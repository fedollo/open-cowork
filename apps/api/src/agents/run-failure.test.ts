import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRunFailurePayload, isDirectVideoGoal } from "./run-failure.js";

describe("buildRunFailurePayload", () => {
  it("includes SDK error message and code", () => {
    const payload = buildRunFailurePayload(
      {
        id: "run-abc",
        error: { message: "MCP spawn failed", code: "mcp_error" },
      },
      { assistantText: "partial", durationMs: 120_000 },
    );

    assert.equal(payload.message, "Run failed: MCP spawn failed (run-abc)");
    assert.equal(payload.code, "mcp_error");
    assert.equal(payload.suggestApiRestart, undefined);
  });

  it("suggests API restart on instant failure without assistant text", () => {
    const payload = buildRunFailurePayload(
      {
        id: "run-fast",
        error: { message: "Agent run expired" },
      },
      { assistantText: "", durationMs: 900 },
    );

    assert.match(payload.message, /Try restarting the API/);
    assert.equal(payload.suggestApiRestart, true);
  });
});

describe("isDirectVideoGoal", () => {
  it("detects Seedance video goals", () => {
    assert.equal(
      isDirectVideoGoal(
        "Using Atlas MCP and model bytedance/seedance-2.5/text-to-video",
      ),
      true,
    );
    assert.equal(isDirectVideoGoal("Update README"), false);
  });
});
