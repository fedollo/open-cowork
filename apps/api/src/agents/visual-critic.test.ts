import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { inspectShotPair } from "./visual-critic.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("inspectShotPair", () => {
  it("rejects a missing after shot", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "shots-"));
    await mkdir(join(cwd, ".open-loop", "shots"), { recursive: true });
    await writeFile(join(cwd, ".open-loop", "shots", "before.png"), PNG_1X1);
    const result = await inspectShotPair(cwd);
    assert.equal(result.ok, false);
  });

  it("rejects identical shots", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "shots-"));
    await mkdir(join(cwd, ".open-loop", "shots"), { recursive: true });
    await writeFile(join(cwd, ".open-loop", "shots", "before.png"), PNG_1X1);
    await writeFile(join(cwd, ".open-loop", "shots", "after.png"), PNG_1X1);
    const result = await inspectShotPair(cwd);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.publicText, /same file/);
  });

  it("rejects a resolution change", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "shots-"));
    await mkdir(join(cwd, ".open-loop", "shots"), { recursive: true });
    const wider = Buffer.from(PNG_1X1);
    wider.writeUInt32BE(2, 16);
    await writeFile(join(cwd, ".open-loop", "shots", "before.png"), PNG_1X1);
    await writeFile(join(cwd, ".open-loop", "shots", "after.png"), wider);
    const result = await inspectShotPair(cwd);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.publicText, /Resolution changed/);
  });
});
