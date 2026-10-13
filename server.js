// Entry point: `npm start`. Configuration comes from environment variables:
//   PORT             port to listen on (default 3000)
//   HOST             address to bind (default localhost, or 0.0.0.0 when PORT is set)
//   PRESENTER_TOKEN  secret that protects the presenter view (recommended when hosted)
//   PUBLIC_URL       the public address phones should open, if it can't be worked out
//   MAX_AUDIENCE     most phones allowed at once (default 80)

import { createApp } from "./server/index.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "localhost");
const token = process.env.PRESENTER_TOKEN || "";

const app = createApp({
  token,
  publicUrl: process.env.PUBLIC_URL || "",
  maxAudience: Number(process.env.MAX_AUDIENCE) || 80,
});

app.server.listen(PORT, HOST, () => {
  const host = HOST === "0.0.0.0" ? "localhost" : HOST;
  // The token itself is never logged, since logs are often shared or retained.
  const suffix = token ? "?token=YOUR_PRESENTER_TOKEN" : "";
  console.log(`Presenter: http://${host}:${PORT}/${suffix}`);
  console.log(`Phones:    http://${host}:${PORT}/join/`);
  if (!token) {
    console.log("No PRESENTER_TOKEN set: anyone who finds this address can open the");
    console.log("presenter view, and a second presenter replaces the first.");
  }
});
