import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { WorkspaceContextEntry } from "@open-loop/shared";
import { resolveFileInWorkspace } from "../routes/fs.js";

const PREVIEW_LINE_LIMIT = 20;

const ROOT_CONTEXT_FILES = ["AGENTS.md", ".cursorrules", "CLAUDE.md"] as const;

const CURSOR_RULES_DIR = ".cursor/rules";
const MCP_CONFIG_PATH = ".cursor/mcp.json";

async function readTextPreview(
  fullPath: string,
): Promise<{ preview: string; truncated: boolean } | null> {
  try {
    const st = await stat(fullPath);
    if (!st.isFile()) return null;
    const raw = await readFile(fullPath, "utf8");
    const lines = raw.split(/\r?\n/);
    const truncated = lines.length > PREVIEW_LINE_LIMIT;
    const preview = lines.slice(0, PREVIEW_LINE_LIMIT).join("\n");
    return { preview, truncated };
  } catch {
    return null;
  }
}

function entry(
  path: string,
  exists: boolean,
  preview?: string,
  truncated?: boolean,
): WorkspaceContextEntry {
  return { path, exists, preview, truncated };
}

async function scanRulesDir(root: string): Promise<WorkspaceContextEntry[]> {
  const rulesRoot = resolveFileInWorkspace(root, CURSOR_RULES_DIR);
  if (!rulesRoot) {
    return [entry(CURSOR_RULES_DIR, false)];
  }

  try {
    const st = await stat(rulesRoot);
    if (!st.isDirectory()) {
      return [entry(CURSOR_RULES_DIR, false)];
    }
  } catch {
    return [entry(CURSOR_RULES_DIR, false)];
  }

  let names: string[];
  try {
    names = await readdir(rulesRoot);
  } catch {
    return [entry(CURSOR_RULES_DIR, true, undefined, false)];
  }

  const files = names
    .filter((name) => !name.startsWith("."))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    return [entry(CURSOR_RULES_DIR, true, "(empty directory)", false)];
  }

  const entries: WorkspaceContextEntry[] = [];
  for (const name of files) {
    const relPath = `${CURSOR_RULES_DIR}/${name}`;
    const full = join(rulesRoot, name);
    try {
      const st = await stat(full);
      if (!st.isFile()) continue;
    } catch {
      continue;
    }
    const previewData = await readTextPreview(full);
    entries.push(
      entry(
        relPath,
        true,
        previewData?.preview,
        previewData?.truncated,
      ),
    );
  }

  if (entries.length === 0) {
    return [entry(CURSOR_RULES_DIR, true, "(no readable rule files)", false)];
  }

  return entries;
}

/** Best-effort scan of workspace context files the agent may receive. */
export async function scanWorkspaceContext(
  cwd: string,
): Promise<WorkspaceContextEntry[]> {
  const root = resolve(cwd);
  const files: WorkspaceContextEntry[] = [];

  for (const relPath of ROOT_CONTEXT_FILES) {
    const full = resolveFileInWorkspace(root, relPath);
    if (!full) {
      files.push(entry(relPath, false));
      continue;
    }
    const previewData = await readTextPreview(full);
    files.push(
      entry(
        relPath,
        previewData !== null,
        previewData?.preview,
        previewData?.truncated,
      ),
    );
  }

  files.push(...(await scanRulesDir(root)));

  const mcpFull = resolveFileInWorkspace(root, MCP_CONFIG_PATH);
  if (!mcpFull) {
    files.push(entry(MCP_CONFIG_PATH, false));
  } else {
    const previewData = await readTextPreview(mcpFull);
    files.push(
      entry(
        MCP_CONFIG_PATH,
        previewData !== null,
        previewData?.preview,
        previewData?.truncated,
      ),
    );
  }

  return files;
}

export async function resolveWorkspaceRoot(
  cwd: string,
): Promise<{ root: string } | { error: string; status: 400 | 404 }> {
  const root = resolve(cwd);
  if (root.includes("\0")) {
    return { error: "invalid cwd", status: 400 };
  }
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
