export type QualityBarCategory = "dev" | "visual" | "writing" | "marketing";

export type QualityBarIntegrationId = "github" | "atlascloud" | "replicate";

export interface QualityBarTemplate {
  id: string;
  label: string;
  category: QualityBarCategory;
  goal: string;
  qualityBar: string;
  boundary?: string;
  integrations?: QualityBarIntegrationId[];
}

/** Display order for template dropdown optgroups. */
export const QUALITY_BAR_CATEGORY_ORDER: QualityBarCategory[] = [
  "visual",
  "writing",
  "marketing",
  "dev",
];

export const QUALITY_BAR_CATEGORY_LABELS: Record<QualityBarCategory, string> = {
  visual: "Visual",
  writing: "Writing",
  marketing: "Marketing",
  dev: "Dev",
};

/** Built-in Gauntlet templates — add more via PR to this file. */
export const QUALITY_BAR_TEMPLATES: QualityBarTemplate[] = [
  {
    id: "readme-docs",
    label: "README & docs polish",
    category: "dev",
    goal: "Add a polished README section that explains how to run Open Loop for a first-time contributor, with setup, usage, and pitfalls.",
    qualityBar:
      "A fresh reader who has never used the project can go from clone → running UI in under 5 minutes using only the README. Every command must be copy-pasteable and verified against this repo.",
    boundary:
      "Do not change application runtime code (apps/, packages/). Only edit README.md and docs/.",
  },
  {
    id: "unit-tests",
    label: "Unit tests",
    category: "dev",
    goal: "Add focused unit tests for the workspace changes API (git snapshot helpers and route handlers).",
    qualityBar:
      "`pnpm --filter @open-loop/api test` passes with new tests covering happy path, non-git workspace, and path traversal rejection.",
    boundary:
      "Only modify apps/api/src/ and docs/ROADMAP.md if needed. Do not change the web UI.",
  },
  {
    id: "safe-refactor",
    label: "Safe refactor",
    category: "dev",
    goal: "Extract git CLI helpers from git-snapshot.ts into a small git-workspace module without changing behavior.",
    qualityBar:
      "All existing API tests pass unchanged. No new runtime dependencies. Public function signatures stay the same.",
    boundary:
      "Do not change route URLs, shared types, or UI. Refactor apps/api only.",
  },
  {
    id: "security-review",
    label: "Security review",
    category: "dev",
    goal: "Review fs and workspace routes for path traversal, cwd validation, and error messages that could leak secrets.",
    qualityBar:
      "Produce a short markdown findings list in docs/ with severity tags. Fix any critical issues with a regression test.",
    boundary:
      "Do not add features. Focus on apps/api/src/routes/fs.ts and workspace.ts.",
  },
  {
    id: "brand-banner-atlas",
    label: "Brand banner (Atlas)",
    category: "visual",
    integrations: ["atlascloud"],
    goal: "Generate a minimal dark brand banner for this project (local agentic workspace, green accent). Save as assets/open-loop-banner.png and add 2–3 lines in README explaining what the image is and where it is used.",
    qualityBar:
      "Open assets/open-loop-banner.png at 800px width: not pixelated, dark theme with readable accent color, no illegible text. README explains the image in one sentence. Visual style matches a dark UI with green accent (#3d9a6a).",
    boundary:
      "Only assets/, README.md, and docs/setup.md if needed. Do not change apps/, packages/, or API code.",
  },
  {
    id: "empty-state-hero",
    label: "Empty-state hero image",
    category: "visual",
    integrations: ["atlascloud"],
    goal: "Create a hero image for the web app empty state (pick folder, start session). Save to apps/web/public/ and wire it into the empty-state UI if not already shown.",
    qualityBar:
      "Hero image loads in the app empty state without layout breakage. Style is consistent with the existing brand banner (dark, minimal, green accent). Image is optimized for ~600px display width.",
    boundary:
      "Only apps/web/public/, apps/web/src/App.tsx (empty-state markup only), and README if needed. No API changes.",
  },
  {
    id: "social-og-image",
    label: "Social / OG image",
    category: "visual",
    integrations: ["atlascloud"],
    goal: "Create a 1200×630 social sharing image for GitHub social preview and link unfurls. Save in assets/ and document upload steps in docs/setup.md.",
    qualityBar:
      "Image is 1200×630 (or documented crop). Project name is readable at thumbnail size. docs/setup.md lists exact steps to set GitHub Social preview.",
    boundary: "Only assets/ and docs/setup.md. Do not change runtime code.",
  },
  {
    id: "video-thumbnail-atlas",
    label: "Video thumbnail (Atlas)",
    category: "visual",
    integrations: ["atlascloud"],
    goal: "Generate a 1280×720 demo thumbnail for Open Loop (local agentic workspace: pick folder → agent works → review changes). Match the style of assets/open-loop-banner.png (dark UI, green accent #3d9a6a). Title overlay max 5 words, e.g. \"Open Loop Demo\". Save as assets/open-loop-demo-thumbnail.png.",
    qualityBar:
      "Open assets/open-loop-demo-thumbnail.png: title readable at 320px (YouTube-style preview). Visual style matches open-loop-banner.png (dark + #3d9a6a). README or docs/setup.md has one line explaining where to use this thumbnail.",
    boundary:
      "Only assets/, README.md, and docs/setup.md. Use Atlas to generate the image. Do not change apps/, packages/, or API code.",
  },
  {
    id: "product-one-pager",
    label: "Product one-pager",
    category: "writing",
    goal: "Create docs/open-loop-one-pager.md explaining what Open Loop is, who it is for, how to set up locally, and current MVP limits.",
    qualityBar:
      "A non-technical reader understands the product in under 2 minutes. Tone matches docs/setup.md. Sections: what, who, setup, limits. Under 80 lines.",
    boundary:
      "Create or edit only docs/open-loop-one-pager.md. Do not change apps/, packages/, or other docs.",
  },
  {
    id: "github-triage",
    label: "GitHub issue triage",
    category: "writing",
    integrations: ["github"],
    goal: "Using the GitHub integration, list all open issues for this repository and write docs/github-triage.md with priority and a one-line reason for each.",
    qualityBar:
      "Every open issue appears exactly once with number, title, suggested priority (high/medium/low), and reason (max 15 words). A maintainer can decide next work in under 3 minutes without opening GitHub.",
    boundary:
      "Create or edit only docs/github-triage.md. Read-only use of GitHub — do not open, close, comment, or label issues. Do not change code.",
  },
  {
    id: "release-notes-draft",
    label: "Release notes draft",
    category: "writing",
    goal: "Draft a markdown release notes section for the latest shipped theme (e.g. comfort or review features) suitable for a GitHub release tag.",
    qualityBar:
      "Notes list user-visible changes in plain language, grouped by theme. Each bullet is one concrete outcome. A reader knows what improved without reading the diff.",
    boundary: "Only docs/ or CHANGELOG.md. Do not modify application code.",
  },
  {
    id: "slide-deck-outline",
    label: "Slide deck outline",
    category: "marketing",
    goal: "Create docs/demo-deck-outline.md with 8–12 slides for a 5-minute product demo or pitch (title + bullets per slide).",
    qualityBar:
      "Each slide has one clear message. Someone can present the deck in 5 minutes using only the outline. No wall-of-text slides; max 5 bullets per slide.",
    boundary: "Create or edit only docs/demo-deck-outline.md. No code or asset changes.",
  },
  {
    id: "landing-page-copy",
    label: "Landing page copy",
    category: "marketing",
    goal: "Write docs/landing-copy.md with hero headline, three value propositions, social proof placeholder, and a single CTA for a future marketing page.",
    qualityBar:
      "Headline is 12 words or fewer. Each value prop is 25 words or fewer. One specific CTA. Readable by a non-technical visitor in 90 seconds. No hype buzzwords without substance.",
    boundary:
      "Create or edit only docs/landing-copy.md. Do not change apps/ or packages/.",
  },
  {
    id: "accessibility-audit",
    label: "Accessibility audit",
    category: "dev",
    goal: "Audit apps/web for WCAG 2.1 AA basics: focus order, form labels, color contrast on primary UI, keyboard reachability.",
    qualityBar:
      "Findings list in docs/ with severity. Fix at least one high-impact issue in apps/web with a brief note in the findings doc. No regressions to existing layout on desktop.",
    boundary: "Focus on apps/web/src/ and docs/. Do not change API routes.",
  },
  {
    id: "bugfix-regression",
    label: "Bug fix + regression test",
    category: "dev",
    goal: "Fix one concrete bug (describe in goal or progress file) and add a regression test that fails before the fix and passes after.",
    qualityBar:
      "`pnpm test` passes including the new test. The fix is minimal and scoped to the reported bug — no drive-by refactors.",
    boundary: "Only files required for the bug and its test. No unrelated feature work.",
  },
  {
    id: "api-error-consistency",
    label: "API error consistency",
    category: "dev",
    goal: "Standardize JSON error responses across Hono routes (consistent shape: error message, optional code, HTTP status).",
    qualityBar:
      "All updated routes return the same error JSON shape. At least one route test asserts the shape. Existing tests still pass.",
    boundary: "Only apps/api/src/routes/ and related tests. Do not change web UI.",
  },
];

export function getQualityBarTemplate(
  id: string,
): QualityBarTemplate | undefined {
  return QUALITY_BAR_TEMPLATES.find((t) => t.id === id);
}

export function listQualityBarTemplatesByCategory(
  category: QualityBarCategory,
): QualityBarTemplate[] {
  return QUALITY_BAR_TEMPLATES.filter((t) => t.category === category);
}
