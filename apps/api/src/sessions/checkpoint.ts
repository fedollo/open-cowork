import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { SessionCheckpoint } from "@open-loop/shared";
import { getGitHeadRef, listGitWorkingTreeChanges } from "./git-snapshot.js";

const execFileAsync = promisify(execFile);

export class CheckpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckpointError";
  }
}

const SKIP_TOP_LEVEL = new Set(["node_modules", ".git"]);

function checkpointMessage(sessionId: string, turn: number): string {
  return `open-loop checkpoint ${sessionId} turn-${turn}`;
}

function shouldSkipRelativePath(relPath: string): boolean {
  if (!relPath || relPath.startsWith("..")) return true;
  const top = relPath.split(/[/\\]/)[0];
  if (SKIP_TOP_LEVEL.has(top)) return true;
  if (relPath.startsWith(".open-loop/checkpoints")) return true;
  if (relPath.startsWith(".open-cowork/checkpoints")) return true;
  return false;
}

async function runGit(
  cwd: string,
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "git",
      ["-C", cwd, ...args],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    return { ok: true, stdout, stderr };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? "",
    };
  }
}

async function isGitRepo(cwd: string): Promise<boolean> {
  const head = await getGitHeadRef(cwd);
  return head !== null;
}

async function walkFiles(root: string, base = root): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(root, entry.name);
    const rel = relative(base, full).replace(/\\/g, "/");
    if (shouldSkipRelativePath(rel)) continue;
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full, base)));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

async function copyTreeFiltered(srcRoot: string, destRoot: string): Promise<string[]> {
  const files = await walkFiles(srcRoot);
  await mkdir(destRoot, { recursive: true });
  for (const rel of files) {
    const from = join(srcRoot, rel);
    const to = join(destRoot, rel);
    await mkdir(join(to, ".."), { recursive: true });
    await cp(from, to);
  }
  return files;
}

export async function createCheckpoint(opts: {
  cwd: string;
  sessionId: string;
  turn: number;
  checkpointsRoot: string;
}): Promise<SessionCheckpoint> {
  const { cwd, sessionId, turn, checkpointsRoot } = opts;
  const createdAt = new Date().toISOString();
  const id = `${sessionId}-turn-${turn}`;

  if (await isGitRepo(cwd)) {
    const headRef = await getGitHeadRef(cwd);
    if (!headRef) {
      throw new CheckpointError("Could not read git HEAD for checkpoint.");
    }

    const dirty = await listGitWorkingTreeChanges(cwd);
    let stashRef: string | undefined;

    if (dirty && dirty.length > 0) {
      const msg = checkpointMessage(sessionId, turn);
      const stash = await runGit(cwd, [
        "stash",
        "push",
        "-u",
        "-m",
        msg,
      ]);
      if (!stash.ok) {
        throw new CheckpointError(
          stash.stderr.trim() || "git stash failed — working tree may be in a conflicted state.",
        );
      }
      if (/No local changes to save/i.test(stash.stderr + stash.stdout)) {
        stashRef = undefined;
      } else {
        const ref = await runGit(cwd, ["rev-parse", "stash@{0}"]);
        if (!ref.ok || !ref.stdout.trim()) {
          throw new CheckpointError("Checkpoint stash was created but could not be resolved.");
        }
        stashRef = ref.stdout.trim();
      }
    }

    return {
      id,
      turn,
      createdAt,
      kind: "git_stash",
      headRef,
      stashRef,
    };
  }

  const snapshotDir = join(checkpointsRoot, sessionId, `turn-${turn}`);
  await rm(snapshotDir, { recursive: true, force: true });
  const files = await copyTreeFiltered(cwd, snapshotDir);
  await writeFile(
    join(snapshotDir, ".open-loop-checkpoint.json"),
    JSON.stringify({ sessionId, turn, files, createdAt }, null, 2),
    "utf8",
  );

  return {
    id,
    turn,
    createdAt,
    kind: "filesystem",
    snapshotDir: relative(checkpointsRoot, snapshotDir).replace(/\\/g, "/"),
    files,
  };
}

export async function rollbackCheckpoint(opts: {
  cwd: string;
  checkpoint: SessionCheckpoint;
  checkpointsRoot: string;
}): Promise<void> {
  const { cwd, checkpoint, checkpointsRoot } = opts;

  if (checkpoint.kind === "git_stash") {
    if (!checkpoint.headRef) {
      throw new CheckpointError("Checkpoint is missing git HEAD reference.");
    }

    const reset = await runGit(cwd, ["reset", "--hard", checkpoint.headRef]);
    if (!reset.ok) {
      throw new CheckpointError(
        reset.stderr.trim() || "git reset --hard failed during rollback.",
      );
    }

    const clean = await runGit(cwd, ["clean", "-fd"]);
    if (!clean.ok) {
      throw new CheckpointError(
        clean.stderr.trim() || "git clean failed during rollback.",
      );
    }

    if (checkpoint.stashRef) {
      const apply = await runGit(cwd, ["stash", "apply", checkpoint.stashRef]);
      if (!apply.ok) {
        throw new CheckpointError(
          apply.stderr.trim() ||
            "Could not restore stashed working tree. Resolve conflicts manually, then retry.",
        );
      }
    }
    return;
  }

  if (checkpoint.kind === "filesystem") {
    if (!checkpoint.snapshotDir) {
      throw new CheckpointError("Filesystem checkpoint is missing snapshot path.");
    }
    const snapshotDir = join(checkpointsRoot, checkpoint.snapshotDir);
    try {
      await stat(snapshotDir);
    } catch {
      throw new CheckpointError(
        "Filesystem checkpoint snapshot not found on disk.",
      );
    }

    const manifestPath = join(snapshotDir, ".open-loop-checkpoint.json");
    let files = checkpoint.files ?? [];
    try {
      const raw = await readFile(manifestPath, "utf8");
      const parsed = JSON.parse(raw) as { files?: string[] };
      if (parsed.files?.length) files = parsed.files;
    } catch {
      // use checkpoint.files
    }

    const snapshotSet = new Set(files);
    const currentFiles = await walkFiles(cwd);
    for (const rel of currentFiles) {
      if (!snapshotSet.has(rel)) {
        await rm(join(cwd, rel), { force: true });
      }
    }

    for (const rel of files) {
      const from = join(snapshotDir, rel);
      const to = join(cwd, rel);
      await mkdir(join(to, ".."), { recursive: true });
      await cp(from, to, { force: true });
    }
    return;
  }

  throw new CheckpointError(`Unknown checkpoint kind: ${(checkpoint as SessionCheckpoint).kind}`);
}

export function resolveCheckpointsRoot(sessionsDir: string): string {
  return join(resolve(sessionsDir, ".."), "checkpoints");
}
