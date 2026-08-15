import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentStreamEvent,
  ChatMessage,
  FileChange,
  FsTreeNode,
  IntegrationId,
  IntegrationInfo,
  Session,
  SessionMode,
  SessionStatus,
} from "@open-loop/shared";
import { QUALITY_BAR_TEMPLATES, getQualityBarTemplate } from "@open-loop/shared";
import {
  cancelSession,
  createSession,
  fetchTree,
  fetchWorkspaceChanges,
  fetchWorkspaceDiff,
  getSession,
  listIntegrations,
  listSessions,
  exportSession,
  streamMessage,
} from "./api";
import { GAUNTLET_EXAMPLE } from "./examples";
import {
  loadGauntletProgressFile,
  renderGauntletMarkdown,
} from "./gauntlet-progress";

interface SessionSummary {
  id: string;
  agentId: string;
  cwd: string;
  model: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  mode?: SessionMode;
  integrations?: IntegrationId[];
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
  const [mode, setMode] = useState<SessionMode>("normal");
  const [qualityBar, setQualityBar] = useState("");
  const [boundary, setBoundary] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [liveAssistant, setLiveAssistant] = useState("");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [tree, setTree] = useState<FsTreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [gauntletPhase, setGauntletPhase] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<
    "files" | "changes" | "activity" | "gauntlet"
  >("files");
  const [gauntletProgress, setGauntletProgress] = useState<string | null>(null);
  const [gauntletProgressPath, setGauntletProgressPath] = useState<string | null>(
    null,
  );
  const [workspaceChanges, setWorkspaceChanges] = useState<FileChange[]>([]);
  const [changesIsGitRepo, setChangesIsGitRepo] = useState(true);
  const [selectedChangePath, setSelectedChangePath] = useState<string | null>(null);
  const [changeDiff, setChangeDiff] = useState("");
  const [changesLoading, setChangesLoading] = useState(false);
  const [runBaseline, setRunBaseline] = useState<string | null>(null);

