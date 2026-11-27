import { nanoid } from "nanoid";
import type { McpServerConfig } from "@cursor/sdk";
import {
  completeAtlasChat,
  type AtlasChatMessage,
  type AtlasToolDefinition,
} from "./atlas-chat.js";
import { estimateLlmUsd, formatUsd } from "./atlas-cost.js";
import { judgeBeforeAfter } from "./visual-critic.js";
import { loadMcpTools } from "./mcp-bridge.js";
import {
  WORKSPACE_TOOL_DEFINITIONS,
  runWorkspaceTool,
} from "./workspace-tools.js";

const MAX_ROUNDS = 24;
const MAX_BUDGET_ROUNDS = 120;

export interface AtlasRunResult {
  id: string;
  status: "finished" | "error" | "cancelled";
  error?: { message: string; code?: string };
  durationMs?: number;
}

type StreamEvent =
  | {
      type: "assistant";
      message: { content: Array<{ type: "text"; text: string }> };
    }
  | {
      type: "tool_call";
      name: string;
      status: "running" | "completed" | "error";
      args?: unknown;
      result?: unknown;
    }
  | { type: "status"; status: string; message?: string };

export interface AtlasRun {
  id: string;
  stream: () => AsyncGenerator<StreamEvent>;
  wait: () => Promise<AtlasRunResult>;
  supports: (op: string) => boolean;
  cancel: () => Promise<void>;
}

export class AtlasAgent {
  readonly agentId = `agent-${nanoid(10)}`;
  private readonly messages: AtlasChatMessage[] = [];
  private mcpServers: Record<string, McpServerConfig> | undefined;
  private budgetUsd: number | undefined;
  private visualCritic = false;
  private qualityBar = "";
  private spentUsd = 0;
  private disposed = false;

  constructor(
    private readonly opts: {
      cwd: string;
      model: string;
      mcpServers?: Record<string, McpServerConfig>;
      budgetUsd?: number;
      visualCritic?: boolean;
      qualityBar?: string;
    },
  ) {
    this.budgetUsd = positiveBudget(opts.budgetUsd);
    this.visualCritic = opts.visualCritic === true;
    this.qualityBar = opts.qualityBar ?? "";
    this.mcpServers = opts.mcpServers;
    this.messages.push({
      role: "system",
      content: [
        "You are the coding agent for this workspace.",
        `Workspace: ${opts.cwd}`,
        "Use the tools to read and edit files and to run commands. Paths are relative to the workspace.",
        this.budgetUsd
          ? `LLM budget for this session: ${formatUsd(this.budgetUsd)}. Keep improving until that budget is nearly used. The server stops the next model call at the cap.`
          : "Keep going until the user's request is done, then summarize what changed.",
        "Integrations are available as tools when enabled.",
      ].join("\n"),
    });
  }

