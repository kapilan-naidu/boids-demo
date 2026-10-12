import { TRAIL_SAMPLES } from "./config.js";
import { createPullForce, createRuleForces } from "./steering.js";

export class Boid {
  constructor(flock, shade, speedFactor) {
    this.flock = flock; // which flock currently owns this boid (0 or 1)
    this.shade = shade; // 0 = the flock's main color, 1 = its accent color
    this.speedFactor = speedFactor;

    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.ax = 0;
    this.ay = 0;

    this.wanderAngle = 0; // direction of this boid's own random steering
    this.flash = 0; // seconds left on the contact highlight
    this.pending = -1; // flock this boid is about to be converted to, if any
    this.immune = 0; // seconds left before this boid can be converted again in a fight

    this.trail = new Float32Array(TRAIL_SAMPLES * 2);
    this.trailHead = 0;
    this.trailCount = 0;
    this.trailClock = 0;

    this.inspect = false; // selected for the debug view
    this.debug = null; // last forces, kept only while inspected
  }

  place(x, y, vx, vy) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.ax = 0;
    this.ay = 0;
    this.trailHead = 0;
    this.trailCount = 0;
    this.trailClock = 0;
    this.pushTrail();
  }

  pushTrail() {
    const slot = this.trailHead * 2;
    this.trail[slot] = this.x;
    this.trail[slot + 1] = this.y;
    this.trailHead = (this.trailHead + 1) % TRAIL_SAMPLES;
    if (this.trailCount < TRAIL_SAMPLES) this.trailCount++;
  }

  setInspect(on) {
    this.inspect = on;
    if (on && !this.debug) {
      this.debug = { rules: createRuleForces(), pull: createPullForce() };
    } else if (!on) {
      this.debug = null;
    }
  }
}
