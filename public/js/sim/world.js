import {
  DEFAULT_PARAMS,
  FLASH_TIME,
  FLOCK_ANCHORS,
  FLOCK_COUNT,
  MAX_AUDIENCE_POINTERS,
  MAX_STEP,
  POINTER_HOLD,
  TRAIL_INTERVAL,
  WORLD_HEIGHT,
} from "./config.js";
import { Boid } from "./boid.js";
import { Leader, Pointer } from "./pointer.js";
import { QuadTree } from "./quadtree.js";
import { createRng } from "./rng.js";
import {
  createPullForce,
  createRuleForces,
  pullForce,
  ruleForces,
  wrapDelta,
} from "./steering.js";

const TAU = Math.PI * 2;
const CRUISE_EASE = 1.5; // how quickly speed settles towards cruising speed, per second
const WANDER_TURN = 5; // how fast each boid's random steering direction drifts, rad/s
const START_SPACING = 12; // roughly how far apart boids start; sizes the starting cluster
const AUTO_INSPECT_NEIGHBORS = 8; // neighbors the debug view wants in an inspected boid
const AUTO_INSPECT_GAP = 280; // how far apart inspected boids are kept, if possible
const clamp01 = (value) => Math.min(1, Math.max(0, value));

// One authoritative simulation: two flocks and the pointers steering them. It has two
// ways of converting boids from one flock to the other:
//   - the presenter holds Shift and leads flock A into B, recruiting what it touches;
//   - in audience mode the flocks fight: a boid heavily outnumbered switches sides.
// Nothing here touches the DOM or the canvas.
export class World {
  constructor({ width, height = WORLD_HEIGHT, params } = {}) {
    this.height = height;
    this.width = width ?? (height * 16) / 9;
    this.params = { ...DEFAULT_PARAMS, ...params };

    this.boids = [];
    this.pointers = new Map();
    this.leaders = [];
    this.tree = new QuadTree();
    this.candidates = new Int32Array(0);
    this.sources = [[], []]; // active pointers leading each flock this step

    this.time = 0;
    this.counts = new Array(FLOCK_COUNT).fill(0);
    this.converter = -1; // the flock the presenter is currently recruiting for, or -1
    this.fighting = false; // audience mode: the flocks fight

    this.audienceEnabled = false; // audience mode, started by the presenter
    this.presenterEnabled = true;
    this.presenterConverting = false; // set while the presenter holds Shift

    this.leaderSource = [{ x: 0, y: 0 }];
    this.forces = createRuleForces();
    this.pull = createPullForce();

    this.reset();
  }

  // Respawns both flocks. Pointers belong to connected players, so they stay.
  reset() {
    this.rng = createRng(this.params.seed);
    for (const pointer of this.pointers.values()) {
      pointer.activeUntil = Math.max(0, pointer.activeUntil - this.time);
    }
    this.time = 0;
    this.boids.length = 0;
    this.leaders = [];
    for (let flock = 0; flock < FLOCK_COUNT; flock++) {
      this.leaders.push(new Leader(flock, this.rng));
      for (let i = 0; i < this.params.boidsPerFlock; i++) this.spawn(flock);
    }
    this.ensureCandidates();
    this.updateLeaders();
    this.updateCounts();
  }

  // Adds a boid to a flock: in a cluster at the flock's anchor, or, when topping up a
  // running flock, next to one of its existing members.
  spawn(flock, { nearMembers = false } = {}) {
    const { rng } = this;
    const members = nearMembers ? this.boids.filter((boid) => boid.flock === flock) : [];
    let x;
    let y;
    let heading;
    if (members.length > 0) {
      const host = members[Math.floor(rng.next() * members.length)];
      x = host.x + rng.range(-20, 20);
      y = host.y + rng.range(-20, 20);
      heading = Math.atan2(host.vy, host.vx);
    } else {
      const anchor = FLOCK_ANCHORS[flock];
      const angle = rng.range(0, TAU);
      const radius = Math.sqrt(rng.next() * this.params.boidsPerFlock) * START_SPACING;
      x = anchor.x * this.width + Math.cos(angle) * radius;
      y = anchor.y * this.height + Math.sin(angle) * radius;
      heading = this.startHeading(flock);
    }

    const shade = rng.next() < 1 / 3 ? 1 : 0;
    const boid = new Boid(flock, shade, rng.range(0.85, 1.15));
    boid.wanderAngle = rng.range(0, TAU);
    const direction = heading + rng.range(-0.5, 0.5);
    const speed = this.params.maxSpeed * rng.range(0.4, 0.8);
    boid.place(
      (x + this.width) % this.width,
      (y + this.height) % this.height,
      Math.cos(direction) * speed,
      Math.sin(direction) * speed
    );
    this.boids.push(boid);
    return boid;
  }

