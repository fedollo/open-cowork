export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

/** List price for Kimi K3.1 Pro and GPT 6.2 Sol on Atlas, short-context tier. */
export function estimateLlmUsd(model: string, usage: TokenUsage): number {
  const prompt = Math.max(0, usage.promptTokens);
  const cached = Math.min(Math.max(0, usage.cachedTokens), prompt);
  const fresh = prompt - cached;
  const output = Math.max(0, usage.completionTokens);
  const long = prompt > 272_000 && model.includes("gpt-6.2");
  const inputRate = long ? 4 : 2;
  const outputRate = long ? 15 : 10;
  const cacheRate = model.includes("kimi") ? 0.2 : long ? 0.2 : 0.1;
  return (fresh * inputRate + cached * cacheRate + output * outputRate) / 1_000_000;
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
