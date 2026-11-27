import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { McpServerConfig } from "@cursor/sdk";
import type { AtlasToolDefinition } from "./atlas-chat.js";

interface McpTool {
  definition: AtlasToolDefinition;
  call: (args: Record<string, unknown>) => Promise<string>;
}

interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

export async function loadMcpTools(
  servers: Record<string, McpServerConfig> | undefined,
  reservedNames: ReadonlySet<string> = new Set(),
): Promise<{ tools: McpTool[]; close: () => Promise<void> }> {
  if (!servers || Object.keys(servers).length === 0) {
    return { tools: [], close: async () => undefined };
  }

  const sessions: McpConnection[] = [];
  const tools: McpTool[] = [];
  for (const [name, config] of Object.entries(servers)) {
    try {
      const connection = await McpConnection.connect(name, config);
      sessions.push(connection);
      const listed = await connection.listTools();
      const used = new Set<string>([
        ...reservedNames,
        ...tools.map((tool) => tool.definition.function.name),
      ]);
      for (const tool of listed) {
        const exposedName = used.has(tool.name) ? `${name}__${tool.name}` : tool.name;
        used.add(exposedName);
        tools.push({
          definition: {
            type: "function",
            function: {
              name: exposedName,
              description: tool.description || `${name} tool ${tool.name}`,
              parameters:
                tool.inputSchema && typeof tool.inputSchema === "object"
                  ? (tool.inputSchema as Record<string, unknown>)
                  : { type: "object", properties: {} },
            },
          },
          call: (args) => connection.callTool(tool.name, args),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`MCP ${name} unavailable: ${message}`);
    }
  }

  return {
    tools,
    close: async () => {
      await Promise.all(sessions.map((session) => session.close()));
    },
  };
}

interface ListedTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

class McpConnection {
  private constructor(
    private readonly rpc: (method: string, params?: unknown) => Promise<unknown>,
    private readonly stop: () => Promise<void>,
  ) {}

  static async connect(name: string, config: McpServerConfig): Promise<McpConnection> {
    void name;
    const transport =
      config.type === "http" || config.type === "sse"
        ? await HttpMcp.connect(config.url, config.headers)
        : await StdioMcp.connect(
            "command" in config ? config.command : "",
            "args" in config ? (config.args ?? []) : [],
            "env" in config ? config.env : undefined,
            "cwd" in config ? config.cwd : undefined,
          );
    const session = new McpConnection(
      (method, params) => transport.rpc(method, params),
      () => transport.close(),
    );
    await session.rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "open-loop", version: "0.5.0" },
    });
    await transport.notify("notifications/initialized");
    return session;
  }

  async listTools(): Promise<ListedTool[]> {
    const result = (await this.rpc("tools/list", {})) as { tools?: ListedTool[] };
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.rpc("tools/call", { name, arguments: args })) as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    const text = (result.content ?? [])
      .map((block) => block.text ?? "")
      .filter(Boolean)
      .join("\n");
    if (result.isError) throw new Error(text || `MCP tool ${name} failed`);
    return text || "(empty tool result)";
  }

  close(): Promise<void> {
    return this.stop();
  }
}

class StdioMcp {
  private buffer = "";
  private seq = 0;
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
  }>();

  private constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onData(chunk));
    child.on("exit", () => {
      for (const waiter of this.pending.values()) {
        waiter.reject(new Error("MCP process exited"));
      }
      this.pending.clear();
    });
  }

  static async connect(
    command: string,
    args: string[],
    env?: Record<string, string>,
    cwd?: string,
  ): Promise<StdioMcp> {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return new StdioMcp(child);
  }

  rpc(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.seq;
    return this.send({ jsonrpc: "2.0", id, method, params });
  }

  async notify(method: string): Promise<void> {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  }

  private send(message: {
    jsonrpc: "2.0";
    id: number;
    method: string;
    params?: unknown;
  }): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify(message)}\n`);
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line.startsWith("{")) this.onMessage(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private onMessage(line: string): void {
    let message: JsonRpcResponse;
    try {
      message = JSON.parse(line) as JsonRpcResponse;
    } catch {
      return;
    }
    if (message.id === undefined) return;
    const waiter = this.pending.get(message.id);
    if (!waiter) return;
    this.pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message ?? "MCP error"));
    else waiter.resolve(message.result);
  }

  async close(): Promise<void> {
    this.child.kill();
  }
}

class HttpMcp {
  private id = 0;
  private sessionId: string | undefined;
  private constructor(
    private readonly url: string,
    private readonly headers: Record<string, string>,
  ) {}

  static async connect(
    url: string,
    headers?: Record<string, string>,
  ): Promise<HttpMcp> {
    return new HttpMcp(url, headers ?? {});
  }

  async rpc(method: string, params?: unknown): Promise<unknown> {
    this.id += 1;
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.id, method, params }),
    });
    const session = response.headers.get("mcp-session-id");
    if (session) this.sessionId = session;
    const body = await response.text();
    if (!response.ok) throw new Error(`MCP HTTP ${response.status}: ${body.slice(0, 300)}`);
    const parsed = parseRpcBody(body);
    if (parsed.error) throw new Error(parsed.error.message ?? "MCP error");
    return parsed.result;
  }

  async notify(method: string): Promise<void> {
    await fetch(this.url, {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", method }),
    });
  }

  async close(): Promise<void> {
    return undefined;
  }
}

function parseRpcBody(body: string): JsonRpcResponse {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as JsonRpcResponse;
  for (const line of trimmed.split("\n")) {
    const data = line.startsWith("data:") ? line.slice(5).trim() : "";
    if (data.startsWith("{")) return JSON.parse(data) as JsonRpcResponse;
  }
  throw new Error("MCP response was not JSON");
}
