import { Hono } from "hono";
import { listIntegrationInfo } from "../integrations/catalog.js";

export const integrationsRoutes = new Hono();

integrationsRoutes.get("/", (c) => {
  return c.json({ integrations: listIntegrationInfo() });
});
