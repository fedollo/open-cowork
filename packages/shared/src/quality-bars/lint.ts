import type { QualityBarLintIssue, QualityBarLintResult } from "./wizard.js";

const VAGUE_BAR = /\b(good enough|nice enough|looks good|vibes|pretty good|better|improve quality|high quality)\b/i;
const MEASURABLE =
  /\b(\d+\s*(min|minutes|sec|seconds|hours|%|px|lines|tests|files)|pnpm|npm|curl|must pass|passes|fails|copy-?paste|under \d|at least \d|zero errors|readable at)\b/i;

export interface LintQualityBarInput {
  id?: string;
  label?: string;
  goal?: string;
  qualityBar?: string;
  boundary?: string;
}

export function lintQualityBar(input: LintQualityBarInput): QualityBarLintResult {
  const issues: QualityBarLintIssue[] = [];
  const goal = input.goal?.trim() ?? "";
  const bar = input.qualityBar?.trim() ?? "";
  const boundary = input.boundary?.trim() ?? "";
  const label = input.label?.trim() ?? "";
  const id = input.id?.trim() ?? "";

  if (!label) {
    issues.push({ severity: "error", field: "label", message: "Label is required." });
  }
  if (id && !/^[a-z0-9][a-z0-9-]{1,62}$/.test(id)) {
    issues.push({
      severity: "error",
      field: "id",
      message: "Id must be lowercase alphanumeric with hyphens (2–63 chars).",
    });
  }
  if (goal.length < 20) {
    issues.push({
      severity: "error",
      field: "goal",
      message: "Goal is too short — describe the deliverable clearly.",
    });
  }
  if (bar.length < 40) {
    issues.push({
      severity: "error",
      field: "qualityBar",
      message: "Quality bar is too short — add concrete acceptance criteria.",
    });
  }
  if (goal && bar && goal === bar) {
    issues.push({
      severity: "warn",
      field: "qualityBar",
      message: "Quality bar should differ from the goal (how to judge done vs what to do).",
    });
  }
  if (bar && VAGUE_BAR.test(bar)) {
    issues.push({
      severity: "error",
      field: "qualityBar",
      message: "Quality bar uses vague language — replace with inspectable checks.",
    });
  }
  if (bar && !MEASURABLE.test(bar)) {
    issues.push({
      severity: "warn",
      field: "qualityBar",
      message:
        "Add measurable signals (commands, time limits, file paths, pass/fail checks).",
    });
  }
  if (bar.split(/\s+/).length < 8) {
    issues.push({
      severity: "warn",
      field: "qualityBar",
      message: "Quality bar looks thin — Gauntlet critics need detail to judge artifacts.",
    });
  }
  if (!boundary) {
    issues.push({
      severity: "info",
      field: "boundary",
      message: "Consider a boundary (what not to touch) to keep runs focused.",
    });
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warn").length;
  const score = Math.max(0, 100 - errors * 25 - warns * 10);
  return {
    score,
    pass: errors === 0,
    issues,
  };
}
