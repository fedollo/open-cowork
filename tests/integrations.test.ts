import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMcpServers,
  IntegrationConfigError,
  normalizeIntegrationIds,
} from "../apps/api/src/integrations/build-mcp.ts";
import { listIntegrationInfo } from "../apps/api/src/integrations/catalog.ts";

describe("integrations catalog", () => {
  it("exposes github, atlascloud, and replicate", () => {
    const list = listIntegrationInfo({});
    assert.deepEqual(
      list.map((i) => i.id).sort(),
      ["atlascloud", "github", "replicate"],
    );
    for (const item of list) {
      assert.equal(item.configured, false);
      assert.ok(item.envKey.length > 0);
      assert.ok(item.label.length > 0);
      // Never leak secret values in catalog responses
      assert.ok(!JSON.stringify(item).includes("sk-"));
    }
  });

  it("marks configured when env present", () => {
    const list = listIntegrationInfo({
      GITHUB_TOKEN: "test-github-token",
      ATLASCLOUD_API_KEY: "test-atlas-key",
      REPLICATE_API_TOKEN: "test-replicate-token",
    });
    assert.ok(list.every((i) => i.configured));
  });
});

describe("normalizeIntegrationIds", () => {
  it("dedupes and drops unknowns", () => {
    assert.deepEqual(
      normalizeIntegrationIds(["github", "github", "nope", "replicate"]),
      ["github", "replicate"],
    );
    assert.deepEqual(normalizeIntegrationIds(undefined), []);
    assert.deepEqual(normalizeIntegrationIds("github"), []);
  });
});

describe("buildMcpServers (app tests)", () => {
  it("builds all three server configs", () => {
    const servers = buildMcpServers(["github", "atlascloud", "replicate"], {
      GITHUB_TOKEN: "test-github-token",
      ATLASCLOUD_API_KEY: "test-atlas-key",
      REPLICATE_API_TOKEN: "test-replicate-token",
    });
    assert.equal(Object.keys(servers).sort().join(","), "atlascloud,github,replicate");
    assert.equal(
      (servers.github as { type: string }).type ??
        ("url" in servers.github ? "http" : "unknown"),
      "http",
    );
    assert.equal((servers.atlascloud as { type: string }).type, "stdio");
    assert.equal((servers.replicate as { type: string }).type, "stdio");
  });

  it("fails closed when a selected integration lacks env", () => {
    assert.throws(
      () =>
        buildMcpServers(["github", "atlascloud"], {
          GITHUB_TOKEN: "test-github-token",
        }),
      IntegrationConfigError,
    );
  });
});
