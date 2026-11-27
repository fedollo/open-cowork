import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { resolveWorkspacePath, runWorkspaceTool } from "./workspace-tools.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("workspace tools", () => {
  it("rejects paths outside the workspace", () => {
    assert.throws(() => resolveWorkspacePath("/tmp/workspace", "../secret"));
    assert.throws(() => resolveWorkspacePath("/tmp/workspace", "/etc/passwd"));
  });

  it("edits a file once", async () => {
    const root = await mkdtemp(join(tmpdir(), "ws-tools-"));
    roots.push(root);
    await writeFile(join(root, "note.txt"), "alpha beta alpha");
    await runWorkspaceTool(root, "edit_file", {
      path: "note.txt",
      old_string: "beta",
      new_string: "gamma",
    });
    const read = await runWorkspaceTool(root, "read_file", { path: "note.txt" });
    assert.equal(read, "alpha gamma alpha");
  });
});
