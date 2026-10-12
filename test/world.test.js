import assert from "node:assert/strict";
import test from "node:test";

import { MAX_AUDIENCE_POINTERS } from "../public/js/sim/config.js";
import { SimulatedAudience } from "../public/js/sim/simulated-audience.js";
import { World } from "../public/js/sim/world.js";

const DT = 1 / 60;

function makeWorld(params = {}) {
  return new World({ width: 1280, params });
}

function run(world, seconds, beforeStep) {
  for (let t = 0; t < seconds; t += DT) {
    beforeStep?.();
    world.step(DT);
  }
}

// Stacks every flock-B boid on a flock-A boid so the two flocks are in contact.
function overlapFlocks(world) {
  const a = world.boids.filter((boid) => boid.flock === 0);
  const b = world.boids.filter((boid) => boid.flock === 1);
  b.forEach((boid, i) => {
    const host = a[i % a.length];
    boid.place(host.x + 3, host.y + 3, host.vx, host.vy);
  });
}

const keepPresenterActive = (world) => () =>
  world.updatePointer("presenter", { kind: "presenter", flock: 0, nx: 0.5, ny: 0.5 });

// Starts audience mode with one simulated player on each team.
function startAudienceMode(world) {
  world.audienceEnabled = true;
  world.updatePointer("a", { kind: "simulated", flock: 0, nx: 0.05, ny: 0.05 });
  world.updatePointer("b", { kind: "simulated", flock: 1, nx: 0.5, ny: 0.5 });
}

// Flock B packed around the middle of the screen with a single flock-A boid among them.
// The rest of flock A is clustered far away in a corner.
function loneAmongFoes(params = {}) {
  const world = makeWorld({ boidsPerFlock: 20, fightRate: 60, ...params });
  startAudienceMode(world);
  const cx = world.width / 2;
  const cy = world.height / 2;
  const a = world.boids.filter((boid) => boid.flock === 0);
  const b = world.boids.filter((boid) => boid.flock === 1);
  const lone = a[0];
  lone.place(cx, cy, 0, 70);
  b.forEach((boid, i) => boid.place(cx + Math.cos(i) * 20, cy + Math.sin(i) * 20, 0, 70));
  a.slice(1).forEach((boid, i) => boid.place(60 + i * 12, 60, 0, 70));
  return { world, lone };
}

test("a world starts with two flocks of the configured size", () => {
  const world = makeWorld({ boidsPerFlock: 40 });
  assert.deepEqual(world.counts, [40, 40]);
  assert.equal(world.boids.length, 80);
});

test("the same seed gives the same simulation", () => {
  const first = makeWorld();
  const second = makeWorld();
  run(first, 3);
  run(second, 3);
  first.boids.forEach((boid, i) => {
    assert.equal(boid.x, second.boids[i].x);
    assert.equal(boid.y, second.boids[i].y);
  });
});

test("reset returns to the same starting state", () => {
  const world = makeWorld();
  const start = world.boids.map((boid) => [boid.x, boid.y]);
  run(world, 2);
  world.reset();
  world.boids.forEach((boid, i) => assert.deepEqual([boid.x, boid.y], start[i]));
});

test("motion stays finite, in bounds and within the speed limits", () => {
  const world = makeWorld();
  const audience = new SimulatedAudience(5);
  audience.setCount(20, world);
  run(world, 30, () => audience.update(DT, world));

  const { maxSpeed, minSpeed } = world.params;
  for (const boid of world.boids) {
    assert.ok(Number.isFinite(boid.x + boid.y + boid.vx + boid.vy));
    assert.ok(boid.x >= 0 && boid.x < world.width);
    assert.ok(boid.y >= 0 && boid.y < world.height);
    const speed = Math.hypot(boid.vx, boid.vy);
    assert.ok(speed <= maxSpeed * boid.speedFactor + 1e-6);
    assert.ok(speed >= minSpeed - 1e-6);
  }
});

test("a long frame is clamped instead of blowing up the simulation", () => {
  const world = makeWorld();
  world.step(5);
  for (const boid of world.boids) {
    assert.ok(Number.isFinite(boid.x + boid.y));
  }
  assert.ok(world.time <= 1 / 30 + 1e-9);
});

test("resize keeps positions at the same place on screen", () => {
  const world = makeWorld();
  const before = world.boids.map((boid) => boid.x / world.width);
  world.resize(world.width * 1.5);
  world.boids.forEach((boid, i) => {
    assert.ok(Math.abs(boid.x / world.width - before[i]) < 1e-9);
  });
});

