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

  it("rejects gauntlet create without qualityBar", async () => {
    const res = await maybeFetch("/sessions");
    if (!res) {
      console.log("skip: API not reachable");
      return;
    }
    // Only run if health worked; create without bar
    const create = await fetch(`${API}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cwd: process.cwd(),
        mode: "gauntlet",
      }),
    });
    assert.equal(create.status, 400);
    const body = (await create.json()) as { error: string };
    assert.match(body.error, /qualityBar/i);
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
});
