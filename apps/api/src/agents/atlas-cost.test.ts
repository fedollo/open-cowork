import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateLlmUsd } from "./atlas-cost.js";

describe("estimateLlmUsd", () => {
  it("prices a million fresh input tokens at $2", () => {
    const cost = estimateLlmUsd("moonshotai/kimi-k3.1-pro", {
      promptTokens: 1_000_000,
      completionTokens: 0,
      cachedTokens: 0,
    });
    assert.equal(cost, 2);
  });

  it("prices output tokens at $10 per million", () => {
    const cost = estimateLlmUsd("openai/gpt-6.2-sol", {
      promptTokens: 0,
      completionTokens: 500_000,
      cachedTokens: 0,
    });
    assert.equal(cost, 5);
  });
});