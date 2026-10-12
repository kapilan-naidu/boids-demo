# Boids Demo

Two interactive boid flocks for live lecture demonstrations. Each flock follows three
simple rules (separation, alignment, cohesion). The presenter can combine the flocks with
the mouse. Then the audience joins from their phones, splits into two teams, and fights.

## Run

Requires Node 20 or later.

```bash
npm install
npm start
```

Open the presenter view at <http://localhost:3000/> in Chrome. Phones open `/join/`.
Everything, including p5.js, is served locally, so the presenter view works without
internet access. Without phones, press `S` to rehearse with simulated players.

```bash
npm test
```

## The demo, step by step

1. **Flock.** Two flocks, no controls on screen. The mouse leads the orange flock while it
   moves.
2. **Reveal the rules.** `Q` shows the debug view: the three rules on selected boids, each
   flock's leader, and the quadtree the boids use to find neighbors.
3. **Combine.** Hold **Shift** and lead orange into blue. Every blue boid it touches
   switches sides. Without Shift the flocks just flock.
4. **Bring in the audience.** `J` shows the QR code and join link. Phones join and appear as
   dim diamonds in their team's color. Nothing happens to the flocks yet.
5. **Start audience mode.** Press `A`. Each phone steers its team's flock, and the flocks
   fight: a boid heavily outnumbered by the other flock around it switches sides, so either
   team can win ground back. The fight runs until one flock is gone. Your mouse sits out.
6. **Reset.** `R` restores both flocks. `A` turns audience mode off again.

## Presenter controls

The controls start hidden so the opening looks like a clean artwork. Press `H` to show them.

| Key     | Action                                                  |
| ------- | ------------------------------------------------------- |
| `Space` | Pause / resume                                          |
| `R`     | Reset both flocks to the same starting state            |
| `Q`     | Debug view: the rules, the leaders and the quadtree     |
| `Shift` | Hold: the mouse converts the boids it touches           |
| `A`     | Audience mode on / off (the fight). Off at startup      |
| `J`     | Join QR code and link                                   |
| `X`     | Debug view: clear the selected boids                    |
| `S`     | Simulated audience on / off (also starts audience mode) |
| `C`     | Clear the audience                                      |
| `M`     | Presenter mouse on / off                                |
| `F`     | Fullscreen                                              |
| `H`     | Hide / show the control panel                           |
| `G`     | Glow effects on / off                                   |
| `P`     | FPS counter                                             |
| `?`     | Shortcut list                                           |

A small dot at the bottom right shows the connection to the server. The presenter view
keeps running if it drops, and reconnects by itself.

In debug view, click a boid to add it to (or remove it from) the inspected set, and press
`X` to clear the selection and start again. The legend fades while an inspected boid is
underneath it.

If the frame rate stays below 40 FPS for a few seconds the glow is switched off
automatically. `G` turns it back on.

## How it works

**Flocking.** Every boid steers by three forces, each capped at `maxForce`: separation
(away from crowding), alignment (match neighbors' velocity) and cohesion (toward the center
of neighbors). Boids only see their own flock. Neighbors come from a quadtree rebuilt every
frame, and the world wraps at its edges. A little steering noise and a cruising speed keep
flocks moving.

**Steering.** A flock with no active pointers follows its own wandering leader. Pointers
(your mouse, phones) are blended into one target, weighted by inverse squared distance, so
the nearest dominates and a flock can split between several. The pull is capped, so no
number of pointers overpowers the three rules.

**Shift conversion.** While Shift is held and the mouse is moving, orange boids convert any
blue boids they touch (`conversionRate`).

**The fight.** In audience mode, a boid converts when the other flock's boids within
`fightRadius` outnumber its friends by more than `fightMargin` times. The worse the odds,
the likelier, up to `fightRate` chances per second. A converted boid is then safe for
`fightCooldown` seconds, so nothing flips back and forth at once. With random players a
round lasts about one to two minutes.

**Resolution independence.** The simulation runs in a world 720 units tall and as wide as
the window needs. Phones send positions as fractions of their screen (0 to 1), so they land
in the same place whatever the screen size. Resizing or fullscreen keeps every boid in
place.

