export type SessionStatus = "idle" | "running" | "error" | "done";

export type SessionMode = "normal" | "gauntlet";

export type IntegrationId = "github" | "atlascloud" | "replicate";

export interface GauntletConfig {
  qualityBar: string;
  boundary?: string;
}

export interface IntegrationInfo {
  id: IntegrationId;
  label: string;
  description: string;
  envKey: string;
  configured: boolean;
}

export interface Session {
  id: string;
  agentId: string;
  cwd: string;
  model: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  mode: SessionMode;
  gauntlet?: GauntletConfig;
  integrations?: IntegrationId[];
  /** When true, create a checkpoint before each agent run (default false). */
  checkpointBeforeRun?: boolean;
  checkpoints?: SessionCheckpoint[];
  messages: ChatMessage[];
}

export type CheckpointKind = "git_stash" | "filesystem";

export interface SessionCheckpoint {
  id: string;
  turn: number;
  createdAt: string;
  kind: CheckpointKind;
  /** Git HEAD at checkpoint time (git_stash). */
  headRef?: string;
  /** Git stash object id (git_stash, when tree was dirty). */
  stashRef?: string;
  /** Path under .open-loop/checkpoints/ (filesystem). */
  snapshotDir?: string;
  /** Relative file paths captured (filesystem). */
  files?: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}


export interface WorkspacePreset {
  id: string;
  name: string;
  cwd: string;
  model: string;
  mode: SessionMode;
  gauntlet?: GauntletConfig;
  integrations?: IntegrationId[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionRequest {
  cwd: string;
  model?: string;
  mode?: SessionMode;
  gauntlet?: GauntletConfig;
  integrations?: IntegrationId[];
  checkpointBeforeRun?: boolean;
}

export interface CreateSessionResponse {
  id: string;
  agentId: string;
  cwd: string;
  model: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  mode: SessionMode;
  gauntlet?: GauntletConfig;
  integrations?: IntegrationId[];
  checkpointBeforeRun?: boolean;
}

export interface SendMessageRequest {
  prompt: string;
  mode?: SessionMode;
  gauntlet?: GauntletConfig;
  integrations?: IntegrationId[];
  checkpointBeforeRun?: boolean;
}

export interface FsTreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
}

export interface WorkspaceFileResponse {
  path: string;
  content: string;
}

export interface FileChange {
  status: string;
  path: string;
}

export interface WorkspaceChangesResponse {
  isGitRepo: boolean;
  cwd: string;
  baseline?: string;
  changes: FileChange[];
}

export interface WorkspaceDiffResponse {
  path: string;
  diff: string;
}

export interface WorkspaceContextEntry {
  path: string;
  exists: boolean;
  preview?: string;
  truncated?: boolean;
}

export interface WorkspaceContextResponse {
  cwd: string;
  files: WorkspaceContextEntry[];
}


/** Relative path the Gauntlet agent maintains in the workspace root. */
export const GAUNTLET_PROGRESS_REL_PATH = ".open-loop/gauntlet-progress.md";

/** Legacy path from pre–Open Loop rename. */
export const GAUNTLET_PROGRESS_LEGACY_REL_PATH =
  ".open-cowork/gauntlet-progress.md";

export type GauntletPhase = "lead" | "build" | "critique" | "integrate";

export type AgentStreamEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_call"; name: string; path?: string; args?: unknown }
  | { type: "tool_result"; name: string; ok: boolean; summary?: string }
  | { type: "status"; status: SessionStatus; message?: string }
  | {
      type: "error";
      message: string;
      code?: string;
      retryable?: boolean;
      suggestApiRestart?: boolean;
    }
  | { type: "done"; runId?: string; status: "finished" | "error" | "cancelled" }
  | { type: "gauntlet_phase"; phase: GauntletPhase; detail?: string }
  | { type: "run_baseline"; ref: string }
  | { type: "checkpoint_created"; checkpoint: SessionCheckpoint };

export {
  QUALITY_BAR_CATEGORY_LABELS,
  QUALITY_BAR_CATEGORY_ORDER,
  QUALITY_BAR_TEMPLATES,
  getQualityBarTemplate,
  listQualityBarTemplatesByCategory,
  type QualityBarCategory,
  type QualityBarIntegrationId,
  type QualityBarTemplate,
} from "./quality-bars/index.js";

export interface FolderPickResponse {
  path: string | null;
  cancelled: boolean;
  recents: string[];
}

export interface RecentsResponse {
  recents: string[];
}
