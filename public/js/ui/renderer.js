import { FLASH_TIME, TRAIL_SAMPLES } from "../sim/config.js";
import { wrapDelta } from "../sim/steering.js";

const TAU = Math.PI * 2;
const SPRITE_SIZE = 64;
const FONT = '700 13px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const LABEL_HEIGHT = 17; // vertical room a debug label takes up
const FLOCK_NAMES = ["A", "B"];

const HEAD_LENGTH = 10; // boid triangle: tip ahead of the position, base behind it
const HEAD_TAIL = 5.5;
const HEAD_HALF_WIDTH = 4.5;
const INSPECTED_SCALE = 1.6; // inspected boids are drawn larger in the debug view
const OUTLINE_ALPHA = 0.6; // how strong the outlines of uninspected boids are in debug

const ARROW_LENGTH = 75; // world units drawn for a force of maxForce, in the debug view
const ARROW_MAX = 110;
const TICK_DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// --- Colors -------------------------------------------------------------------------

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  const n = parseInt(full, 16);
  return Number.isNaN(n) ? [255, 0, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex, toward, amount) {
  const [r, g, b] = hexToRgb(hex);
  const [tr, tg, tb] = toward;
  const blend = (from, to) => Math.round(from + (to - from) * amount);
  return `rgb(${blend(r, tr)}, ${blend(g, tg)}, ${blend(b, tb)})`;
}

// The palette lives in CSS custom properties, so it can be restyled without touching JS.
export function readPalette(root = document.documentElement) {
  const styles = getComputedStyle(root);
  const get = (name) => styles.getPropertyValue(name).trim();
  return {
    flocks: [
      [get("--flock-a"), get("--flock-a-accent")],
      [get("--flock-b"), get("--flock-b-accent")],
    ],
    flash: get("--flash"),
    ink: get("--ink"),
    rules: {
      separation: get("--rule-separation"),
      alignment: get("--rule-alignment"),
      cohesion: get("--rule-cohesion"),
      pull: get("--rule-pull"),
    },
  };
}

