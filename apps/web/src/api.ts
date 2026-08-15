import type {
  AgentStreamEvent,
  CreateSessionResponse,
  FsTreeNode,
  GauntletConfig,
  IntegrationId,
  IntegrationInfo,
  Session,
  SessionMode,
  SessionStatus,
  WorkspaceChangesResponse,
  WorkspaceDiffResponse,
  WorkspaceFileResponse,
  WorkspacePreset,
  FolderPickResponse,
  RecentsResponse,
} from "@open-loop/shared";

const BASE = "/api";

export async function listSessions(): Promise<
  Array<Omit<Session, "messages"> & { messageCount: number }>
> {
  const res = await fetch(`${BASE}/sessions`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSession(id: string): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listIntegrations(): Promise<IntegrationInfo[]> {
  const res = await fetch(`${BASE}/integrations`);
  if (!res.ok) throw new Error(await res.text());
  const body = (await res.json()) as { integrations: IntegrationInfo[] };
  return body.integrations;
}

export async function createSession(opts: {
  cwd: string;
  model?: string;
  mode?: SessionMode;
  gauntlet?: GauntletConfig;
  integrations?: IntegrationId[];
}): Promise<CreateSessionResponse> {
  const res = await fetch(`${BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? res.statusText);
  }
  return res.json();
}

export async function cancelSession(id: string): Promise<boolean> {
  const res = await fetch(`${BASE}/sessions/${id}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return Boolean(data.cancelled);
}


export async function fetchWorkspaceFile(
  cwd: string,
  path: string,
): Promise<WorkspaceFileResponse> {
  const res = await fetch(
    `${BASE}/fs/file?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

export async function fetchTree(
  cwd: string,
  depth = 2,
): Promise<{ cwd: string; nodes: FsTreeNode[] }> {
  const res = await fetch(
    `${BASE}/fs/tree?cwd=${encodeURIComponent(cwd)}&depth=${depth}`,
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function streamMessage(
  sessionId: string,
  opts: {
    prompt: string;
    mode?: SessionMode;
    gauntlet?: GauntletConfig;
    integrations?: IntegrationId[];
  },
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
): Promise<SessionStatus | null> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? res.statusText);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastStatus: SessionStatus | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const event = JSON.parse(line.slice(6)) as AgentStreamEvent;
        onEvent(event);
        if (event.type === "status") lastStatus = event.status;
      } catch {
        // skip malformed
      }
    }
  }

  return lastStatus;
}

export async function exportSession(id: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${id}/export`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `open-loop-session-${id}.md`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}



export async function fetchWorkspaceChanges(
  cwd: string,
  baseline?: string,
): Promise<WorkspaceChangesResponse> {
  const params = new URLSearchParams({ cwd });
  if (baseline) params.set("baseline", baseline);
  const res = await fetch(`${BASE}/workspace/changes?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

export async function fetchWorkspaceDiff(
  cwd: string,
  path: string,
  baseline?: string,
): Promise<WorkspaceDiffResponse> {
  const params = new URLSearchParams({ cwd, path });
  if (baseline) params.set("baseline", baseline);
  const res = await fetch(`${BASE}/workspace/diff?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}


export async function listPresets(): Promise<WorkspacePreset[]> {
  const res = await fetch(`${BASE}/presets`);
  if (!res.ok) throw new Error(await res.text());
  const body = (await res.json()) as { presets: WorkspacePreset[] };
  return body.presets;
}

export async function savePreset(input: {
  name: string;
  cwd: string;
  model: string;
  mode: SessionMode;
  gauntlet?: GauntletConfig;
  integrations?: IntegrationId[];
}): Promise<WorkspacePreset> {
  const res = await fetch(`${BASE}/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}

export async function deletePreset(id: string): Promise<void> {
  const res = await fetch(`${BASE}/presets/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
}


export async function fetchRecentFolders(): Promise<string[]> {
  const res = await fetch(`${BASE}/fs/recents`);
  if (!res.ok) throw new Error(await res.text());
  const body = (await res.json()) as RecentsResponse;
  return body.recents;
}

export async function pickFolder(): Promise<FolderPickResponse> {
  const res = await fetch(`${BASE}/fs/pick`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json();
}