test("pointer coordinates are normalized, clamped and validated", () => {
  const world = makeWorld();
  const pointer = world.updatePointer("a", { nx: 0.5, ny: 0.25 });
  assert.equal(pointer.targetX, world.width * 0.5);
  assert.equal(pointer.targetY, world.height * 0.25);

  world.updatePointer("a", { nx: 7, ny: -3 });
  assert.equal(world.pointers.get("a").targetX, world.width);
  assert.equal(world.pointers.get("a").targetY, 0);

  assert.equal(world.updatePointer("b", { nx: NaN, ny: 0.5 }), null);
  assert.equal(world.updatePointer("b", { nx: "x", ny: 0.5 }), null);
  assert.equal(world.pointers.has("b"), false);

  world.resize(world.width * 2);
  world.updatePointer("c", { nx: 0.5, ny: 0.5 });
  assert.equal(world.pointers.get("c").targetX, world.width / 2);
});

test("audience size is capped but the presenter always gets a pointer", () => {
  const world = makeWorld();
  for (let i = 0; i < MAX_AUDIENCE_POINTERS + 10; i++) {
    world.updatePointer(`p${i}`, { nx: 0.5, ny: 0.5 });
  }
  assert.equal(world.audienceCount(), MAX_AUDIENCE_POINTERS);
  assert.ok(world.updatePointer("presenter", { kind: "presenter", nx: 0.1, ny: 0.1 }));
});

test("audience mode is off until the presenter starts it", () => {
  const world = makeWorld();
  assert.equal(world.audienceEnabled, false);
  world.updatePointer("a", { kind: "simulated", flock: 0, nx: 0.5, ny: 0.5 });
  world.step(DT);
  assert.equal(world.fighting, false);
  assert.equal(world.sources[0].length, 0);
});

test("each pointer leads its own flock", () => {
  const world = makeWorld();
  startAudienceMode(world);
  world.step(DT);
  assert.equal(world.fighting, true);
  const ids = world.sources.map((sources) => sources.map((pointer) => pointer.id));
  assert.deepEqual(ids, [["a"], ["b"]]);
});

test("a removed pointer stops influencing straight away and is then deleted", () => {
  const world = makeWorld();
  startAudienceMode(world);
  world.step(DT);
  assert.equal(world.sources[0].length, 1);

  world.removePointer("a");
  world.step(DT);
  assert.equal(world.sources[0].length, 0);
  assert.ok(world.pointers.has("a"), "still fading");

  run(world, 2);
  assert.equal(world.pointers.has("a"), false);
});

test("a pointer that stops updating expires", () => {
  const world = makeWorld();
  startAudienceMode(world);
  world.step(DT);
  assert.equal(world.sources[1].length, 1);
  run(world, 1);
  assert.equal(world.sources[1].length, 0);
});

test("clearAudience removes every audience pointer and keeps the presenter's", () => {
  const world = makeWorld();
  world.updatePointer("presenter", { kind: "presenter", nx: 0.2, ny: 0.2 });
  startAudienceMode(world);
  world.clearAudience();
  run(world, 2);
  assert.deepEqual([...world.pointers.keys()], ["presenter"]);
});

test("without Shift the presenter's mouse steers flock A but converts nobody", () => {
  const world = makeWorld({ boidsPerFlock: 30 });
  overlapFlocks(world);
  run(world, 3, keepPresenterActive(world));
  assert.deepEqual(world.counts, [30, 30]);
  assert.equal(world.sources[0].length, 1);
});

test("holding Shift lets the presenter's pointer convert the other flock on contact", () => {
  const world = makeWorld({ boidsPerFlock: 30 });
  overlapFlocks(world);
  world.presenterConverting = true;
  run(world, 4, keepPresenterActive(world));
  assert.equal(world.counts[0] + world.counts[1], 60);
  assert.ok(world.counts[0] > 30, `flock A should have gained, got ${world.counts}`);
});

test("Shift conversion needs contact", () => {
  const world = makeWorld({ boidsPerFlock: 30 });
  world.presenterConverting = true;
  // The flocks start far apart, so there is nothing to convert yet.
  run(world, 0.5, keepPresenterActive(world));
  assert.deepEqual(world.counts, [30, 30]);
});

test("the presenter's mouse can be switched off", () => {
  const world = makeWorld({ boidsPerFlock: 30 });
  overlapFlocks(world);
  world.presenterEnabled = false;
  world.presenterConverting = true;
  run(world, 3, keepPresenterActive(world));
  assert.deepEqual(world.counts, [30, 30]);
});

test("the presenter's mouse sits out audience mode", () => {
  const world = makeWorld({ boidsPerFlock: 30 });
  overlapFlocks(world);
  startAudienceMode(world);
  world.presenterConverting = true;
  run(world, 1, () => {
    keepPresenterActive(world)();
    startAudienceMode(world);
  });
  assert.equal(world.converter, -1);
  const ids = world.sources.flat().map((pointer) => pointer.id);
  assert.ok(!ids.includes("presenter"));
});

