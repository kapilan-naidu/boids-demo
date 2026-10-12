import assert from "node:assert/strict";
import test from "node:test";
import WebSocket from "ws";

import { CLOSE, createApp } from "../server/index.js";

// Starts the real server on a free port. Returns helpers for talking to it.
async function start(options = {}) {
  const app = createApp(options);
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const { port } = app.server.address();
  const base = `127.0.0.1:${port}`;

  const sockets = [];
  const connect = (query) =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://${base}/ws?${query}`);
      const received = [];
      const waiting = [];
      socket.on("message", (data) => {
        const message = JSON.parse(data.toString());
        const waiter = waiting.shift();
        if (waiter) waiter(message);
        else received.push(message);
      });
      const client = {
        socket,
        received,
        closed: new Promise((done) => socket.on("close", (code) => done(code))),
        next: () =>
          received.length
            ? Promise.resolve(received.shift())
            : new Promise((done) => waiting.push(done)),
      };
      sockets.push(socket);
      socket.on("open", () => resolve(client));
      socket.on("error", reject);
    });

  return {
    app,
    base,
    http: (path) => fetch(`http://${base}${path}`, { redirect: "manual" }),
    presenter: (token = "") => connect(`role=presenter&token=${token}`),
    phone: () => connect("role=audience"),
    stop: async () => {
      for (const socket of sockets) socket.terminate();
      await app.close();
    },
  };
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const move = (x, y, a = true) => JSON.stringify({ t: "move", x, y, a });

test("the presenter view needs its token, but the join page and health check do not", async () => {
  const t = await start({ token: "secret" });
  try {
    assert.equal((await t.http("/")).status, 401);
    assert.equal((await t.http("/?token=wrong")).status, 401);
    assert.equal((await t.http("/?token=secret")).status, 200);
    assert.equal((await t.http("/join/")).status, 200);
    assert.equal((await t.http("/join")).status, 301);
    assert.equal((await t.http("/healthz")).status, 200);
    assert.equal((await t.http("/js/presenter.js")).status, 200);
  } finally {
    await t.stop();
  }
});

test("without a token configured the presenter view is open (local use)", async () => {
  const t = await start();
  try {
    assert.equal((await t.http("/")).status, 200);
  } finally {
    await t.stop();
  }
});

test("files outside public/ can't be fetched", async () => {
  const t = await start();
  try {
    for (const path of ["/../server.js", "/..%2fserver.js", "/%2e%2e/package.json"]) {
      const { status } = await fetch(`http://${t.base}${path}`);
      assert.ok(status === 400 || status === 404, `${path} gave ${status}`);
    }
    assert.equal((await t.http("/server.js")).status, 404);
  } finally {
    await t.stop();
  }
});

test("the join API gives a URL and a QR code, from the public URL when set", async () => {
  const t = await start({ publicUrl: "https://boids.example.app/" });
  try {
    const data = await (await t.http("/api/join")).json();
    assert.equal(data.url, "https://boids.example.app/join/");
    assert.ok(data.svg.includes("<svg"));
  } finally {
    await t.stop();
  }

  const plain = await start();
  try {
    const data = await (await plain.http("/api/join")).json();
    assert.equal(data.url, `http://${plain.base}/join/`);
  } finally {
    await plain.stop();
  }
});

test("a presenter with the wrong token is turned away", async () => {
  const t = await start({ token: "secret" });
  try {
    const bad = await t.presenter("nope");
    assert.equal(await bad.closed, CLOSE.UNAUTHORIZED);
    const good = await t.presenter("secret");
    assert.equal((await good.next()).t, "snapshot");
  } finally {
    await t.stop();
  }
});

test("phones join, move and leave, and the presenter hears about it", async () => {
  const t = await start();
  try {
    const presenter = await t.presenter();
    assert.deepEqual(await presenter.next(), { t: "snapshot", players: [] });

    const phone = await t.phone();
    const hello = await phone.next();
    assert.equal(hello.t, "hello");
    assert.ok(hello.id && [0, 1].includes(hello.team));
    assert.deepEqual(await presenter.next(), { t: "join", id: hello.id, team: hello.team });

    phone.socket.send(move(0.25, 2));
    assert.deepEqual(await presenter.next(), {
      t: "move",
      id: hello.id,
      x: 0.25,
      y: 1,
      a: true,
    });

    phone.socket.close();
    assert.deepEqual(await presenter.next(), { t: "leave", id: hello.id });
    assert.deepEqual(t.app.stats().audience, 0);
  } finally {
    await t.stop();
  }
});

test("a presenter that connects late gets everyone already there", async () => {
  const t = await start();
  try {
    const phones = [await t.phone(), await t.phone(), await t.phone()];
    await Promise.all(phones.map((phone) => phone.next()));
    const presenter = await t.presenter();
    const snapshot = await presenter.next();
    assert.equal(snapshot.t, "snapshot");
    assert.equal(snapshot.players.length, 3);
  } finally {
    await t.stop();
  }
});

test("teams stay balanced as phones join", async () => {
  const t = await start();
  try {
    const phones = [];
    for (let i = 0; i < 7; i++) phones.push(await t.phone());
    await Promise.all(phones.map((phone) => phone.next()));
    const [a, b] = t.app.stats().teams;
    assert.equal(a + b, 7);
    assert.ok(Math.abs(a - b) <= 1);
  } finally {
    await t.stop();
  }
});

test("malformed messages are ignored and the connection survives", async () => {
  const t = await start();
  try {
    const presenter = await t.presenter();
    await presenter.next();
    const phone = await t.phone();
    await phone.next();
    await presenter.next(); // join

    for (const junk of ["garbage", "{}", '{"t":"move","x":"a","y":1,"a":true}', "x".repeat(100)]) {
      phone.socket.send(junk);
    }
    phone.socket.send(move(0.5, 0.5, false));
    const message = await presenter.next();
    assert.equal(message.t, "move");
    assert.equal(message.a, false);
    assert.equal(presenter.received.length, 0, "nothing else was relayed");
  } finally {
    await t.stop();
  }
});

test("a phone that floods the server is rate limited", async () => {
  const t = await start({ messagesPerSecond: 5 });
  try {
    const presenter = await t.presenter();
    await presenter.next();
    const phone = await t.phone();
    await phone.next();
    await presenter.next();

    for (let i = 0; i < 100; i++) phone.socket.send(move(0.5, 0.5));
    await pause(300);
    assert.ok(presenter.received.length <= 8, `relayed ${presenter.received.length}`);
    assert.ok(presenter.received.length >= 1);
  } finally {
    await t.stop();
  }
});

test("oversized frames close the connection", async () => {
  const t = await start();
  try {
    const phone = await t.phone();
    await phone.next();
    phone.socket.send("x".repeat(5000));
    assert.equal(await phone.closed, 1009);
  } finally {
    await t.stop();
  }
});

test("extra phones are turned away once the room is full", async () => {
  const t = await start({ maxAudience: 2 });
  try {
    const first = await t.phone();
    const second = await t.phone();
    await Promise.all([first.next(), second.next()]);
    const third = await t.phone();
    assert.deepEqual(await third.next(), { t: "full" });
    assert.equal(await third.closed, CLOSE.FULL);
    assert.equal(t.app.stats().audience, 2);
  } finally {
    await t.stop();
  }
});

test("a second presenter replaces the first", async () => {
  const t = await start();
  try {
    const first = await t.presenter();
    await first.next();
    const second = await t.presenter();
    assert.equal(await first.closed, CLOSE.REPLACED);
    assert.equal((await second.next()).t, "snapshot");
  } finally {
    await t.stop();
  }
});
