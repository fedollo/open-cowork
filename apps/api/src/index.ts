import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { initCursorSdk } from "./sdk-init.js";
import { env } from "./env.js";
import { sessionsRoutes } from "./routes/sessions.js";
import { fsRoutes } from "./routes/fs.js";
import { workspaceRoutes } from "./routes/workspace.js";
import { integrationsRoutes } from "./routes/integrations.js";
import { presetsRoutes } from "./routes/presets.js";
import { qualityBarsRoutes } from "./routes/quality-bars.js";
import { disposeAll } from "./agents/registry.js";

initCursorSdk();

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/health", (c) =>
  c.json({ ok: true, hasApiKey: Boolean(env.apiKey) }),
);

app.route("/sessions", sessionsRoutes);
app.route("/fs", fsRoutes);
app.route("/workspace", workspaceRoutes);
app.route("/integrations", integrationsRoutes);
app.route("/presets", presetsRoutes);
app.route("/quality-bars", qualityBarsRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

console.log(`Open Loop API on http://localhost:${env.port}`);
if (!env.apiKey) {
  console.warn("WARNING: CURSOR_API_KEY not set — create/send will fail until configured.");
}

serve({ fetch: app.fetch, port: env.port });

async function shutdown() {
  console.log("Shutting down — disposing agents…");
  await disposeAll();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
