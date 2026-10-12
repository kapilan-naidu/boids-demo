// Presenter view: owns the simulation and draws it. p5 is used in instance mode for the
// canvas and the frame loop; the simulation itself has no p5 dependency.

import { WORLD_HEIGHT } from "./sim/config.js";
import { SimulatedAudience } from "./sim/simulated-audience.js";
import { World } from "./sim/world.js";
import { connectAudience } from "./net.js";
import { bindControls, createToast } from "./ui/controls.js";
import { showJoin } from "./ui/join-panel.js";
import { Renderer, readPalette } from "./ui/renderer.js";

const PRESENTER_ID = "presenter";
const SLOW_FPS = 40; // below this for a few seconds, glow is switched off
const SLOW_SECONDS = 3;

const stage = document.getElementById("stage");
const worldWidth = () => WORLD_HEIGHT * (window.innerWidth / window.innerHeight);

const world = new World({ width: worldWidth() });
const audience = new SimulatedAudience();
const renderer = new Renderer(readPalette());
const toast = createToast(document.getElementById("toast"));
const legend = document.getElementById("legend");

const state = {
  paused: false,
  debug: false,
  panel: false,
  help: false,
  perf: false,
  join: false,
  simulate: false,
  simulatedPlayers: 24,
};

const onOff = (value) => (value ? "on" : "off");

const loadJoin = () =>
  showJoin({
    qr: document.getElementById("join-qr"),
    url: document.getElementById("join-url"),
    note: document.getElementById("join-note"),
  });

// The legend's footprint in world units, with room around it for an inspected boid's
// labels. Null while the legend is hidden.
function legendArea(margin = 0.12) {
  const box = legend.getBoundingClientRect();
  if (box.width === 0) return null;
  const pad = window.innerHeight * margin;
  const toWorld = world.width / window.innerWidth;
  return {
    x0: (box.left - pad) * toWorld,
    x1: (box.right + pad) * toWorld,
    y0: (box.top - pad) * toWorld,
    y1: (box.bottom + pad) * toWorld,
  };
}

const actions = {
  pause() {
    state.paused = !state.paused;
    toast(state.paused ? "Paused" : "Running");
  },
  reset() {
    world.reset();
    if (state.debug) world.autoInspect({ avoid: legendArea() });
    toast("Reset");
  },
  debug() {
    state.debug = !state.debug;
    if (state.debug) {
      controls.sync(); // shows the legend, so it can be measured
      world.autoInspect({ avoid: legendArea() });
    } else {
      world.clearInspected();
    }
    toast(state.debug ? "Debug view" : "Clean view");
  },
  fullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement
        .requestFullscreen?.()
        .catch(() => toast("Fullscreen blocked"));
    }
  },
  deselect() {
    if (!state.debug) return;
    world.clearInspected();
    toast("Selection cleared");
  },
  panel() {
    state.panel = !state.panel;
  },
  help() {
    state.help = !state.help;
  },
  perf() {
    state.perf = !state.perf;
  },
  glow() {
    renderer.quality = renderer.quality === "high" ? "low" : "high";
    toast(`Glow ${onOff(renderer.quality === "high")}`);
  },
  presenterMouse() {
    world.presenterEnabled = !world.presenterEnabled;
    toast(`Mouse ${onOff(world.presenterEnabled)}`);
  },
  audience() {
    world.audienceEnabled = !world.audienceEnabled;
    if (world.audienceEnabled) loadJoin();
    toast(`Audience mode ${onOff(world.audienceEnabled)}`);
  },
  simulate() {
    state.simulate = !state.simulate;
    // Rehearsing the audience means starting audience mode.
    if (state.simulate) {
      world.audienceEnabled = true;
      loadJoin();
    }
    audience.setCount(state.simulate ? state.simulatedPlayers : 0, world);
    toast(`Simulated audience ${onOff(state.simulate)}`);
  },
  simulatedPlayersChanged() {
    if (state.simulate) audience.setCount(state.simulatedPlayers, world);
  },
  join() {
    state.join = !state.join;
    if (state.join) loadJoin();
  },
  clear() {
    audience.clear(world);
    world.clearAudience();
    state.simulate = false;
    toast("Audience cleared");
  },
};