  // Each flock starts out heading roughly towards the other.
  startHeading(flock) {
    const from = FLOCK_ANCHORS[flock];
    const to = FLOCK_ANCHORS[(flock + 1) % FLOCK_COUNT];
    return Math.atan2((to.y - from.y) * this.height, (to.x - from.x) * this.width);
  }

  // Changes each flock's population by the difference from the previous setting.
  setBoidsPerFlock(count) {
    const delta = count - this.params.boidsPerFlock;
    this.params.boidsPerFlock = count;
    for (let flock = 0; flock < FLOCK_COUNT; flock++) {
      if (delta > 0) {
        for (let i = 0; i < delta; i++) this.spawn(flock, { nearMembers: true });
      } else {
        let remove = -delta;
        for (let i = this.boids.length - 1; i >= 0 && remove > 0; i--) {
          if (this.boids[i].flock === flock) {
            this.boids.splice(i, 1);
            remove--;
          }
        }
      }
    }
    this.ensureCandidates();
    this.updateCounts();
  }

  // Keeps positions at the same place on screen when the window's aspect ratio changes.
  resize(width, height = this.height) {
    const scaleX = width / this.width;
    const scaleY = height / this.height;
    for (const boid of this.boids) {
      boid.x *= scaleX;
      boid.y *= scaleY;
      for (let i = 0; i < boid.trailCount * 2; i += 2) {
        boid.trail[i] *= scaleX;
        boid.trail[i + 1] *= scaleY;
      }
    }
    for (const pointer of this.pointers.values()) {
      pointer.x *= scaleX;
      pointer.y *= scaleY;
      pointer.targetX *= scaleX;
      pointer.targetY *= scaleY;
    }
    this.width = width;
    this.height = height;
    this.updateLeaders();
  }

  // --- Pointers -------------------------------------------------------------------

  // Creates or updates a pointer that leads `flock`. (nx, ny) are normalized: 0..1 across
  // and down the screen, whatever the sender's screen size.
  updatePointer(id, { kind = "remote", flock = 0, nx, ny, active = true }) {
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
    let pointer = this.pointers.get(id);
    if (!pointer) {
      const isAudience = kind !== "presenter";
      if (isAudience && this.audienceCount() >= MAX_AUDIENCE_POINTERS) return null;
      const x = clamp01(nx) * this.width;
      const y = clamp01(ny) * this.height;
      pointer = new Pointer(id, kind, flock, x, y);
      this.pointers.set(id, pointer);
    }
    pointer.removing = false;
    pointer.flock = flock;
    pointer.targetX = clamp01(nx) * this.width;
    pointer.targetY = clamp01(ny) * this.height;
    pointer.activeUntil = active ? this.time + POINTER_HOLD : 0;
    return pointer;
  }

  setPointerActive(id, active) {
    const pointer = this.pointers.get(id);
    if (pointer) pointer.activeUntil = active ? this.time + POINTER_HOLD : 0;
  }

  // Stops the pointer's influence now; the marker fades out and is then deleted.
  removePointer(id) {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    pointer.removing = true;
    pointer.activeUntil = 0;
    pointer.active = false;
  }

  clearAudience() {
    for (const pointer of this.pointers.values()) {
      if (pointer.kind !== "presenter") this.removePointer(pointer.id);
    }
  }

  audienceCount() {
    let count = 0;
    for (const pointer of this.pointers.values()) {
      if (pointer.kind !== "presenter" && !pointer.removing) count++;
    }
    return count;
  }

  // The presenter's mouse sits out audience mode, so the audience's fight is its own.
  isPointerEnabled(pointer) {
    if (pointer.kind === "presenter") return this.presenterEnabled && !this.fighting;
    return this.audienceEnabled;
  }

  // --- Stepping -------------------------------------------------------------------

  step(dt) {
    dt = Math.min(dt, MAX_STEP);
    if (!(dt > 0)) return;
    this.time += dt;

    const { boids, params: p } = this;
    this.updateLeaders();
    this.updatePointers(dt);
    this.ensureCandidates();
    this.tree.rebuild(boids, this.width, this.height);

    // Every boid is steered from the same snapshot of the flock, then all move together.
    for (let i = 0; i < boids.length; i++) {
      const boid = boids[i];
      const { width, height, candidates } = this;
      const count = this.tree.query(boid.x, boid.y, p.perceptionRadius, candidates);
      ruleForces(boid, i, boids, candidates, count, p, width, height, this.forces);

      const sources = this.sources[boid.flock];
      if (sources.length > 0) {
        pullForce(boid, sources, sources.length, p, this.pull);
        this.pull.source = "pointers";
      } else {
        this.pullLeader(boid);
        this.pull.source = "leader";
      }

      // A little steering noise of the boid's own, outside the three rules.
      boid.wanderAngle += this.rng.range(-1, 1) * WANDER_TURN * dt;
      const wander = p.wander * p.maxForce;

      const f = this.forces;
      const pull = this.pull;
      const { separation, alignment, cohesion } = p;
      boid.ax = f.sepX * separation + f.aliX * alignment + f.cohX * cohesion + pull.x;
      boid.ay = f.sepY * separation + f.aliY * alignment + f.cohY * cohesion + pull.y;
      boid.ax += Math.cos(boid.wanderAngle) * wander;
      boid.ay += Math.sin(boid.wanderAngle) * wander;

      if (boid.inspect) {
        Object.assign(boid.debug.rules, f);
        Object.assign(boid.debug.pull, this.pull);
      }
    }

    if (this.fighting) this.fight(dt);
    else this.recruit(dt);

    for (const boid of boids) this.integrate(boid, dt);
    this.updateCounts();
  }

