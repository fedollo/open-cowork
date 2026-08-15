import { Hono } from "hono";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { FsTreeNode } from "@open-loop/shared";
import {
  FolderPickerUnsupportedError,
  pickFolderNative,
} from "../fs/pick-folder.js";
import { addRecent, listRecents } from "../store/recents.js";

const SKIP = new Set(["node_modules", ".git", ".open-loop", "dist", ".next", ".turbo"]);

export const fsRoutes = new Hono();

/** Resolve a relative path under cwd; null if unsafe or invalid. */
export function resolveFileInWorkspace(
  cwd: string,
  relPath: string,
): string | null {
  if (!relPath || relPath.includes("\0")) return null;
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("..")) return null;
  const root = resolve(cwd);
  const full = resolve(root, normalized);
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

fsRoutes.get("/file", async (c) => {
  const cwd = c.req.query("cwd");
  const relPath = c.req.query("path");

  if (!cwd || !relPath) {
    return c.json({ error: "cwd and path query required" }, 400);
  }

  const full = resolveFileInWorkspace(cwd, relPath);
  if (!full) return c.json({ error: "invalid path" }, 400);

  try {
    const st = await stat(full);
    if (!st.isFile()) return c.json({ error: "not a file" }, 400);
    const content = await readFile(full, "utf8");
    return c.json({ path: relPath.replace(/\\/g, "/"), content });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return c.json({ error: "file not found", path: relPath }, 404);
    }
    throw err;
  }
});

fsRoutes.get("/tree", async (c) => {
  const cwd = c.req.query("cwd");
  const depth = Math.min(Number(c.req.query("depth") ?? 2), 4);

  if (!cwd) return c.json({ error: "cwd query required" }, 400);

  const root = resolve(cwd);
  try {
    const st = await stat(root);
    if (!st.isDirectory()) return c.json({ error: "cwd is not a directory" }, 400);
  } catch {
    return c.json({ error: "cwd not found" }, 404);
  }

  const nodes: FsTreeNode[] = [];

  async function walk(dir: string, level: number): Promise<void> {
    if (level > depth) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
      if (SKIP.has(entry.name)) continue;
      const full = join(dir, entry.name);
      const type = entry.isDirectory() ? "dir" : "file";
      nodes.push({ name: entry.name, path: full, type });
      if (type === "dir") await walk(full, level + 1);
    }
  }

  await walk(root, 1);
  return c.json({ cwd: root, nodes });
});


fsRoutes.get("/recents", async (c) => {
  const recents = await listRecents();
  return c.json({ recents });
});

fsRoutes.post("/pick", async (c) => {
  try {
    const path = await pickFolderNative();
    if (!path) {
      const recents = await listRecents();
      return c.json({ path: null, cancelled: true, recents });
    }
    const recents = await addRecent(path);
    return c.json({ path, cancelled: false, recents });
  } catch (err) {
    if (err instanceof FolderPickerUnsupportedError) {
      return c.json({ error: err.message }, 501);
    }
    throw err;
  }
});
