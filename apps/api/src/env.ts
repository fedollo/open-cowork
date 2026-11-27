import { config } from "dotenv";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { resolveAtlasChatModel } from "@open-loop/shared";

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
  atlasApiKey: process.env.ATLASCLOUD_API_KEY ?? "",
  /**
   * OpenAI-compatible chat base. Distinct from ATLASCLOUD_BASE_URL, which in
   * this repo is the media API (`/api/v1`) used by other Atlas clients.
   */
  atlasLlmBaseUrl:
    process.env.ATLASCLOUD_LLM_BASE_URL?.trim() ||
    "https://api.atlascloud.ai/v1",
  port: Number(process.env.PORT ?? 8787),
  defaultModel: resolveAtlasChatModel(process.env.DEFAULT_MODEL),
  /** Comma-separated Cursor settingSources; default project-only. */
  settingSources: process.env.OPEN_LOOP_SETTING_SOURCES ?? "project",
  sessionsDir,
  presetsPath: join(dirname(sessionsDir), "presets.json"),
  recentsPath: join(dirname(sessionsDir), "recents.json"),
  checkpointsDir: join(dirname(sessionsDir), "checkpoints"),
  qualityBarsCustomDir: resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../packages/shared/quality-bars/custom",
  ),
};

export function requireApiKey(): string {
  if (!env.atlasApiKey) {
    throw new Error(
      "ATLASCLOUD_API_KEY missing. Set it in .env and restart the API.",
    );
  }
  return env.atlasApiKey;
}
