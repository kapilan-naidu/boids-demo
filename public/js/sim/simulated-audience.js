import { FLOCK_COUNT } from "./config.js";
import { createRng } from "./rng.js";

// Stand-in players for rehearsing without phones. They drive the world through the same
// updatePointer() call that real participants will use, with normalized coordinates, and
// are shared out evenly between the two teams.

export class SimulatedAudience {
  constructor(seed = 1) {
    this.rng = createRng(seed);
    this.players = [];
  }

  get count() {
    return this.players.length;
  }

  setCount(count, world) {
    while (this.players.length < count) this.players.push(this.createPlayer());
    while (this.players.length > count) {
      world.removePointer(this.players.pop().id);
    }
  }

  clear(world) {
    this.setCount(0, world);
  }

  createPlayer() {
    const index = this.players.length;
    const { rng } = this;
    return {
      id: `sim-${index}`,
      flock: index % FLOCK_COUNT,
      x: rng.range(0.1, 0.9),
      y: rng.range(0.1, 0.9),
      goalX: rng.range(0.1, 0.9),
      goalY: rng.range(0.1, 0.9),
      speed: rng.range(0.08, 0.2), // screen fractions per second
      hopTimer: rng.range(1, 4),
      touching: rng.next() < 0.7,
      touchTimer: rng.range(1, 5),
    };
  }

  update(dt, world) {
    const { rng } = this;
    for (const player of this.players) {
      player.hopTimer -= dt;
      if (player.hopTimer <= 0) {
        player.goalX = rng.range(0.05, 0.95);
        player.goalY = rng.range(0.05, 0.95);
        player.hopTimer = rng.range(1.5, 4);
      }
      player.touchTimer -= dt;
      if (player.touchTimer <= 0) {
        player.touching = !player.touching;
        player.touchTimer = player.touching ? rng.range(2, 6) : rng.range(0.4, 1.5);
      }

      const dx = player.goalX - player.x;
      const dy = player.goalY - player.y;
      const distance = Math.hypot(dx, dy);
      const stride = Math.min(distance, player.speed * dt);
      if (distance > 0) {
        player.x += (dx / distance) * stride;
        player.y += (dy / distance) * stride;
      }

      world.updatePointer(player.id, {
        kind: "simulated",
        flock: player.flock,
        nx: player.x,
        ny: player.y,
        active: player.touching,
      });
    }
  }
}
