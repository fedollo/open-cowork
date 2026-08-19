import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  QUALITY_BAR_TEMPLATES,
  type QualityBarCategory,
  type QualityBarIntegrationId,
  type QualityBarTemplate,
  type QualityBarTemplateRecord,
} from "@open-loop/shared";
import { env } from "../env.js";

const ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

export class QualityBarStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QualityBarStoreError";
  }
}

function builtinRecords(): QualityBarTemplateRecord[] {
  return QUALITY_BAR_TEMPLATES.map((t) => ({ ...t, source: "builtin" as const }));
}

function isBuiltinId(id: string): boolean {
  return QUALITY_BAR_TEMPLATES.some((t) => t.id === id);
}

async function ensureCustomDir(): Promise<void> {
  await mkdir(env.qualityBarsCustomDir, { recursive: true });
}

function templatePath(id: string): string {
  return join(env.qualityBarsCustomDir, `${id}.json`);
}

function parseCustomFile(raw: string, filename: string): QualityBarTemplate {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new QualityBarStoreError(`Invalid JSON in ${filename}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new QualityBarStoreError(`Invalid template object in ${filename}`);
  }
  const t = parsed as Partial<QualityBarTemplate>;
  if (!t.id || !t.label || !t.category || !t.goal || !t.qualityBar) {
    throw new QualityBarStoreError(`Missing required fields in ${filename}`);
  }
  if (t.id !== filename.replace(/\.json$/, "")) {
    throw new QualityBarStoreError(
      `Template id "${t.id}" must match filename ${filename}`,
    );
  }
  return {
    id: t.id,
    label: t.label,
    category: t.category,
    goal: t.goal,
    qualityBar: t.qualityBar,
    boundary: t.boundary,
    integrations: t.integrations,
  };
}

export async function listCustomQualityBars(): Promise<QualityBarTemplateRecord[]> {
  await ensureCustomDir();
  let names: string[];
  try {
    names = await readdir(env.qualityBarsCustomDir);
  } catch {
    return [];
  }
  const out: QualityBarTemplateRecord[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json") || name === ".gitkeep") continue;
    const raw = await readFile(join(env.qualityBarsCustomDir, name), "utf8");
    const template = parseCustomFile(raw, name);
    out.push({ ...template, source: "custom" });
  }
  return out;
}

export async function listAllQualityBars(): Promise<QualityBarTemplateRecord[]> {
  const custom = await listCustomQualityBars();
  return [...builtinRecords(), ...custom];
}

export async function getQualityBarById(
  id: string,
): Promise<QualityBarTemplateRecord | undefined> {
  const builtin = QUALITY_BAR_TEMPLATES.find((t) => t.id === id);
  if (builtin) return { ...builtin, source: "builtin" };
  const custom = await listCustomQualityBars();
  return custom.find((t) => t.id === id);
}

export function validateQualityBarId(id: string): void {
  if (!ID_RE.test(id)) {
    throw new QualityBarStoreError(
      "id must be lowercase alphanumeric with hyphens (2–63 chars)",
    );
  }
}

export async function createCustomQualityBar(
  input: QualityBarTemplate,
): Promise<QualityBarTemplateRecord> {
  validateQualityBarId(input.id);
  if (isBuiltinId(input.id)) {
    throw new QualityBarStoreError(`id "${input.id}" conflicts with a built-in template`);
  }
  await ensureCustomDir();
  const path = templatePath(input.id);
  try {
    await readFile(path, "utf8");
    throw new QualityBarStoreError(`Custom template "${input.id}" already exists`);
  } catch (err) {
    if (err instanceof QualityBarStoreError) throw err;
    // ENOENT — ok to create
  }
  const { id, label, category, goal, qualityBar, boundary, integrations } =
    input;
  const payload: QualityBarTemplate = {
    id,
    label: label.trim(),
    category,
    goal: goal.trim(),
    qualityBar: qualityBar.trim(),
    boundary: boundary?.trim() || undefined,
    integrations,
  };
  await writeFile(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return { ...payload, source: "custom" };
}

export async function updateCustomQualityBar(
  id: string,
  input: Omit<QualityBarTemplate, "id">,
): Promise<QualityBarTemplateRecord> {
  if (isBuiltinId(id)) {
    throw new QualityBarStoreError("Built-in templates cannot be edited here");
  }
  await ensureCustomDir();
  const path = templatePath(id);
  try {
    await readFile(path, "utf8");
  } catch {
    throw new QualityBarStoreError(`Custom template "${id}" not found`);
  }
  const payload: QualityBarTemplate = {
    id,
    label: input.label.trim(),
    category: input.category,
    goal: input.goal.trim(),
    qualityBar: input.qualityBar.trim(),
    boundary: input.boundary?.trim() || undefined,
    integrations: input.integrations,
  };
  await writeFile(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return { ...payload, source: "custom" };
}

export async function deleteCustomQualityBar(id: string): Promise<boolean> {
  if (isBuiltinId(id)) {
    throw new QualityBarStoreError("Built-in templates cannot be deleted");
  }
  const path = templatePath(id);
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

export const QUALITY_BAR_CATEGORIES: QualityBarCategory[] = [
  "visual",
  "video",
  "writing",
  "marketing",
  "dev",
];

export const QUALITY_BAR_INTEGRATION_IDS: QualityBarIntegrationId[] = [
  "github",
  "atlascloud",
  "replicate",
];
