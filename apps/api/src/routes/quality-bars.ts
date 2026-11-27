import { lintQualityBar } from "@open-loop/shared";
import { Hono } from "hono";
import { z } from "zod";
import { generateQualityBarDraft } from "../quality-bars/generate.js";
import { env } from "../env.js";
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

const wizardDraftSchema = z.object({
  label: z.string().optional(),
  goal: z.string().optional(),
  qualityBar: z.string().optional(),
  boundary: z.string().optional(),
});

const generateSchema = z.object({
  mode: z.enum(["create", "refine"]),
  intent: z.string().min(10).optional(),
  category: categorySchema,
  integrations: z.array(integrationSchema).optional(),
  referenceTemplateId: z.string().optional(),
  draft: wizardDraftSchema.optional(),
  refineInstruction: z.string().optional(),
  model: z.string().optional(),
});

qualityBarsRoutes.post("/lint", async (c) => {
  let body: {
    id?: string;
    label?: string;
    goal?: string;
    qualityBar?: string;
    boundary?: string;
  };
  try {
    body = z
      .object({
        id: z.string().optional(),
        label: z.string().optional(),
        goal: z.string().optional(),
        qualityBar: z.string().optional(),
        boundary: z.string().optional(),
      })
      .parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid body" }, 400);
  }
  return c.json(lintQualityBar(body));
});

qualityBarsRoutes.post("/generate", async (c) => {
  if (!env.atlasApiKey.trim()) {
    return c.json(
      {
        error:
          "ATLASCLOUD_API_KEY is required for AI generation. Set it in .env and restart the API.",
      },
      503,
    );
  }
  let body: z.infer<typeof generateSchema>;
  try {
    body = generateSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid body" }, 400);
  }
  if (body.mode === "create" && !body.intent?.trim()) {
    return c.json({ error: "intent is required for create mode" }, 400);
  }
  if (body.mode === "refine" && !body.draft) {
    return c.json({ error: "draft is required for refine mode" }, 400);
  }
  try {
    const draft = await generateQualityBarDraft({
      mode: body.mode,
      intent: body.intent ?? "",
      category: body.category,
      integrations: body.integrations,
      referenceTemplateId: body.referenceTemplateId,
      draft: body.draft,
      refineInstruction: body.refineInstruction,
      model: body.model,
    });
    return c.json({ draft, lint: lintQualityBar(draft) });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Generation failed";
    return c.json({ error: message }, 502);
  }
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
