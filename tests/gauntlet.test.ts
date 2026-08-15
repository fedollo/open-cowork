import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGauntletPrompt } from "../apps/api/src/gauntlet/prompt.ts";
import { detectGauntletPhase } from "../apps/api/src/gauntlet/detect-phase.ts";
import { getQualityBarTemplate } from "../packages/shared/src/quality-bars/index.ts";

const GAUNTLET_EXAMPLE = getQualityBarTemplate("readme-docs")!;

describe("gauntlet prompt", () => {
  it("embeds goal, bar, critic rules, and progress path", () => {
    const out = buildGauntletPrompt({
      goal: GAUNTLET_EXAMPLE.goal,
      qualityBar: GAUNTLET_EXAMPLE.qualityBar,
      boundary: GAUNTLET_EXAMPLE.boundary,
    });
    assert.match(out, /Gauntlet Loop/);
    assert.ok(out.includes(GAUNTLET_EXAMPLE.goal.slice(0, 40)));
    assert.ok(out.includes("SEPARATE harsh critic"));
    assert.ok(out.includes(".open-loop/gauntlet-progress.md"));
    assert.ok(out.includes(GAUNTLET_EXAMPLE.boundary.slice(0, 20)));
  });
});

describe("gauntlet phase detection", () => {
  it("detects critique from critic language", () => {
    const hit = detectGauntletPhase("spawn a harsh critic for A/B comparison");
    assert.equal(hit?.type, "gauntlet_phase");
    assert.equal(hit?.phase, "critique");
  });

  it("detects build from builder language", () => {
    const hit = detectGauntletPhase("builder implementing the Quick Start section");
    assert.equal(hit?.phase, "build");
  });
});

describe("gauntlet example fixture", () => {
  it("has non-empty goal and quality bar", () => {
    assert.ok(GAUNTLET_EXAMPLE.goal.length > 20);
    assert.ok(GAUNTLET_EXAMPLE.qualityBar.length > 20);
  });
});
