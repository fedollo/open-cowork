/**
 * Gauntlet Loop orchestration prompt builder.
 * Pattern popularized by Matt Shumer (Claude of Duty / somethingbig.ai/gauntlet-loop).
 * Open Loop wraps the user goal + quality bar; Cursor Agent fans out builders/critics via Task.
 */

export interface BuildGauntletPromptInput {
  goal: string;
  qualityBar: string;
  boundary?: string;
  budgetUsd?: number;
  visualCritic?: boolean;
  /** Atlas/Seedance video jobs: one end-to-end generation before critic loops. */
  videoDirectMode?: boolean;
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
    "7. Maintain a live progress file at `.open-loop/gauntlet-progress.md` in the workspace root. Update it as work evolves.",
    "   Use these ## headings when possible: **Pieces**, **Critic verdicts**, **Gaps**, **Next steps**, **Rounds**.",
    "   End the file with a line `Bar status: met`, `Bar status: not met`, or `Bar status: in progress`.",
    "8. Use subagents heavily. Prefer parallel builders when pieces are independent.",
  ];

  if (boundary) {
    lines.push("", "## Boundaries (hard limits)", boundary);
  }

  if (input.budgetUsd && input.budgetUsd > 0) {
    lines.push(
      "",
      "## LLM budget",
      `This session may spend about $${input.budgetUsd.toFixed(2)} on model calls.`,
      input.visualCritic
        ? "Keep improving until the separate visual critic accepts the screenshots or the budget is nearly used."
        : "Keep improving the work until that budget is nearly used or the quality bar is met.",
      "The server stops the next model call when the cap is reached. Video and other tool charges are outside this cap.",
    );
  }

  if (input.visualCritic) {
    lines.push(
      "",
      "## Visual critic (separate model)",
      "You cannot declare the quality bar met. `Bar status: met` in the progress file does not finish the run.",
      "Before the first edit, save `.open-loop/shots/before.png`.",
      "After the visible change, save `.open-loop/shots/after.png` from the same camera, resolution, and moment.",
      "When you stop calling tools, a different model call sees only those two PNGs and the quality bar. It can reject the work.",
      "Missing files, byte-identical files, a black frame, or an HUD-only change are rejections, and you must keep working.",
      "Godot on this machine: `~/Downloads/Godot.app/Contents/MacOS/Godot` (or `/Applications/Godot.app/Contents/MacOS/Godot` if that file exists). The jungle preview needs a window, not headless:",
      "`<godot> --path . scenes/tests/jungle_preview.tscn -- --tag=before`",
      "Copy `screenshots/before_gioco.png` to `.open-loop/shots/before.png`. Repeat with `--tag=after` and copy `screenshots/after_gioco.png` to `.open-loop/shots/after.png`.",
      "Blender is installed at `/Applications/Blender.app/Contents/MacOS/Blender` and is not on PATH. Call that binary when a model change is required.",
    );
  }

  if (input.videoDirectMode) {
    lines.push(
      "",
      "## Video generation (Atlas / Seedance)",
      "These jobs are expensive. Run ONE end-to-end generation (submit → poll → download MP4) before any builder/critic loop.",
      "Use Task subagents only to QA the downloaded MP4 (palette, motion, readability) — not to fan out parallel video generations.",
    );
  }

  lines.push(
    "",
    "## Stop conditions",
    "- Stop only when the quality bar is met for the important pieces, or when the human cancels.",
    "- Do not declare success based on effort or 'good enough for AI'.",
  );

  return lines.join("\n");
}
