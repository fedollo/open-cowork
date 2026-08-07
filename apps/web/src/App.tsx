import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentStreamEvent,
  ChatMessage,
  FsTreeNode,
  Session,
  SessionStatus,
} from "@open-cowork/shared";
import {
  cancelSession,
  createSession,
  fetchTree,
  getSession,
  listSessions,
  streamMessage,
} from "./api";

interface SessionSummary {
  id: string;
  agentId: string;
  cwd: string;
  model: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  messageCount: number;
}

interface ActivityItem {
  id: string;
  kind: string;
  text: string;
  isError?: boolean;
}

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [cwdInput, setCwdInput] = useState("");
  const [modelInput, setModelInput] = useState("composer-2.5");
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [liveAssistant, setLiveAssistant] = useState("");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [tree, setTree] = useState<FsTreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await listSessions();
      setSessions(list);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages, liveAssistant]);

  const loadTree = useCallback(async (cwd: string) => {
    try {
      const data = await fetchTree(cwd);
      setTree(data.nodes);
    } catch {
      setTree([]);
    }
  }, []);

  const selectSession = useCallback(
    async (id: string) => {
      setError(null);
      setLiveAssistant("");
      setActivity([]);
      setActiveId(id);
      try {
        const s = await getSession(id);
        setSession(s);
        setStatus(s.status);
        void loadTree(s.cwd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore caricamento");
      }
    },
    [loadTree],
  );

  const handleCreate = async () => {
    const cwd = cwdInput.trim();
    if (!cwd) {
      setError("Inserisci un path assoluto della cartella");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createSession(cwd, modelInput.trim() || undefined);
      await refreshSessions();
      await selectSession(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Creazione fallita");
    } finally {
      setCreating(false);
    }
  };

  const handleEvent = useCallback((event: AgentStreamEvent) => {
    switch (event.type) {
      case "assistant_text":
        setLiveAssistant((prev) => prev + event.text);
        break;
      case "tool_call":
        setActivity((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${prev.length}`,
            kind: "tool",
            text: event.path
              ? `${event.name} → ${event.path}`
              : event.name,
          },
        ]);
        break;
      case "tool_result":
        setActivity((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${prev.length}`,
            kind: event.ok ? "ok" : "fail",
            text: event.summary
              ? `${event.name}: ${event.summary}`
              : event.name,
            isError: !event.ok,
          },
        ]);
        break;
      case "status":
        setStatus(event.status);
        setActivity((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${prev.length}`,
            kind: "status",
            text: event.message ?? event.status,
          },
        ]);
        break;
      case "error":
        setError(event.message);
        setActivity((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${prev.length}`,
            kind: "error",
            text: event.message,
            isError: true,
          },
        ]);
        break;
      case "done":
        setActivity((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${prev.length}`,
            kind: "done",
            text: `run ${event.status}${event.runId ? ` (${event.runId})` : ""}`,
          },
        ]);
        break;
    }
  }, []);

  const handleSend = async () => {
    if (!activeId || !prompt.trim() || sending) return;
    const text = prompt.trim();
    setPrompt("");
    setSending(true);
    setError(null);
    setLiveAssistant("");
    setStatus("running");

    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setSession((prev) =>
      prev
        ? { ...prev, messages: [...prev.messages, userMsg], status: "running" }
        : prev,
    );

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await streamMessage(activeId, text, handleEvent, ac.signal);
      const refreshed = await getSession(activeId);
      setSession(refreshed);
      setStatus(refreshed.status);
      setLiveAssistant("");
      void loadTree(refreshed.cwd);
      void refreshSessions();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Invio fallito");
        setStatus("error");
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const handleCancel = async () => {
    if (!activeId) return;
    abortRef.current?.abort();
    try {
      await cancelSession(activeId);
      setStatus("idle");
      setSending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel fallito");
    }
  };

  const showEmpty = !session;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>Open Cowork</h1>
          <p>Workspace agentico locale</p>
        </div>

        <div className="new-session">
          <label htmlFor="cwd">Cartella (path assoluto)</label>
          <input
            id="cwd"
            value={cwdInput}
            onChange={(e) => setCwdInput(e.target.value)}
            placeholder="/Users/…/progetto"
            spellCheck={false}
          />
          <label htmlFor="model">Modello</label>
          <input
            id="model"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            spellCheck={false}
          />
          <button
            className="btn"
            type="button"
            disabled={creating}
            onClick={() => void handleCreate()}
          >
            {creating ? "Creazione…" : "Nuova sessione"}
          </button>
        </div>

        <div className="session-list">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`session-item${activeId === s.id ? " active" : ""}`}
              onClick={() => void selectSession(s.id)}
            >
              <span className="title">{s.title}</span>
              <span className="meta">{s.cwd}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="chat">
        {showEmpty ? (
          <div className="empty-state">
            <h2>Scegli una cartella e descrivi l&apos;obiettivo</h2>
            <p>
              Crea una sessione a sinistra con il path assoluto del workspace,
              poi scrivi cosa deve fare l&apos;agent. Vedrai lo stream live e i
              file aggiornati a destra.
            </p>
            {error && <div className="error-banner" style={{ marginTop: "1rem" }}>{error}</div>}
          </div>
        ) : (
          <>
            <div className="chat-header">
              <span className="cwd" title={session.cwd}>
                {session.cwd}
              </span>
              <span className={`status-pill ${status}`}>{status}</span>
            </div>

            <div className="messages">
              {session.messages.map((m) => (
                <div key={m.id} className={`msg ${m.role}`}>
                  <div className="role">{m.role}</div>
                  <div className="body">{m.content}</div>
                </div>
              ))}
              {liveAssistant && (
                <div className="msg assistant">
                  <div className="role">assistant</div>
                  <div className="body">{liveAssistant}</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="composer">
              {error && <div className="error-banner">{error}</div>}
              <div className="composer-row">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Descrivi l'obiettivo…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  disabled={sending}
                />
                <div className="composer-actions">
                  {sending ? (
                    <button
                      className="btn btn-danger"
                      type="button"
                      onClick={() => void handleCancel()}
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      className="btn"
                      type="button"
                      disabled={!prompt.trim()}
                      onClick={() => void handleSend()}
                    >
                      Avvia
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <aside className="panel">
        <div className="panel-section">
          <div className="panel-title">File</div>
          <div className="tree">
            {tree.length === 0 ? (
              <div className="tree-node">Nessun albero</div>
            ) : (
              tree.map((n) => (
                <div
                  key={n.path}
                  className={`tree-node ${n.type}`}
                  title={n.path}
                  style={{
                    paddingLeft: `${Math.min(
                      (n.path.split("/").length -
                        (session?.cwd.split("/").length ?? 0)) *
                        0.55,
                      4,
                    )}rem`,
                  }}
                >
                  {n.type === "dir" ? "▸ " : "  "}
                  {n.name}
                </div>
              ))
            )}
          </div>
        </div>
        <div className="panel-section">
          <div className="panel-title">Activity</div>
          <div className="activity">
            {activity.length === 0 ? (
              <div className="activity-item">In attesa di eventi…</div>
            ) : (
              activity.map((a) => (
                <div
                  key={a.id}
                  className={`activity-item${a.isError ? " error" : ""}`}
                >
                  <span className="kind">{a.kind}</span>
                  {a.text}
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
