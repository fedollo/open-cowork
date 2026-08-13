/** Starter examples shown in the UI for Gauntlet mode. */
export const GAUNTLET_EXAMPLE = {
  goal: "Add a polished README section that explains how to run Open Loop for a first-time contributor, with setup, usage, and pitfalls.",
  qualityBar:
    "A fresh reader who has never used the project can go from clone → running UI in under 5 minutes using only the README. Compare against the clarity of https://github.com/vitejs/vite/blob/main/README.md (structure, scannability, no fluff). Every command must be copy-pasteable and verified against this repo.",
  boundary:
    "Do not change application runtime code (apps/, packages/). Only edit README.md and docs/. Stop if you would need network access beyond reading public docs already linked.",
} as const;
