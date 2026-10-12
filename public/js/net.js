// The presenter's connection to the server. Phones' touches arrive here and become
// pointers in the world. The presenter keeps running if the connection drops, and it
// reconnects with a growing delay.

const REPLACED = 4000; // another presenter took over; don't fight it
const UNAUTHORIZED = 4401;

export function connectAudience({ world, token, onStatus, onCount }) {
  const teams = new Map(); // phone id -> team
  let retries = 0;
  let timer = null;

  const add = (id, team) => {
    teams.set(id, team);
    const start = { kind: "remote", flock: team, nx: 0.5, ny: 0.5, active: false };
    world.updatePointer(id, start);
    onCount(teams.size);
  };
  const remove = (id) => {
    if (teams.delete(id)) world.removePointer(id);
    onCount(teams.size);
  };
  const removeAll = () => {
    for (const id of [...teams.keys()]) remove(id);
  };

  const handle = (message) => {
    switch (message.t) {
      case "snapshot":
        removeAll();
        for (const player of message.players) add(player.id, player.team);
        break;
      case "join":
        add(message.id, message.team);
        break;
      case "move":
        if (!teams.has(message.id)) break;
        world.updatePointer(message.id, {
          kind: "remote",
          flock: teams.get(message.id),
          nx: message.x,
          ny: message.y,
          active: message.a,
        });
        break;
      case "leave":
        remove(message.id);
        break;
    }
  };

  const connect = () => {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const query = new URLSearchParams({ role: "presenter", token });
    const socket = new WebSocket(`${scheme}//${location.host}/ws?${query}`);

    socket.onopen = () => {
      retries = 0;
      onStatus("live");
    };
    socket.onmessage = (event) => {
      try {
        handle(JSON.parse(event.data));
      } catch {
        // Ignore anything malformed; the next message will carry on.
      }
    };
    socket.onclose = (event) => {
      removeAll();
      if (event.code === UNAUTHORIZED) return onStatus("unauthorized");
      if (event.code === REPLACED) return onStatus("replaced");
      onStatus("offline");
      timer = setTimeout(connect, Math.min(1000 * 2 ** retries++, 8000));
    };
  };

  connect();
  return { stop: () => clearTimeout(timer) };
}
