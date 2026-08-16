import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSettingSources } from "./setting-sources.js";

describe("resolveSettingSources", () => {
  it("defaults to project only", () => {
    assert.deepEqual(resolveSettingSources(undefined), ["project"]);
    assert.deepEqual(resolveSettingSources(""), ["project"]);
  });

  it("parses comma-separated sources", () => {
    assert.deepEqual(resolveSettingSources("project,user"), [
      "project",
      "user",
    ]);
  });

  it("ignores invalid tokens", () => {
    assert.deepEqual(resolveSettingSources("project,invalid"), ["project"]);
  });
});
