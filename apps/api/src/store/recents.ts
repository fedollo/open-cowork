import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { stat } from "node:fs/promises";
import { env } from "../env.js";

const MAX_RECENTS = 10;

interface RecentsFile {
  recents: string[];
}

async function ensureRecentsDir(): Promise<void> {
  await mkdir(dirname(env.recentsPath), { recursive: true });
}

async function readRecentsFile(): Promise<RecentsFile> {
  await ensureRecentsDir();
  try {
    const raw = await readFile(env.recentsPath, "utf8");
    const parsed = JSON.parse(raw) as RecentsFile;
    if (!Array.isArray(parsed.recents)) return { recents: [] };
    return parsed;
  } catch {
    return { recents: [] };
  }
}

async function writeRecentsFile(data: RecentsFile): Promise<void> {
  await ensureRecentsDir();
  await writeFile(env.recentsPath, JSON.stringify(data, null, 2), "utf8");
}

export async function listRecents(): Promise<string[]> {
  const file = await readRecentsFile();
  return file.recents;
}

export async function addRecent(path: string): Promise<string[]> {
  const normalized = path.trim();
  if (!normalized) return listRecents();

  const st = await stat(normalized).catch(() => null);
  if (!st?.isDirectory()) {
    throw new Error("Recent path must be an existing directory");
  }

  const file = await readRecentsFile();
  const next = [
    normalized,
    ...file.recents.filter((entry) => entry !== normalized),
  ].slice(0, MAX_RECENTS);
  await writeRecentsFile({ recents: next });
  return next;
}
