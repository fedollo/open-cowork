import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseGauntletProgress,
  GAUNTLET_BAR_STATUS_LABELS,
} from "../packages/shared/src/gauntlet-progress-parse.ts";

describe("parseGauntletProgress", () => {
  it("extracts sections from ## headings and bullets", () => {
    const md = `# Gauntlet progress

## Pieces
- README Quick Start
- Setup docs

## Critic verdicts
- README: pass — commands copy-pasteable
- Setup: fail — missing pnpm note

## Gaps
- Add pnpm to setup.md

## Next steps
- Fix setup.md line 12

Bar status: not met
`;
    const parsed = parseGauntletProgress(md);
    assert.equal(parsed.pieces.length, 2);
    assert.equal(parsed.verdicts.length, 2);
    assert.equal(parsed.gaps.length, 1);
    assert.equal(parsed.nextSteps.length, 1);
    assert.equal(parsed.barStatus, "not_met");
  });

  it("returns unknown bar status for empty input", () => {
    const parsed = parseGauntletProgress("");
    assert.equal(parsed.barStatus, "unknown");
    assert.deepEqual(parsed.pieces, []);
  });

  it("infers in_progress when content exists without explicit status", () => {
    const parsed = parseGauntletProgress("## Pieces\n- One item\n");
    assert.equal(parsed.barStatus, "in_progress");
  });

  it("exports human-readable bar status labels", () => {
    assert.equal(GAUNTLET_BAR_STATUS_LABELS.met, "Bar met");
  });
});
