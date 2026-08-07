import { Hono } from "hono";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FsTreeNode } from "@open-cowork/shared";

const SKIP = new Set(["node_modules", ".git", ".open-cowork", "dist", ".next", ".turbo"]);

export const fsRoutes = new Hono();

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
