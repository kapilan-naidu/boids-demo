# Boids — Participatory Flocking Demo

## 1. Purpose

Build a reliable, browser-based **live lecture demonstration** that progresses from a conventional Boids flocking simulation to a **participatory system** in which students join from their phones and influence the shared flock.

The demo supports a talk about the shift from **designing fixed outcomes**, to **designing rules and behavior**, to **designing systems and conditions for participation**. It must make that conceptual progression visible, quickly and clearly, to a room of university design students.

**Priority:** dependable live presentation > legibility > interaction > visual polish. Avoid unnecessary complexity.

## 2. Demo narrative / required modes

The presenter should be able to run these moments in sequence without restarting the application:

1. **Flock:** Show a visually compelling swarm of Boids moving according to simple local rules. No debug clutter initially.
2. **Reveal rules:** Toggle a debug/explainer view to expose the simple forces and relationships behind the apparently complex collective movement.
3. **Introduce participation:** Display a QR code and short join URL. Students open a mobile controller in their own browsers; no installation or account required.
4. **Audience affects the system:** Each connected participant becomes a visible agent or force that influences the **same shared simulation**. Their input must have a noticeable but bounded effect on the flock.
5. **Reflect / reset:** Presenter can hide the QR, disable or clear audience inputs, and reset the simulation for a repeatable demonstration.

The distinction between **autonomous Boids** and **audience-controlled agents/forces** must remain easy to see.

## 3. Core simulation

- Implement classic 2D Boids behavior using the three foundational steering rules:
  - **Separation:** avoid crowding nearby Boids.
  - **Alignment:** steer toward the average heading of nearby Boids.
  - **Cohesion:** steer toward the local group's center.
- Animate smoothly in real time on the presentation display.
- Provide sensible default settings that produce a coherent, visually interesting flock without intervention.
- Include configurable parameters for separation, alignment, cohesion, perception radius, maximum speed, maximum steering force, and Boid count. Expose only the most useful controls in the presentation UI; others can be configuration values.
- Keep motion stable: clamp velocity/steering, handle screen edges consistently, and avoid numerical instability.
- Use a high-contrast, projector-friendly visual design. Boids and their heading should be legible from the back of a lecture room.
- Debug mode should clearly visualize relevant neighbors, perception radius, and/or steering vectors for a **small selected subset** of Boids; do not overwhelm the whole screen with diagnostics.
- Label the three rules in the debug/explainer view so a non-programming audience can understand them at a glance.

## 4. Audience participation

### Joining

- The presenter view displays a QR code encoding the **actual reachable mobile join URL**, plus the URL in readable text.
- Students join using an ordinary phone browser over the network. No app, login, or personal data requested.
- Joining and leaving should work while the simulation is running.
- Display the current connected participant count in the presenter UI.
- If a participant disconnects, remove or fade their influence promptly and safely.

### Mobile controller

- Design mobile-first, with a single clear instruction and an immediately usable interaction.
- **Recommended MVP interaction:** a full-screen touch surface that sends normalized pointer coordinates (`x`, `y` in `[0,1]`) to the server; the corresponding participant marker acts as an **attractor** (or repulsor) in the shared simulation.
- Allow each participant to choose **attract / repel** if this can be implemented without complicating onboarding; otherwise ship one interaction mode first.
- Show a clear connected / disconnected state and minimal visual feedback for touch input.
- Throttle outgoing events to avoid flooding the server (e.g. ~15–30 updates/second per active participant).

### Shared effect

- All students influence **one authoritative simulation** shown on the presenter screen, not separate local simulations.
- Participant positions should be mapped to the presentation canvas, independent of phone screen size.
- Render audience agents/forces distinctly from ordinary Boids (e.g. larger marker, different shape).
- Apply audience influence as an additional bounded steering force; preserve enough separation/alignment/cohesion that the flock still demonstrates emergent behavior.
- Multiple participants should combine to produce visible collective effects. Prevent one phone from completely dominating the system.
- Set a configurable maximum active participant count and handle excess joins gracefully. Target a typical lecture room; do not assume a specific class size.

## 5. Presenter controls

Provide a presenter-only control panel or keyboard shortcuts for:

- Start/pause simulation.
- Reset flock to a stable starting state.
- Toggle **clean / debug** views.
- Show/hide **join QR and URL**.
- Enable/disable audience influence independently of connections.
- Clear participant agents/influences without restarting the server.
- Adjust at least Boid count and the three flocking rule weights, preferably via simple sliders.
- Enter/exit full-screen presentation mode.

Controls should be unobtrusive or hideable so the screen can look like a clean artwork during the opening moment. Document shortcuts in the README.

## 6. Architecture and technology

Use a minimal, maintainable stack aligned with the presenter's preferences:

- **Vanilla JavaScript**, HTML, CSS. **No TypeScript**, React, or frontend build pipeline.
- **p5.js** is preferred for the simulation/rendering, but plain Canvas 2D is acceptable if simpler and equally clear.
- **Node.js + Express** for serving the pages and **WebSockets** (e.g. `ws`) for low-latency phone-to-presenter interaction.
- One local server serves both `/presenter` and `/join` (routes may differ if clearly documented).
- Server maintains the authoritative list of participants and relays their latest normalized input to the presenter. For the MVP, the **presenter browser can own the simulation**; server-side physics is not required. The system must not depend on a third-party cloud backend.
- Keep dependencies minimal and pinned in `package.json`; include a lockfile.
- Separate simulation logic, renderer/UI, WebSocket messaging, and server code into understandable modules.

