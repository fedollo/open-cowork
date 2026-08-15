import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitWorkingTreeLine {
  status: string;
  path: string;
}

/** Best-effort `git status --porcelain` for session export; null if not a git repo. */
export async function listGitWorkingTreeChanges(
  cwd: string,
): Promise<GitWorkingTreeLine[] | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", cwd, "status", "--porcelain"],
      { maxBuffer: 1024 * 1024 },
    );
    const lines = stdout
      .split("\n")
      .map((line) => line.trimEnd())
      .filter(Boolean);

    return lines.map((line) => {
      const status = line.slice(0, 2).trim() || "?";
      let path = line.slice(3).trim();
      if (path.includes(" -> ")) {
        path = path.split(" -> ").pop()!.trim();
      }
      return { status, path };
    });
  } catch {
    return null;
  }
}
