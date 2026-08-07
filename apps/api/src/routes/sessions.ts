import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Session, AgentStreamEvent } from "@open-cowork/shared";
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

const createSchema = z.object({
  cwd: z.string().min(1),
  model: z.string().min(1).optional(),
});

const messageSchema = z.object({
  prompt: z.string().min(1),
});

export const sessionsRoutes = new Hono();

sessionsRoutes.get("/", async (c) => {
  const sessions = await listSessions();
  return c.json(
    sessions.map(({ messages: _m, ...rest }) => ({
      ...rest,
      messageCount: _m?.length ?? 0,
    })),
  );
});

sessionsRoutes.get("/:id", async (c) => {
  const session = await getSession(c.req.param("id"));
  if (!session) return c.json({ error: "Session not found" }, 404);
  return c.json(session);
});

sessionsRoutes.post("/", async (c) => {
  const body = createSchema.parse(await c.req.json());
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
      title: "Nuova sessione",
      createdAt: now,
      updatedAt: now,
      status: "idle",
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
  const session = await getSession(id);
  if (!session) return c.json({ error: "Session not found" }, 404);

  let prompt: string;
  try {
    prompt = messageSchema.parse(await c.req.json()).prompt;
  } catch {
    return c.json({ error: "Invalid body: prompt required" }, 400);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        send({ type: "status", status: "running" });

        const agent = await getOrResumeAgent(id, session.agentId);
        const userMsg = {
          id: nanoid(8),
          role: "user" as const,
          content: prompt,
          createdAt: new Date().toISOString(),
        };
        session.messages.push(userMsg);
        if (session.title === "Nuova sessione") {
          session.title = prompt.slice(0, 60) + (prompt.length > 60 ? "…" : "");
        }
        session.status = "running";
        session.updatedAt = new Date().toISOString();
        await saveSession(session);

        const run = await agent.send(prompt);
        setCurrentRun(id, run);

        let assistantText = "";
        for await (const event of run.stream()) {
          const mapped = mapSdkEvent(event as SDKMessage);
          for (const m of mapped) {
            if (m.type === "assistant_text") assistantText += m.text;
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
