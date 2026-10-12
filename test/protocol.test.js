import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_MESSAGE_BYTES,
  RateLimiter,
  parseMove,
  pickTeam,
  safeEqual,
} from "../server/protocol.js";

const move = (overrides = {}) => JSON.stringify({ t: "move", x: 0.5, y: 0.25, a: true, ...overrides });

test("a valid move is accepted, from a string or a buffer", () => {
  assert.deepEqual(parseMove(move()), { x: 0.5, y: 0.25, active: true });
  assert.deepEqual(parseMove(Buffer.from(move({ a: false }))), {
    x: 0.5,
    y: 0.25,
    active: false,
  });
});

test("coordinates outside 0..1 are clamped", () => {
  assert.deepEqual(parseMove(move({ x: 7, y: -3 })), { x: 1, y: 0, active: true });
});

test("anything that isn't a well-formed move is rejected", () => {
  const bad = [
    "not json",
    "null",
    "[]",
    "42",
    move({ t: "other" }),
    move({ t: undefined }),
    move({ x: "0.5" }),
    move({ y: null }),
    move({ x: undefined }),
    move({ a: "yes" }),
    move({ a: undefined }),
    '{"t":"move","x":1e999,"y":0,"a":true}',
    "",
  ];
  for (const raw of bad) assert.equal(parseMove(raw), null, raw);
  assert.equal(parseMove(undefined), null);
  assert.equal(parseMove({}), null);
});

test("oversized messages are rejected", () => {
  const padded = move({ pad: "x".repeat(MAX_MESSAGE_BYTES) });
  assert.equal(parseMove(padded), null);
});

test("the rate limiter allows a burst, then roughly the configured rate", () => {
  const limiter = new RateLimiter(10, 10, 0);
  let allowed = 0;
  for (let i = 0; i < 50; i++) if (limiter.allow(0)) allowed++;
  assert.equal(allowed, 10);

  // After one second, about ten more tokens have come back.
  allowed = 0;
  for (let i = 0; i < 50; i++) if (limiter.allow(1000)) allowed++;
  assert.equal(allowed, 10);
});

test("pickTeam fills the smaller team", () => {
  assert.equal(pickTeam([0, 0]), 0);
  assert.equal(pickTeam([1, 0]), 1);
  assert.equal(pickTeam([2, 3]), 0);
  assert.equal(pickTeam([3, 3]), 0);
});

test("safeEqual compares secrets", () => {
  assert.equal(safeEqual("secret", "secret"), true);
  assert.equal(safeEqual("secret", "secreT"), false);
  assert.equal(safeEqual("secret", "secrets"), false);
  assert.equal(safeEqual("", "x"), false);
});
