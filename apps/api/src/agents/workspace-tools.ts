import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { AtlasToolDefinition } from "./atlas-chat.js";

const MAX_READ_CHARS = 80_000;
const MAX_SHELL_CHARS = 30_000;
const SHELL_TIMEOUT_MS = 120_000;

export function resolveWorkspacePath(cwd: string, inputPath: string): string {
  const root = resolve(cwd);
  const abs = isAbsolute(inputPath)
    ? resolve(inputPath)
    : resolve(root, inputPath);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path escapes the workspace: ${inputPath}`);
  }
  return abs;
}

export const WORKSPACE_TOOL_DEFINITIONS: AtlasToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file in the workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a text file in the workspace.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Replace one exact occurrence of old_string with new_string in a workspace file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List one directory in the workspace.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search file contents under the workspace with a regex.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shell",
      description: "Run a shell command in the workspace. Returns combined output.",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
];

export async function runWorkspaceTool(
  cwd: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "read_file":
      return readWorkspaceFile(cwd, requiredString(args, "path"));
    case "write_file":
      return writeWorkspaceFile(
        cwd,
        requiredString(args, "path"),
        requiredString(args, "content"),
      );
    case "edit_file":
      return editWorkspaceFile(
        cwd,
        requiredString(args, "path"),
        requiredString(args, "old_string"),
        requiredString(args, "new_string"),
      );
    case "list_dir":
      return listWorkspaceDir(cwd, stringArg(args, "path") || ".");
    case "grep":
      return grepWorkspace(
        cwd,
        requiredString(args, "pattern"),
        stringArg(args, "path") || ".",
      );
    case "shell":
      return runShell(cwd, requiredString(args, "command"));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function readWorkspaceFile(cwd: string, inputPath: string): Promise<string> {
  const abs = resolveWorkspacePath(cwd, inputPath);
  const text = await readFile(abs, "utf8");
  if (text.length <= MAX_READ_CHARS) return text;
  return `${text.slice(0, MAX_READ_CHARS)}\n…[truncated]`;
}

async function writeWorkspaceFile(
  cwd: string,
  inputPath: string,
  content: string,
): Promise<string> {
  const abs = resolveWorkspacePath(cwd, inputPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
  return `Wrote ${inputPath} (${content.length} chars)`;
}

async function editWorkspaceFile(
  cwd: string,
  inputPath: string,
  oldString: string,
  newString: string,
): Promise<string> {
  const abs = resolveWorkspacePath(cwd, inputPath);
  const text = await readFile(abs, "utf8");
  const first = text.indexOf(oldString);
  if (first < 0) throw new Error("old_string was not found");
  const second = text.indexOf(oldString, first + oldString.length);
  if (second >= 0) throw new Error("old_string matched more than once");
  const next = text.slice(0, first) + newString + text.slice(first + oldString.length);
  await writeFile(abs, next, "utf8");
  return `Updated ${inputPath}`;
}

async function listWorkspaceDir(cwd: string, inputPath: string): Promise<string> {
  const abs = resolveWorkspacePath(cwd, inputPath);
  const entries = await readdir(abs, { withFileTypes: true });
  const lines = entries
    .slice(0, 200)
    .map((entry) => `${entry.isDirectory() ? "dir" : "file"} ${entry.name}`);
  if (entries.length > 200) lines.push(`…[${entries.length - 200} more]`);
  return lines.join("\n");
}

async function grepWorkspace(
  cwd: string,
  pattern: string,
  inputPath: string,
): Promise<string> {
  const abs = resolveWorkspacePath(cwd, inputPath);
  const output = await runCommand(cwd, "rg", [
    "-n",
    "--max-count",
    "40",
    "--glob",
    "!.git",
    pattern,
    abs,
  ]);
  return clip(output || "(no matches)");
}

async function runShell(cwd: string, command: string): Promise<string> {
  return clip(await runCommand(cwd, "sh", ["-c", command], SHELL_TIMEOUT_MS));
}

function runCommand(
  cwd: string,
  command: string,
  args: string[],
  timeoutMs = 30_000,
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env: process.env });
    let output = "";
    const append = (chunk: Buffer) => {
      if (output.length < MAX_SHELL_CHARS) output += chunk.toString("utf8");
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const suffix = code && code !== 0 ? `\n[exit ${code}]` : "";
      resolvePromise(clip(output + suffix));
    });
  });
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing ${key}`);
  }
  return value;
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

function clip(text: string): string {
  if (text.length <= MAX_SHELL_CHARS) return text;
  return `${text.slice(0, MAX_SHELL_CHARS)}\n…[truncated]`;
}
