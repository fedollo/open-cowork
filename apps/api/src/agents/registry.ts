import { CursorAgentError, type McpServerConfig } from "@cursor/sdk";
import { resolveAtlasChatModel } from "@open-loop/shared";
import { requireApiKey } from "../env.js";
import { AtlasAgent, type AtlasRun } from "./atlas-agent.js";

type AgentInstance = AtlasAgent;
type RunInstance = AtlasRun;

interface RegistryEntry {
  agent: AgentInstance;
  currentRun: RunInstance | null;
}

const registry = new Map<string, RegistryEntry>();

export async function createAgent(opts: {
  cwd: string;
  model: string;
  mcpServers?: Record<string, McpServerConfig>;
  budgetUsd?: number;
  visualCritic?: boolean;
  qualityBar?: string;
}): Promise<{ agent: AgentInstance; agentId: string }> {
  requireApiKey();
  const agent = new AtlasAgent({
    cwd: opts.cwd,
    model: resolveAtlasChatModel(opts.model),
    mcpServers: opts.mcpServers,
    budgetUsd: opts.budgetUsd,
    visualCritic: opts.visualCritic,
    qualityBar: opts.qualityBar,
  });
  return { agent, agentId: agent.agentId };
}

/**
 * Return the in-memory agent, or create a fresh one after an API restart.
 */
export async function getOrResumeAgent(
  sessionId: string,
  opts: {
    agentId: string;
    cwd: string;
    model: string;
    mcpServers?: Record<string, McpServerConfig>;
    budgetUsd?: number;
    visualCritic?: boolean;
    qualityBar?: string;
  },
): Promise<{ agent: AgentInstance; agentId: string; recreated: boolean }> {
  const existing = registry.get(sessionId);
  if (existing) {
    return {
      agent: existing.agent,
      agentId: existing.agent.agentId,
      recreated: false,
    };
  }

  console.warn(
    `Agent ${opts.agentId} not in memory — creating a new one for session ${sessionId}`,
  );
  const { agent, agentId } = await createAgent({
    cwd: opts.cwd,
    model: opts.model,
    mcpServers: opts.mcpServers,
    budgetUsd: opts.budgetUsd,
    visualCritic: opts.visualCritic,
    qualityBar: opts.qualityBar,
  });
  registry.set(sessionId, { agent, currentRun: null });
  return { agent, agentId, recreated: true };
}

export async function resetAgentForSession(
  sessionId: string,
  opts: {
    cwd: string;
    model: string;
    mcpServers?: Record<string, McpServerConfig>;
    budgetUsd?: number;
    visualCritic?: boolean;
    qualityBar?: string;
  },
): Promise<{ agent: AgentInstance; agentId: string }> {
  await disposeAgent(sessionId);
  const { agent, agentId } = await createAgent(opts);
  registerAgent(sessionId, agent);
  return { agent, agentId };
}

export function registerAgent(sessionId: string, agent: AgentInstance): void {
  registry.set(sessionId, { agent, currentRun: null });
}

export function setCurrentRun(sessionId: string, run: RunInstance | null): void {
  const entry = registry.get(sessionId);
  if (entry) entry.currentRun = run;
}

export function getCurrentRun(sessionId: string): RunInstance | null {
  return registry.get(sessionId)?.currentRun ?? null;
}

export async function cancelRun(sessionId: string): Promise<boolean> {
  const run = getCurrentRun(sessionId);
  if (!run) return false;
  if (run.supports("cancel")) {
    await run.cancel();
    return true;
  }
  return false;
}

export async function disposeAgent(sessionId: string): Promise<void> {
  const entry = registry.get(sessionId);
  if (!entry) return;
  registry.delete(sessionId);
  try {
    await entry.agent[Symbol.asyncDispose]();
  } catch {
    // ignore dispose errors
  }
}

export async function disposeAll(): Promise<void> {
  const ids = [...registry.keys()];
  await Promise.all(ids.map((id) => disposeAgent(id)));
}

export function usesStdioMcp(
  mcpServers?: Record<string, McpServerConfig>,
): boolean {
  if (!mcpServers) return false;
  return Object.values(mcpServers).some((s) => s.type === "stdio" || !s.type);
}

export { CursorAgentError };
