// Steering math. Pure functions with no DOM or p5 dependency, so they can be unit tested.
// Every force is clamped to a maximum, and results are written into reusable objects to
// avoid allocating on every boid, every frame.

const scratch = { x: 0, y: 0 };

// Shortest signed distance along one axis of a world that wraps at `size`.
export function wrapDelta(delta, size) {
  if (delta > size / 2) return delta - size;
  if (delta < -size / 2) return delta + size;
  return delta;
}

export function clampMagnitude(x, y, max, out) {
  const lengthSq = x * x + y * y;
  if (lengthSq > max * max) {
    const scale = max / Math.sqrt(lengthSq);
    out.x = x * scale;
    out.y = y * scale;
  } else {
    out.x = x;
    out.y = y;
  }
  return out;
}

// Steering towards direction (dx, dy): head that way at full speed, correct the
// difference from the current velocity, and limit how hard we can correct.
export function steerToward(dx, dy, vx, vy, maxSpeed, maxForce, out) {
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const desiredX = (dx / length) * maxSpeed;
  const desiredY = (dy / length) * maxSpeed;
  return clampMagnitude(desiredX - vx, desiredY - vy, maxForce, out);
}

export function createRuleForces() {
  return {
    sepX: 0,
    sepY: 0,
    aliX: 0,
    aliY: 0,
    cohX: 0,
    cohY: 0,
    neighbors: 0, // flock mates inside the perception radius
    separating: 0, // flock mates inside the separation radius
    centerX: 0, // center of the neighbors (the cohesion target)
    centerY: 0,
  };
}

export function createPullForce() {
  return { x: 0, y: 0, targetX: 0, targetY: 0, sources: 0, source: "none" };
}

// The three classic rules for one boid. `candidates[0..count)` are indices into `boids`
// that might be nearby; only flock mates inside the perception radius are used.
//   separation: push away from flock mates that are too close, harder the closer they are
//   alignment:  match the average velocity of flock mates
//   cohesion:   pull towards the center of flock mates, harder the further from it
// Each force is at most maxForce. The weights are applied by the caller.
export function ruleForces(self, index, boids, candidates, count, p, width, height, out) {
  const perceptionSq = p.perceptionRadius * p.perceptionRadius;
  const separationRadius = p.perceptionRadius * p.separationRatio;
  const separationSq = separationRadius * separationRadius;

  let awayX = 0;
  let awayY = 0;
  let headingX = 0;
  let headingY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let neighbors = 0;
  let separating = 0;

  for (let k = 0; k < count; k++) {
    const j = candidates[k];
    if (j === index) continue;
    const other = boids[j];
    if (other.flock !== self.flock) continue;

    const dx = wrapDelta(other.x - self.x, width);
    const dy = wrapDelta(other.y - self.y, height);
    const distSq = dx * dx + dy * dy;
    if (distSq >= perceptionSq || distSq === 0) continue;

    neighbors++;
    headingX += other.vx;
    headingY += other.vy;
    offsetX += dx;
    offsetY += dy;

    if (distSq < separationSq) {
      // A unit push away from the neighbor, fading to nothing at the edge of the radius.
      const dist = Math.sqrt(distSq);
      const push = (separationRadius - dist) / (separationRadius * dist);
      awayX -= dx * push;
      awayY -= dy * push;
      separating++;
    }
  }

  out.neighbors = neighbors;
  out.separating = separating;
  out.sepX = out.sepY = out.aliX = out.aliY = out.cohX = out.cohY = 0;
  out.centerX = self.x;
  out.centerY = self.y;
  if (neighbors === 0) return out;

  out.centerX = self.x + offsetX / neighbors;
  out.centerY = self.y + offsetY / neighbors;

  const { maxForce } = p;
  if (separating > 0) {
    clampMagnitude(awayX * maxForce, awayY * maxForce, maxForce, scratch);
    out.sepX = scratch.x;
    out.sepY = scratch.y;
  }

  // Closing a velocity gap of half the top speed takes the full force.
  const alignGain = (2 * maxForce) / p.maxSpeed;
  clampMagnitude(
    (headingX / neighbors - self.vx) * alignGain,
    (headingY / neighbors - self.vy) * alignGain,
    maxForce,
    scratch
  );
  out.aliX = scratch.x;
  out.aliY = scratch.y;

  const cohesionGain = maxForce / p.perceptionRadius;
  clampMagnitude(
    (offsetX / neighbors) * cohesionGain,
    (offsetY / neighbors) * cohesionGain,
    maxForce,
    scratch
  );
  out.cohX = scratch.x;
  out.cohY = scratch.y;
  return out;
}

// Pull of the pointers leading this boid's flock. Pointers are blended into a single
// target, weighted by inverse squared distance, so the nearest one dominates and the
// flock can split between several. The force is capped, so no number of pointers can
// push harder than `pointerStrength * maxForce`.
export function pullForce(self, sources, count, p, out) {
  out.x = 0;
  out.y = 0;
  out.targetX = self.x;
  out.targetY = self.y;
  out.sources = count;
  if (count === 0) return out;

  const softeningSq = p.pointerSoftening * p.pointerSoftening;
  let weightSum = 0;
  let targetX = 0;
  let targetY = 0;
  for (let k = 0; k < count; k++) {
    const source = sources[k];
    const dx = source.x - self.x;
    const dy = source.y - self.y;
    const weight = 1 / (dx * dx + dy * dy + softeningSq);
    weightSum += weight;
    targetX += source.x * weight;
    targetY += source.y * weight;
  }
  targetX /= weightSum;
  targetY /= weightSum;
  out.targetX = targetX;
  out.targetY = targetY;

  const maxSpeed = p.maxSpeed * self.speedFactor;
  steerToward(
    targetX - self.x,
    targetY - self.y,
    self.vx,
    self.vy,
    maxSpeed,
    p.maxForce * p.pointerStrength,
    scratch
  );
  out.x = scratch.x;
  out.y = scratch.y;
  return out;
}
