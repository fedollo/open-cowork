import { config } from "dotenv";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveSessionsDir(): string {
  if (process.env.SESSIONS_DIR) return process.env.SESSIONS_DIR;
  const root = resolve(__dirname, "../../..");
  const nextDir = resolve(root, ".open-loop/sessions");
  const legacyDir = resolve(root, ".open-cowork/sessions");
  if (existsSync(nextDir)) return nextDir;
  if (existsSync(legacyDir)) return legacyDir;
  return nextDir;
}

const rootEnv = resolve(__dirname, "../../../.env");
const localEnv = resolve(__dirname, "../../.env");

if (existsSync(rootEnv)) config({ path: rootEnv });
else if (existsSync(localEnv)) config({ path: localEnv });
else config();

const sessionsDir = resolveSessionsDir();

export const env = {
  apiKey: process.env.CURSOR_API_KEY ?? "",
  port: Number(process.env.PORT ?? 8787),
  defaultModel: process.env.DEFAULT_MODEL ?? "composer-2.5",
  /** Comma-separated Cursor settingSources; default project-only. */
  settingSources: process.env.OPEN_LOOP_SETTING_SOURCES ?? "project",
  sessionsDir,
  presetsPath: join(dirname(sessionsDir), "presets.json"),
  recentsPath: join(dirname(sessionsDir), "recents.json"),
};

export function requireApiKey(): string {
  if (!env.apiKey) {
    throw new Error(
      "CURSOR_API_KEY missing. Copy .env.example to .env and set your key.",
    );
  }
  return env.apiKey;
}
