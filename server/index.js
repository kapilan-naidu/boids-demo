// HTTP and WebSocket server. Serves public/, relays audience touches to the presenter,
// and keeps no data beyond the connections that are open right now.
//
//   /           presenter view (needs ?token=... when a presenter token is set)
//   /join/      phone page
//   /ws         WebSocket: ?role=presenter&token=... or ?role=audience
//   /api/join   the join URL and its QR code as SVG
//   /healthz    for the host's health check

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { WebSocketServer } from "ws";
import {
  MAX_MESSAGE_BYTES,
  RateLimiter,
  TEAM_COUNT,
  parseMove,
  pickTeam,
  safeEqual,
} from "./protocol.js";

const ROOT = resolve(fileURLToPath(new URL("../public", import.meta.url)));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

// Close codes the phone page understands.
export const CLOSE = { REPLACED: 4000, UNAUTHORIZED: 4401, IDLE: 4408, FULL: 4429 };

export function createApp({
  token = "",
  publicUrl = "",
  maxAudience = 80,
  idleMs = 5 * 60 * 1000,
  messagesPerSecond = 30,
} = {}) {
  const audience = new Map(); // id -> { socket, team, limiter, lastMove }
  let presenter = null;

  const send = (socket, message) => {
    if (socket?.readyState === 1) socket.send(JSON.stringify(message));
  };
  const teamCounts = () => {
    const counts = new Array(TEAM_COUNT).fill(0);
    for (const player of audience.values()) counts[player.team]++;
    return counts;
  };

  // --- HTTP -----------------------------------------------------------------------

  const joinUrl = (req) => {
    if (publicUrl) return `${publicUrl.replace(/\/$/, "")}/join/`;
    const forwarded = String(req.headers["x-forwarded-proto"] ?? "http");
    const proto = forwarded.split(",")[0].trim();
    const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
    return `${proto}://${host}/join/`;
  };

  const resolvePath = (pathname) => {
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = resolve(join(ROOT, pathname));
    return file.startsWith(ROOT + sep) ? file : null;
  };

  const handle = async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { ...HEADERS, Allow: "GET, HEAD" }).end();
      return;
    }
    let url;
    try {
      url = new URL(req.url, "http://localhost");
      decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, HEADERS).end("Bad request");
      return;
    }
    const { pathname } = url;

    if (pathname === "/healthz") {
      res.writeHead(200, { ...HEADERS, "Content-Type": "text/plain" }).end("ok");
      return;
    }
    if (pathname === "/api/join") {
      const target = joinUrl(req);
      const svg = await QRCode.toString(target, { type: "svg", margin: 1 });
      const body = JSON.stringify({ url: target, svg });
      res.writeHead(200, { ...HEADERS, "Content-Type": TYPES[".json"] }).end(body);
      return;
    }
    if (pathname === "/join") {
      res.writeHead(301, { ...HEADERS, Location: "/join/" }).end();
      return;
    }
    if (token && (pathname === "/" || pathname === "/index.html")) {
      if (!safeEqual(url.searchParams.get("token") ?? "", token)) {
        res.writeHead(401, { ...HEADERS, "Content-Type": "text/plain" });
        res.end("The presenter view needs the presenter link.");
        return;
      }
    }

    const file = resolvePath(decodeURIComponent(pathname));
    if (!file) {
      res.writeHead(400, HEADERS).end("Bad request");
      return;
    }
    try {
      const body = await readFile(file);
      const type = TYPES[extname(file)] ?? "application/octet-stream";
      res.writeHead(200, { ...HEADERS, "Content-Type": type });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(404, { ...HEADERS, "Content-Type": "text/plain" }).end("Not found");
    }
  };

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, HEADERS);
      res.end();
    });
  });

  // --- WebSocket --------------------------------------------------------------------

  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: MAX_MESSAGE_BYTES * 2 });

  const attachPresenter = (socket) => {
    if (presenter) presenter.close(CLOSE.REPLACED, "replaced");
    presenter = socket;
    socket.on("close", () => {
      if (presenter === socket) presenter = null;
    });
    const players = [...audience].map(([id, player]) => ({ id, team: player.team }));
    send(socket, { t: "snapshot", players });
  };

  const attachAudience = (socket) => {
    if (audience.size >= maxAudience) {
      send(socket, { t: "full" });
      socket.close(CLOSE.FULL, "full");
      return;
    }
    const id = randomBytes(4).toString("hex");
    const player = {
      socket,
      team: pickTeam(teamCounts()),
      limiter: new RateLimiter(messagesPerSecond, messagesPerSecond),
      lastMove: Date.now(),
    };
    audience.set(id, player);
    send(socket, { t: "hello", id, team: player.team });
    send(presenter, { t: "join", id, team: player.team });

    socket.on("message", (raw) => {
      if (!player.limiter.allow()) return;
      const move = parseMove(raw);
      if (!move) return;
      player.lastMove = Date.now();
      send(presenter, { t: "move", id, x: move.x, y: move.y, a: move.active });
    });
    socket.on("close", () => {
      audience.delete(id);
      send(presenter, { t: "leave", id });
    });
  };

  wss.on("connection", (socket, req) => {
    socket.isAlive = true;
    socket.on("pong", () => (socket.isAlive = true));
    socket.on("error", () => socket.terminate());

    const url = new URL(req.url, "http://localhost");
    if (url.searchParams.get("role") === "presenter") {
      if (token && !safeEqual(url.searchParams.get("token") ?? "", token)) {
        socket.close(CLOSE.UNAUTHORIZED, "unauthorized");
        return;
      }
      attachPresenter(socket);
    } else {
      attachAudience(socket);
    }
  });

  // Drops connections that stopped answering, and players who haven't touched for a while.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const socket of wss.clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
    for (const player of audience.values()) {
      if (now - player.lastMove > idleMs) player.socket.close(CLOSE.IDLE, "idle");
    }
  }, 10000);
  sweep.unref();

  return {
    server,
    stats: () => ({
      audience: audience.size,
      presenter: Boolean(presenter),
      teams: teamCounts(),
    }),
    close: () =>
      new Promise((done) => {
        clearInterval(sweep);
        for (const socket of wss.clients) socket.terminate();
        wss.close(() => server.close(() => done()));
      }),
  };
}
