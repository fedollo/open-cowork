import { Hono } from "hono";
import { z } from "zod";
import {
  createCustomQualityBar,
  deleteCustomQualityBar,
  getQualityBarById,
  listAllQualityBars,
  QualityBarStoreError,
  updateCustomQualityBar,
  validateQualityBarId,
} from "../store/quality-bars.js";

const categorySchema = z.enum([
  "visual",
  "video",
  "writing",
  "marketing",
  "dev",
]);

const integrationSchema = z.enum(["github", "atlascloud", "replicate"]);

const bodySchema = z.object({
  id: z.string().min(2).max(63).optional(),
  label: z.string().min(1),
  category: categorySchema,
  goal: z.string().min(1),
  qualityBar: z.string().min(1),
  boundary: z.string().optional(),
  integrations: z.array(integrationSchema).optional(),
});

export const qualityBarsRoutes = new Hono();

qualityBarsRoutes.get("/", async (c) => {
  const templates = await listAllQualityBars();
  return c.json({ templates });
});

qualityBarsRoutes.get("/:id", async (c) => {
  const template = await getQualityBarById(c.req.param("id"));
  if (!template) return c.json({ error: "Template not found" }, 404);
  return c.json(template);
});

qualityBarsRoutes.post("/", async (c) => {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid body" }, 400);
  }
  if (!body.id?.trim()) {
    return c.json({ error: "id is required when creating a template" }, 400);
  }
  try {
    validateQualityBarId(body.id.trim());
    const created = await createCustomQualityBar({
      id: body.id.trim(),
      label: body.label,
      category: body.category,
      goal: body.goal,
      qualityBar: body.qualityBar,
      boundary: body.boundary,
      integrations: body.integrations,
    });
    return c.json(created, 201);
  } catch (err) {
    if (err instanceof QualityBarStoreError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

qualityBarsRoutes.put("/:id", async (c) => {
  const id = c.req.param("id");
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid body" }, 400);
  }
  try {
    const updated = await updateCustomQualityBar(id, {
      label: body.label,
      category: body.category,
      goal: body.goal,
      qualityBar: body.qualityBar,
      boundary: body.boundary,
      integrations: body.integrations,
    });
    return c.json(updated);
  } catch (err) {
    if (err instanceof QualityBarStoreError) {
      const status = err.message.includes("not found") ? 404 : 400;
      return c.json({ error: err.message }, status);
    }
    throw err;
  }
});

qualityBarsRoutes.delete("/:id", async (c) => {
  try {
    const deleted = await deleteCustomQualityBar(c.req.param("id"));
    if (!deleted) return c.json({ error: "Template not found" }, 404);
    return c.json({ deleted: true });
  } catch (err) {
    if (err instanceof QualityBarStoreError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});
