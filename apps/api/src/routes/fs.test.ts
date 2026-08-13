import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFileInWorkspace } from "./fs.js";

describe("resolveFileInWorkspace", () => {
  it("resolves a relative file under cwd", () => {
    const full = resolveFileInWorkspace("/tmp/project", ".open-loop/gauntlet-progress.md");
    assert.ok(full?.endsWith(".open-loop/gauntlet-progress.md"));
  });

  it("rejects path traversal", () => {
    assert.equal(resolveFileInWorkspace("/tmp/project", "../etc/passwd"), null);
    assert.equal(
      resolveFileInWorkspace("/tmp/project", ".open-loop/../../etc/passwd"),
      null,
    );
  });

  it("rejects absolute paths", () => {
    assert.equal(resolveFileInWorkspace("/tmp/project", "/etc/passwd"), null);
  });
});
