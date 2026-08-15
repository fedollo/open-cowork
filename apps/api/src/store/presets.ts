import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { nanoid } from "nanoid";
import type { WorkspacePreset } from "@open-loop/shared";
import { env } from "../env.js";

const MAX_PRESETS = 20;

interface PresetsFile {
  presets: WorkspacePreset[];
}

async function ensurePresetsDir(): Promise<void> {
  await mkdir(dirname(env.presetsPath), { recursive: true });
}

async function readPresetsFile(): Promise<PresetsFile> {
  await ensurePresetsDir();
  try {
    const raw = await readFile(env.presetsPath, "utf8");
    const parsed = JSON.parse(raw) as PresetsFile;
    if (!Array.isArray(parsed.presets)) return { presets: [] };
    return parsed;
  } catch {
    return { presets: [] };
  }
}

async function writePresetsFile(data: PresetsFile): Promise<void> {
  await ensurePresetsDir();
  await writeFile(env.presetsPath, JSON.stringify(data, null, 2), "utf8");
}

export async function listPresets(): Promise<WorkspacePreset[]> {
  const file = await readPresetsFile();
  return file.presets.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createPreset(
  input: Omit<WorkspacePreset, "id" | "createdAt" | "updatedAt">,
): Promise<WorkspacePreset> {
  const file = await readPresetsFile();
  if (file.presets.length >= MAX_PRESETS) {
    throw new Error(`Maximum of ${MAX_PRESETS} presets reached`);
  }
  const now = new Date().toISOString();
  const preset: WorkspacePreset = {
    id: nanoid(10),
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  file.presets.push(preset);
  await writePresetsFile(file);
  return preset;
}

export async function deletePreset(id: string): Promise<boolean> {
  const file = await readPresetsFile();
  const next = file.presets.filter((p) => p.id !== id);
  if (next.length === file.presets.length) return false;
  await writePresetsFile({ presets: next });
  return true;
}