test("in audience mode a heavily outnumbered boid switches sides", () => {
  const { world, lone } = loneAmongFoes();
  world.step(DT);
  assert.equal(lone.flock, 1);
  assert.deepEqual(world.counts, [19, 21]);
});

test("boids among their own flock are left alone", () => {
  const { world } = loneAmongFoes();
  run(world, 0.2);
  // Only the lone boid changed; the corner cluster and the B cluster hold.
  assert.deepEqual(world.counts, [19, 21]);
});

test("evenly mixed ground holds, because only a decisive majority converts", () => {
  const world = makeWorld({ boidsPerFlock: 6, fightRate: 60 });
  startAudienceMode(world);
  const cx = world.width / 2;
  const cy = world.height / 2;
  world.boids.forEach((boid, i) => {
    const angle = (i / world.boids.length) * Math.PI * 2;
    boid.flock = i % 2;
    boid.place(cx + Math.cos(angle) * 15, cy + Math.sin(angle) * 15, 0, 70);
  });
  run(world, 0.3);
  assert.deepEqual(world.counts, [6, 6]);
});

test("a converted boid is safe for the cooldown, then can be converted again", () => {
  const { world, lone } = loneAmongFoes();
  world.step(DT);
  assert.ok(lone.immune > world.params.fightCooldown - 0.1);

  // The same lone boid, but still on cooldown: only the cooldown protects it.
  const { world: other, lone: protectedBoid } = loneAmongFoes();
  protectedBoid.immune = 10;
  run(other, 0.3);
  assert.equal(protectedBoid.flock, 0, "an immune boid is not converted");
  protectedBoid.immune = 0;
  other.step(DT);
  assert.equal(protectedBoid.flock, 1);
});

test("nothing is converted outside audience mode", () => {
  const { world } = loneAmongFoes();
  world.audienceEnabled = false;
  run(world, 1);
  assert.deepEqual(world.counts, [20, 20]);
});

test("changing boids per flock adds and removes boids from each flock", () => {
  const world = makeWorld({ boidsPerFlock: 50 });
  world.setBoidsPerFlock(70);
  assert.deepEqual(world.counts, [70, 70]);
  run(world, 1);
  world.setBoidsPerFlock(20);
  assert.deepEqual(world.counts, [20, 20]);
  run(world, 1);
  assert.equal(world.boids.length, 40);
});

test("autoInspect picks one boid per flock and records its forces", () => {
  const world = makeWorld();
  world.autoInspect();
  const inspected = world.boids.filter((boid) => boid.inspect);
  assert.equal(inspected.length, 2);
  assert.deepEqual(inspected.map((boid) => boid.flock).sort(), [0, 1]);
  world.step(DT);
  for (const boid of inspected) assert.ok(boid.debug.rules.neighbors >= 0);

  world.clearInspected();
  assert.equal(world.boids.filter((boid) => boid.inspect).length, 0);
});

test("autoInspect skips boids inside the area to avoid", () => {
  const world = makeWorld();
  const avoid = { x0: 0, x1: world.width * 0.5, y0: 0, y1: world.height };
  world.autoInspect({ avoid });
  const inspected = world.boids.filter((boid) => boid.inspect);
  assert.ok(inspected.length > 0);
  for (const boid of inspected) assert.ok(boid.x >= avoid.x1);

  world.autoInspect({ avoid: { x0: 0, x1: world.width, y0: 0, y1: world.height } });
  assert.equal(world.boids.filter((boid) => boid.inspect).length, 0);
});

test("autoInspect keeps its picks apart when the flocks overlap", () => {
  const world = makeWorld();
  overlapFlocks(world);
  world.autoInspect();
  const [first, second] = world.boids.filter((boid) => boid.inspect);
  assert.ok(first && second);
  assert.ok(world.distance(first, second) >= 100);
});

test("simulated players are shared evenly between the two teams", () => {
  const world = makeWorld();
  const audience = new SimulatedAudience(2);
  audience.setCount(10, world);
  run(world, 5, () => audience.update(DT, world));

  const teams = [0, 0];
  for (const pointer of world.pointers.values()) {
    teams[pointer.flock]++;
    assert.ok(pointer.targetX >= 0 && pointer.targetX <= world.width);
    assert.ok(pointer.targetY >= 0 && pointer.targetY <= world.height);
  }
  assert.deepEqual(teams, [5, 5]);

  audience.clear(world);
  run(world, 2);
  assert.equal(world.pointers.size, 0);
});
