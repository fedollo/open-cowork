import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMcpServers, IntegrationConfigError } from "./build-mcp.js";
import { listIntegrationInfo } from "./catalog.js";

describe("buildMcpServers", () => {
  it("builds github http config from GITHUB_TOKEN", () => {
    const servers = buildMcpServers(["github"], {
      GITHUB_TOKEN: "test-github-token",
    });
    assert.ok(servers.github);
    assert.ok("url" in servers.github);
    assert.equal(servers.github.url, "https://api.githubcopilot.com/mcp/");
    assert.equal(
      servers.github.headers?.Authorization,
      "Bearer test-github-token",
    );
  });

  it("accepts GITHUB_PERSONAL_ACCESS_TOKEN alias", () => {
    const servers = buildMcpServers(["github"], {
      GITHUB_PERSONAL_ACCESS_TOKEN: "test-pat-token",
    });
    assert.ok(servers.github);
  });

  it("builds atlascloud and replicate stdio configs", () => {
    const servers = buildMcpServers(["atlascloud", "replicate"], {
      ATLASCLOUD_API_KEY: "test-atlas-key",
      REPLICATE_API_TOKEN: "test-replicate-token",
    });
    assert.equal((servers.atlascloud as { command: string }).command, "npx");
    assert.deepEqual((servers.atlascloud as { args: string[] }).args, [
      "-y",
      "atlascloud-mcp",
    ]);
    assert.equal(
      (servers.atlascloud as { env: Record<string, string> }).env
        .ATLASCLOUD_API_KEY,
      "test-atlas-key",
    );
    assert.equal(
      (servers.replicate as { env: Record<string, string> }).env
        .REPLICATE_API_TOKEN,
      "test-replicate-token",
    );
  });

  it("throws when enabled but env missing", () => {
    assert.throws(
      () => buildMcpServers(["replicate"], {}),
      (err: unknown) =>
        err instanceof IntegrationConfigError &&
        /REPLICATE_API_TOKEN/.test(err.message),
    );
  });
});

describe("listIntegrationInfo", () => {
  it("marks configured from env without exposing secrets", () => {
    const list = listIntegrationInfo({
      GITHUB_TOKEN: "secret",
      ATLASCLOUD_API_KEY: "",
    });
    const gh = list.find((i) => i.id === "github");
    const atlas = list.find((i) => i.id === "atlascloud");
    assert.equal(gh?.configured, true);
    assert.equal(atlas?.configured, false);
    assert.equal(gh?.envKey, "GITHUB_TOKEN");
  });
});
