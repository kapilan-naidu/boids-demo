import assert from "node:assert/strict";
import test from "node:test";

import { QuadTree } from "../public/js/sim/quadtree.js";
import { createRng } from "../public/js/sim/rng.js";
import { wrapDelta } from "../public/js/sim/steering.js";

const WIDTH = 1280;
const HEIGHT = 720;

function randomBoids(count, seed) {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => ({
    x: rng.range(0, WIDTH),
    y: rng.range(0, HEIGHT),
  }));
}

function bruteForce(boids, x, y, radius) {
  const found = [];
  boids.forEach((boid, i) => {
    const dx = wrapDelta(boid.x - x, WIDTH);
    const dy = wrapDelta(boid.y - y, HEIGHT);
    if (dx * dx + dy * dy <= radius * radius) found.push(i);
  });
  return found.sort((a, b) => a - b);
}

test("query finds exactly the boids within the radius, across the world's edges", () => {
  const boids = randomBoids(400, 11);
  // Put a few right on the seams and corners.
  boids.push({ x: 2, y: 2 }, { x: WIDTH - 3, y: HEIGHT - 3 }, { x: 2, y: HEIGHT - 3 });
  const tree = new QuadTree();
  tree.rebuild(boids, WIDTH, HEIGHT);
  const out = new Int32Array(boids.length * 2);

  for (const radius of [26, 70, 140]) {
    for (let i = 0; i < boids.length; i++) {
      const count = tree.query(boids[i].x, boids[i].y, radius, out);
      const found = [...out.subarray(0, count)].sort((a, b) => a - b);
      assert.deepEqual(found, bruteForce(boids, boids[i].x, boids[i].y, radius));
    }
  }
});

test("query works from any point, not just a boid's own position", () => {
  const boids = randomBoids(200, 4);
  const tree = new QuadTree();
  tree.rebuild(boids, WIDTH, HEIGHT);
  const out = new Int32Array(boids.length * 2);
  const rng = createRng(8);
  for (let n = 0; n < 50; n++) {
    const x = rng.range(0, WIDTH);
    const y = rng.range(0, HEIGHT);
    const count = tree.query(x, y, 90, out);
    const found = [...out.subarray(0, count)].sort((a, b) => a - b);
    assert.deepEqual(found, bruteForce(boids, x, y, 90));
  }
});

test("every boid ends up in exactly one leaf, inside that leaf's bounds", () => {
  const boids = randomBoids(300, 21);
  const tree = new QuadTree({ capacity: 4 });
  tree.rebuild(boids, WIDTH, HEIGHT);

  const seen = new Set();
  for (let c = 0; c < tree.used; c++) {
    const cell = tree.cells[c];
    if (cell.child >= 0) {
      assert.equal(cell.count, 0, "split cells hold no boids");
      continue;
    }
    let chained = 0;
    for (let i = cell.head; i >= 0; i = tree.next[i]) {
      assert.ok(!seen.has(i), `boid ${i} appears once`);
      seen.add(i);
      chained++;
      assert.ok(boids[i].x >= cell.x0 && boids[i].x <= cell.x1);
      assert.ok(boids[i].y >= cell.y0 && boids[i].y <= cell.y1);
    }
    assert.equal(chained, cell.count);
    assert.ok(cell.count <= 4);
  }
  assert.equal(seen.size, boids.length);
});

test("cells split where boids crowd and stay coarse where they don't", () => {
  const crowd = Array.from({ length: 60 }, (_, i) => ({
    x: 100 + (i % 8),
    y: 100 + i * 0.5,
  }));
  const spread = randomBoids(8, 1);
  const tree = new QuadTree();
  tree.rebuild(crowd, WIDTH, HEIGHT);
  const crowdedCells = tree.used;
  tree.rebuild(spread, WIDTH, HEIGHT);
  assert.ok(crowdedCells > tree.used * 3);
});

test("boids stacked on one spot can't split the tree forever", () => {
  const stacked = Array.from({ length: 50 }, () => ({ x: 300, y: 300 }));
  const tree = new QuadTree({ capacity: 4, maxDepth: 6 });
  tree.rebuild(stacked, WIDTH, HEIGHT);
  const out = new Int32Array(100);
  assert.equal(tree.query(300, 300, 5, out), 50);
  assert.ok(tree.used < 100);
});

test("rebuild can be repeated with a different number of boids", () => {
  const tree = new QuadTree();
  const out = new Int32Array(1000);
  for (const count of [300, 20, 500, 0, 7]) {
    const boids = randomBoids(count, count + 1);
    tree.rebuild(boids, WIDTH, HEIGHT);
    assert.equal(tree.search(WIDTH / 2, HEIGHT / 2, 5000, out, 0), count);
  }
});

test("query never writes past the end of the output buffer", () => {
  const boids = randomBoids(100, 2);
  const tree = new QuadTree();
  tree.rebuild(boids, WIDTH, HEIGHT);
  const out = new Int32Array(10);
  assert.equal(tree.query(WIDTH / 2, HEIGHT / 2, 5000, out), 10);
});

test("a query visits fewer cells than the tree has", () => {
  const boids = randomBoids(400, 5);
  const tree = new QuadTree();
  tree.rebuild(boids, WIDTH, HEIGHT);
  tree.query(640, 360, 40, new Int32Array(800));
  assert.ok(tree.visited < tree.used / 2);
});
