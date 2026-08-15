import { Hono } from "hono";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  WorkspaceChangesResponse,
  WorkspaceContextResponse,
  WorkspaceDiffResponse,
} from "@open-loop/shared";
import { resolveFileInWorkspace } from "./fs.js";
import {
  getUnifiedDiff,
  listChangesSinceBaseline,
  listGitWorkingTreeChanges,
} from "../sessions/git-snapshot.js";
import {
  resolveWorkspaceRoot,
  scanWorkspaceContext,
} from "../workspace/context-scan.js";

export const workspaceRoutes = new Hono();

async function resolveWorkspaceDir(
  cwd: string,
): Promise<{ root: string } | { error: string; status: 400 | 404 }> {
  const root = resolve(cwd);
  try {
    const st = await stat(root);
    if (!st.isDirectory()) {
      return { error: "cwd is not a directory", status: 400 };
    }
  } catch {
    return { error: "cwd not found", status: 404 };
  }
  return { root };
}

workspaceRoutes.get("/changes", async (c) => {
  const cwd = c.req.query("cwd");
  const baseline = c.req.query("baseline") || undefined;

  if (!cwd) return c.json({ error: "cwd query required" }, 400);

  const resolved = await resolveWorkspaceDir(cwd);
  if ("error" in resolved) {
    return c.json({ error: resolved.error }, resolved.status);
  }

  const changes = baseline
    ? await listChangesSinceBaseline(resolved.root, baseline)
    : await listGitWorkingTreeChanges(resolved.root);

  if (changes === null) {
    const body: WorkspaceChangesResponse = {
      isGitRepo: false,
      cwd: resolved.root,
      baseline,
      changes: [],
    };
    return c.json(body);
  }

  const body: WorkspaceChangesResponse = {
    isGitRepo: true,
    cwd: resolved.root,
    baseline,
    changes,
  };
  return c.json(body);
});

workspaceRoutes.get("/diff", async (c) => {
  const cwd = c.req.query("cwd");
  const relPath = c.req.query("path");
  const baseline = c.req.query("baseline") || undefined;

  if (!cwd || !relPath) {
    return c.json({ error: "cwd and path query required" }, 400);
  }

  const resolved = await resolveWorkspaceDir(cwd);
  if ("error" in resolved) {
    return c.json({ error: resolved.error }, resolved.status);
  }

  const full = resolveFileInWorkspace(resolved.root, relPath);
  if (!full) return c.json({ error: "invalid path" }, 400);

  const normalizedPath = relPath.replace(/\\/g, "/");
  const diff = await getUnifiedDiff(resolved.root, normalizedPath, baseline);
  if (diff === null) {
    const body: WorkspaceDiffResponse = {
      path: normalizedPath,
      diff: "",
    };
    return c.json(body);
  }

  const body: WorkspaceDiffResponse = {
    path: normalizedPath,
    diff,
  };
  return c.json(body);
});

workspaceRoutes.get("/context", async (c) => {
  const cwd = c.req.query("cwd");

  if (!cwd) return c.json({ error: "cwd query required" }, 400);

  const resolved = await resolveWorkspaceRoot(cwd);
  if ("error" in resolved) {
    return c.json({ error: resolved.error }, resolved.status);
  }

  const files = await scanWorkspaceContext(resolved.root);
  const body: WorkspaceContextResponse = {
    cwd: resolved.root,
    files,
  };
  return c.json(body);
});

