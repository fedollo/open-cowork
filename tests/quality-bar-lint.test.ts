import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lintQualityBar } from "../packages/shared/src/quality-bars/lint.ts";
import { getQualityBarTemplate } from "../packages/shared/src/quality-bars/index.ts";

describe("quality bar lint", () => {
  it("passes strong built-in templates", () => {
    const t = getQualityBarTemplate("readme-docs");
    assert.ok(t);
    const result = lintQualityBar(t!);
    assert.ok(result.pass, result.issues.map((i) => i.message).join("; "));
    assert.ok(result.score >= 80);
  });

  it("flags vague quality bars", () => {
    const result = lintQualityBar({
      label: "Test",
      goal: "Do something useful for the project",
      qualityBar: "Looks good enough to ship",
    });
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((i) => i.severity === "error"));
  });

  it("warns when bar lacks measurable signals", () => {
    const result = lintQualityBar({
      label: "Thin bar",
      goal: "Write documentation for onboarding",
      qualityBar: "Documentation explains setup clearly for new users",
      boundary: "docs only",
    });
    assert.ok(result.issues.some((i) => i.field === "qualityBar"));
  });
});
