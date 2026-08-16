import assert from "node:assert/strict";
import { describe, it } from "node:test";

const API = process.env.API_URL ?? "http://127.0.0.1:8787";

async function maybeFetch(path: string): Promise<Response | null> {
  try {
    return await fetch(`${API}${path}`);
  } catch {
    return null;
  }
}

describe("API smoke (optional if server running)", () => {
  it("health reports ok when API is up", async () => {
    const res = await maybeFetch("/health");
    if (!res) {
      console.log("skip: API not reachable at", API);
      return;
    }
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; hasApiKey: boolean };
    assert.equal(body.ok, true);
  });

  it("rejects create without qualityBar", async () => {
    const res = await maybeFetch("/sessions");
    if (!res) {
      console.log("skip: API not reachable");
      return;
    }
    const create = await fetch(`${API}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cwd: process.cwd(),
      }),
    });
    assert.equal(create.status, 400);
    const body = (await create.json()) as { error: string };
    assert.match(body.error, /quality bar|qualityBar|Invalid body/i);
  });

  it("returns 404 for missing workspace file", async () => {
    const cwd = encodeURIComponent(process.cwd());
    const path = encodeURIComponent(".open-loop/does-not-exist.md");
    const res = await maybeFetch(`/fs/file?cwd=${cwd}&path=${path}`);
    if (!res) {
      console.log("skip: API not reachable");
      return;
    }
    assert.equal(res.status, 404);
  });

  it("lists fs tree for this repo", async () => {
    const cwd = encodeURIComponent(process.cwd());
    const res = await maybeFetch(`/fs/tree?cwd=${cwd}&depth=1`);
    if (!res) {
      console.log("skip: API not reachable");
      return;
    }
    assert.equal(res.status, 200);
    const body = (await res.json()) as { nodes: Array<{ name: string }> };
    const names = body.nodes.map((n) => n.name);
    assert.ok(names.includes("apps") || names.includes("package.json"));
  });

  it("lists integrations catalog", async () => {
    const res = await maybeFetch("/integrations");
    if (!res) {
      console.log("skip: API not reachable");
      return;
    }
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      integrations: Array<{
        id: string;
        configured: boolean;
        envKey: string;
      }>;
    };
    const ids = body.integrations.map((i) => i.id).sort();
    assert.deepEqual(ids, ["atlascloud", "github", "replicate"]);
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes("Bearer "));
    assert.ok(!/ATLASCLOUD_API_KEY":"[^"]+"/.test(serialized));
  });

  it("rejects create when github enabled without token", async () => {
    const health = await maybeFetch("/health");
    if (!health) {
      console.log("skip: API not reachable");
      return;
    }
    const create = await fetch(`${API}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cwd: process.cwd(),
        gauntlet: { qualityBar: "Smoke test bar" },
        integrations: ["github"],
      }),
    });
    // If the running API already has GITHUB_TOKEN, create may succeed (201/200).
    // Otherwise we require a clear 400 about the missing key.
    if (create.status === 400) {
      const body = (await create.json()) as { error: string };
      assert.match(body.error, /GITHUB_TOKEN|GitHub/i);
      return;
    }
    assert.ok(
      create.status === 200 || create.status === 201,
      `unexpected status ${create.status}`,
    );
  });
});
