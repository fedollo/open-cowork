import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(__dirname, "../../../.env");
const localEnv = resolve(__dirname, "../../.env");

if (existsSync(rootEnv)) config({ path: rootEnv });
else if (existsSync(localEnv)) config({ path: localEnv });
else config();

export const env = {
  apiKey: process.env.CURSOR_API_KEY ?? "",
  port: Number(process.env.PORT ?? 8787),
  defaultModel: process.env.DEFAULT_MODEL ?? "composer-2.5",
  sessionsDir:
    process.env.SESSIONS_DIR ??
    resolve(__dirname, "../../../.open-cowork/sessions"),
};

export function requireApiKey(): string {
  if (!env.apiKey) {
    throw new Error(
      "CURSOR_API_KEY missing. Copy .env.example to .env and set your key.",
    );
  }
  return env.apiKey;
}