  const [integrationCatalog, setIntegrationCatalog] = useState<
    IntegrationInfo[]
  >([]);
  const [enabledIntegrations, setEnabledIntegrations] = useState<
    IntegrationId[]
  >([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runBaselineRef = useRef<string | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await listSessions();
      setSessions(list);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const refreshIntegrations = useCallback(async () => {
    try {
      const list = await listIntegrations();
      setIntegrationCatalog(list);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
    void refreshIntegrations();
  }, [refreshSessions, refreshIntegrations]);

  const toggleIntegration = (id: IntegrationId) => {
    setEnabledIntegrations((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };


  const handleExportSession = async () => {
    if (!session) return;
    setExporting(true);
    setError(null);
    try {
      await exportSession(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

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


  const loadChanges = useCallback(async (cwd: string, baseline?: string | null) => {
    setChangesLoading(true);
    try {
      const data = await fetchWorkspaceChanges(cwd, baseline ?? undefined);
      setChangesIsGitRepo(data.isGitRepo);
      setWorkspaceChanges(data.changes);
    } catch {
      setChangesIsGitRepo(false);
      setWorkspaceChanges([]);
    } finally {
      setChangesLoading(false);
    }
  }, []);

  const loadChangeDiff = useCallback(
    async (cwd: string, path: string, baseline?: string | null) => {
      setSelectedChangePath(path);
      try {
        const data = await fetchWorkspaceDiff(cwd, path, baseline ?? undefined);
        setChangeDiff(
          data.diff.trim() ? data.diff : "No diff for this file.",
        );
      } catch {
        setChangeDiff("Failed to load diff.");
      }
    },
    [],
  );

  useEffect(() => {
    if (rightTab === "changes" && session?.cwd) {
      void loadChanges(session.cwd, runBaselineRef.current);
    }
  }, [rightTab, session?.cwd, runBaseline, loadChanges]);

  const loadGauntletProgress = useCallback(async (cwd: string) => {
    const file = await loadGauntletProgressFile(cwd);
    if (file) {
      setGauntletProgress(file.content);
      setGauntletProgressPath(file.path);
    } else {
      setGauntletProgress(null);
      setGauntletProgressPath(null);
    }
  }, []);

  const selectSession = useCallback(
    async (id: string) => {
      setError(null);
      setLiveAssistant("");
      setActivity([]);
      setGauntletPhase(null);
      setGauntletProgress(null);
      setGauntletProgressPath(null);
      setWorkspaceChanges([]);
      setSelectedChangePath(null);
      setChangeDiff("");
      setRunBaseline(null);
      runBaselineRef.current = null;
      setRightTab("files");
      setActiveId(id);
      try {
        const s = await getSession(id);
        setSession(s);
        setStatus(s.status);
        setMode(s.mode ?? "normal");
        setQualityBar(s.gauntlet?.qualityBar ?? "");
        setBoundary(s.gauntlet?.boundary ?? "");
        setEnabledIntegrations(s.integrations ?? []);
        void loadTree(s.cwd);
        if (s.mode === "gauntlet") {
          void loadGauntletProgress(s.cwd);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session");
      }
    },
    [loadTree, loadGauntletProgress],
  );

  const applyQualityBarTemplate = (id: string) => {
    const template = getQualityBarTemplate(id);
    if (!template) return;
    setMode("gauntlet");
    setPrompt(template.goal);
    setQualityBar(template.qualityBar);
    setBoundary(template.boundary ?? "");
    setSelectedTemplateId(id);
    setError(null);
  };

  const fillGauntletExample = () => applyQualityBarTemplate("readme-docs");

  const handleCreate = async () => {
    const cwd = cwdInput.trim();
    if (!cwd) {
      setError("Enter an absolute folder path");
      return;
    }
    if (mode === "gauntlet" && !qualityBar.trim()) {
      setError("Gauntlet mode requires a concrete quality bar");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createSession({
        cwd,
        model: modelInput.trim() || undefined,
        mode,
        gauntlet:
          mode === "gauntlet"
            ? {
                qualityBar: qualityBar.trim(),
                boundary: boundary.trim() || undefined,
              }
            : undefined,
        integrations: enabledIntegrations,
      });
      await refreshSessions();
      await selectSession(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setCreating(false);
    }
  };

  const refreshGauntletProgress = useCallback(
    (cwd: string) => {
      void loadGauntletProgress(cwd);
    },
    [loadGauntletProgress],
  );

  const handleEvent = useCallback(
    (event: AgentStreamEvent, opts?: { cwd?: string; isGauntlet?: boolean }) => {
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
      case "gauntlet_phase":
        setGauntletPhase(event.phase);
        setActivity((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${prev.length}`,
            kind: `gauntlet:${event.phase}`,
            text: event.detail ?? event.phase,
          },
        ]);
        if (opts?.isGauntlet && opts.cwd) refreshGauntletProgress(opts.cwd);
        break;
      case "run_baseline":
        runBaselineRef.current = event.ref;
        setRunBaseline(event.ref);
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
        if (opts?.isGauntlet && opts.cwd) refreshGauntletProgress(opts.cwd);
        if (opts?.cwd) {
          void loadChanges(opts.cwd, runBaselineRef.current);
        }
        if (opts?.cwd && !opts?.isGauntlet) setRightTab("changes");
        break;
    }
  },
    [refreshGauntletProgress, loadChanges],
  );

  const handleSend = async () => {
    if (!activeId || !prompt.trim() || sending) return;
    if (mode === "gauntlet" && !qualityBar.trim()) {
      setError("Gauntlet mode requires a concrete quality bar");
      return;
    }

    const text = prompt.trim();
    setPrompt("");
    setSending(true);
    setError(null);
    setLiveAssistant("");
    setStatus("running");
    setGauntletPhase(mode === "gauntlet" ? "lead" : null);
    runBaselineRef.current = null;
    setRunBaseline(null);
    if (mode === "gauntlet") setRightTab("gauntlet");

    const displayContent =
      mode === "gauntlet"
        ? `[Gauntlet]\nGoal: ${text}\nBar: ${qualityBar.trim()}${
            boundary.trim() ? `\nBoundary: ${boundary.trim()}` : ""
          }`
        : text;

    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: displayContent,
      createdAt: new Date().toISOString(),
    };
    setSession((prev) =>
      prev
        ? {
            ...prev,
            mode,
            gauntlet:
              mode === "gauntlet"
                ? {
                    qualityBar: qualityBar.trim(),
                    boundary: boundary.trim() || undefined,
                  }
                : prev.gauntlet,
            integrations: enabledIntegrations,
            messages: [...prev.messages, userMsg],
            status: "running",
          }
        : prev,
    );

    const ac = new AbortController();
    abortRef.current = ac;

    const runCwd = session?.cwd ?? cwdInput.trim();
    const isGauntletRun = mode === "gauntlet";

    try {
      await streamMessage(
        activeId,
        {
          prompt: text,
          mode,
          gauntlet:
            mode === "gauntlet"
              ? {
                  qualityBar: qualityBar.trim(),
                  boundary: boundary.trim() || undefined,
                }
              : undefined,
          integrations: enabledIntegrations,
        },
        (event) =>
          handleEvent(event, { cwd: runCwd, isGauntlet: isGauntletRun }),
        ac.signal,
      );
      const refreshed = await getSession(activeId);
      setSession(refreshed);
      setStatus(refreshed.status);
      setLiveAssistant("");
      void loadTree(refreshed.cwd);
      void loadChanges(refreshed.cwd, runBaselineRef.current);
      if (refreshed.mode === "gauntlet") {
        void loadGauntletProgress(refreshed.cwd);
      }
      void refreshSessions();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Failed to send message");
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
      setError(err instanceof Error ? err.message : "Failed to cancel");
    }
  };

  const showEmpty = !session;
  const canSend =
    Boolean(prompt.trim()) &&
    (mode !== "gauntlet" || Boolean(qualityBar.trim()));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>Open Loop</h1>
          <p>Local agentic workspace</p>
        </div>

        <div className="new-session">
          <label htmlFor="cwd">Folder (absolute path)</label>
          <input
            id="cwd"
            value={cwdInput}
            onChange={(e) => setCwdInput(e.target.value)}
            placeholder="/Users/…/project"
            spellCheck={false}
          />
          <label htmlFor="model">Model</label>
          <input
            id="model"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            spellCheck={false}
          />

          <span className="field-label">Mode</span>
          <div className="mode-toggle" role="group" aria-label="Session mode">
            <button
              type="button"
              className={`mode-btn${mode === "normal" ? " active" : ""}`}
              onClick={() => setMode("normal")}
            >
              Normal
            </button>
            <button
              type="button"
              className={`mode-btn${mode === "gauntlet" ? " active" : ""}`}
              onClick={() => setMode("gauntlet")}
            >
              Gauntlet
            </button>
          </div>

          {mode === "gauntlet" && (
            <>
              <label htmlFor="qualityBarTemplate">Template</label>
              <select
                id="qualityBarTemplate"
                className="sidebar-select"
                value={selectedTemplateId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedTemplateId(id);
                  if (id) applyQualityBarTemplate(id);
                }}
              >
                <option value="">Choose a template…</option>
                {QUALITY_BAR_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <label htmlFor="qualityBar">Quality bar</label>
              <textarea
                id="qualityBar"
                className="sidebar-textarea"
                value={qualityBar}
                onChange={(e) => setQualityBar(e.target.value)}
                placeholder={GAUNTLET_EXAMPLE.qualityBar.slice(0, 80) + "…"}
                rows={3}
              />
              <label htmlFor="boundary">Boundary (optional)</label>
              <textarea
                id="boundary"
                className="sidebar-textarea"
                value={boundary}
                onChange={(e) => setBoundary(e.target.value)}
                placeholder={(GAUNTLET_EXAMPLE.boundary ?? "").slice(0, 60) + "…"}
                rows={2}
              />
            </>
          )}

          <span className="field-label">Integrations</span>
          <div
            className="integrations-panel"
            role="group"
            aria-label="Integrations"
          >
            {integrationCatalog.map((item) => {
              const checked = enabledIntegrations.includes(item.id);
              return (
                <label
                  key={item.id}
                  className={`integration-chip${checked ? " on" : ""}${
                    !item.configured ? " missing" : ""
                  }`}
                  title={
                    item.configured
                      ? item.description
                      : `Set ${item.envKey} in .env — ${item.description}`
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleIntegration(item.id)}
                  />
                  <span className="integration-chip-label">{item.label}</span>
                  <span
                    className={`integration-dot${
                      item.configured ? " ready" : " warn"
                    }`}
                    aria-label={
                      item.configured ? "ready" : `needs ${item.envKey}`
                    }
                  />
                </label>
              );
            })}
          </div>
          {integrationCatalog.length === 0 && (
            <p className="hint-muted">Loading integrations…</p>
          )}

          <button
            className="btn"
            type="button"
            disabled={creating}
            onClick={() => void handleCreate()}
          >
            {creating ? "Creating…" : "New session"}
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
              <span className="title-row">
                <span className="title">{s.title}</span>
                {s.mode === "gauntlet" && (
                  <span className="mode-badge">gauntlet</span>
                )}
              </span>
              <span className="meta">{s.cwd}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="chat">
        {showEmpty ? (
          <div className="empty-state">
            <h2>
              {mode === "gauntlet"
                ? "Set a goal and a concrete quality bar"
                : "Pick a folder and describe the goal"}
            </h2>
            <p>
              {mode === "gauntlet"
                ? "Gauntlet mode wraps your goal in a builder/critic orchestration loop. Set folder, goal, and quality bar in the sidebar, then start."
                : "Create a session on the left with an absolute workspace path and goal, then start. Live stream and file updates appear on the right."}
            </p>
            {mode === "gauntlet" && (
              <div className="example-card">
                <p className="example-label">Example</p>
                <p>
                  <strong>Goal:</strong> {GAUNTLET_EXAMPLE.goal}
                </p>
                <p>
                  <strong>Bar:</strong> {GAUNTLET_EXAMPLE.qualityBar}
                </p>
                <p>
                  <strong>Boundary:</strong> {GAUNTLET_EXAMPLE.boundary ?? "—"}
                </p>
                <button
                  className="btn"
                  type="button"
                  onClick={fillGauntletExample}
                >
                  Use this example
                </button>
              </div>
            )}
            {error && (
              <div className="error-banner" style={{ marginTop: "1rem" }}>
                {error}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="chat-header">
              <span className="cwd" title={session.cwd}>
                {session.cwd}
              </span>
              <div className="header-pills">
                <button
                  type="button"
                  className="btn btn-ghost header-export"
                  disabled={exporting}
                  onClick={() => void handleExportSession()}
                >
                  {exporting ? "Exporting…" : "Export"}
                </button>
                {(session.mode ?? mode) === "gauntlet" && (
                  <span className="status-pill gauntlet">
                    gauntlet{gauntletPhase ? ` · ${gauntletPhase}` : ""}
                  </span>
                )}
                {(session.integrations ?? enabledIntegrations).map((id) => (
                  <span key={id} className="status-pill integration">
                    {id}
                  </span>
                ))}
                <span className={`status-pill ${status}`}>{status}</span>
              </div>
            </div>

            {(session.mode ?? mode) === "gauntlet" && (
              <div className="gauntlet-hint">
                Progress file:{" "}
                <code>.open-loop/gauntlet-progress.md</code> in the workspace
              </div>
            )}

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

              {mode === "gauntlet" && (
                <div className="gauntlet-fields">
                  <div className="gauntlet-fields-header">
                    <label htmlFor="composer-bar">Quality bar</label>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={fillGauntletExample}
                      disabled={sending}
                    >
                      Use example
                    </button>
                  </div>
                  <textarea
                    id="composer-bar"
                    value={qualityBar}
                    onChange={(e) => setQualityBar(e.target.value)}
                    placeholder="Concrete inspectable standard (e.g. match Vite README clarity)…"
                    rows={2}
                    disabled={sending}
                  />
                  <label htmlFor="composer-boundary">Boundary (optional)</label>
                  <textarea
                    id="composer-boundary"
                    value={boundary}
                    onChange={(e) => setBoundary(e.target.value)}
                    placeholder="Hard limits (e.g. only edit README/docs)…"
                    rows={1}
                    disabled={sending}
                  />
                </div>
              )}

              <div className="composer-row">
                <label htmlFor="composer-goal">Goal</label>
                <textarea
                  id="composer-goal"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    mode === "gauntlet"
                      ? GAUNTLET_EXAMPLE.goal.slice(0, 80) + "…"
                      : "Describe the goal…"
                  }
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
                      disabled={!canSend}
                      onClick={() => void handleSend()}
                    >
                      {mode === "gauntlet" ? "Start Gauntlet" : "Start"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <aside className="panel">
        <div className="panel-tabs" role="tablist" aria-label="Workspace panels">
          <button
            type="button"
            role="tab"
            className={`panel-tab${rightTab === "files" ? " active" : ""}`}
            aria-selected={rightTab === "files"}
            onClick={() => setRightTab("files")}
          >
            File
          </button>
          {session && (
            <button
              type="button"
              role="tab"
              className={`panel-tab${rightTab === "changes" ? " active" : ""}`}
              aria-selected={rightTab === "changes"}
              onClick={() => setRightTab("changes")}
            >
              Changes
            </button>
          )}
          <button
            type="button"
            role="tab"
            className={`panel-tab${rightTab === "activity" ? " active" : ""}`}
            aria-selected={rightTab === "activity"}
            onClick={() => setRightTab("activity")}
          >
            Activity
          </button>
          {(session?.mode ?? mode) === "gauntlet" && (
            <button
              type="button"
              role="tab"
              className={`panel-tab gauntlet-tab${rightTab === "gauntlet" ? " active" : ""}`}
              aria-selected={rightTab === "gauntlet"}
              onClick={() => setRightTab("gauntlet")}
            >
              Gauntlet
            </button>
          )}
        </div>
        <div className="panel-body">
        {rightTab === "files" && (
        <div className="panel-section">
          <div className="tree">
            {tree.length === 0 ? (
              <div className="tree-node">No files</div>
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
        )}

        {rightTab === "changes" && session && (
          <div className="panel-section changes-panel">
            {changesLoading ? (
              <div className="changes-empty">Loading changes…</div>
            ) : !changesIsGitRepo ? (
              <div className="changes-empty">
                This workspace is not a git repository.
              </div>
            ) : workspaceChanges.length === 0 ? (
              <div className="changes-empty">
                No file changes since the start of this run.
              </div>
            ) : (
              <>
                <ul className="changes-list">
                  {workspaceChanges.map((change) => (
                    <li key={change.path}>
                      <button
                        type="button"
                        className={`changes-item${
                          selectedChangePath === change.path ? " active" : ""
                        }`}
                        onClick={() =>
                          void loadChangeDiff(
                            session.cwd,
                            change.path,
                            runBaselineRef.current,
                          )
                        }
                      >
                        <span className="changes-status">{change.status}</span>
                        <span className="changes-path">{change.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {selectedChangePath && (
                  <pre className="changes-diff">{changeDiff}</pre>
                )}
              </>
            )}
          </div>
        )}

        {rightTab === "activity" && (
        <div className="panel-section">
          <div className="activity">
            {activity.length === 0 ? (
              <div className="activity-item">Waiting for events…</div>
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
        )}
        {rightTab === "gauntlet" && (session?.mode ?? mode) === "gauntlet" && (
          <div className="panel-section">
            <div className="gauntlet-board">
              {gauntletProgressPath && (
                <div className="gauntlet-board-meta">{gauntletProgressPath}</div>
              )}
              {gauntletProgress ? (
                <div
                  className="gauntlet-board-content"
                  dangerouslySetInnerHTML={{
                    __html: renderGauntletMarkdown(gauntletProgress),
                  }}
                />
              ) : (
                <div className="gauntlet-board-empty">
                  No progress file yet. The agent writes{" "}
                  <code>.open-loop/gauntlet-progress.md</code> during a Gauntlet
                  run.
                  {gauntletPhase && (
                    <>
                      {" "}
                      Current phase: <strong>{gauntletPhase}</strong>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </aside>
    </div>
  );
}