## Tuning

Defaults are in [`public/js/sim/config.js`](public/js/sim/config.js). The sliders cover
flock size, the three rule weights, perception radius and max speed. The palette is in CSS
custom properties at the top of [`public/css/presenter.css`](public/css/presenter.css).

## Phones and the server

`server.js` serves `public/` and a WebSocket at `/ws`. Phones send
`{ t: "move", x, y, a }` (position and whether a finger is down). The server validates
every message, clamps coordinates, limits each phone to 30 messages a second, caps frames at
256 bytes, and forwards the result to the presenter. It stores nothing: each phone gets a
random id and a team (the smaller one) when it connects, and both are gone when it
disconnects. Phones that stop touching for 5 minutes are dropped and rejoin on their next
touch. Up to 80 phones are accepted; later ones see "The room is full".

| Variable          | Meaning                                                               |
| ----------------- | --------------------------------------------------------------------- |
| `PORT`            | Port to listen on. Default 3000                                       |
| `HOST`            | Address to bind. Default `localhost`, or `0.0.0.0` when `PORT` is set |
| `PRESENTER_TOKEN` | Secret that protects the presenter view. Required in production       |
| `PUBLIC_URL`      | Address phones should open, if it can't be worked out from the request |
| `MAX_AUDIENCE`    | Most phones at once. Default 80                                       |

When `PRESENTER_TOKEN` is set, open the presenter view as `/?token=YOUR_TOKEN`. Only one
presenter can be connected: a second one replaces the first.

## Deploy to Railway

The app is one Node process with no database, so a single Railway service is enough. Run
only one instance: the connections live in that process's memory.

1. Push the repository to GitHub, then create a Railway project from it. Railway detects
   Node and runs `npm start`.
2. Under **Variables**, set `PRESENTER_TOKEN` to a long random string, for example the
   output of `openssl rand -hex 16`.
3. Under **Settings > Networking**, generate a public domain. Railway serves it over HTTPS,
   and the pages switch to `wss://` automatically.
4. Optionally set the health check path to `/healthz`.
5. Open `https://YOUR-DOMAIN/?token=YOUR_TOKEN` on the presenter laptop and press `J`. The
   QR code and link use the public address.

Check Railway's current plan limits and whether an idle service sleeps before the lecture,
and try the whole thing once with real phones on the venue network.

## Manual smoke test with real phones

- [ ] Presenter view opens with the token and the dot at the bottom right says LIVE.
- [ ] Opening `/` without the token shows an error.
- [ ] `J` shows a QR code; two phones scan it and each shows its team.
- [ ] Two diamonds, one per team color, appear on the presenter screen.
- [ ] Touching a phone moves its diamond within a fraction of a second.
- [ ] A phone locks and unlocks, or loses signal: it reconnects without reloading.
- [ ] Closing a phone's tab removes its diamond.
- [ ] `A` starts the fight; the flocks follow their teams' fingers.
- [ ] `A` off, `C` clear and `R` reset all work mid-demo.
- [ ] With the server stopped, the flocks, debug view and Shift conversion still work.

## Project layout

```
server.js                     entry point: reads the environment, starts the server
server/
  index.js                    static files, WebSocket, presenter token, join QR
  protocol.js                 message validation, rate limiter, team balancing
public/
  index.html                  presenter page
  css/presenter.css
  join/                       phone page (index.html, join.css, join.js)
  js/
    presenter.js              entry point: wires the world, renderer, controls, network
    net.js                    presenter's WebSocket client
    sim/                      simulation, no DOM or p5 dependency
      config.js               defaults and constants
      world.js                flocks, pointers, Shift conversion, the fight
      steering.js             the three rules and pointer pull
      quadtree.js             neighbor lookup (wraps at the edges)
      boid.js, pointer.js, rng.js, simulated-audience.js
    ui/
      renderer.js             canvas drawing: trails, glow, markers, debug overlay
      controls.js             control panel and keyboard shortcuts
      join-panel.js           the QR card
    vendor/p5.min.js          p5.js 1.11.3 (LGPL-2.1), unmodified
test/                         node:test unit and server tests
```
