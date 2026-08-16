import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { env } from "../env.js";
import { presetsRoutes } from "./presets.js";

let originalPresetsPath = "";
let tempDir = "";

before(async () => {
  originalPresetsPath = env.presetsPath;
  tempDir = await mkdtemp(join(tmpdir(), "presets-test-"));
  (env as { presetsPath: string }).presetsPath = join(tempDir, "presets.json");
});

after(async () => {
  (env as { presetsPath: string }).presetsPath = originalPresetsPath;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

describe("presets routes", () => {
  it("creates, lists, and deletes a preset", async () => {
    const createRes = await presetsRoutes.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Docs run",
        cwd: "/tmp/project",
        model: "composer-2.5",
        gauntlet: { qualityBar: "All docs tests pass" },
        integrations: ["github"],
      }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as { id: string; name: string };
    assert.equal(created.name, "Docs run");

    const listRes = await presetsRoutes.request("/");
    assert.equal(listRes.status, 200);
    const listBody = (await listRes.json()) as {
      presets: Array<{ id: string }>;
    };
    assert.equal(listBody.presets.length, 1);

    const deleteRes = await presetsRoutes.request(`/${created.id}`, {
      method: "DELETE",
    });
    assert.equal(deleteRes.status, 200);

    const listAfter = await presetsRoutes.request("/");
    const afterBody = (await listAfter.json()) as {
      presets: unknown[];
    };
    assert.equal(afterBody.presets.length, 0);
  });

  it("rejects gauntlet preset without quality bar", async () => {
    const res = await presetsRoutes.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Bad gauntlet",
        cwd: "/tmp/project",
        model: "composer-2.5",
        gauntlet: { qualityBar: "" },
      }),
    });
    assert.equal(res.status, 400);
  });
});
