import { Agent, CursorAgentError, type McpServerConfig } from "@cursor/sdk";
import { env, requireApiKey } from "../env.js";
import { resolveSettingSources } from "./setting-sources.js";

type AgentInstance = Awaited<ReturnType<typeof Agent.create>>;
type RunInstance = Awaited<ReturnType<AgentInstance["send"]>>;

interface RegistryEntry {
  agent: AgentInstance;
  currentRun: RunInstance | null;
}

const registry = new Map<string, RegistryEntry>();

function settingSources() {
  return resolveSettingSources(env.settingSources);
}

function isAgentNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not found/i.test(msg) || /unknown agent/i.test(msg);
}

export async function createAgent(opts: {
  cwd: string;
  model: string;
  mcpServers?: Record<string, McpServerConfig>;
}): Promise<{ agent: AgentInstance; agentId: string }> {
  const apiKey = requireApiKey();
  const agent = await Agent.create({
    apiKey,
    model: { id: opts.model },
    local: {
      cwd: opts.cwd,
      settingSources: settingSources(),
    },
    ...(opts.mcpServers && Object.keys(opts.mcpServers).length > 0
      ? { mcpServers: opts.mcpServers }
      : {}),
  });
  const agentId = agent.agentId;
  return { agent, agentId };
}

/**
 * Resume an existing agent, or recreate one if the local store lost it
 * (common after API restart / dispose).
 */
export async function getOrResumeAgent(
  sessionId: string,
  opts: {
    agentId: string;
    cwd: string;
    model: string;
    mcpServers?: Record<string, McpServerConfig>;
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

  const apiKey = requireApiKey();
  const mcpOpt =
    opts.mcpServers && Object.keys(opts.mcpServers).length > 0
      ? { mcpServers: opts.mcpServers }
      : {};

  try {
    const agent = await Agent.resume(opts.agentId, {
      apiKey,
      local: {
        cwd: opts.cwd,
        settingSources: settingSources(),
      },
      ...mcpOpt,
    });
    registry.set(sessionId, { agent, currentRun: null });
    return { agent, agentId: agent.agentId, recreated: false };
  } catch (err) {
    if (!isAgentNotFound(err)) throw err;

    console.warn(
      `Agent ${opts.agentId} not found — recreating for session ${sessionId}`,
    );
    const { agent, agentId } = await createAgent({
      cwd: opts.cwd,
      model: opts.model,
      mcpServers: opts.mcpServers,
    });
    registry.set(sessionId, { agent, currentRun: null });
    return { agent, agentId, recreated: true };
  }
}

export async function resetAgentForSession(
  sessionId: string,
  opts: {
    cwd: string;
    model: string;
    mcpServers?: Record<string, McpServerConfig>;
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
