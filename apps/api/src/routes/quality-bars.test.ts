import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { env } from "../env.js";
import { qualityBarsRoutes } from "./quality-bars.js";

let originalCustomDir = "";
let tempDir = "";

before(async () => {
  originalCustomDir = env.qualityBarsCustomDir;
  tempDir = await mkdtemp(join(tmpdir(), "quality-bars-test-"));
  (env as { qualityBarsCustomDir: string }).qualityBarsCustomDir = tempDir;
});

after(async () => {
  (env as { qualityBarsCustomDir: string }).qualityBarsCustomDir =
    originalCustomDir;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

describe("quality-bars routes", () => {
  it("lists built-in templates", async () => {
    const res = await qualityBarsRoutes.request("/");
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      templates: Array<{ id: string; source: string }>;
    };
    assert.ok(body.templates.length >= 23);
    assert.ok(body.templates.every((t) => t.source === "builtin"));
  });

  it("creates, updates, and deletes a custom template", async () => {
    const createRes = await qualityBarsRoutes.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "my-test-bar",
        label: "My test bar",
        category: "dev",
        goal: "Do something testable",
        qualityBar: "A reviewer can verify the outcome in under 2 minutes.",
        boundary: "Only docs/",
      }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as { id: string; source: string };
    assert.equal(created.id, "my-test-bar");
    assert.equal(created.source, "custom");

    const listRes = await qualityBarsRoutes.request("/");
    const listBody = (await listRes.json()) as {
      templates: Array<{ id: string }>;
    };
    assert.ok(listBody.templates.some((t) => t.id === "my-test-bar"));

    const updateRes = await qualityBarsRoutes.request("/my-test-bar", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: "My test bar updated",
        category: "dev",
        goal: "Updated goal",
        qualityBar: "Updated bar with concrete acceptance criteria.",
      }),
    });
    assert.equal(updateRes.status, 200);

    const deleteRes = await qualityBarsRoutes.request("/my-test-bar", {
      method: "DELETE",
    });
    assert.equal(deleteRes.status, 200);
  });

  it("rejects create with built-in id", async () => {
    const res = await qualityBarsRoutes.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "readme-docs",
        label: "Clone",
        category: "dev",
        goal: "x",
        qualityBar: "y",
      }),
    });
    assert.equal(res.status, 400);
  });

  it("rejects editing built-in template", async () => {
    const res = await qualityBarsRoutes.request("/readme-docs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: "Nope",
        category: "dev",
        goal: "x",
        qualityBar: "y",
      }),
    });
    assert.equal(res.status, 400);
  });
});
