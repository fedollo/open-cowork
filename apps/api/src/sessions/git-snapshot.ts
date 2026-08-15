import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitWorkingTreeLine {
  status: string;
  path: string;
}

export function parseNameStatusLines(stdout: string): GitWorkingTreeLine[] {
  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const status = parts[0]?.trim() || "?";
      const path = parts[parts.length - 1]?.trim() ?? "";
      return { status, path };
    })
    .filter((entry) => entry.path.length > 0);
}

async function runGit(
  cwd: string,
  args: string[],
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

/** Best-effort `git rev-parse HEAD`; null if not a git repo. */
export async function getGitHeadRef(cwd: string): Promise<string | null> {
  const stdout = await runGit(cwd, ["rev-parse", "HEAD"]);
  const ref = stdout?.trim();
  return ref || null;
}

/** Best-effort `git status --porcelain`; null if not a git repo. */
export async function listGitWorkingTreeChanges(
  cwd: string,
): Promise<GitWorkingTreeLine[] | null> {
  const stdout = await runGit(cwd, ["status", "--porcelain"]);
  if (stdout === null) return null;

  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2).trim() || "?";
      let path = line.slice(3).trim();
      if (path.includes(" -> ")) {
        path = path.split(" -> ").pop()!.trim();
      }
      return { status, path };
    });
}

/** Changes since a baseline commit plus untracked files. */
export async function listChangesSinceBaseline(
  cwd: string,
  baseline: string,
): Promise<GitWorkingTreeLine[] | null> {
  const diffOut = await runGit(cwd, ["diff", "--name-status", baseline]);
  if (diffOut === null) return null;

  const changes = parseNameStatusLines(diffOut);
  const seen = new Set(changes.map((c) => c.path));

  const untrackedOut = await runGit(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]);
  if (untrackedOut) {
    for (const path of untrackedOut
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean)) {
      if (!seen.has(path)) {
        changes.push({ status: "??", path });
        seen.add(path);
      }
    }
  }

  return changes;
}

/** Unified diff for one path; empty string when no diff. Null if git unavailable. */
export async function getUnifiedDiff(
  cwd: string,
  relPath: string,
  baseline?: string,
): Promise<string | null> {
  if (baseline) {
    const diffOut = await runGit(cwd, ["diff", baseline, "--", relPath]);
    if (diffOut === null) return null;
    if (diffOut.trim()) return diffOut;

    const untrackedOut = await runGit(cwd, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "--",
      relPath,
    ]);
    if (untrackedOut?.trim()) {
      const full = resolve(cwd, relPath);
      const noIndexOut = await runGit(cwd, [
        "diff",
        "--no-index",
        "--",
        "/dev/null",
        full,
      ]);
      return noIndexOut ?? "";
    }

    return "";
  }

  const diffOut = await runGit(cwd, ["diff", "--", relPath]);
  if (diffOut === null) return null;
  if (diffOut.trim()) return diffOut;

  const untrackedOut = await runGit(cwd, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    relPath,
  ]);
  if (untrackedOut?.trim()) {
    const full = resolve(cwd, relPath);
    const noIndexOut = await runGit(cwd, [
      "diff",
      "--no-index",
      "--",
      "/dev/null",
      full,
    ]);
    return noIndexOut ?? "";
  }

  return "";
}
