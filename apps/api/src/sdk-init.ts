import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { configureCursorSdk } from "@cursor/sdk";

const require = createRequire(import.meta.url);

function resolveBundledRipgrepPath(): string | undefined {
  try {
    const pkgDir = dirname(require.resolve("@cursor/sdk-darwin-arm64/package.json"));
    const bundled = join(pkgDir, "bin/rg");
    if (existsSync(bundled)) return bundled;
  } catch {
    // optional platform package may be absent on other OS/arch
  }

  try {
    const fromPath = execSync("which rg", { encoding: "utf8" }).trim();
    if (fromPath && existsSync(fromPath)) return fromPath;
  } catch {
    // ignore
  }

  return undefined;
}

/** Configure Cursor SDK defaults and ripgrep before any Agent.create() calls. */
export function initCursorSdk(): void {
  const rgPath = resolveBundledRipgrepPath();
  if (rgPath && !process.env.CURSOR_RIPGREP_PATH) {
    process.env.CURSOR_RIPGREP_PATH = rgPath;
  }

  configureCursorSdk({});
}
