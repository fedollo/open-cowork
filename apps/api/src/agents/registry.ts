import { Agent, CursorAgentError } from "@cursor/sdk";
import { requireApiKey } from "../env.js";

type AgentInstance = Awaited<ReturnType<typeof Agent.create>>;
type RunInstance = Awaited<ReturnType<AgentInstance["send"]>>;

interface RegistryEntry {
  agent: AgentInstance;
  currentRun: RunInstance | null;
}

const registry = new Map<string, RegistryEntry>();

/** Load project + user Cursor layers (skills, rules, AGENTS.md). */
const LOCAL_SETTING_SOURCES = ["project", "user"] as const;

export async function createAgent(opts: {
  cwd: string;
  model: string;
}): Promise<{ agent: AgentInstance; agentId: string }> {
  const apiKey = requireApiKey();
  const agent = await Agent.create({
    apiKey,
    model: { id: opts.model },
    local: {
      cwd: opts.cwd,
      settingSources: [...LOCAL_SETTING_SOURCES],
    },
  });
  const agentId = agent.agentId;
  return { agent, agentId };
}

export async function getOrResumeAgent(
  sessionId: string,
  agentId: string,
): Promise<AgentInstance> {
  const existing = registry.get(sessionId);
  if (existing) return existing.agent;

  const apiKey = requireApiKey();
  const agent = await Agent.resume(agentId, {
    apiKey,
    local: {
      settingSources: [...LOCAL_SETTING_SOURCES],
    },
  });
  registry.set(sessionId, { agent, currentRun: null });
  return agent;
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

export { CursorAgentError };