  async send(
    prompt: string,
    opts?: {
      mcpServers?: Record<string, McpServerConfig>;
      budgetUsd?: number;
      visualCritic?: boolean;
      qualityBar?: string;
    },
  ): Promise<AtlasRun> {
    if (this.disposed) throw new Error("Agent is disposed");
    if (opts?.mcpServers) this.mcpServers = opts.mcpServers;
    if (opts && "budgetUsd" in opts) this.budgetUsd = positiveBudget(opts.budgetUsd);
    if (opts && "visualCritic" in opts) this.visualCritic = opts.visualCritic === true;
    if (opts?.qualityBar !== undefined) this.qualityBar = opts.qualityBar;
    this.messages.push({ role: "user", content: prompt });

    const abort = new AbortController();
    let result: AtlasRunResult | undefined;
    const events: StreamEvent[] = [];
    const waiters: Array<() => void> = [];
    let finished = false;

    const push = (event: StreamEvent) => {
      events.push(event);
      for (const wake of waiters.splice(0)) wake();
    };

    const done = (next: AtlasRunResult) => {
      result = next;
      finished = true;
      for (const wake of waiters.splice(0)) wake();
    };

    const task = this.runLoop(abort.signal, push)
      .then(() => {
        done({ id: `run-${nanoid(8)}`, status: "finished" });
      })
      .catch((err: unknown) => {
        if (abort.signal.aborted) {
          done({ id: `run-${nanoid(8)}`, status: "cancelled" });
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        done({
          id: `run-${nanoid(8)}`,
          status: "error",
          error: { message },
        });
      });

    return {
      id: `run-${nanoid(8)}`,
      stream: async function* stream() {
        let cursor = 0;
        while (true) {
          while (cursor < events.length) yield events[cursor++];
          if (finished) return;
          await new Promise<void>((resolve) => waiters.push(resolve));
        }
      },
      wait: async () => {
        await task;
        return result ?? { id: "run", status: "error", error: { message: "Missing result" } };
      },
      supports: (op) => op === "cancel",
      cancel: async () => {
        abort.abort();
      },
    };
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.disposed = true;
  }

  private async runLoop(
    signal: AbortSignal,
    push: (event: StreamEvent) => void,
  ): Promise<void> {
    push({ type: "status", status: "RUNNING" });
    const mcp = await loadMcpTools(
      this.mcpServers,
      new Set(WORKSPACE_TOOL_DEFINITIONS.map((tool) => tool.function.name)),
    );
    const tools: AtlasToolDefinition[] = [
      ...WORKSPACE_TOOL_DEFINITIONS,
      ...mcp.tools.map((tool) => tool.definition),
    ];
    const mcpByName = new Map(mcp.tools.map((tool) => [tool.definition.function.name, tool]));

    try {
      const roundCap = this.budgetUsd ? MAX_BUDGET_ROUNDS : MAX_ROUNDS;
      for (let round = 0; round < roundCap; round++) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        if (this.budgetReached()) {
          this.say(
            push,
            `LLM budget reached (${formatUsd(this.spentUsd)} of ${formatUsd(this.budgetUsd ?? 0)}). Stopped before the next model call.`,
          );
          return;
        }
        let streamed = "";
        const completion = await completeAtlasChat({
          model: this.opts.model,
          messages: this.messages,
          tools,
          signal,
          onText: (delta) => {
            streamed += delta;
            push({
              type: "assistant",
              message: { content: [{ type: "text", text: delta }] },
            });
          },
        });
        const assistant = completion.message;
        this.noteSpend(completion.usage, push);
        if (!streamed && assistant.content) {
          push({
            type: "assistant",
            message: { content: [{ type: "text", text: assistant.content }] },
          });
        }
        this.messages.push(assistant);
        if (!assistant.tool_calls?.length) {
          const keepGoing = await this.reviewOrContinue(signal, push);
          if (!keepGoing) return;
          continue;
        }

        for (const call of assistant.tool_calls) {
          const args = parseArgs(call.function.arguments);
          push({
            type: "tool_call",
            name: call.function.name,
            status: "running",
            args,
          });
          let output: string;
          let ok = true;
          try {
            output = await this.callTool(call.function.name, args, mcpByName);
          } catch (err) {
            ok = false;
            output = err instanceof Error ? err.message : String(err);
          }
          push({
            type: "tool_call",
            name: call.function.name,
            status: ok ? "completed" : "error",
            args,
            result: output,
          });
          this.messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: output,
          });
        }
      }
      throw new Error(`Stopped after ${roundCap} tool rounds`);
    } finally {
      await mcp.close();
    }
  }

  private callTool(
    name: string,
    args: Record<string, unknown>,
    mcpByName: Map<string, { call: (args: Record<string, unknown>) => Promise<string> }>,
  ): Promise<string> {
    const mcp = mcpByName.get(name);
    if (mcp) return mcp.call(args);
    return runWorkspaceTool(this.opts.cwd, name, args);
  }

  private async reviewOrContinue(
    signal: AbortSignal,
    push: (event: StreamEvent) => void,
  ): Promise<boolean> {
    if (!this.visualCritic) return false;
    const verdict = await judgeBeforeAfter({
      cwd: this.opts.cwd,
      model: this.opts.model,
      qualityBar: this.qualityBar,
      signal,
    });
    if (verdict.usage) this.noteSpend(verdict.usage, push);
    push({
      type: "assistant",
      message: { content: [{ type: "text", text: `\n${verdict.publicText}` }] },
    });
    if (verdict.accepted) return false;
    this.messages.push({ role: "user", content: verdict.continuation });
    return true;
  }

  private budgetReached(): boolean {
    return this.budgetUsd !== undefined && this.spentUsd >= this.budgetUsd;
  }

  private noteSpend(
    usage: { promptTokens: number; completionTokens: number; cachedTokens: number },
    push: (event: StreamEvent) => void,
  ): void {
    const cost = estimateLlmUsd(this.opts.model, usage);
    if (cost <= 0) return;
    this.spentUsd += cost;
    const cap = this.budgetUsd !== undefined ? ` / ${formatUsd(this.budgetUsd)}` : "";
    push({
      type: "status",
      status: "RUNNING",
      message: `LLM spend ${formatUsd(this.spentUsd)}${cap}`,
    });
  }

  private say(push: (event: StreamEvent) => void, text: string): void {
    this.messages.push({ role: "assistant", content: text });
    push({
      type: "assistant",
      message: { content: [{ type: "text", text }] },
    });
  }
}

function positiveBudget(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return { input: raw };
  }
  return {};
}
