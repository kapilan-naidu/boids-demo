// Entry point: `npm start`. Configuration comes from environment variables:
//   PORT             port to listen on (default 3000)
//   HOST             address to bind (default localhost, or 0.0.0.0 when PORT is set)
//   PRESENTER_TOKEN  secret that protects the presenter view; required in production
//   PUBLIC_URL       the public address phones should open, if it can't be worked out
//   MAX_AUDIENCE     most phones allowed at once (default 80)

import { createApp } from "./server/index.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "localhost");
const token = process.env.PRESENTER_TOKEN || "";

if (!token && process.env.NODE_ENV === "production") {
  console.error("PRESENTER_TOKEN must be set in production, or anyone could open the");
  console.error("presenter view and take over the screen.");
  process.exit(1);
}

const app = createApp({
  token,
  publicUrl: process.env.PUBLIC_URL || "",
  maxAudience: Number(process.env.MAX_AUDIENCE) || 80,
});

app.server.listen(PORT, HOST, () => {
  const host = HOST === "0.0.0.0" ? "localhost" : HOST;
  const suffix = token ? `?token=${token}` : "";
  console.log(`Presenter: http://${host}:${PORT}/${suffix}`);
  console.log(`Phones:    http://${host}:${PORT}/join/`);
  if (!token) console.log("No PRESENTER_TOKEN set: the presenter view is open to anyone.");
});
