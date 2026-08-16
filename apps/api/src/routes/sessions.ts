import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import type {
  Session,
  AgentStreamEvent,
  IntegrationId,
  SessionCheckpoint,
} from "@open-loop/shared";
import { env } from "../env.js";
import { getSession, listSessions, saveSession } from "../store/sessions.js";
import {
  createAgent,
  getOrResumeAgent,
  registerAgent,
  setCurrentRun,
  cancelRun,
  resetAgentForSession,
  disposeAgent,
  usesStdioMcp,
  CursorAgentError,
} from "../agents/registry.js";
import type { SDKMessage } from "@cursor/sdk";
import { mapSdkEvent } from "../agents/stream-map.js";
import { buildRunFailurePayload, isDirectVideoGoal } from "../agents/run-failure.js";
import { getGitHeadRef } from "../sessions/git-snapshot.js";
import { addRecent } from "../store/recents.js";
import { buildGauntletPrompt } from "../gauntlet/prompt.js";
import { detectGauntletPhase } from "../gauntlet/detect-phase.js";
import {
  buildSessionExportMarkdown,
  sessionExportFilename,
} from "../sessions/export-session.js";
import { listGitWorkingTreeChanges } from "../sessions/git-snapshot.js";
import {
  buildMcpServers,
  IntegrationConfigError,
  normalizeIntegrationIds,
} from "../integrations/build-mcp.js";
import {
  CheckpointError,
  createCheckpoint,
  rollbackCheckpoint,
} from "../sessions/checkpoint.js";

const gauntletSchema = z.object({
  qualityBar: z.string().min(1),
  boundary: z.string().optional(),
});

const integrationsSchema = z
  .array(z.enum(["github", "atlascloud", "replicate"]))
  .optional();

const createSchema = z.object({
  cwd: z.string().min(1),
  model: z.string().min(1).optional(),
  gauntlet: gauntletSchema,
  integrations: integrationsSchema,
  checkpointBeforeRun: z.boolean().optional(),
});

const messageSchema = z.object({
  prompt: z.string().min(1),
  gauntlet: gauntletSchema.optional(),
  integrations: integrationsSchema,
  checkpointBeforeRun: z.boolean().optional(),
});

function normalizeSession(session: Session): Session {
  return {
    ...session,
    mode: "gauntlet",
    integrations: session.integrations ?? [],
    checkpointBeforeRun: session.checkpointBeforeRun ?? false,
    checkpoints: session.checkpoints ?? [],
  };
}

function nextTurn(session: Session): number {
  return (session.messages?.length ?? 0) + 1;
}

async function appendCheckpoint(
  session: Session,
  checkpoint: SessionCheckpoint,
): Promise<void> {
  session.checkpoints = [...(session.checkpoints ?? []), checkpoint];
}

export const sessionsRoutes = new Hono();

sessionsRoutes.get("/", async (c) => {
  const sessions = await listSessions();
  return c.json(
    sessions.map((raw) => {
      const s = normalizeSession(raw);
      const { messages: _m, ...rest } = s;
      return {
        ...rest,
        messageCount: _m?.length ?? 0,
      };
    }),
  );
});


