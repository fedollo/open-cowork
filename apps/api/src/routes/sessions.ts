import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Session, AgentStreamEvent, SessionMode } from "@open-cowork/shared";
import { env } from "../env.js";
import { getSession, listSessions, saveSession } from "../store/sessions.js";
import {
  createAgent,
  getOrResumeAgent,
  registerAgent,
  setCurrentRun,
  cancelRun,
  CursorAgentError,
} from "../agents/registry.js";
import type { SDKMessage } from "@cursor/sdk";
import { mapSdkEvent } from "../agents/stream-map.js";
import { buildGauntletPrompt } from "../gauntlet/prompt.js";
import { detectGauntletPhase } from "../gauntlet/detect-phase.js";

const gauntletSchema = z.object({
  qualityBar: z.string().min(1),
  boundary: z.string().optional(),
});

const createSchema = z.object({
  cwd: z.string().min(1),
  model: z.string().min(1).optional(),
  mode: z.enum(["normal", "gauntlet"]).optional(),
  gauntlet: gauntletSchema.optional(),
});

const messageSchema = z.object({
  prompt: z.string().min(1),
  mode: z.enum(["normal", "gauntlet"]).optional(),
  gauntlet: gauntletSchema.optional(),
});

function normalizeSession(session: Session): Session {
  return {
    ...session,
    mode: session.mode ?? "normal",
  };
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

  const mode: SessionMode = body.mode ?? "normal";
  if (mode === "gauntlet" && !body.gauntlet?.qualityBar?.trim()) {
    return c.json(
      { error: "Gauntlet mode requires gauntlet.qualityBar" },
      400,
    );
  }

  const model = body.model ?? env.defaultModel;
  const id = nanoid(12);
  const now = new Date().toISOString();

  try {
    const { agent, agentId } = await createAgent({ cwd: body.cwd, model });
    registerAgent(id, agent);

    const session: Session = {
      id,
      agentId,
      cwd: body.cwd,
      model,
      title: mode === "gauntlet" ? "Gauntlet session" : "Nuova sessione",
      createdAt: now,
      updatedAt: now,
      status: "idle",
      mode,
      gauntlet:
        mode === "gauntlet" && body.gauntlet
          ? {
              qualityBar: body.gauntlet.qualityBar.trim(),
              boundary: body.gauntlet.boundary?.trim() || undefined,
            }
          : undefined,
      messages: [],
    };
    await saveSession(session);

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

  const mode: SessionMode = body.mode ?? session.mode ?? "normal";
  const gauntletCfg = body.gauntlet ?? session.gauntlet;

  if (mode === "gauntlet" && !gauntletCfg?.qualityBar?.trim()) {
    return c.json(
      { error: "Gauntlet mode requires gauntlet.qualityBar" },
      400,
    );
  }

  const userGoal = body.prompt.trim();
  const agentPrompt =
    mode === "gauntlet" && gauntletCfg
      ? buildGauntletPrompt({
          goal: userGoal,
          qualityBar: gauntletCfg.qualityBar,
          boundary: gauntletCfg.boundary,
        })
      : userGoal;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        send({ type: "status", status: "running" });
        if (mode === "gauntlet") {
          send({
            type: "gauntlet_phase",
            phase: "lead",
            detail: "Gauntlet orchestration prompt sent to lead agent",
          });
        }

        const { agent, agentId, recreated } = await getOrResumeAgent(id, {
          agentId: session.agentId,
          cwd: session.cwd,
          model: session.model,
        });
        if (recreated) {
          session.agentId = agentId;
          send({
            type: "status",
            status: "running",
            message: "Previous agent lost after restart — created a new one",
          });
        }

        session.mode = mode;
        if (mode === "gauntlet" && gauntletCfg) {
          session.gauntlet = {
            qualityBar: gauntletCfg.qualityBar.trim(),
            boundary: gauntletCfg.boundary?.trim() || undefined,
          };
        }

        const displayContent =
          mode === "gauntlet"
            ? `[Gauntlet]\nGoal: ${userGoal}\nBar: ${gauntletCfg!.qualityBar}${
                gauntletCfg!.boundary
                  ? `\nBoundary: ${gauntletCfg!.boundary}`
                  : ""
              }`
            : userGoal;

        session.messages.push({
          id: nanoid(8),
          role: "user",
          content: displayContent,
          createdAt: new Date().toISOString(),
        });

        if (
          session.title === "Nuova sessione" ||
          session.title === "Gauntlet session"
        ) {
          const prefix = mode === "gauntlet" ? "Gauntlet: " : "";
          session.title =
            prefix + userGoal.slice(0, 50) + (userGoal.length > 50 ? "…" : "");
        }
        session.status = "running";
        session.updatedAt = new Date().toISOString();
        await saveSession(session);

        const run = await agent.send(agentPrompt);
        setCurrentRun(id, run);

        let assistantText = "";
        let lastPhase: string | null = null;
        for await (const event of run.stream()) {
          const mapped = mapSdkEvent(event as SDKMessage);
          for (const m of mapped) {
            if (m.type === "assistant_text") {
              assistantText += m.text;
              if (mode === "gauntlet") {
                const phase = detectGauntletPhase(m.text);
                if (phase && phase.phase !== lastPhase) {
                  lastPhase = phase.phase;
                  send(phase);
                }
              }
            }
            if (mode === "gauntlet" && m.type === "tool_call") {
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
          send({
            type: "error",
            message: `Run fallita (${result.id})`,
          });
        }

        send({ type: "done", runId: result.id, status: doneStatus });
        send({ type: "status", status: session.status });
      } catch (err) {
        setCurrentRun(id, null);
        session.status = "error";
        session.updatedAt = new Date().toISOString();
        await saveSession(session);

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
