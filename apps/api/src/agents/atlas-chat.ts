import { setDefaultAutoSelectFamily } from "node:net";
import { env } from "../env.js";

setDefaultAutoSelectFamily(false);

export interface AtlasToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type AtlasContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type AtlasChatMessage =
  | { role: "system" | "user"; content: string | AtlasContentPart[] }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: AtlasToolCall[];
      reasoning_content?: string;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface AtlasToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AtlasAssistantMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: AtlasToolCall[];
  reasoning_content?: string;
}

interface StreamDelta {
  content?: string;
  reasoning_content?: string;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

export class AtlasRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtlasRequestError";
  }
}

export interface AtlasUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

export async function completeAtlasChat(opts: {
  model: string;
  messages: AtlasChatMessage[];
  tools?: AtlasToolDefinition[];
  signal?: AbortSignal;
  onText?: (delta: string) => void;
}): Promise<{ message: AtlasAssistantMessage; usage: AtlasUsage }> {
  const response = await fetch(`${env.atlasLlmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.atlasApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : {}),
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 8192,
    }),
    signal: opts.signal,
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new AtlasRequestError(
      `Atlas Cloud ${response.status} for ${opts.model}: ${detail}`,
    );
  }
  if (!response.body) {
    throw new AtlasRequestError("Atlas Cloud returned an empty stream");
  }

  const assistant: AtlasAssistantMessage = { role: "assistant", content: "" };
  const toolCalls: AtlasToolCall[] = [];
  let reasoning = "";
  const usage: AtlasUsage = {
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const payload = sseData(line);
      if (!payload || payload === "[DONE]") continue;
      let parsed: {
        choices?: Array<{ delta?: StreamDelta; finish_reason?: string }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          prompt_tokens_details?: { cached_tokens?: number };
        };
      };
      try {
        parsed = JSON.parse(payload) as typeof parsed;
      } catch {
        continue;
      }
      if (parsed.usage) {
        usage.promptTokens = parsed.usage.prompt_tokens ?? usage.promptTokens;
        usage.completionTokens =
          parsed.usage.completion_tokens ?? usage.completionTokens;
        usage.cachedTokens =
          parsed.usage.prompt_tokens_details?.cached_tokens ?? usage.cachedTokens;
      }
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) {
        assistant.content = (assistant.content ?? "") + delta.content;
        opts.onText?.(delta.content);
      }
      if (delta.reasoning_content) reasoning += delta.reasoning_content;
      if (delta.tool_calls) mergeToolCallDeltas(toolCalls, delta.tool_calls);
    }
  }

  if (!assistant.content) assistant.content = null;
  if (reasoning) assistant.reasoning_content = reasoning;
  if (toolCalls.length > 0) assistant.tool_calls = toolCalls;
  return { message: assistant, usage };
}

function sseData(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  return trimmed.slice(5).trim();
}

function mergeToolCallDeltas(
  calls: AtlasToolCall[],
  deltas: NonNullable<StreamDelta["tool_calls"]>,
): void {
  for (const delta of deltas) {
    const index = delta.index ?? calls.length;
    let call = calls[index];
    if (!call) {
      call = {
        id: delta.id ?? `call_${index}`,
        type: "function",
        function: { name: "", arguments: "" },
      };
      calls[index] = call;
    }
    if (delta.id) call.id = delta.id;
    if (delta.function?.name) call.function.name += delta.function.name;
    if (delta.function?.arguments) {
      call.function.arguments += delta.function.arguments;
    }
  }
}