// A soft round glow with a hot core, drawn once and stamped with drawImage().
// This is far cheaper than shadowBlur or a gradient per boid.
function createGlowSprite(hex) {
  const canvas = document.createElement("canvas");
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  const ctx = canvas.getContext("2d");
  const [r, g, b] = hexToRgb(hex);
  const half = SPRITE_SIZE / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, mix(hex, [255, 255, 255], 0.55));
  gradient.addColorStop(0.16, `rgba(${r}, ${g}, ${b}, 0.9)`);
  gradient.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.22)`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return canvas;
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function hexagon(ctx, x, y, radius, rotation) {
  for (let i = 0; i < 6; i++) {
    const angle = rotation + (i * TAU) / 6;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// --- Renderer -----------------------------------------------------------------------

export class Renderer {
  constructor(palette) {
    this.palette = palette;
    this.sprites = new Map();
    const lighten = (hex) => mix(hex, [255, 255, 255], 0.3);
    this.heads = palette.flocks.map((colors) => colors.map(lighten));
    this.quality = "high";
    this.neighbors = [];
    this.labels = []; // debug labels placed this frame, so later ones can avoid them
    this.bounds = { width: 1, height: 1 }; // world size, to keep labels on screen
  }

  sprite(hex) {
    let sprite = this.sprites.get(hex);
    if (!sprite) {
      sprite = createGlowSprite(hex);
      this.sprites.set(hex, sprite);
    }
    return sprite;
  }

  // `view.debug` switches on the debug overlay. `pixelWidth/pixelHeight` is the canvas
  // backing size.
  draw(ctx, world, view, pixelWidth, pixelHeight) {
    const scale = pixelHeight / world.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    ctx.globalCompositeOperation = "source-over";
    if (view.debug) this.drawTree(ctx, world);

    if (view.debug) {
      this.drawOutlines(ctx, world);
    } else {
      ctx.globalCompositeOperation = "lighter";
      this.drawTrails(ctx, world);
      this.drawGlows(ctx, world);
      ctx.globalCompositeOperation = "source-over";
      this.drawHeads(ctx, world);
    }

    ctx.globalCompositeOperation = "lighter";
    for (const pointer of world.pointers.values()) this.drawPointer(ctx, world, pointer);

    ctx.globalCompositeOperation = "source-over";
    if (view.debug) this.drawDebug(ctx, world);
    ctx.restore();
  }

  colorOf(boid) {
    return this.palette.flocks[boid.flock][boid.shade];
  }

  drawTrails(ctx, world) {
    const stride = this.quality === "high" ? 1 : 2;
    for (const boid of world.boids) {
      const sprite = this.sprite(this.colorOf(boid));
      const count = boid.trailCount;
      for (let k = 0; k < count - 1; k += stride) {
        // Oldest first, so k / count grows towards the head.
        const slot = (boid.trailHead - count + k + TRAIL_SAMPLES) % TRAIL_SAMPLES;
        const age = (k + 1) / count;
        const radius = 2.6 + 4.6 * age;
        ctx.globalAlpha = age * age * 0.8;
        ctx.drawImage(
          sprite,
          boid.trail[slot * 2] - radius,
          boid.trail[slot * 2 + 1] - radius,
          radius * 2,
          radius * 2
        );
      }
    }
  }

  drawGlows(ctx, world) {
    const flashSprite = this.sprite(this.palette.flash);
    for (const boid of world.boids) {
      if (this.quality === "high") {
        ctx.globalAlpha = 0.55;
        ctx.drawImage(this.sprite(this.colorOf(boid)), boid.x - 18, boid.y - 18, 36, 36);
      }
      if (boid.flash > 0) {
        ctx.globalAlpha = (boid.flash / FLASH_TIME) * 0.9;
        ctx.drawImage(flashSprite, boid.x - 20, boid.y - 20, 40, 40);
      }
    }
  }

  // Triangles pointing along each boid's heading, batched into one fill per color.
  drawHeads(ctx, world) {
    ctx.globalAlpha = 1;
    for (let flock = 0; flock < 2; flock++) {
      for (let shade = 0; shade < 2; shade++) {
        ctx.fillStyle = this.heads[flock][shade];
        ctx.beginPath();
        for (const boid of world.boids) {
          if (boid.flock === flock && boid.shade === shade) this.triangle(ctx, boid, 1);
        }
        ctx.fill();
      }
    }
  }

  // The debug view draws boids as plain outlines in their own colors, with no trails or
  // glow, so the overlay on top stays readable. Inspected boids are larger and brighter,
  // and a boid that has just converted is outlined in the flash color.
  drawOutlines(ctx, world) {
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    for (let flock = 0; flock < 2; flock++) {
      for (let shade = 0; shade < 2; shade++) {
        ctx.strokeStyle = this.palette.flocks[flock][shade];
        for (const inspected of [false, true]) {
          ctx.globalAlpha = inspected ? 1 : OUTLINE_ALPHA;
          const size = inspected ? INSPECTED_SCALE : 1;
          ctx.beginPath();
          for (const boid of world.boids) {
            if (boid.flock !== flock || boid.shade !== shade) continue;
            if (boid.inspect === inspected && boid.flash <= 0) this.triangle(ctx, boid, size);
          }
          ctx.stroke();
        }
      }
    }

    ctx.strokeStyle = this.palette.flash;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (const boid of world.boids) {
      if (boid.flash > 0) this.triangle(ctx, boid, boid.inspect ? INSPECTED_SCALE : 1);
    }
    ctx.stroke();
  }

  // Adds a boid's triangle to the current path.
  triangle(ctx, boid, size) {
    const speed = Math.hypot(boid.vx, boid.vy) || 1;
    const ux = boid.vx / speed;
    const uy = boid.vy / speed;
    const tailX = boid.x - ux * HEAD_TAIL * size;
    const tailY = boid.y - uy * HEAD_TAIL * size;
    const half = HEAD_HALF_WIDTH * size;
    const length = HEAD_LENGTH * size;
    ctx.moveTo(boid.x + ux * length, boid.y + uy * length);
    ctx.lineTo(tailX - uy * half, tailY + ux * half);
    ctx.lineTo(tailX + uy * half, tailY - ux * half);
    ctx.closePath();
  }

  // Presenter pointers are rings and audience pointers are diamonds, both in their
  // flock's color and larger than any boid. A presenter holding Shift gets a second,
  // spinning ring.
  drawPointer(ctx, world, pointer) {
    const enabled = world.isPointerEnabled(pointer);
    const idle = pointer.kind === "presenter" || pointer.removing ? 0 : 0.3;
    const strength = Math.max(pointer.glow, idle) * (enabled ? 1 : 0.35);
    if (strength < 0.03) return;

    const color = this.palette.flocks[pointer.flock][0];
    const stroke = this.heads[pointer.flock][0];
    const { x, y } = pointer;
    const pulse = pointer.active ? 1 + 0.08 * Math.sin(world.time * 9) : 1;
    const radius = 17 * pulse;

    ctx.globalAlpha = 0.45 * strength;
    ctx.drawImage(this.sprite(color), x - 60, y - 60, 120, 120);

    ctx.globalAlpha = strength;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    if (pointer.kind === "presenter") {
      ctx.arc(x, y, radius, 0, TAU);
    } else {
      const r = radius * 1.25;
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    }
    ctx.stroke();

    if (pointer.kind === "presenter" && world.converter === pointer.flock) {
      ctx.lineWidth = 2.4;
      ctx.setLineDash([7, 7]);
      ctx.lineDashOffset = -world.time * 40;
      ctx.beginPath();
      ctx.arc(x, y, radius + 26, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }

    ctx.beginPath();
    for (const [dx, dy] of TICK_DIRECTIONS) {
      ctx.moveTo(x + dx * (radius + 6), y + dy * (radius + 6));
      ctx.lineTo(x + dx * (radius + 14), y + dy * (radius + 14));
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, TAU);
    ctx.fillStyle = stroke;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // --- Debug view ---------------------------------------------------------------------

  // Every cell of the quadtree the boids are actually using to find their neighbors.
  drawTree(ctx, world) {
    const { cells, used } = world.tree;
    ctx.strokeStyle = this.palette.ink;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < used; i++) {
      const cell = cells[i];
      ctx.rect(cell.x0, cell.y0, cell.x1 - cell.x0, cell.y1 - cell.y0);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawDebug(ctx, world) {
    ctx.font = FONT;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";

    this.labels.length = 0;
    this.bounds.width = world.width;
    this.bounds.height = world.height;
    for (const leader of world.leaders) this.drawLeader(ctx, world, leader);
    for (const boid of world.boids) {
      if (boid.inspect && boid.debug) this.drawInspected(ctx, world, boid);
    }
  }

  // The leader is the point a flock follows when no pointer is steering it. It is drawn
  // as a spinning hexagonal beacon, unlike the round and diamond pointer markers.
  drawLeader(ctx, world, leader) {
    const { x, y } = leader;
    const inUse = world.sources[leader.flock].length === 0;
    const alpha = inUse ? 1 : 0.45;
    const base = this.palette.flocks[leader.flock][0];
    const color = this.heads[leader.flock][0];
    const spin = world.time * 0.6;

    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.7 * alpha;
    ctx.drawImage(this.sprite(base), x - 80, y - 80, 160, 160);
    ctx.globalCompositeOperation = "source-over";

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    hexagon(ctx, x, y, 28, spin);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    hexagon(ctx, x, y, 40, -spin * 0.7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    hexagon(ctx, x, y, 11, spin);
    ctx.fill();

    const text = `LEADER ${FLOCK_NAMES[leader.flock]}${inUse ? "" : " (IDLE)"}`;
    const width = ctx.measureText(text).width;
    const labelX = x + 52 + width > world.width ? x - 52 - width : x + 52;
    this.label(ctx, text, labelX, y, color);
    ctx.globalAlpha = 1;
  }

  drawInspected(ctx, world, boid) {
    const { params } = world;
    const { rules } = this.palette;
    const { rules: forces, pull } = boid.debug;
    const flockColor = this.heads[boid.flock][0];
    const separationRadius = params.perceptionRadius * params.separationRatio;
    const unit = ARROW_LENGTH / params.maxForce;

    // Perception and separation radii.
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = flockColor;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(boid.x, boid.y, params.perceptionRadius, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = rules.separation;
    ctx.beginPath();
    ctx.arc(boid.x, boid.y, separationRadius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // Links to neighbors, each with a tick showing the heading it contributes.
    const neighbors = world.neighborsOf(boid, this.neighbors);
    for (const other of neighbors) {
      const dx = wrapDelta(other.x - boid.x, world.width);
      const dy = wrapDelta(other.y - boid.y, world.height);
      const close = dx * dx + dy * dy < separationRadius * separationRadius;
      ctx.globalAlpha = close ? 0.9 : 0.35;
      ctx.strokeStyle = close ? rules.separation : flockColor;
      ctx.lineWidth = close ? 2.2 : 1.2;
      line(ctx, boid.x, boid.y, boid.x + dx, boid.y + dy);

      const speed = Math.hypot(other.vx, other.vy) || 1;
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = rules.alignment;
      ctx.lineWidth = 2;
      line(
        ctx,
        boid.x + dx,
        boid.y + dy,
        boid.x + dx + (other.vx / speed) * 16,
        boid.y + dy + (other.vy / speed) * 16
      );
    }

    // Center of the neighbors, the target of cohesion.
    if (forces.neighbors > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rules.cohesion;
      ctx.lineWidth = 2.2;
      const { centerX: cx, centerY: cy } = forces;
      line(ctx, cx - 8, cy, cx + 8, cy);
      line(ctx, cx, cy - 8, cx, cy + 8);
    }

    // What the flock is following, and the pull towards it.
    if (pull.sources > 0) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = rules.pull;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 8]);
      line(ctx, boid.x, boid.y, pull.targetX, pull.targetY);
      ctx.setLineDash([]);
    }

    // Selection ring.
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(boid.x, boid.y, 18, 0, TAU);
    ctx.stroke();

    // One arrow per rule, drawn as the weighted force actually applied.
    const arrows = [
      [forces.sepX * params.separation, forces.sepY * params.separation, "separation"],
      [forces.aliX * params.alignment, forces.aliY * params.alignment, "alignment"],
      [forces.cohX * params.cohesion, forces.cohY * params.cohesion, "cohesion"],
    ];
    if (pull.sources > 0) arrows.push([pull.x, pull.y, "pull"]);
    for (const [fx, fy, rule] of arrows) {
      const upper = rule.toUpperCase();
      const name = rule === "pull" ? `${upper} TO ${pull.source.toUpperCase()}` : upper;
      this.forceArrow(ctx, boid, fx, fy, unit, rules[rule], name);
    }

    const count = `${forces.neighbors} NEIGHBORS`;
    const countX = boid.x - ctx.measureText(count).width / 2;
    this.label(ctx, count, countX, boid.y + 34, flockColor);
    ctx.globalAlpha = 1;
  }

  forceArrow(ctx, boid, fx, fy, unit, color, text) {
    const magnitude = Math.hypot(fx, fy);
    const length = Math.min(magnitude * unit, ARROW_MAX);
    if (length < 6) return;
    const ux = fx / magnitude;
    const uy = fy / magnitude;
    const tipX = boid.x + ux * length;
    const tipY = boid.y + uy * length;

    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3.5;
    line(ctx, boid.x, boid.y, tipX, tipY);
    ctx.beginPath();
    ctx.moveTo(tipX + ux * 9, tipY + uy * 9);
    ctx.lineTo(tipX - ux * 5 - uy * 6.5, tipY - uy * 5 + ux * 6.5);
    ctx.lineTo(tipX - ux * 5 + uy * 6.5, tipY - uy * 5 - ux * 6.5);
    ctx.closePath();
    ctx.fill();

    // Text starts past the tip, or ends before it when the arrow points left.
    const textX = ux < 0 ? tipX - 14 - ctx.measureText(text).width : tipX + 14;
    this.label(ctx, text, textX, tipY + uy * 10, color);
  }

  // Draws outlined text in the debug view. It stays on screen, and looks for the nearest
  // spot above or below that doesn't overlap a label already drawn this frame.
  label(ctx, text, x, y, color) {
    const width = ctx.measureText(text).width;
    const { bounds } = this;
    x = Math.min(Math.max(x, 8), bounds.width - width - 8);
    const bottom = (top) => top + LABEL_HEIGHT;
    const clashes = (top) =>
      this.labels.some(
        (r) => x < r.x + r.w && x + width > r.x && top < bottom(r.y) && bottom(top) > r.y
      );
    const isFree = (top) => top >= 4 && bottom(top) <= bounds.height - 4 && !clashes(top);

    let top = y - LABEL_HEIGHT / 2;
    for (let k = 0; k < 16; k++) {
      const offset = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * LABEL_HEIGHT;
      if (isFree(y - LABEL_HEIGHT / 2 + offset)) {
        top = y - LABEL_HEIGHT / 2 + offset;
        break;
      }
    }
    top = Math.min(Math.max(top, 4), bounds.height - LABEL_HEIGHT - 4);
    y = top + LABEL_HEIGHT / 2;
    this.labels.push({ x, y: top, w: width });

    ctx.globalAlpha = 1;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(5, 7, 11, 0.92)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
}
