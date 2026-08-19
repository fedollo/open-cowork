import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentStreamEvent,
  ChatMessage,
  FileChange,
  FsTreeNode,
  GauntletPhase,
  IntegrationId,
  IntegrationInfo,
  QualityBarTemplateRecord,
  Session,
  SessionStatus,
  WorkspaceContextEntry,
  WorkspacePreset,
} from "@open-loop/shared";
import {
  QUALITY_BAR_CATEGORY_LABELS,
  QUALITY_BAR_CATEGORY_ORDER,
} from "@open-loop/shared";
import {
  cancelSession,
  createSession,
  fetchTree,
  fetchRecentFolders,
  pickFolder,
  fetchWorkspaceChanges,
  fetchWorkspaceContext,
  fetchWorkspaceDiff,
  getSession,
  listIntegrations,
  listQualityBarTemplates,
  listSessions,
  listPresets,
  savePreset,
  deletePreset,
  exportSession,
  rollbackSession,
  streamMessage,
} from "./api";
import { GAUNTLET_EXAMPLE } from "./examples";
import { GauntletBoard } from "./GauntletBoard";
import { loadGauntletProgressFile } from "./gauntlet-progress";

interface SessionSummary {
  id: string;
  agentId: string;
  cwd: string;
  model: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
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
  const [gauntletPhase, setGauntletPhase] = useState<GauntletPhase | null>(null);
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
  const [presets, setPresets] = useState<WorkspacePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetNameInput, setPresetNameInput] = useState("");
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [pickingFolder, setPickingFolder] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(true);
  const [workspaceContext, setWorkspaceContext] = useState<
    WorkspaceContextEntry[]
  >([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [checkpointBeforeRun, setCheckpointBeforeRun] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [qualityBarTemplates, setQualityBarTemplates] = useState<
    QualityBarTemplateRecord[]
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



  const refreshRecents = useCallback(async () => {
    try {
      const list = await fetchRecentFolders();
      setRecentFolders(list);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleBrowseFolder = async () => {
    setPickingFolder(true);
    setError(null);
    try {
      const result = await pickFolder();
      setRecentFolders(result.recents);
      if (result.path) {
        setCwdInput(result.path);
        void loadWorkspaceContext(result.path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Folder picker failed");
    } finally {
      setPickingFolder(false);
    }
  };

  const refreshPresets = useCallback(async () => {
    try {
      const list = await listPresets();
      setPresets(list);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const refreshQualityBarTemplates = useCallback(async () => {
    try {
      const list = await listQualityBarTemplates();
      setQualityBarTemplates(list);
      return list;
    } catch (err) {
      console.error(err);
      return [] as QualityBarTemplateRecord[];
    }
  }, []);

  const applyQualityBarTemplate = useCallback(
    (id: string, source?: QualityBarTemplateRecord[]) => {
      const list = source ?? qualityBarTemplates;
      const template = list.find((t) => t.id === id);
      if (!template) return;
      setPrompt(template.goal);
      setQualityBar(template.qualityBar);
      setBoundary(template.boundary ?? "");
      setSelectedTemplateId(id);
      setError(null);
    },
    [qualityBarTemplates],
  );

  const applyWorkspacePreset = (preset: WorkspacePreset) => {
    setCwdInput(preset.cwd);
    setModelInput(preset.model);
    setQualityBar(preset.gauntlet?.qualityBar ?? "");
    setBoundary(preset.gauntlet?.boundary ?? "");
    setEnabledIntegrations(preset.integrations ?? []);
    setSelectedTemplateId("");
    setError(null);
    void loadWorkspaceContext(preset.cwd);
  };

  const handleLoadPreset = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    setSelectedPresetId(id);
    applyWorkspacePreset(preset);
  };

  const handleSavePreset = async () => {
    const name = presetNameInput.trim();
    const cwd = cwdInput.trim();
    if (!name) {
      setError("Enter a preset name");
      return;
    }
    if (!cwd) {
      setError("Enter an absolute folder path before saving a preset");
      return;
    }
    if (!qualityBar.trim()) {
      setError("A quality bar is required for presets");
      return;
    }
    setPresetsLoading(true);
    setError(null);
    try {
      const saved = await savePreset({
        name,
        cwd,
        model: modelInput.trim() || "composer-2.5",
        gauntlet: {
          qualityBar: qualityBar.trim(),
          boundary: boundary.trim() || undefined,
        },
        integrations: enabledIntegrations,
      });
      setPresetNameInput("");
      setSelectedPresetId(saved.id);
      await refreshPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preset");
    } finally {
      setPresetsLoading(false);
    }
  };

  const handleDeletePreset = async () => {
    if (!selectedPresetId) return;
    setPresetsLoading(true);
    setError(null);
    try {
      await deletePreset(selectedPresetId);
      setSelectedPresetId("");
      await refreshPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete preset");
    } finally {
      setPresetsLoading(false);
    }
  };


  useEffect(() => {
    void refreshSessions();
    void refreshIntegrations();
    void refreshPresets();
    void refreshRecents();
    void refreshQualityBarTemplates().then((list) => {
      const params = new URLSearchParams(window.location.search);
      const templateId = params.get("template");
      if (templateId && list) {
        applyQualityBarTemplate(templateId, list);
        params.delete("template");
        const qs = params.toString();
        const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
        window.history.replaceState({}, "", next);
      }
    });
  }, [
    refreshSessions,
    refreshIntegrations,
    refreshPresets,
    refreshRecents,
    refreshQualityBarTemplates,
    applyQualityBarTemplate,
  ]);

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


  const loadWorkspaceContext = useCallback(async (cwd: string) => {
    const trimmed = cwd.trim();
    if (!trimmed) {
      setWorkspaceContext([]);
      return;
    }
    setContextLoading(true);
    try {
      const data = await fetchWorkspaceContext(trimmed);
      setWorkspaceContext(data.files);
    } catch {
      setWorkspaceContext([]);
    } finally {
      setContextLoading(false);
    }
  }, []);

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
    const trimmed = cwdInput.trim();
    if (!trimmed) {
      setWorkspaceContext([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void loadWorkspaceContext(trimmed);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [cwdInput, loadWorkspaceContext]);

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
        setQualityBar(s.gauntlet?.qualityBar ?? "");
        setBoundary(s.gauntlet?.boundary ?? "");
        setEnabledIntegrations(s.integrations ?? []);
        if (s.checkpointBeforeRun) {
          setCheckpointBeforeRun(true);
        }
        void loadTree(s.cwd);
        void loadGauntletProgress(s.cwd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session");
      }
    },
    [loadTree, loadGauntletProgress],
  );

  const fillGauntletExample = () => applyQualityBarTemplate("readme-docs");

  const handleRollback = async () => {
    if (!activeId || !session || rollingBack || sending) return;
    setRollingBack(true);
    setError(null);
    try {
      const result = await rollbackSession(activeId);
      const refreshed = await getSession(activeId);
      setSession(refreshed);
      setCheckpointBeforeRun(refreshed.checkpointBeforeRun ?? false);
      void loadTree(refreshed.cwd);
      void loadChanges(refreshed.cwd, runBaselineRef.current);
      setActivity((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${prev.length}`,
          kind: "checkpoint",
          text: `Rolled back turn ${result.rolledBack.turn}`,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setRollingBack(false);
    }
  };

  const handleCreate = async () => {
    const cwd = cwdInput.trim();
    if (!cwd) {
      setError("Enter an absolute folder path");
      return;
    }
    if (!qualityBar.trim()) {
      setError("A concrete quality bar is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createSession({
        cwd,
        model: modelInput.trim() || undefined,
        gauntlet: {
          qualityBar: qualityBar.trim(),
          boundary: boundary.trim() || undefined,
        },
        integrations: enabledIntegrations,
        checkpointBeforeRun,
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
    (event: AgentStreamEvent, opts?: { cwd?: string }) => {
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
        if (opts?.cwd) refreshGauntletProgress(opts.cwd);
        break;
      case "run_baseline":
        runBaselineRef.current = event.ref;
        setRunBaseline(event.ref);
        break;
      case "checkpoint_created":
        setSession((prev) =>
          prev
            ? {
                ...prev,
                checkpoints: [...(prev.checkpoints ?? []), event.checkpoint],
              }
            : prev,
        );
        setActivity((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${prev.length}`,
            kind: "checkpoint",
            text: `Checkpoint turn ${event.checkpoint.turn} (${event.checkpoint.kind})`,
          },
        ]);
        break;
      case "error":
        setError(
          event.code ? `${event.message} [${event.code}]` : event.message,
        );
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
        if (opts?.cwd) refreshGauntletProgress(opts.cwd);
        if (opts?.cwd) {
          void loadChanges(opts.cwd, runBaselineRef.current);
        }
        break;
    }
  },
    [refreshGauntletProgress, loadChanges],
  );

  const handleSend = async () => {
    if (!activeId || !prompt.trim() || sending) return;
    if (!qualityBar.trim()) {
      setError("A concrete quality bar is required");
      return;
    }

    const text = prompt.trim();
    setPrompt("");
    setSending(true);
    setError(null);
    setLiveAssistant("");
    setStatus("running");
    setGauntletPhase("lead");
    runBaselineRef.current = null;
    setRunBaseline(null);
    setRightTab("gauntlet");

    const displayContent = `[Gauntlet]\nGoal: ${text}\nBar: ${qualityBar.trim()}${
      boundary.trim() ? `\nBoundary: ${boundary.trim()}` : ""
    }`;

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
            mode: "gauntlet",
            gauntlet: {
              qualityBar: qualityBar.trim(),
              boundary: boundary.trim() || undefined,
            },
            integrations: enabledIntegrations,
            messages: [...prev.messages, userMsg],
            status: "running",
          }
        : prev,
    );

    const ac = new AbortController();
    abortRef.current = ac;

    const runCwd = session?.cwd ?? cwdInput.trim();

    try {
      await streamMessage(
        activeId,
        {
          prompt: text,
          gauntlet: {
            qualityBar: qualityBar.trim(),
            boundary: boundary.trim() || undefined,
          },
          integrations: enabledIntegrations,
          checkpointBeforeRun,
        },
        (event) => handleEvent(event, { cwd: runCwd }),
        ac.signal,
      );
      const refreshed = await getSession(activeId);
      setSession(refreshed);
      setStatus(refreshed.status);
      setLiveAssistant("");
      void loadTree(refreshed.cwd);
      void loadChanges(refreshed.cwd, runBaselineRef.current);
      void loadGauntletProgress(refreshed.cwd);
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
  const canSend = Boolean(prompt.trim()) && Boolean(qualityBar.trim());

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <h1>Open Loop</h1>
          <p>Gauntlet workspace</p>
          <a className="brand-link" href="/quality-bars">
            Quality bars →
          </a>
        </div>

        <div className="new-session">

          <span className="field-label">Presets</span>
          <select
            id="workspacePreset"
            className="sidebar-select"
            value={selectedPresetId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedPresetId(id);
              if (id) handleLoadPreset(id);
            }}
          >
            <option value="">Choose a preset…</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <div className="preset-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={presetsLoading || !selectedPresetId}
              onClick={() => void handleDeletePreset()}
            >
              Delete preset
            </button>
          </div>
          <label htmlFor="presetName">Preset name</label>
          <input
            id="presetName"
            value={presetNameInput}
            onChange={(e) => setPresetNameInput(e.target.value)}
            placeholder="My workspace preset"
            spellCheck={false}
          />
          <button
            type="button"
            className="btn btn-ghost preset-save"
            disabled={presetsLoading}
            onClick={() => void handleSavePreset()}
          >
            {presetsLoading ? "Saving…" : "Save current as preset"}
          </button>

          <label htmlFor="cwd">Folder (absolute path)</label>
          <div className="folder-row">
            <input
              id="cwd"
              value={cwdInput}
              onChange={(e) => setCwdInput(e.target.value)}
              placeholder="/Users/…/project"
              spellCheck={false}
            />
            <button
              type="button"
              className="btn btn-ghost folder-browse"
              disabled={pickingFolder}
              onClick={() => void handleBrowseFolder()}
            >
              {pickingFolder ? "Opening…" : "Browse"}
            </button>
          </div>
          {recentFolders.length > 0 && (
            <>
              <label htmlFor="recentFolder">Recent folders</label>
              <select
                id="recentFolder"
                className="sidebar-select"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) setCwdInput(e.target.value);
                }}
              >
                <option value="">Choose recent…</option>
                {recentFolders.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </>
          )}


          <div className="context-panel">
            <button
              type="button"
              className="context-panel-toggle"
              aria-expanded={contextPanelOpen}
              onClick={() => setContextPanelOpen((open) => !open)}
            >
              Context
              {contextLoading ? " (loading…)" : ""}
            </button>
            {contextPanelOpen && (
              <div className="context-panel-body">
                {contextLoading && workspaceContext.length === 0 ? (
                  <p className="hint-muted">Scanning workspace…</p>
                ) : null}
                {!contextLoading && !cwdInput.trim() ? (
                  <p className="hint-muted">Enter a folder to inspect context.</p>
                ) : null}
                {cwdInput.trim() ? (
                  <>
                    <p className="context-subheading">Rules &amp; docs</p>
                    <ul className="context-file-list">
                      {workspaceContext.map((file) => (
                        <li key={file.path} className="context-file-item">
                          <div className="context-file-head">
                            <code>{file.path}</code>
                            {!file.exists && (
                              <span className="context-missing">not found</span>
                            )}
                          </div>
                          {file.exists && file.preview ? (
                            <pre className="context-preview">
                              {file.preview}
                              {file.truncated ? "\n…" : ""}
                            </pre>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <p className="context-subheading">Session integrations</p>
                    {enabledIntegrations.length === 0 ? (
                      <p className="hint-muted">None selected for the next session.</p>
                    ) : (
                      <ul className="context-integration-list">
                        {enabledIntegrations.map((id) => {
                          const info = integrationCatalog.find((i) => i.id === id);
                          const label = info?.label ?? id;
                          const ready = info?.configured ?? false;
                          return (
                            <li key={id}>
                              {label}
                              {!ready ? " (needs env key)" : ""}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>

          <label htmlFor="model">Model</label>
          <input
            id="model"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            spellCheck={false}
          />

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
                {QUALITY_BAR_CATEGORY_ORDER.map((category) => (
                  <optgroup
                    key={category}
                    label={QUALITY_BAR_CATEGORY_LABELS[category]}
                  >
                    {qualityBarTemplates
                      .filter((t) => t.category === category)
                      .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                        {t.source === "custom" ? " ★" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedTemplateId && (() => {
                const template = qualityBarTemplates.find(
                  (t) => t.id === selectedTemplateId,
                );
                if (!template?.integrations?.length) return null;
                const parts = template.integrations.map((id) => {
                  const info = integrationCatalog.find((i) => i.id === id);
                  const label = info?.label ?? id;
                  const enabled = enabledIntegrations.includes(id);
                  return enabled ? label : `${label} (toggle not enabled)`;
                });
                return (
                  <p className="template-hint">
                    Requires: {parts.join(", ")}
                  </p>
                );
              })()}
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

          <label className="checkpoint-toggle">
            <input
              type="checkbox"
              checked={checkpointBeforeRun}
              onChange={(e) => setCheckpointBeforeRun(e.target.checked)}
              disabled={sending}
            />
            <span>Create checkpoint before run</span>
          </label>
          <p className="hint-muted checkpoint-hint">
            Git stash (or filesystem snapshot when not a repo). Use Rollback in
            the session header after a run.
          </p>

          <label htmlFor="sidebar-goal">Goal</label>
          <textarea
            id="sidebar-goal"
            className="sidebar-textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={GAUNTLET_EXAMPLE.goal.slice(0, 80) + "…"}
            rows={3}
          />

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
                <span className="mode-badge">gauntlet</span>
              </span>
              <span className="meta">{s.cwd}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="chat">
        {showEmpty ? (
          <div className="empty-state">
            <img
              className="empty-state-hero"
              src="/open-loop-banner.png"
              alt="Open Loop — local agentic workspace"
              width={512}
              height={288}
            />
            <h2>Set a goal and a concrete quality bar</h2>
            <p>
              Open Loop runs a builder/critic Gauntlet loop. Set folder, goal,
              and quality bar in the sidebar, then start.
            </p>
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
                {(session.checkpoints?.length ?? 0) > 0 && (
                  <span className="status-pill checkpoint">
                    checkpoint · turn{" "}
                    {session.checkpoints![session.checkpoints!.length - 1]!.turn}
                  </span>
                )}
                <button
                  type="button"
                  className={`btn btn-ghost header-export${
                    (session.checkpoints?.length ?? 0) > 0
                      ? " rollback-ready"
                      : ""
                  }`}
                  disabled={
                    rollingBack ||
                    sending ||
                    !(session.checkpoints?.length ?? 0)
                  }
                  title={
                    (session.checkpoints?.length ?? 0) > 0
                      ? "Restore files to the state before the last checkpointed run"
                      : "No checkpoint yet — enable “Create checkpoint before run”, then Start"
                  }
                  onClick={() => void handleRollback()}
                >
                  {rollingBack ? "Rolling back…" : "Rollback last turn"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost header-export"
                  disabled={exporting}
                  onClick={() => void handleExportSession()}
                >
                  {exporting ? "Exporting…" : "Export"}
                </button>
                <span className="status-pill gauntlet">
                  gauntlet{gauntletPhase ? ` · ${gauntletPhase}` : ""}
                </span>
                {(session.integrations ?? enabledIntegrations).map((id) => (
                  <span key={id} className="status-pill integration">
                    {id}
                  </span>
                ))}
                <span className={`status-pill ${status}`}>{status}</span>
              </div>
            </div>

            <div className="gauntlet-hint">
              Progress file:{" "}
              <code>.open-loop/gauntlet-progress.md</code> in the workspace
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

              <div className="composer-row">
                <label htmlFor="composer-goal">Goal</label>
                <textarea
                  id="composer-goal"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={GAUNTLET_EXAMPLE.goal.slice(0, 80) + "…"}
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
                      Start Gauntlet
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
          {session && (
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
        {rightTab === "gauntlet" && session && (
          <div className="panel-section">
            <GauntletBoard
              progress={gauntletProgress}
              progressPath={gauntletProgressPath}
              phase={gauntletPhase}
            />
          </div>
        )}
        </div>
      </aside>
    </div>
  );
}
