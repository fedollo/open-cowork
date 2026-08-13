import type { AgentStreamEvent, GauntletPhase } from "@open-loop/shared";

const PHASE_PATTERNS: Array<{ phase: GauntletPhase; re: RegExp }> = [
  { phase: "critique", re: /\b(critic|critique|harsh critic|quality bar|a\/b)\b/i },
  { phase: "build", re: /\b(builder|building|implement|sub-?agent.*build)\b/i },
  { phase: "integrate", re: /\b(integrat|smooth|cohesi|progress\.md)\b/i },
  { phase: "lead", re: /\b(decompos|break (the )?(goal|work)|fan out|gauntlet)\b/i },
];

/** Best-effort phase hint from stream text or tool names. */
export function detectGauntletPhase(
  text: string,
): Extract<AgentStreamEvent, { type: "gauntlet_phase" }> | null {
  const sample = text.slice(0, 500);
  for (const { phase, re } of PHASE_PATTERNS) {
    if (re.test(sample)) {
      return { type: "gauntlet_phase", phase, detail: sample.slice(0, 120) };
    }
  }
  return null;
}
