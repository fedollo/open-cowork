/**
 * Gauntlet Loop orchestration prompt builder.
 * Pattern popularized by Matt Shumer (Claude of Duty / somethingbig.ai/gauntlet-loop).
 * Open Loop wraps the user goal + quality bar; Cursor Agent fans out builders/critics via Task.
 */

export interface BuildGauntletPromptInput {
  goal: string;
  qualityBar: string;
  boundary?: string;
}

export function buildGauntletPrompt(input: BuildGauntletPromptInput): string {
  const goal = input.goal.trim();
  const qualityBar = input.qualityBar.trim();
  const boundary = input.boundary?.trim();

  const lines: string[] = [
    "You are the lead agent for a Gauntlet Loop (builder vs harsh critic).",
    "",
    "## Goal",
    goal,
    "",
    "## Quality bar (concrete, inspectable — not vibes)",
    qualityBar,
    "",
    "## How to work",
    "1. Decide the approach yourself. Do NOT wait for architecture instructions from me.",
    "2. Break the goal into the smallest pieces that can be improved and judged independently.",
    "3. For each important piece, fan out a builder subagent (Task) and a SEPARATE harsh critic subagent with fresh context.",
    "4. Never let the builder grade its own work. Critics must inspect the REAL artifacts (files, test output, screenshots if available) — not the builder's summary.",
    "5. Critics compare our output directly against the quality bar, using a blind A/B comparison when possible. If ours loses, name the largest meaningful gap and send it back for another round.",
    "6. Keep looping. Do not stop after a fixed number of rounds. Continue until our output wins against the bar, or the human stops the run.",
    "7. Maintain a live progress file at `.open-loop/gauntlet-progress.md` in the workspace root. Update it as work evolves (pieces, critic verdicts, gaps, next steps).",
    "8. Use subagents heavily. Prefer parallel builders when pieces are independent.",
  ];

  if (boundary) {
    lines.push("", "## Boundaries (hard limits)", boundary);
  }

  lines.push(
    "",
    "## Stop conditions",
    "- Stop only when the quality bar is met for the important pieces, or when the human cancels.",
    "- Do not declare success based on effort or 'good enough for AI'.",
  );

  return lines.join("\n");
}
