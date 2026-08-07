import type { AgentStreamEvent } from "@open-cowork/shared";
import type { SDKMessage } from "@cursor/sdk";

/** Map SDK stream messages to our AgentStreamEvent union. */
export function mapSdkEvent(event: SDKMessage): AgentStreamEvent[] {
  const out: AgentStreamEvent[] = [];

  switch (event.type) {
    case "assistant": {
      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          out.push({ type: "assistant_text", text: block.text });
        } else if (block.type === "tool_use") {
          out.push({
            type: "tool_call",
            name: block.name,
            path: extractPath(block.input),
            args: block.input,
          });
        }
      }
      break;
    }
    case "tool_call": {
      if (event.status === "running") {
        out.push({
          type: "tool_call",
          name: event.name,
          path: extractPath(event.args),
          args: event.args,
        });
      } else {
        out.push({
          type: "tool_result",
          name: event.name,
          ok: event.status === "completed",
          summary: summarizeResult(event.result),
        });
      }
      break;
    }
    case "status": {
      const statusMap = {
        CREATING: "running",
        RUNNING: "running",
        FINISHED: "done",
        ERROR: "error",
        CANCELLED: "idle",
        EXPIRED: "error",
      } as const;
      out.push({
        type: "status",
        status: statusMap[event.status] ?? "running",
        message: event.message ?? event.status,
      });
      break;
    }
    case "thinking":
    case "system":
    case "user":
    case "request":
    case "task":
    case "usage":
      break;
  }

  return out;
}

function extractPath(args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const a = args as Record<string, unknown>;
  for (const key of ["path", "filePath", "file_path", "target", "target_file"]) {
    if (typeof a[key] === "string") return a[key] as string;
  }
  return undefined;
}

function summarizeResult(result: unknown): string | undefined {
  if (result == null) return undefined;
  if (typeof result === "string") return result.slice(0, 200);
  try {
    return JSON.stringify(result).slice(0, 200);
  } catch {
    return undefined;
  }
}
