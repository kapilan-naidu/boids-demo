// Message validation and small helpers for the audience connection. Pure functions with
// no network dependency, so they can be unit tested.
//
// Audience -> server:  { t: "move", x, y, a }   x and y are 0..1, a is "finger is down"
// Server -> audience:  { t: "hello", id, team } | { t: "full" }
// Server -> presenter: { t: "snapshot", players } | { t: "join", id, team }
//                      | { t: "move", id, x, y, a } | { t: "leave", id }

import { timingSafeEqual } from "node:crypto";

export const MAX_MESSAGE_BYTES = 128;
export const TEAM_COUNT = 2;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

// Returns a clean { x, y, active }, or null if the message is not a valid move.
export function parseMove(raw) {
  const text = typeof raw === "string" ? raw : raw?.toString?.("utf8");
  if (typeof text !== "string") return null;
  if (Buffer.byteLength(text) > MAX_MESSAGE_BYTES) return null;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return null;
  }
  if (message === null || typeof message !== "object") return null;
  if (message.t !== "move") return null;
  if (typeof message.x !== "number" || typeof message.y !== "number") return null;
  if (!Number.isFinite(message.x) || !Number.isFinite(message.y)) return null;
  if (typeof message.a !== "boolean") return null;
  return { x: clamp01(message.x), y: clamp01(message.y), active: message.a };
}

// Token bucket: `perSecond` messages a second on average, with a small burst allowance.
export class RateLimiter {
  constructor(perSecond, burst = perSecond, now = Date.now()) {
    this.perSecond = perSecond;
    this.burst = burst;
    this.tokens = burst;
    this.last = now;
  }

  allow(now = Date.now()) {
    const refill = ((now - this.last) / 1000) * this.perSecond;
    this.tokens = Math.min(this.burst, this.tokens + refill);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

// The team with fewer players, so the two sides stay balanced as people come and go.
export function pickTeam(teamCounts) {
  let team = 0;
  for (let i = 1; i < TEAM_COUNT; i++) {
    if (teamCounts[i] < teamCounts[team]) team = i;
  }
  return team;
}

// Compares secrets without leaking how much of them matched.
export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
