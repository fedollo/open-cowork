import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  IntegrationId,
  QualityBarCategory,
  QualityBarGeneratedDraft,
  QualityBarLintResult,
  QualityBarTemplateRecord,
} from "@open-loop/shared";
import {
  lintQualityBar,
  QUALITY_BAR_CATEGORY_LABELS,
  QUALITY_BAR_CATEGORY_ORDER,
} from "@open-loop/shared";
import {
  createQualityBarTemplate,
  generateQualityBarDraft,
  lintQualityBarRemote,
} from "./api";
import { navigateToSessionWithTemplate } from "./quality-bar-navigation";

const INTEGRATION_OPTIONS: Array<{ id: IntegrationId; label: string }> = [
  { id: "github", label: "GitHub" },
  { id: "atlascloud", label: "Atlas Cloud" },
  { id: "replicate", label: "Replicate" },
];

type WizardStep = 1 | 2 | 3;

interface QualityBarWizardProps {
  templates: QualityBarTemplateRecord[];
  onSaved: (record: QualityBarTemplateRecord) => void;
  onCancel: () => void;
}

export function QualityBarWizard({
  templates,
  onSaved,
  onCancel,
}: QualityBarWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [intent, setIntent] = useState("");
  const [category, setCategory] = useState<QualityBarCategory>("dev");
  const [integrations, setIntegrations] = useState<IntegrationId[]>([]);
  const [referenceTemplateId, setReferenceTemplateId] = useState("");
  const [draft, setDraft] = useState<QualityBarGeneratedDraft | null>(null);
  const [lint, setLint] = useState<QualityBarLintResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refineNote, setRefineNote] = useState("");

  const referenceOptions = useMemo(
    () =>
      templates.filter(
        (t) => !referenceTemplateId || t.category === category || t.id === referenceTemplateId,
      ),
    [templates, category, referenceTemplateId],
  );

  const runLint = useCallback(async (fields: QualityBarGeneratedDraft) => {
    try {
      const result = await lintQualityBarRemote(fields);
      setLint(result);
    } catch {
      setLint(lintQualityBar(fields));
    }
  }, []);

  useEffect(() => {
    if (draft) void runLint(draft);
  }, [draft, runLint]);

  const toggleIntegration = (id: IntegrationId) => {
    setIntegrations((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { draft: generated, lint: generatedLint } =
        await generateQualityBarDraft({
          mode: "create",
          intent: intent.trim(),
          category,
          integrations: integrations.length ? integrations : undefined,
          referenceTemplateId: referenceTemplateId || undefined,
        });
      setDraft(generated);
      setLint(generatedLint);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleRefine = async (instruction: string) => {
    if (!draft) return;
    setGenerating(true);
    setError(null);
    try {
      const { draft: refined, lint: refinedLint } =
        await generateQualityBarDraft({
          mode: "refine",
          intent: intent.trim(),
          category: draft.category,
          integrations: draft.integrations,
          draft: {
            label: draft.label,
            goal: draft.goal,
            qualityBar: draft.qualityBar,
            boundary: draft.boundary,
          },
          refineInstruction: instruction,
        });
      setDraft(refined);
      setLint(refinedLint);
      setRefineNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refine failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createQualityBarTemplate({
        id: draft.id,
        label: draft.label,
        category: draft.category,
        goal: draft.goal,
        qualityBar: draft.qualityBar,
        boundary: draft.boundary,
        integrations: draft.integrations,
      });
      onSaved(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const lintClass =
    lint == null
      ? ""
      : lint.pass
        ? "wizard-lint-pass"
        : lint.score >= 60
          ? "wizard-lint-warn"
          : "wizard-lint-fail";

  return (
    <div className="wizard-panel">
      <nav className="wizard-steps" aria-label="Wizard steps">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`wizard-step-pill${step >= n ? " active" : ""}${step === n ? " current" : ""}`}
          >
            {n === 1 ? "Intent" : n === 2 ? "Context" : "Review"}
          </span>
        ))}
      </nav>

      {error && <div className="error-banner">{error}</div>}

      {step === 1 && (
        <section className="wizard-section">
          <h2>What should Gauntlet deliver?</h2>
          <p className="hint-muted">
            Describe the outcome in plain language. The AI will draft a goal,
            quality bar, and boundary you can edit before saving.
          </p>
          <label htmlFor="wizard-intent">Intent</label>
          <textarea
            id="wizard-intent"
            rows={5}
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="e.g. A 15s demo video that shows Open Loop Gauntlet board to a non-technical stakeholder, with cost logged."
          />
          <div className="wizard-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              disabled={intent.trim().length < 10}
              onClick={() => setStep(2)}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="wizard-section">
          <h2>Category & references</h2>
          <label htmlFor="wizard-category">Category</label>
          <select
            id="wizard-category"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as QualityBarCategory)
            }
          >
            {QUALITY_BAR_CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {QUALITY_BAR_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <span className="field-label">Integrations (optional)</span>
          <div className="studio-integrations">
            {INTEGRATION_OPTIONS.map((opt) => (
              <label key={opt.id} className="integration-chip">
                <input
                  type="checkbox"
                  checked={integrations.includes(opt.id)}
                  onChange={() => toggleIntegration(opt.id)}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <label htmlFor="wizard-reference">Style reference (optional)</label>
          <select
            id="wizard-reference"
            value={referenceTemplateId}
            onChange={(e) => setReferenceTemplateId(e.target.value)}
          >
            <option value="">— None —</option>
            {referenceOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} ({t.source})
              </option>
            ))}
          </select>
          <div className="wizard-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(1)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn"
              disabled={generating}
              onClick={() => void handleGenerate()}
            >
              {generating ? "Generating…" : "Generate template"}
            </button>
          </div>
        </section>
      )}

      {step === 3 && draft && (
        <section className="wizard-section">
          <div className={`wizard-lint-banner ${lintClass}`}>
            {lint == null ? (
              "Checking quality bar…"
            ) : (
              <>
                <strong>Bar score: {lint.score}/100</strong>
                {!lint.pass && (
                  <span> — fix errors before Gauntlet will work well.</span>
                )}
              </>
            )}
          </div>
          {lint && lint.issues.length > 0 && (
            <ul className="wizard-lint-list">
              {lint.issues.map((issue, i) => (
                <li key={i} className={`lint-${issue.severity}`}>
                  <strong>{issue.field}:</strong> {issue.message}
                </li>
              ))}
            </ul>
          )}

          <label htmlFor="wizard-draft-id">Id</label>
          <input
            id="wizard-draft-id"
            value={draft.id}
            onChange={(e) =>
              setDraft((d) =>
                d ? { ...d, id: e.target.value.toLowerCase() } : d,
              )
            }
            spellCheck={false}
          />
          <label htmlFor="wizard-draft-label">Label</label>
          <input
            id="wizard-draft-label"
            value={draft.label}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, label: e.target.value } : d))
            }
          />
          <label htmlFor="wizard-draft-goal">Goal</label>
          <textarea
            id="wizard-draft-goal"
            rows={3}
            value={draft.goal}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, goal: e.target.value } : d))
            }
          />
          <label htmlFor="wizard-draft-bar">Quality bar</label>
          <textarea
            id="wizard-draft-bar"
            rows={4}
            value={draft.qualityBar}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, qualityBar: e.target.value } : d))
            }
          />
          <label htmlFor="wizard-draft-boundary">Boundary</label>
          <textarea
            id="wizard-draft-boundary"
            rows={2}
            value={draft.boundary ?? ""}
            onChange={(e) =>
              setDraft((d) =>
                d ? { ...d, boundary: e.target.value || undefined } : d,
              )
            }
          />

          <div className="wizard-refine">
            <input
              type="text"
              placeholder="Refine instruction (optional)"
              value={refineNote}
              onChange={(e) => setRefineNote(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-ghost"
              disabled={generating}
              onClick={() =>
                void handleRefine(
                  refineNote.trim() ||
                    "Make the quality bar more concrete and measurable.",
                )
              }
            >
              {generating ? "…" : "Refine with AI"}
            </button>
          </div>
          <div className="wizard-quick-refine">
            {[
              "Add measurable checks and commands",
              "Tighten boundary — fewer paths",
              "Make critics able to reject without trusting the builder",
            ].map((label) => (
              <button
                key={label}
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={generating}
                onClick={() => void handleRefine(label)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="wizard-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(2)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn"
              disabled={saving || !draft.id.trim()}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save custom template"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!draft.id.trim()}
              onClick={() =>
                navigateToSessionWithTemplate({
                  id: draft.id.trim(),
                  label: draft.label,
                  goal: draft.goal.trim(),
                  qualityBar: draft.qualityBar.trim(),
                  boundary: draft.boundary?.trim() || undefined,
                  integrations: draft.integrations,
                })
              }
            >
              Use in session
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
