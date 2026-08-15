import { Hono } from "hono";
import { z } from "zod";
import {
  createPreset,
  deletePreset,
  listPresets,
} from "../store/presets.js";

const gauntletSchema = z.object({
  qualityBar: z.string().min(1),
  boundary: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  cwd: z.string().min(1),
  model: z.string().min(1),
  mode: z.enum(["normal", "gauntlet"]),
  gauntlet: gauntletSchema.optional(),
  integrations: z
    .array(z.enum(["github", "atlascloud", "replicate"]))
    .optional(),
});

export const presetsRoutes = new Hono();

presetsRoutes.get("/", async (c) => {
  const presets = await listPresets();
  return c.json({ presets });
});

presetsRoutes.post("/", async (c) => {
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid body" }, 400);
  }

  if (body.mode === "gauntlet" && !body.gauntlet?.qualityBar?.trim()) {
    return c.json(
      { error: "Gauntlet presets require gauntlet.qualityBar" },
      400,
    );
  }

  try {
    const preset = await createPreset({
      name: body.name.trim(),
      cwd: body.cwd.trim(),
      model: body.model.trim(),
      mode: body.mode,
      gauntlet:
        body.mode === "gauntlet" && body.gauntlet
          ? {
              qualityBar: body.gauntlet.qualityBar.trim(),
              boundary: body.gauntlet.boundary?.trim() || undefined,
            }
          : undefined,
      integrations: body.integrations ?? [],
    });
    return c.json(preset, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save preset";
    return c.json({ error: message }, 400);
  }
});

presetsRoutes.delete("/:id", async (c) => {
  const deleted = await deletePreset(c.req.param("id"));
  if (!deleted) return c.json({ error: "Preset not found" }, 404);
  return c.json({ deleted: true });
});
