import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  IntegrationId,
  QualityBarCategory,
  QualityBarTemplateRecord,
} from "@open-loop/shared";
import {
  QUALITY_BAR_CATEGORY_LABELS,
  QUALITY_BAR_CATEGORY_ORDER,
} from "@open-loop/shared";
import {
  createQualityBarTemplate,
  deleteQualityBarTemplate,
  listQualityBarTemplates,
  updateQualityBarTemplate,
} from "./api";

type Filter = "all" | "builtin" | "custom";

const EMPTY_DRAFT = {
  id: "",
  label: "",
  category: "dev" as QualityBarCategory,
  goal: "",
  qualityBar: "",
  boundary: "",
  integrations: [] as IntegrationId[],
};

const INTEGRATION_OPTIONS: Array<{ id: IntegrationId; label: string }> = [
  { id: "github", label: "GitHub" },
  { id: "atlascloud", label: "Atlas Cloud" },
  { id: "replicate", label: "Replicate" },
];

function recordToDraft(t: QualityBarTemplateRecord) {
  return {
    id: t.id,
    label: t.label,
    category: t.category,
    goal: t.goal,
    qualityBar: t.qualityBar,
    boundary: t.boundary ?? "",
    integrations: t.integrations ?? [],
  };
}

export function QualityBarsPage() {
  const [templates, setTemplates] = useState<QualityBarTemplateRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [isNew, setIsNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const selected = templates.find((t) => t.id === selectedId);
  const readOnly = Boolean(selected?.source === "builtin" && !isNew);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listQualityBarTemplates();
      setTemplates(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    let list = templates;
    if (filter === "builtin") list = list.filter((t) => t.source === "builtin");
    if (filter === "custom") list = list.filter((t) => t.source === "custom");
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.label.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.goal.toLowerCase().includes(q),
      );
    }
    return list;
  }, [templates, filter, search]);

  const selectTemplate = (t: QualityBarTemplateRecord) => {
    setSelectedId(t.id);
    setIsNew(false);
    setDraft(recordToDraft(t));
    setError(null);
  };

  const handleNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setDraft({ ...EMPTY_DRAFT, id: `my-${Date.now().toString(36).slice(-6)}` });
    setError(null);
  };

  const handleDuplicate = () => {
    if (!selected && !draft.label) return;
    const base = selected ? recordToDraft(selected) : draft;
    setSelectedId(null);
    setIsNew(true);
    setDraft({
      ...base,
      id: `${base.id.replace(/-copy\d*$/, "")}-copy`,
      label: `${base.label} (copy)`,
    });
    setError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        label: draft.label.trim(),
        category: draft.category,
        goal: draft.goal.trim(),
        qualityBar: draft.qualityBar.trim(),
        boundary: draft.boundary.trim() || undefined,
        integrations:
          draft.integrations.length > 0 ? draft.integrations : undefined,
      };
      if (isNew) {
        const id = draft.id.trim();
        if (!id) throw new Error("id is required");
        const created = await createQualityBarTemplate({ id, ...payload });
        await refresh();
        selectTemplate(created);
      } else if (selectedId) {
        const updated = await updateQualityBarTemplate(selectedId, payload);
        await refresh();
        selectTemplate(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || selected?.source !== "custom") return;
    if (!window.confirm(`Delete custom template "${selectedId}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteQualityBarTemplate(selectedId);
      setSelectedId(null);
      setIsNew(false);
      setDraft({ ...EMPTY_DRAFT });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const useInSession = () => {
    const id = isNew ? draft.id.trim() : selectedId;
    if (!id) return;
    window.location.assign(`/?template=${encodeURIComponent(id)}`);
  };

  const toggleIntegration = (id: IntegrationId) => {
    setDraft((prev) => ({
      ...prev,
      integrations: prev.integrations.includes(id)
        ? prev.integrations.filter((x) => x !== id)
        : [...prev.integrations, id],
    }));
  };

  return (
    <div className="studio-app">
      <header className="studio-header">
        <div>
          <a className="studio-back" href="/">
            ← Workspace
          </a>
          <h1>Quality Bar Studio</h1>
          <p className="studio-subtitle">
            Built-in templates are read-only. Custom templates save to{" "}
            <code>packages/shared/quality-bars/custom/</code> (commit to git).
          </p>
        </div>
        <div className="studio-header-actions">
          <button type="button" className="btn" onClick={handleNew}>
            + New
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!selected && !isNew}
            onClick={handleDuplicate}
          >
            Duplicate
          </button>
        </div>
      </header>

      <div className="studio-layout">
        <aside className="studio-list">
          <input
            className="studio-search"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="studio-filters" role="group" aria-label="Filter">
            {(["all", "builtin", "custom"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`studio-filter${filter === f ? " active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f === "builtin" ? "Built-in" : "My"}
              </button>
            ))}
          </div>
          {loading ? (
            <p className="hint-muted">Loading…</p>
          ) : (
            QUALITY_BAR_CATEGORY_ORDER.map((category) => {
              const items = filtered.filter((t) => t.category === category);
              if (items.length === 0) return null;
              return (
                <div key={category} className="studio-category">
                  <h2>{QUALITY_BAR_CATEGORY_LABELS[category]}</h2>
                  <ul>
                    {items.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          className={`studio-list-item${
                            selectedId === t.id && !isNew ? " active" : ""
                          }`}
                          onClick={() => selectTemplate(t)}
                        >
                          <span className="studio-list-label">{t.label}</span>
                          <span className="studio-list-meta">
                            {t.source === "custom" ? "custom" : "built-in"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </aside>

        <main className="studio-editor">
          {!selected && !isNew ? (
            <div className="studio-empty">
              Select a template or click <strong>New</strong> to create a custom
              quality bar.
            </div>
          ) : (
            <>
              {error && <div className="error-banner">{error}</div>}
              {readOnly && (
                <p className="studio-readonly-hint">
                  Built-in template — duplicate to create an editable copy.
                </p>
              )}
              <label htmlFor="studio-id">Id</label>
              <input
                id="studio-id"
                value={draft.id}
                disabled={!isNew}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, id: e.target.value.toLowerCase() }))
                }
                spellCheck={false}
              />
              <label htmlFor="studio-label">Label</label>
              <input
                id="studio-label"
                value={draft.label}
                disabled={readOnly}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, label: e.target.value }))
                }
              />
              <label htmlFor="studio-category">Category</label>
              <select
                id="studio-category"
                value={draft.category}
                disabled={readOnly}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    category: e.target.value as QualityBarCategory,
                  }))
                }
              >
                {QUALITY_BAR_CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {QUALITY_BAR_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <span className="field-label">Integrations</span>
              <div className="studio-integrations">
                {INTEGRATION_OPTIONS.map((opt) => (
                  <label key={opt.id} className="integration-chip">
                    <input
                      type="checkbox"
                      checked={draft.integrations.includes(opt.id)}
                      disabled={readOnly}
                      onChange={() => toggleIntegration(opt.id)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <label htmlFor="studio-goal">Goal (pre-fills composer)</label>
              <textarea
                id="studio-goal"
                rows={3}
                value={draft.goal}
                disabled={readOnly}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, goal: e.target.value }))
                }
              />
              <label htmlFor="studio-bar">Quality bar</label>
              <textarea
                id="studio-bar"
                rows={4}
                value={draft.qualityBar}
                disabled={readOnly}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, qualityBar: e.target.value }))
                }
              />
              <label htmlFor="studio-boundary">Boundary (optional)</label>
              <textarea
                id="studio-boundary"
                rows={2}
                value={draft.boundary}
                disabled={readOnly}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, boundary: e.target.value }))
                }
              />
              <div className="studio-editor-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={saving || readOnly}
                  onClick={() => void handleSave()}
                >
                  {saving ? "Saving…" : isNew ? "Create" : "Save"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={isNew && !draft.id.trim()}
                  onClick={useInSession}
                >
                  Use in session
                </button>
                {!isNew && selected?.source === "custom" && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={saving}
                    onClick={() => void handleDelete()}
                  >
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
