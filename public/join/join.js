// Phone page: a full-screen touch surface that sends where the finger is, as fractions of
// the screen (0 to 1), about 20 times a second. Nothing is stored and nothing personal is
// sent.

const SEND_INTERVAL = 50; // ms between updates
const FULL = 4429; // the room is full
const IDLE = 4408; // dropped for not touching; touch again to rejoin
const TEAM_NAMES = ["Orange team", "Blue team"];

const surface = document.getElementById("surface");
const finger = document.getElementById("finger");
const status = document.getElementById("status");
const team = document.getElementById("team");

let socket = null;
let retries = 0;
let retryTimer = null;
let latest = { x: 0.5, y: 0.5, down: false };
let dirty = false;

function setState(state, text) {
  surface.dataset.state = state;
  status.textContent = text;
}

function connect() {
  clearTimeout(retryTimer);
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${scheme}//${location.host}/ws?role=audience`);

  socket.onopen = () => {
    retries = 0;
    setState("connected", "Connected");
  };
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.t === "hello") {
        surface.dataset.team = message.team;
        team.textContent = TEAM_NAMES[message.team] ?? "";
      }
    } catch {
      // Ignore anything unexpected.
    }
  };
  socket.onclose = (event) => {
    socket = null;
    if (event.code === FULL) return setState("full", "The room is full");
    if (event.code === IDLE) return setState("idle", "Touch to rejoin");
    setState("connecting", "Reconnecting");
    retryTimer = setTimeout(connect, Math.min(1000 * 2 ** retries++, 8000));
  };
}

function isOpen() {
  return socket?.readyState === WebSocket.OPEN;
}

function update(event) {
  latest = {
    x: Math.min(1, Math.max(0, event.clientX / window.innerWidth)),
    y: Math.min(1, Math.max(0, event.clientY / window.innerHeight)),
    down: event.type !== "pointerup" && event.type !== "pointercancel",
  };
  dirty = true;
  finger.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
  finger.classList.toggle("is-down", latest.down);
}

for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
  surface.addEventListener(type, (event) => {
    event.preventDefault();
    if (type === "pointermove" && !latest.down) return;
    if (type === "pointerdown") {
      surface.setPointerCapture(event.pointerId);
      if (!socket) connect(); // rejoin after being dropped for idling
    }
    update(event);
  });
}

// One message per tick at most, however fast the touch events arrive.
setInterval(() => {
  if (!dirty || !isOpen()) return;
  dirty = false;
  socket.send(JSON.stringify({ t: "move", x: latest.x, y: latest.y, a: latest.down }));
}, SEND_INTERVAL);

connect();