const controls = bindControls({ world, state, actions });
controls.sync();

// Phones connect through the server. The presenter works without it, so a dropped
// connection only changes the status dot.
const netLabels = {
  live: "Live",
  offline: "Reconnecting",
  unauthorized: "Wrong presenter link",
  replaced: "Another presenter is connected",
};
connectAudience({
  world,
  token: new URLSearchParams(location.search).get("token") ?? "",
  onStatus: (status) => {
    const net = document.getElementById("net");
    net.dataset.status = status;
    document.getElementById("net-label").textContent = netLabels[status];
  },
  onCount: (count) => {
    document.getElementById("join-count").textContent = count;
  },
});
toast("H controls · ? shortcuts");

// The mouse leads flock A while it is moving. Holding Shift also lets it convert the
// other flock's boids that it touches.
const setConverting = (on) => (world.presenterConverting = on);
window.addEventListener("keydown", (e) => e.key === "Shift" && setConverting(true));
window.addEventListener("keyup", (e) => e.key === "Shift" && setConverting(false));
window.addEventListener("blur", () => setConverting(false));

stage.addEventListener("pointermove", (event) => {
  setConverting(event.shiftKey);
  world.updatePointer(PRESENTER_ID, {
    kind: "presenter",
    flock: 0,
    nx: event.clientX / window.innerWidth,
    ny: event.clientY / window.innerHeight,
  });
});
stage.addEventListener("pointerleave", () => world.setPointerActive(PRESENTER_ID, false));

// In debug view, clicking a boid adds it to (or removes it from) the inspected set.
stage.addEventListener("pointerdown", (event) => {
  if (!state.debug) return;
  const x = (event.clientX / window.innerWidth) * world.width;
  const y = (event.clientY / window.innerHeight) * world.height;
  const boid = world.nearestBoid(x, y, 40);
  if (boid) world.toggleInspect(boid);
});

new p5((sketch) => {
  let fps = 60;
  let slowTime = 0;
  let statsClock = 0;

  sketch.setup = () => {
    sketch.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
    sketch.createCanvas(window.innerWidth, window.innerHeight).parent(stage);
  };

  sketch.windowResized = () => {
    sketch.resizeCanvas(window.innerWidth, window.innerHeight);
    world.resize(worldWidth());
  };

  sketch.draw = () => {
    const dt = sketch.deltaTime / 1000;
    if (!state.paused) {
      audience.update(dt, world);
      world.step(dt);
    }

    const density = sketch.pixelDensity();
    renderer.draw(
      sketch.drawingContext,
      world,
      state,
      sketch.width * density,
      sketch.height * density
    );

    if (dt > 0) fps += (1 / dt - fps) * 0.05;
    fadeLegendOverInspected();
    degradeIfSlow(dt);
    statsClock += dt;
    if (statsClock > 0.25) {
      statsClock = 0;
      controls.updateStats(fps);
    }
  };

  // The legend gets out of the way while an inspected boid is underneath it.
  function fadeLegendOverInspected() {
    if (!state.debug) return;
    const area = legendArea();
    const covered =
      area &&
      world.boids.some(
        (boid) =>
          boid.inspect &&
          boid.x > area.x0 &&
          boid.x < area.x1 &&
          boid.y > area.y0 &&
          boid.y < area.y1
      );
    legend.classList.toggle("is-faded", Boolean(covered));
  }

  // Drops the glow effects if the machine can't keep up, rather than stuttering on stage.
  function degradeIfSlow(dt) {
    if (renderer.quality !== "high" || state.paused || dt > 0.25) return;
    slowTime = fps < SLOW_FPS ? slowTime + dt : Math.max(0, slowTime - dt);
    if (slowTime > SLOW_SECONDS) {
      renderer.quality = "low";
      toast("Glow off: low frame rate");
    }
  }
});