  // A flock with nobody steering it follows its own wandering leader.
  pullLeader(boid) {
    const leader = this.leaders[boid.flock];
    this.leaderSource[0].x = leader.x;
    this.leaderSource[0].y = leader.y;
    pullForce(boid, this.leaderSource, 1, this.params, this.pull);
  }

  integrate(boid, dt) {
    const { params: p } = this;
    boid.vx += boid.ax * dt;
    boid.vy += boid.ay * dt;

    // Ease towards a cruising speed, then keep speed between a floor and a ceiling so the
    // flock can neither stall nor race.
    const maxSpeed = p.maxSpeed * boid.speedFactor;
    let speed = Math.hypot(boid.vx, boid.vy);
    if (speed === 0) {
      boid.vx = p.minSpeed;
      speed = p.minSpeed;
    }
    const cruise = maxSpeed * p.cruiseRatio;
    const eased = speed + (cruise - speed) * CRUISE_EASE * dt;
    const target = Math.min(maxSpeed, Math.max(p.minSpeed, eased));
    boid.vx *= target / speed;
    boid.vy *= target / speed;

    boid.x = (((boid.x + boid.vx * dt) % this.width) + this.width) % this.width;
    boid.y = (((boid.y + boid.vy * dt) % this.height) + this.height) % this.height;

    boid.flash = Math.max(0, boid.flash - dt);
    boid.immune = Math.max(0, boid.immune - dt);
    boid.trailClock += dt;
    if (boid.trailClock >= TRAIL_INTERVAL) {
      boid.trailClock %= TRAIL_INTERVAL;
      boid.pushTrail();
    }
  }

  // The presenter's move: while Shift is held and the mouse is active, boids of the flock
  // it leads convert the other flock's boids they touch.
  recruit(dt) {
    const { boids, converter, params: p } = this;
    if (converter < 0) return;

    const rival = 1 - converter;
    const contactSq = p.contactRadius * p.contactRadius;
    const chance = p.conversionRate * dt;
    let converted = false;
    for (let i = 0; i < boids.length; i++) {
      const attacker = boids[i];
      if (attacker.flock !== converter) continue;

      const { x, y } = attacker;
      const count = this.tree.query(x, y, p.contactRadius, this.candidates);
      for (let k = 0; k < count; k++) {
        const target = boids[this.candidates[k]];
        if (target.flock !== rival || target.pending >= 0) continue;
        const dx = wrapDelta(target.x - x, this.width);
        const dy = wrapDelta(target.y - y, this.height);
        if (dx * dx + dy * dy < contactSq && this.rng.next() < chance) {
          target.pending = converter;
          attacker.flash = Math.max(attacker.flash, FLASH_TIME * 0.6);
          converted = true;
        }
      }
    }
    if (converted) this.applyConversions(0);
  }

  // Audience mode. A boid heavily outnumbered by the other flock around it may switch
  // sides, and the worse the odds, the likelier. Numbers decide, so either flock can win
  // ground back. A converted boid is safe for a while, so nothing flips back and forth
  // at once.
  fight(dt) {
    const { boids, params: p } = this;
    if (this.counts[0] === 0 || this.counts[1] === 0) return;

    let converted = false;
    for (let i = 0; i < boids.length; i++) {
      const boid = boids[i];
      if (boid.immune > 0) continue;

      const { x, y } = boid;
      const count = this.tree.query(x, y, p.fightRadius, this.candidates);
      let friends = 0;
      let foes = 0;
      for (let k = 0; k < count; k++) {
        const index = this.candidates[k];
        if (index === i) continue;
        if (boids[index].flock === boid.flock) friends++;
        else foes++;
      }
      // Only a decisive local majority converts, so evenly mixed ground holds.
      const lead = foes - friends * p.fightMargin;
      if (lead <= 0) continue;

      const odds = lead / (foes + friends);
      if (this.rng.next() < odds * p.fightRate * dt) {
        boid.pending = 1 - boid.flock;
        converted = true;
      }
    }
    if (converted) this.applyConversions(p.fightCooldown);
  }

