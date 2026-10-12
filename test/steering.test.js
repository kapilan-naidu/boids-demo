import assert from "node:assert/strict";
import test from "node:test";

import { Boid } from "../public/js/sim/boid.js";
import { DEFAULT_PARAMS } from "../public/js/sim/config.js";
import { createRng } from "../public/js/sim/rng.js";
import {
  clampMagnitude,
  createPullForce,
  createRuleForces,
  pullForce,
  ruleForces,
  steerToward,
  wrapDelta,
} from "../public/js/sim/steering.js";

const params = { ...DEFAULT_PARAMS };
const WIDTH = 1000;
const HEIGHT = 600;
const separationRadius = params.perceptionRadius * params.separationRatio;

function boidAt(x, y, { vx = 0, vy = 0, flock = 0 } = {}) {
  const boid = new Boid(flock, 0, 1);
  boid.place(x, y, vx, vy);
  return boid;
}

// Rule forces on boids[index], with every other boid offered as a candidate.
function forcesOn(boids, index = 0) {
  const candidates = boids.map((_, i) => i);
  return ruleForces(
    boids[index],
    index,
    boids,
    candidates,
    candidates.length,
    params,
    WIDTH,
    HEIGHT,
    createRuleForces()
  );
}

const magnitude = (x, y) => Math.hypot(x, y);

test("wrapDelta takes the short way round the world", () => {
  assert.equal(wrapDelta(200, 1000), 200);
  assert.equal(wrapDelta(900, 1000), -100);
  assert.equal(wrapDelta(-900, 1000), 100);
  assert.equal(wrapDelta(-200, 1000), -200);
});

test("clampMagnitude limits length and keeps direction", () => {
  const out = { x: 0, y: 0 };
  clampMagnitude(30, 40, 10, out);
  assert.ok(Math.abs(magnitude(out.x, out.y) - 10) < 1e-9);
  assert.ok(Math.abs(out.x / out.y - 0.75) < 1e-9);
  clampMagnitude(3, 4, 10, out);
  assert.deepEqual(out, { x: 3, y: 4 });
});

test("steerToward corrects towards the desired velocity and respects maxForce", () => {
  const out = { x: 0, y: 0 };
  steerToward(1, 0, 0, 0, 100, 1000, out);
  assert.deepEqual(out, { x: 100, y: 0 });
  steerToward(1, 0, 0, 0, 100, 40, out);
  assert.deepEqual(out, { x: 40, y: 0 });
  steerToward(0, 0, 5, 5, 100, 40, out);
  assert.deepEqual(out, { x: 0, y: 0 });
});

test("separation pushes a boid away from a close flock mate", () => {
  const f = forcesOn([boidAt(500, 300), boidAt(510, 300)]);
  assert.ok(f.sepX < 0);
  assert.ok(Math.abs(f.sepY) < 1e-9);
  assert.equal(f.separating, 1);
});

test("separation ignores flock mates beyond the separation radius", () => {
  const f = forcesOn([boidAt(500, 300), boidAt(500 + separationRadius + 5, 300)]);
  assert.equal(f.separating, 0);
  assert.equal(f.sepX, 0);
  assert.equal(f.neighbors, 1);
});

test("alignment steers towards the neighbors' heading", () => {
  const f = forcesOn([boidAt(500, 300), boidAt(540, 300, { vy: 100 })]);
  assert.ok(f.aliY > 0);
  assert.ok(Math.abs(f.aliX) < 1e-9);
});

test("cohesion pulls towards the center of the neighbors", () => {
  const boids = [boidAt(500, 300), boidAt(540, 290), boidAt(540, 310)];
  const f = forcesOn(boids);
  assert.ok(f.cohX > 0);
  assert.ok(Math.abs(f.cohY) < 1e-9);
  assert.ok(Math.abs(f.centerX - 540) < 1e-9);
  assert.ok(Math.abs(f.centerY - 300) < 1e-9);
});

test("boids of the other flock are not perceived", () => {
  const f = forcesOn([boidAt(500, 300), boidAt(505, 300, { flock: 1 })]);
  assert.equal(f.neighbors, 0);
  assert.equal(magnitude(f.sepX, f.sepY) + magnitude(f.aliX, f.aliY), 0);
});

test("neighbors are found across the world's edge", () => {
  const f = forcesOn([boidAt(5, 300), boidAt(WIDTH - 10, 300)]);
  assert.equal(f.neighbors, 1);
  assert.ok(f.sepX > 0, "pushed away from the boid on the far side of the seam");
  assert.ok(f.cohX < 0, "pulled towards it across the seam");
});

test("every rule force stays within maxForce, even in a crowd", () => {
  const rng = createRng(3);
  const boids = Array.from({ length: 60 }, () =>
    boidAt(rng.range(480, 520), rng.range(280, 320), {
      vx: rng.range(-170, 170),
      vy: rng.range(-170, 170),
    })
  );
  for (let i = 0; i < boids.length; i++) {
    const f = forcesOn(boids, i);
    const limit = params.maxForce + 1e-9;
    assert.ok(magnitude(f.sepX, f.sepY) <= limit);
    assert.ok(magnitude(f.aliX, f.aliY) <= limit);
    assert.ok(magnitude(f.cohX, f.cohY) <= limit);
  }
});

test("pull is zero with no pointers", () => {
  const out = pullForce(boidAt(100, 100), [], 0, params, createPullForce());
  assert.equal(out.x, 0);
  assert.equal(out.y, 0);
});

test("pull is bounded however many pointers there are", () => {
  const self = boidAt(500, 300);
  const rng = createRng(9);
  const cap = params.maxForce * params.pointerStrength + 1e-9;
  for (const count of [1, 5, 40]) {
    const sources = Array.from({ length: count }, () => ({
      x: rng.range(0, WIDTH),
      y: rng.range(0, HEIGHT),
    }));
    const out = pullForce(self, sources, count, params, createPullForce());
    assert.ok(magnitude(out.x, out.y) <= cap, `${count} pointers`);
  }
});

test("pull is dominated by the nearest pointer, so a flock can split between several", () => {
  const self = boidAt(500, 300);
  const near = { x: 400, y: 300 };
  const far = { x: 900, y: 300 };
  const out = pullForce(self, [near, far], 2, params, createPullForce());
  const midpoint = (near.x + far.x) / 2;
  assert.ok(out.targetX < midpoint);
  assert.ok(out.x < 0, "steers towards the near pointer");
});
