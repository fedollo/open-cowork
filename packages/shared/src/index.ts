export type SessionStatus = "idle" | "running" | "error" | "done";

export interface Session {
  id: string;
  agentId: string;
  cwd: string;
  model: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface CreateSessionRequest {
  cwd: string;
  model?: string;
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
}

export interface SendMessageRequest {
  prompt: string;
}

export interface FsTreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
}

export type AgentStreamEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_call"; name: string; path?: string; args?: unknown }
  | { type: "tool_result"; name: string; ok: boolean; summary?: string }
  | { type: "status"; status: SessionStatus; message?: string }
  | { type: "error"; message: string; retryable?: boolean }
  | { type: "done"; runId?: string; status: "finished" | "error" | "cancelled" };
