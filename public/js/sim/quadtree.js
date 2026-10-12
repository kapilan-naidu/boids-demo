// Quadtree for neighbor lookups. Each cell holds a few boids and splits into four where
// boids crowd, so a boid only has to check the cells near it instead of the whole flock.
//
// The tree is rebuilt from scratch every frame, before anyone queries it. Cells are
// pooled and boids are chained through an index array, so a rebuild allocates nothing
// once the pool has grown. The world wraps at its edges, so queries near an edge also
// look at the other side.

class Cell {
  constructor() {
    this.x0 = 0;
    this.y0 = 0;
    this.x1 = 0;
    this.y1 = 0;
    this.depth = 0;
    this.head = -1; // first boid in this cell's chain (leaf cells only)
    this.count = 0;
    this.child = -1; // index of the first of four consecutive children, or -1 for a leaf
  }
}

export class QuadTree {
  constructor({ capacity = 4, maxDepth = 10 } = {}) {
    this.capacity = capacity; // boids a cell holds before it splits
    this.maxDepth = maxDepth;
    this.cells = [new Cell()];
    this.used = 0; // cells in use this frame; the rest are spare
    this.next = new Int32Array(0); // next[i] is the boid after i in its cell's chain
    this.stack = new Int32Array(128);
    this.boids = [];
    this.width = 1;
    this.height = 1;
    this.visited = 0; // cells examined by the latest query
  }

  rebuild(boids, width, height) {
    this.boids = boids;
    this.width = width;
    this.height = height;
    if (this.next.length < boids.length) this.next = new Int32Array(boids.length * 2);
    this.used = 0;
    this.allocate(0, 0, width, height, 0);
    for (let i = 0; i < boids.length; i++) this.insert(i);
  }

  allocate(x0, y0, x1, y1, depth) {
    if (this.used === this.cells.length) this.cells.push(new Cell());
    const cell = this.cells[this.used];
    cell.x0 = x0;
    cell.y0 = y0;
    cell.x1 = x1;
    cell.y1 = y1;
    cell.depth = depth;
    cell.head = -1;
    cell.count = 0;
    cell.child = -1;
    return this.used++;
  }

  insert(index) {
    const { x, y } = this.boids[index];
    let at = 0;
    for (;;) {
      const cell = this.cells[at];
      if (cell.child < 0) {
        if (cell.count < this.capacity || cell.depth >= this.maxDepth) {
          this.next[index] = cell.head;
          cell.head = index;
          cell.count++;
          return;
        }
        this.split(at);
      }
      at = this.childAt(this.cells[at], x, y);
    }
  }

  // Which of a cell's four children holds (x, y): 0 top-left, 1 top-right, 2 bottom-left,
  // 3 bottom-right.
  childAt(cell, x, y) {
    const right = x >= (cell.x0 + cell.x1) / 2 ? 1 : 0;
    const below = y >= (cell.y0 + cell.y1) / 2 ? 2 : 0;
    return cell.child + right + below;
  }

  split(at) {
    const cell = this.cells[at];
    const mx = (cell.x0 + cell.x1) / 2;
    const my = (cell.y0 + cell.y1) / 2;
    const depth = cell.depth + 1;
    cell.child = this.used;
    this.allocate(cell.x0, cell.y0, mx, my, depth);
    this.allocate(mx, cell.y0, cell.x1, my, depth);
    this.allocate(cell.x0, my, mx, cell.y1, depth);
    this.allocate(mx, my, cell.x1, cell.y1, depth);

    // Hand the boids down. A cell never holds more than `capacity` boids when it splits,
    // so no child can overflow here.
    let index = cell.head;
    cell.head = -1;
    cell.count = 0;
    while (index >= 0) {
      const following = this.next[index];
      const { x, y } = this.boids[index];
      const child = this.cells[this.childAt(cell, x, y)];
      this.next[index] = child.head;
      child.head = index;
      child.count++;
      index = following;
    }
  }

  // Writes the indices of boids within `radius` of (x, y) into `out`, treating the world
  // as wrapping at its edges. Returns how many were written. The radius must be less than
  // half the world's smaller side, or boids on the far side would be counted twice.
  query(x, y, radius, out) {
    this.visited = 0;
    const { width, height } = this;
    const shiftX = x - radius < 0 ? width : x + radius > width ? -width : 0;
    const shiftY = y - radius < 0 ? height : y + radius > height ? -height : 0;

    let written = this.search(x, y, radius, out, 0);
    if (shiftX) written = this.search(x + shiftX, y, radius, out, written);
    if (shiftY) written = this.search(x, y + shiftY, radius, out, written);
    if (shiftX && shiftY) {
      written = this.search(x + shiftX, y + shiftY, radius, out, written);
    }
    return written;
  }

  search(x, y, radius, out, written) {
    const radiusSq = radius * radius;
    const { cells, stack, next, boids } = this;
    let top = 0;
    stack[top++] = 0;
    while (top > 0) {
      const cell = cells[stack[--top]];
      this.visited++;

      // Skip cells the circle can't reach.
      const dx = x < cell.x0 ? cell.x0 - x : x > cell.x1 ? x - cell.x1 : 0;
      const dy = y < cell.y0 ? cell.y0 - y : y > cell.y1 ? y - cell.y1 : 0;
      if (dx * dx + dy * dy > radiusSq) continue;

      if (cell.child >= 0) {
        for (let k = 0; k < 4; k++) stack[top++] = cell.child + k;
        continue;
      }
      for (let i = cell.head; i >= 0; i = next[i]) {
        const ex = boids[i].x - x;
        const ey = boids[i].y - y;
        if (ex * ex + ey * ey <= radiusSq && written < out.length) out[written++] = i;
      }
    }
    return written;
  }
}