  // Switches every boid with a pending conversion at once, so the order boids are visited
  // in can't decide the result.
  applyConversions(cooldown) {
    for (const boid of this.boids) {
      if (boid.pending < 0) continue;
      boid.flock = boid.pending;
      boid.pending = -1;
      boid.flash = FLASH_TIME;
      boid.immune = cooldown;
    }
  }

  updateLeaders() {
    for (const leader of this.leaders) leader.update(this.time, this.width, this.height);
  }

  updatePointers(dt) {
    const follow = 1 - Math.exp(-dt * 16);
    const fade = 1 - Math.exp(-dt * 6);
    this.converter = -1;
    this.fighting = this.audienceEnabled && this.audienceCount() > 0;
    for (const sources of this.sources) sources.length = 0;

    for (const pointer of this.pointers.values()) {
      pointer.x += (pointer.targetX - pointer.x) * follow;
      pointer.y += (pointer.targetY - pointer.y) * follow;
      pointer.active = this.time < pointer.activeUntil;
      pointer.glow += ((pointer.active ? 1 : 0) - pointer.glow) * fade;

      if (pointer.removing && pointer.glow < 0.02) {
        this.pointers.delete(pointer.id);
      } else if (pointer.active && this.isPointerEnabled(pointer)) {
        this.sources[pointer.flock].push(pointer);
        if (pointer.kind === "presenter" && this.presenterConverting) {
          this.converter = pointer.flock;
        }
      }
    }
  }

  updateCounts() {
    this.counts.fill(0);
    for (const boid of this.boids) this.counts[boid.flock]++;
  }

  ensureCandidates() {
    if (this.candidates.length < this.boids.length) {
      this.candidates = new Int32Array(this.boids.length * 2);
    }
  }

  // --- Queries used by the debug view ---------------------------------------------

  // The boid closest to a world position, or null if none is within `maxDistance`.
  nearestBoid(x, y, maxDistance = Infinity) {
    let best = null;
    let bestSq = maxDistance * maxDistance;
    for (const boid of this.boids) {
      const dx = wrapDelta(boid.x - x, this.width);
      const dy = wrapDelta(boid.y - y, this.height);
      const distSq = dx * dx + dy * dy;
      if (distSq < bestSq) {
        best = boid;
        bestSq = distSq;
      }
    }
    return best;
  }

  // Flock mates inside the perception radius, appended to `out`.
  neighborsOf(boid, out) {
    out.length = 0;
    const radiusSq = this.params.perceptionRadius ** 2;
    for (const other of this.boids) {
      if (other === boid || other.flock !== boid.flock) continue;
      const dx = wrapDelta(other.x - boid.x, this.width);
      const dy = wrapDelta(other.y - boid.y, this.height);
      if (dx * dx + dy * dy < radiusSq) out.push(other);
    }
    return out;
  }

  // Picks one boid per flock with a handful of neighbors: enough to show all three rules
  // at work, few enough that the picture stays readable. The picks are kept apart so
  // their labels don't pile up, and boids inside `avoid` (a rectangle in world units,
  // such as the area under the legend) are skipped.
  autoInspect({ avoid } = {}) {
    this.clearInspected();
    const scratch = [];
    const chosen = [];

    const pick = (flock, gap) => {
      let best = null;
      let bestScore = Infinity;
      for (const boid of this.boids) {
        if (boid.flock !== flock) continue;
        if (avoid && boid.x > avoid.x0 && boid.x < avoid.x1) {
          if (boid.y > avoid.y0 && boid.y < avoid.y1) continue;
        }
        if (chosen.some((other) => this.distance(boid, other) < gap)) continue;
        const count = this.neighborsOf(boid, scratch).length;
        const score = count < 3 ? 100 - count : Math.abs(count - AUTO_INSPECT_NEIGHBORS);
        if (score < bestScore) {
          best = boid;
          bestScore = score;
        }
      }
      return best;
    };

    for (let flock = 0; flock < FLOCK_COUNT; flock++) {
      const boid = pick(flock, AUTO_INSPECT_GAP) ?? pick(flock, 0);
      if (!boid) continue;
      chosen.push(boid);
      boid.setInspect(true);
    }
  }

  distance(a, b) {
    const dx = wrapDelta(a.x - b.x, this.width);
    const dy = wrapDelta(a.y - b.y, this.height);
    return Math.hypot(dx, dy);
  }

  toggleInspect(boid, limit = 4) {
    if (boid.inspect) {
      boid.setInspect(false);
      return;
    }
    const inspected = this.boids.filter((other) => other.inspect);
    if (inspected.length >= limit) inspected[0].setInspect(false);
    boid.setInspect(true);
  }

  clearInspected() {
    for (const boid of this.boids) {
      if (boid.inspect) boid.setInspect(false);
    }
  }
}
