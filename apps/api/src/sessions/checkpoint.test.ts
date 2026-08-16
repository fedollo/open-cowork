import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import {
  createCheckpoint,
  rollbackCheckpoint,
} from "./checkpoint.js";

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", cwd, ...args]);
}

describe("checkpoint git integration", () => {
  it("creates and rolls back a dirty git working tree", async () => {
    const root = join(tmpdir(), `open-loop-cp-${Date.now()}`);
    const checkpointsRoot = join(root, "checkpoints");
    const repo = join(root, "repo");
    await mkdir(repo, { recursive: true });

    try {
      await runGit(repo, ["init"]);
      await runGit(repo, ["config", "user.email", "test@open-loop.local"]);
      await runGit(repo, ["config", "user.name", "Open Loop Test"]);
      await writeFile(join(repo, "README.md"), "# before\n", "utf8");
      await runGit(repo, ["add", "README.md"]);
      await runGit(repo, ["commit", "-m", "init"]);

      await writeFile(join(repo, "README.md"), "# dirty\n", "utf8");

      const checkpoint = await createCheckpoint({
        cwd: repo,
        sessionId: "sess-test",
        turn: 1,
        checkpointsRoot,
      });

      assert.equal(checkpoint.kind, "git_stash");
      assert.ok(checkpoint.headRef);

      await writeFile(join(repo, "README.md"), "# agent edit\n", "utf8");
      await writeFile(join(repo, "new.txt"), "added by agent\n", "utf8");

      await rollbackCheckpoint({
        cwd: repo,
        checkpoint,
        checkpointsRoot,
      });

      const content = await readFile(join(repo, "README.md"), "utf8");
      assert.equal(content, "# dirty\n");
      await assert.rejects(readFile(join(repo, "new.txt"), "utf8"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("checkpoint filesystem fallback", () => {
  it("snapshots and restores a non-git workspace", async () => {
    const root = join(tmpdir(), `open-loop-fs-${Date.now()}`);
    const checkpointsRoot = join(root, "checkpoints");
    const workspace = join(root, "workspace");
    await mkdir(workspace, { recursive: true });

    try {
      await writeFile(join(workspace, "note.txt"), "original\n", "utf8");

      const checkpoint = await createCheckpoint({
        cwd: workspace,
        sessionId: "sess-fs",
        turn: 1,
        checkpointsRoot,
      });

      assert.equal(checkpoint.kind, "filesystem");

      await writeFile(join(workspace, "note.txt"), "changed\n", "utf8");
      await writeFile(join(workspace, "extra.txt"), "new\n", "utf8");

      await rollbackCheckpoint({
        cwd: workspace,
        checkpoint,
        checkpointsRoot,
      });

      assert.equal(await readFile(join(workspace, "note.txt"), "utf8"), "original\n");
      await assert.rejects(readFile(join(workspace, "extra.txt"), "utf8"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