**Networking:** Students' phones must be able to reach the host computer from the venue network. The QR URL must not default to `localhost` (which points to each student's phone). Provide a configurable public/LAN base URL and clear instructions for selecting a reachable host address. Avoid assuming `.local` hostnames work across all phones and venue Wi-Fi configurations. Note that client isolation, captive portals, or firewalls can block local connections; document an alternative network/hotspot or publicly reachable deployment option. If served over HTTPS, use `wss://` WebSockets.

## 7. Reliability and performance

- Aim for ~60 FPS on a modern laptop/desktop browser at presentation resolution; degrade gracefully if needed.
- Remain responsive with a moderate flock (suggested default ~100–200 Boids) and dozens of connected phones. These are starting targets, not hard-coded limits.
- Limit message rates and payload sizes; validate and clamp all incoming participant data server-side.
- Avoid memory leaks or duplicated WebSocket subscriptions after reconnects.
- On phone disconnect or inactivity, expire stale participants after a short configurable timeout.
- Presenter should keep running even if a phone disconnects or the server briefly loses a connection; show a small status indicator and reconnect when possible.
- Provide a **no-audience fallback**: the presenter can demonstrate the core Boids behavior and debug rules even if student connectivity fails.
- Include a **demo/test mode** that simulates several audience agents locally so the participatory effect can be rehearsed without phones.

## 8. Visual and interaction design

- Clean, minimal, high-contrast aesthetic suitable for projection; avoid dense dashboards and unnecessary ornamentation.
- The default presenter screen should prioritize the flock, not the controls.
- Make the difference between ordinary Boids, selected/debug Boids, and audience agents immediately apparent.
- Debug overlays should be readable and selectively enabled.
- The join experience should be self-explanatory in under 10 seconds.
- QR overlay should be large enough to scan from the room; provide a readable fallback URL.
- Adapt presenter canvas to resizing and fullscreen without corrupting normalized participant positions.

## 9. Security and privacy

- Do not collect names, emails, device identifiers, location, or other personal information.
- Assign ephemeral random participant IDs server-side; discard them when participants disconnect/expire.
- Accept only the message types needed for the demo. Validate JSON shape, bounds, and message size; rate-limit updates.
- Do not expose presenter/admin actions through the public join client. Document how presenter access is protected if deployed publicly (e.g. a presenter token or private route with authentication).
- No analytics, trackers, or unnecessary third-party services.

## 10. Deliverables

1. Runnable project source code.
2. `package.json` and lockfile; a single documented command to install and start the app.
3. Presenter view with Boids simulation, debug mode, audience overlay, and controls.
4. Mobile join view with touch interaction and connection feedback.
5. WebSocket server and ephemeral participant handling.
6. QR code generation from configured reachable join URL.
7. `README.md` covering setup, LAN/venue networking, presenter shortcuts, demo sequence, and troubleshooting.
8. Basic automated tests for Boids steering/math and WebSocket message validation, plus a manual multi-device smoke-test checklist.

## 11. Acceptance criteria

The project is ready for the lecture when all of the following work:

- [ ] Run locally with straightforward setup and open presenter view in Chrome.
- [ ] Show a smooth flock without any phones connected.
- [ ] Toggle debug mode to explain separation, alignment, and cohesion visually.
- [ ] Display a QR code that opens a reachable mobile join page (not `localhost`).
- [ ] Connect at least two phones simultaneously and see two distinct agents/forces on the shared presenter canvas.
- [ ] Moving a finger on either phone changes the flock's behavior within a perceptible delay.
- [ ] Combined audience inputs produce visible but stable changes; the flock does not collapse into chaotic or frozen motion.
- [ ] Disconnect/reconnect a phone without restarting the demo.
- [ ] Pause, reset, hide the QR, and clear audience inputs during the presentation.
- [ ] Rehearse participation using simulated agents when phones are unavailable.
- [ ] Continue the standalone flock/debug demonstration if network participation fails.
- [ ] Document a successful test using the actual intended network configuration before the lecture.

## 12. Scope boundaries

**In scope:** 2D Boids, clear rule visualization, shared WebSocket participation, phone touch controls, presenter controls, QR onboarding, basic robustness.

**Out of scope for MVP:** accounts, persistence, databases, participant chat, AI features, audio, complex physics, 3D graphics, elaborate branding, deployment infrastructure beyond simple documented options, and detailed analytics.

## 13. Suggested implementation order

1. Standalone Boids with good defaults and debug overlays.
2. Presenter controls, fullscreen, reset, and visual polish.
3. Node/Express/WebSocket server and phone join page.
4. Participant agents and bounded influence on flock.
5. QR onboarding and network configuration.
6. Reconnection, rate limiting, simulated audience, tests, and rehearsal checklist.

## 14. Decisions to confirm with presenter

The requirements above make reasonable MVP assumptions, but the coding agent should flag these for confirmation rather than silently overbuilding:

- Exact visual style / colors and whether an existing Boids sketch must be reused.
- Attract-only versus attract/repel participant controls.
- Expected peak number of simultaneous student participants.
- Actual venue networking/deployment plan (LAN, hotspot, or public HTTPS host).
- Whether the presenter wants the audience represented as **agents within** the flock or **external forces acting on** it. The MVP uses external forces with visible markers.

**Success is a convincing, repeatable teaching moment:** students first see emergence from simple rules, then experience how their participation changes the behavior of a shared system.
