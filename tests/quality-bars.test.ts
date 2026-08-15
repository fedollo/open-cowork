import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUALITY_BAR_CATEGORY_ORDER,
  QUALITY_BAR_TEMPLATES,
  getQualityBarTemplate,
} from "../packages/shared/src/quality-bars/index.ts";

describe("quality bar templates", () => {
  it("has 16 templates with unique ids and required fields", () => {
    assert.equal(QUALITY_BAR_TEMPLATES.length, 16);
    const ids = new Set<string>();
    for (const template of QUALITY_BAR_TEMPLATES) {
      assert.ok(template.id.length > 0);
      assert.ok(template.label.length > 0);
      assert.ok(template.goal.length > 20);
      assert.ok(template.qualityBar.length > 20);
      assert.ok(QUALITY_BAR_CATEGORY_ORDER.includes(template.category));
      assert.ok(!ids.has(template.id), `duplicate id: ${template.id}`);
      ids.add(template.id);
      assert.equal(getQualityBarTemplate(template.id), template);
    }
  });

  it("includes visual templates that require Atlas Cloud", () => {
    const atlasVisual = QUALITY_BAR_TEMPLATES.filter(
      (t) =>
        t.category === "visual" &&
        t.integrations?.includes("atlascloud"),
    );
    assert.equal(atlasVisual.length, 4);
  });

  it("includes github triage template", () => {
    const triage = getQualityBarTemplate("github-triage");
    assert.ok(triage);
    assert.deepEqual(triage?.integrations, ["github"]);
    assert.match(triage?.boundary ?? "", /read-only/i);
  });

  it("includes writing and marketing templates without code boundaries", () => {
    const docOnly = QUALITY_BAR_TEMPLATES.filter(
      (t) => t.category === "writing" || t.category === "marketing",
    );
    assert.ok(docOnly.length >= 5);
    for (const template of docOnly) {
      assert.match(
        template.boundary ?? "",
        /docs\/|CHANGELOG/i,
        `${template.id} should restrict to docs`,
      );
    }
  });
});
