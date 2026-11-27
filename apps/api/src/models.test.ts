import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATLAS_CHAT_MODELS,
  DEFAULT_ATLAS_MODEL_ID,
  resolveAtlasChatModel,
} from "@open-loop/shared";

describe("Atlas chat models", () => {
  it("offers Kimi K3.1 Pro and GPT 6.2 Sol", () => {
    assert.deepEqual(
      ATLAS_CHAT_MODELS.map((model) => model.id),
      ["moonshotai/kimi-k3.1-pro", "openai/gpt-6.2-sol"],
    );
  });

  it("keeps known ids and falls back otherwise", () => {
    assert.equal(
      resolveAtlasChatModel("openai/gpt-6.2-sol"),
      "openai/gpt-6.2-sol",
    );
    assert.equal(resolveAtlasChatModel("composer-2.5"), DEFAULT_ATLAS_MODEL_ID);
    assert.equal(resolveAtlasChatModel("  "), DEFAULT_ATLAS_MODEL_ID);
    assert.equal(resolveAtlasChatModel(undefined), DEFAULT_ATLAS_MODEL_ID);
  });
});
