import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGauntletPrompt } from "./prompt.js";

describe("buildGauntletPrompt", () => {
  it("includes goal, bar, critic rules, and progress file", () => {
    const out = buildGauntletPrompt({
      goal: "Build a pricing page",
      qualityBar: "Match stripe.com pricing clarity on mobile",
      boundary: "Do not touch billing APIs",
    });

    assert.match(out, /Build a pricing page/);
    assert.match(out, /Match stripe\.com pricing clarity on mobile/);
    assert.match(out, /Do not touch billing APIs/);
    assert.match(out, /SEPARATE harsh critic/i);
    assert.match(out, /fresh context/i);
    assert.match(out, /\.open-loop\/gauntlet-progress\.md/);
    assert.match(out, /blind A\/B/i);
    assert.match(out, /Do not stop after a fixed number of rounds/);
  });
});
