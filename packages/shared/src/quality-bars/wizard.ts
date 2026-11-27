import type { QualityBarCategory, QualityBarIntegrationId } from "./index.js";

export type QualityBarWizardMode = "create" | "refine";

export interface QualityBarWizardRequest {
  mode: QualityBarWizardMode;
  /** What the user wants the Gauntlet run to deliver. */
  intent: string;
  category: QualityBarCategory;
  integrations?: QualityBarIntegrationId[];
  /** Optional built-in/custom template id to use as style reference. */
  referenceTemplateId?: string;
  /** For refine mode — current draft fields. */
  draft?: {
    label?: string;
    goal?: string;
    qualityBar?: string;
    boundary?: string;
  };
  /** Short instruction for refine, e.g. "make bar more measurable". */
  refineInstruction?: string;
  model?: string;
}

export interface QualityBarGeneratedDraft {
  id: string;
  label: string;
  category: QualityBarCategory;
  goal: string;
  qualityBar: string;
  boundary?: string;
  integrations?: QualityBarIntegrationId[];
}

export type QualityBarLintSeverity = "error" | "warn" | "info";

export interface QualityBarLintIssue {
  severity: QualityBarLintSeverity;
  field: "goal" | "qualityBar" | "boundary" | "label" | "id";
  message: string;
}

export interface QualityBarLintResult {
  score: number;
  pass: boolean;
  issues: QualityBarLintIssue[];
}
