import type { RunResult } from "@cursor/sdk";

export interface RunFailurePayload {
  message: string;
  code?: string;
  suggestApiRestart?: boolean;
}

export function buildRunFailurePayload(
  result: Pick<RunResult, "id" | "error">,
  opts?: { assistantText?: string; durationMs?: number },
): RunFailurePayload {
  const detail = result.error?.message?.trim() || "Unknown error";
  const assistantText = opts?.assistantText?.trim() ?? "";
  const durationMs = opts?.durationMs;
  const instantFailure =
    !assistantText && durationMs !== undefined && durationMs < 5000;

  return {
    message: instantFailure
      ? `Run failed: ${detail} (${result.id}). Try restarting the API (pnpm dev) and starting a New session.`
      : `Run failed: ${detail} (${result.id})`,
    code: result.error?.code,
    ...(instantFailure ? { suggestApiRestart: true } : {}),
  };
}

export function isDirectVideoGoal(goal: string): boolean {
  return /bytedance\/seedance|atlas_generate_video|Atlas MCP.*video/i.test(goal);
}
