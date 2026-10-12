// Connects the control panel and keyboard shortcuts to the app's actions, and keeps the
// panel in step with the app's state.

const SHORTCUTS = {
  " ": "pause",
  r: "reset",
  q: "debug",
  f: "fullscreen",
  h: "panel",
  m: "presenterMouse",
  a: "audience",
  s: "simulate",
  c: "clear",
  j: "join",
  x: "deselect",
  g: "glow",
  p: "perf",
  "?": "help",
};

export function createToast(element) {
  let timer;
  return (message) => {
    element.textContent = message;
    element.classList.add("is-visible");
    clearTimeout(timer);
    timer = setTimeout(() => element.classList.remove("is-visible"), 1500);
  };
}

export function bindControls({ world, state, actions }) {
  const byId = (id) => document.getElementById(id);
  const panel = byId("panel");
  const legend = byId("legend");
  const help = byId("help");
  const perf = byId("perf");
  const status = byId("status");

  // Buttons that show an on/off state, and where that state lives.
  const pressed = {
    pause: () => state.paused,
    debug: () => state.debug,
    presenterMouse: () => world.presenterEnabled,
    audience: () => world.audienceEnabled,
    simulate: () => state.simulate,
    join: () => state.join,
  };

  const sliders = [...document.querySelectorAll("input[data-param], input[data-state]")];
  const readValue = (input) =>
    input.dataset.param ? world.params[input.dataset.param] : state[input.dataset.state];

  function sync() {
    panel.hidden = !state.panel;
    legend.hidden = !state.debug;
    help.hidden = !state.help;
    perf.hidden = !state.perf;
    // Audience mode keeps a small QR on screen for latecomers; J opens the big card.
    const join = byId("join");
    join.hidden = !(state.join || world.audienceEnabled);
    join.dataset.size = state.join ? "large" : "compact";
    status.textContent = state.paused ? "Paused" : "Running";

    for (const button of document.querySelectorAll("button[data-action]")) {
      const isPressed = pressed[button.dataset.action];
      if (isPressed) button.setAttribute("aria-pressed", String(isPressed()));
    }
    for (const input of sliders) {
      const value = readValue(input);
      input.value = value;
      const output = input.parentElement.querySelector(".control__value");
      output.value = format(value, input.step);
    }
  }

  function run(name) {
    actions[name]?.();
    sync();
  }

  for (const button of document.querySelectorAll("button[data-action]")) {
    button.addEventListener("click", () => {
      run(button.dataset.action);
      // So that Space keeps meaning "pause" rather than "press this button again".
      button.blur();
    });
  }

  for (const input of sliders) {
    input.addEventListener("input", () => {
      const value = Number(input.value);
      if (input.dataset.param === "boidsPerFlock") {
        world.setBoidsPerFlock(value);
      } else if (input.dataset.param) {
        world.params[input.dataset.param] = value;
      } else {
        state[input.dataset.state] = value;
        actions.simulatedPlayersChanged?.();
      }
      sync();
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const action = SHORTCUTS[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    if (event.target instanceof HTMLButtonElement) event.target.blur();
    run(action);
  });

  return {
    sync,
    // Cheap per-frame readouts; the DOM is only touched when something changed.
    updateStats(fps) {
      const [a, b] = world.counts;
      const total = a + b || 1;
      byId("count-a").textContent = a;
      byId("count-b").textContent = b;
      byId("bar-a").style.width = `${(a / total) * 100}%`;
      byId("bar-b").style.width = `${(b / total) * 100}%`;
      const mode = world.fighting ? "Contest" : "Running";
      status.textContent = state.paused ? "Paused" : mode;
      if (state.perf) perf.textContent = `FPS ${Math.round(fps)}`;
    },
  };
}

function format(value, step) {
  return Number(step) < 1 ? Number(value).toFixed(1) : String(Math.round(value));
}