sessionsRoutes.get("/:id/export", async (c) => {
  const session = await getSession(c.req.param("id"));
  if (!session) return c.json({ error: "Session not found" }, 404);
  const normalized = normalizeSession(session);
  const gitChanges = await listGitWorkingTreeChanges(normalized.cwd);
  const markdown = buildSessionExportMarkdown(normalized, gitChanges);
  const filename = sessionExportFilename(normalized.id);
  return c.body(markdown, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

sessionsRoutes.get("/:id", async (c) => {
  const session = await getSession(c.req.param("id"));
  if (!session) return c.json({ error: "Session not found" }, 404);
  return c.json(normalizeSession(session));
});

sessionsRoutes.post("/", async (c) => {
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid body" }, 400);
  }

  if (!body.gauntlet?.qualityBar?.trim()) {
    return c.json({ error: "Quality bar is required" }, 400);
  }

  const integrations = normalizeIntegrationIds(body.integrations);
  let mcpServers;
  try {
    mcpServers = buildMcpServers(integrations);
  } catch (err) {
    if (err instanceof IntegrationConfigError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }

  const model = body.model ?? env.defaultModel;
  const id = nanoid(12);
  const now = new Date().toISOString();

  try {
    const { agent, agentId } = await createAgent({
      cwd: body.cwd,
      model,
      mcpServers,
    });
    registerAgent(id, agent);

    const session: Session = {
      id,
      agentId,
      cwd: body.cwd,
      model,
      title: "Gauntlet session",
      createdAt: now,
      updatedAt: now,
      status: "idle",
      mode: "gauntlet",
      gauntlet: {
        qualityBar: body.gauntlet.qualityBar.trim(),
        boundary: body.gauntlet.boundary?.trim() || undefined,
      },
      integrations,
      checkpointBeforeRun: body.checkpointBeforeRun ?? false,
      checkpoints: [],
      messages: [],
    };
    await saveSession(session);
    void addRecent(session.cwd).catch(() => {});

    return c.json({
      id: session.id,
      agentId: session.agentId,
      cwd: session.cwd,
      model: session.model,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      status: session.status,
      mode: session.mode,
      gauntlet: session.gauntlet,
      integrations: session.integrations,
      checkpointBeforeRun: session.checkpointBeforeRun,
    });
  } catch (err) {
    const message =
      err instanceof CursorAgentError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to create agent";
    return c.json({ error: message }, 500);
  }
});

sessionsRoutes.post("/:id/messages", async (c) => {
  const id = c.req.param("id");
  const raw = await getSession(id);
  if (!raw) return c.json({ error: "Session not found" }, 404);
  const session = normalizeSession(raw);

  let body: z.infer<typeof messageSchema>;
  try {
    body = messageSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid body: prompt required" }, 400);
  }

  const gauntletCfg = body.gauntlet ?? session.gauntlet;
  const integrations: IntegrationId[] =
    body.integrations !== undefined
      ? normalizeIntegrationIds(body.integrations)
      : (session.integrations ?? []);
  const checkpointBeforeRun =
    body.checkpointBeforeRun ?? session.checkpointBeforeRun ?? false;

  if (!gauntletCfg?.qualityBar?.trim()) {
    return c.json({ error: "Quality bar is required" }, 400);
  }

  let mcpServers;
  try {
    mcpServers = buildMcpServers(integrations);
  } catch (err) {
    if (err instanceof IntegrationConfigError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }

  const userGoal = body.prompt.trim();
  const videoDirectMode = isDirectVideoGoal(userGoal);
  const agentPrompt = buildGauntletPrompt({
    goal: userGoal,
    qualityBar: gauntletCfg.qualityBar,
    boundary: gauntletCfg.boundary,
    videoDirectMode,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const retryAfterError = session.status === "error";
      const hasStdioMcp = usesStdioMcp(mcpServers);

      try {
        send({ type: "status", status: "running" });
        send({
          type: "gauntlet_phase",
          phase: "lead",
          detail: "Gauntlet orchestration prompt sent to lead agent",
        });

        const runBaseline = await getGitHeadRef(session.cwd);
        if (runBaseline) {
          send({ type: "run_baseline", ref: runBaseline });
        }

        session.checkpointBeforeRun = checkpointBeforeRun;

        if (checkpointBeforeRun) {
          try {
            const turn = nextTurn(session);
            const checkpoint = await createCheckpoint({
              cwd: session.cwd,
              sessionId: id,
              turn,
              checkpointsRoot: env.checkpointsDir,
            });
            await appendCheckpoint(session, checkpoint);
            session.updatedAt = new Date().toISOString();
            await saveSession(session);
            send({ type: "checkpoint_created", checkpoint });
          } catch (err) {
            const message =
              err instanceof CheckpointError
                ? err.message
                : err instanceof Error
                  ? err.message
                  : "Checkpoint failed";
            send({ type: "error", message });
            session.status = "error";
            session.updatedAt = new Date().toISOString();
            await saveSession(session);
            send({ type: "done", status: "error" });
            send({ type: "status", status: "error" });
            return;
          }
        }

        let agent;
        let agentId: string;
        let recreated = false;

        if (retryAfterError || hasStdioMcp) {
          const reset = await resetAgentForSession(id, {
            cwd: session.cwd,
            model: session.model,
            mcpServers,
          });
          agent = reset.agent;
          agentId = reset.agentId;
          recreated = true;
          send({
            type: "status",
            status: "running",
            message: retryAfterError
              ? "Previous run failed — created a fresh agent"
              : "Fresh agent for MCP integrations",
          });
        } else {
          const resumed = await getOrResumeAgent(id, {
            agentId: session.agentId,
            cwd: session.cwd,
            model: session.model,
            mcpServers,
          });
          agent = resumed.agent;
          agentId = resumed.agentId;
          recreated = resumed.recreated;
        }

        if (recreated && !retryAfterError && !hasStdioMcp) {
          session.agentId = agentId;
          send({
            type: "status",
            status: "running",
            message: "Previous agent lost after restart — created a new one",
          });
        } else if (recreated) {
          session.agentId = agentId;
        }

        session.mode = "gauntlet";
        session.integrations = integrations;
        session.gauntlet = {
          qualityBar: gauntletCfg.qualityBar.trim(),
          boundary: gauntletCfg.boundary?.trim() || undefined,
        };

        const displayContent = `[Gauntlet]\nGoal: ${userGoal}\nBar: ${gauntletCfg.qualityBar}${
          gauntletCfg.boundary ? `\nBoundary: ${gauntletCfg.boundary}` : ""
        }`;

        session.messages.push({
          id: nanoid(8),
          role: "user",
          content: displayContent,
          createdAt: new Date().toISOString(),
        });

        if (session.title === "Gauntlet session") {
          session.title =
            "Gauntlet: " +
            userGoal.slice(0, 50) +
            (userGoal.length > 50 ? "…" : "");
        }
        session.status = "running";
        session.updatedAt = new Date().toISOString();
        await saveSession(session);

        const sendOpts: {
          mcpServers?: typeof mcpServers;
          local?: { force?: boolean };
        } = {};
        if (Object.keys(mcpServers).length > 0) {
          sendOpts.mcpServers = mcpServers;
        }
        if (retryAfterError) {
          sendOpts.local = { force: true };
        }

        const runStartedAt = Date.now();
        const run = await agent.send(
          agentPrompt,
          Object.keys(sendOpts).length > 0 ? sendOpts : undefined,
        );
        setCurrentRun(id, run);

        let assistantText = "";
        let lastPhase: string | null = null;
        for await (const event of run.stream()) {
          const mapped = mapSdkEvent(event as SDKMessage);
          for (const m of mapped) {
            if (m.type === "assistant_text") {
              assistantText += m.text;
              const phase = detectGauntletPhase(m.text);
              if (phase && phase.phase !== lastPhase) {
                lastPhase = phase.phase;
                send(phase);
              }
            }
            if (m.type === "tool_call") {
              const phase = detectGauntletPhase(
                `${m.name} ${m.path ?? ""} ${JSON.stringify(m.args ?? "")}`,
              );
              if (phase && phase.phase !== lastPhase) {
                lastPhase = phase.phase;
                send(phase);
              }
            }
            send(m);
          }
        }

        const result = await run.wait();
        setCurrentRun(id, null);

        const durationMs = Date.now() - runStartedAt;

        if (assistantText) {
          session.messages.push({
            id: nanoid(8),
            role: "assistant",
            content: assistantText,
            createdAt: new Date().toISOString(),
          });
        }

        const doneStatus =
          result.status === "error"
            ? "error"
            : result.status === "cancelled"
              ? "cancelled"
              : "finished";

        session.status = doneStatus === "finished" ? "done" : "error";
        session.updatedAt = new Date().toISOString();
        await saveSession(session);

        if (doneStatus === "error") {
          console.error("Agent run failed", {
            sessionId: id,
            runId: result.id,
            status: result.status,
            error: result.error,
            durationMs: result.durationMs ?? durationMs,
          });
          const failure = buildRunFailurePayload(result, {
            assistantText,
            durationMs: result.durationMs ?? durationMs,
          });
          send({
            type: "error",
            message: failure.message,
            code: failure.code,
            suggestApiRestart: failure.suggestApiRestart,
          });
        }

        if (hasStdioMcp) {
          await disposeAgent(id);
        }

        send({ type: "done", runId: result.id, status: doneStatus });
        send({ type: "status", status: session.status });
      } catch (err) {
        setCurrentRun(id, null);
        session.status = "error";
        session.updatedAt = new Date().toISOString();
        await saveSession(session);

        if (hasStdioMcp) {
          await disposeAgent(id);
        }

        if (err instanceof CursorAgentError) {
          send({
            type: "error",
            message: err.message,
            retryable: err.isRetryable,
          });
        } else {
          send({
            type: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          });
        }
        send({ type: "done", status: "error" });
        send({ type: "status", status: "error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

sessionsRoutes.post("/:id/cancel", async (c) => {
  const id = c.req.param("id");
  const session = await getSession(id);
  if (!session) return c.json({ error: "Session not found" }, 404);

  const cancelled = await cancelRun(id);
  if (cancelled) {
    session.status = "idle";
    session.updatedAt = new Date().toISOString();
    await saveSession(session);
  }
  return c.json({ cancelled });
});

sessionsRoutes.post("/:id/checkpoint", async (c) => {
  const id = c.req.param("id");
  const raw = await getSession(id);
  if (!raw) return c.json({ error: "Session not found" }, 404);
  const session = normalizeSession(raw);

  try {
    const turn = nextTurn(session);
    const checkpoint = await createCheckpoint({
      cwd: session.cwd,
      sessionId: id,
      turn,
      checkpointsRoot: env.checkpointsDir,
    });
    await appendCheckpoint(session, checkpoint);
    session.updatedAt = new Date().toISOString();
    await saveSession(session);
    return c.json({ checkpoint, checkpoints: session.checkpoints });
  } catch (err) {
    const message =
      err instanceof CheckpointError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Checkpoint failed";
    return c.json({ error: message }, 400);
  }
});

sessionsRoutes.post("/:id/rollback", async (c) => {
  const id = c.req.param("id");
  const raw = await getSession(id);
  if (!raw) return c.json({ error: "Session not found" }, 404);
  const session = normalizeSession(raw);

  const checkpoints = session.checkpoints ?? [];
  const checkpoint = checkpoints[checkpoints.length - 1];
  if (!checkpoint) {
    return c.json({ error: "No checkpoint available for this session." }, 400);
  }

  try {
    await rollbackCheckpoint({
      cwd: session.cwd,
      checkpoint,
      checkpointsRoot: env.checkpointsDir,
    });
    session.checkpoints = checkpoints.slice(0, -1);
    session.updatedAt = new Date().toISOString();
    await saveSession(session);
    return c.json({
      rolledBack: checkpoint,
      checkpoints: session.checkpoints,
    });
  } catch (err) {
    const message =
      err instanceof CheckpointError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Rollback failed";
    return c.json({ error: message }, 400);
  }
});
