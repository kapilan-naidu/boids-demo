// A pointer is a visible force that leads one flock: the presenter's mouse, a simulated
// player, or (later) a phone. A leader is a flock's own autonomous pointer, used whenever
// nobody is steering it.

export class Pointer {
  constructor(id, kind, flock, x, y) {
    this.id = id;
    this.kind = kind; // "presenter" | "simulated" | "remote"
    this.flock = flock; // the flock it leads
    this.x = x; // smoothed position, in world units
    this.y = y;
    this.targetX = x; // where the latest input says it should be
    this.targetY = y;
    this.activeUntil = 0; // world time until which the pointer counts as active
    this.active = false;
    this.glow = 0; // 0..1, drives how visible the marker is
    this.removing = false; // fading out before it is deleted
  }
}

export class Leader {
  constructor(flock, rng) {
    this.flock = flock;
    this.x = 0;
    this.y = 0;
    this.phase = [0, 1, 2, 3].map(() => rng.range(0, Math.PI * 2));
    this.tempo = flock === 0 ? 1 : 0.83;
  }

  // Drifts along a slow, smooth, non-repeating-looking path that stays inside the world.
  update(time, width, height) {
    const t = time * this.tempo;
    const [a, b, c, d] = this.phase;
    this.x = width * (0.5 + 0.32 * Math.sin(0.13 * t + a) + 0.1 * Math.sin(0.41 * t + b));
    this.y = height * (0.5 + 0.3 * Math.sin(0.17 * t + c) + 0.1 * Math.sin(0.53 * t + d));
  }
}
