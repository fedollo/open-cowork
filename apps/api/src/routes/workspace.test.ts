import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import type { WorkspaceChangesResponse, WorkspaceDiffResponse } from "@open-loop/shared";
import { parseNameStatusLines } from "../sessions/git-snapshot.js";
import { workspaceRoutes } from "./workspace.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]) {
  await execFileAsync("git", ["-C", cwd, ...args]);
}

async function initRepoWithCommit(dir: string, filename: string, content: string) {
  await git(dir, "init");
  await git(dir, "config", "user.email", "test@example.com");
  await git(dir, "config", "user.name", "Test User");
  await writeFile(join(dir, filename), content);
  await git(dir, "add", filename);
  await git(dir, "commit", "-m", "initial");
}

describe("parseNameStatusLines", () => {
  it("parses modified and added paths", () => {
    const parsed = parseNameStatusLines("M\tREADME.md\nA\tnew.txt\n");
    assert.equal(parsed.length, 2);
    assert.deepEqual(parsed[0], { status: "M", path: "README.md" });
    assert.deepEqual(parsed[1], { status: "A", path: "new.txt" });
  });
});

describe("GET /changes", () => {
  it("returns isGitRepo false for a non-git directory", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "workspace-test-"));
    const res = await workspaceRoutes.request(
      `/changes?cwd=${encodeURIComponent(cwd)}`,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as WorkspaceChangesResponse;
    assert.equal(body.isGitRepo, false);
    assert.deepEqual(body.changes, []);
  });

  it("lists changes since baseline after a file edit", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "workspace-test-"));
    await initRepoWithCommit(cwd, "README.md", "hello\n");

    const baselineRes = await workspaceRoutes.request(
      `/changes?cwd=${encodeURIComponent(cwd)}`,
    );
    const baselineBody = (await baselineRes.json()) as WorkspaceChangesResponse;
    assert.equal(baselineBody.isGitRepo, true);
    const baseline = baselineBody.changes.length === 0
      ? (await execFileAsync("git", ["-C", cwd, "rev-parse", "HEAD"])).stdout.trim()
      : undefined;

    const head = (await execFileAsync("git", ["-C", cwd, "rev-parse", "HEAD"])).stdout.trim();
    await writeFile(join(cwd, "README.md"), "hello world\n");

    const res = await workspaceRoutes.request(
      `/changes?cwd=${encodeURIComponent(cwd)}&baseline=${encodeURIComponent(head)}`,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as WorkspaceChangesResponse;
    assert.equal(body.isGitRepo, true);
    assert.ok(body.changes.some((c) => c.path === "README.md"));
  });
});

describe("GET /diff", () => {
  it("returns a unified diff for a modified file", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "workspace-test-"));
    await initRepoWithCommit(cwd, "README.md", "hello\n");
    const head = (await execFileAsync("git", ["-C", cwd, "rev-parse", "HEAD"])).stdout.trim();
    await writeFile(join(cwd, "README.md"), "hello world\n");

    const res = await workspaceRoutes.request(
      `/diff?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent("README.md")}&baseline=${encodeURIComponent(head)}`,
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as WorkspaceDiffResponse;
    assert.match(body.diff, /hello world/);
  });

  it("rejects path traversal", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "workspace-test-"));
    await mkdir(join(cwd, "nested"), { recursive: true });

    const res = await workspaceRoutes.request(
      `/diff?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent("../etc/passwd")}`,
    );
    assert.equal(res.status, 400);
  });
});
