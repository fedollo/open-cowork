export interface QualityBarTemplate {
  id: string;
  label: string;
  goal: string;
  qualityBar: string;
  boundary?: string;
}

/** Built-in Gauntlet templates — add more via PR to this file. */
export const QUALITY_BAR_TEMPLATES: QualityBarTemplate[] = [
  {
    id: "readme-docs",
    label: "README & docs polish",
    goal: "Add a polished README section that explains how to run Open Loop for a first-time contributor, with setup, usage, and pitfalls.",
    qualityBar:
      "A fresh reader who has never used the project can go from clone → running UI in under 5 minutes using only the README. Every command must be copy-pasteable and verified against this repo.",
    boundary:
      "Do not change application runtime code (apps/, packages/). Only edit README.md and docs/.",
  },
  {
    id: "unit-tests",
    label: "Unit tests",
    goal: "Add focused unit tests for the workspace changes API (git snapshot helpers and route handlers).",
    qualityBar:
      "`pnpm --filter @open-loop/api test` passes with new tests covering happy path, non-git workspace, and path traversal rejection.",
    boundary: "Only modify apps/api/src/ and docs/ROADMAP.md if needed. Do not change the web UI.",
  },
  {
    id: "safe-refactor",
    label: "Safe refactor",
    goal: "Extract git CLI helpers from git-snapshot.ts into a small git-workspace module without changing behavior.",
    qualityBar:
      "All existing API tests pass unchanged. No new runtime dependencies. Public function signatures stay the same.",
    boundary: "Do not change route URLs, shared types, or UI. Refactor apps/api only.",
  },
  {
    id: "security-review",
    label: "Security review",
    goal: "Review fs and workspace routes for path traversal, cwd validation, and error messages that could leak secrets.",
    qualityBar:
      "Produce a short markdown findings list in docs/ with severity tags. Fix any critical issues with a regression test.",
    boundary:
      "Do not add features. Focus on apps/api/src/routes/fs.ts and workspace.ts.",
  },
];

export function getQualityBarTemplate(
  id: string,
): QualityBarTemplate | undefined {
  return QUALITY_BAR_TEMPLATES.find((t) => t.id === id);
}
