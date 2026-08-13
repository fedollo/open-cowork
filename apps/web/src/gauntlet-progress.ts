import {
  GAUNTLET_PROGRESS_LEGACY_REL_PATH,
  GAUNTLET_PROGRESS_REL_PATH,
} from "@open-loop/shared";
import { fetchWorkspaceFile } from "./api";

export async function loadGauntletProgressFile(
  cwd: string,
): Promise<{ content: string; path: string } | null> {
  for (const path of [GAUNTLET_PROGRESS_REL_PATH, GAUNTLET_PROGRESS_LEGACY_REL_PATH]) {
    try {
      return await fetchWorkspaceFile(cwd, path);
    } catch {
      // try legacy / alternate path
    }
  }
  return null;
}

/** Minimal markdown → HTML for trusted local progress files (escape first). */
export function renderGauntletMarkdown(md: string): string {
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .split("\n")
    .map((line) => {
      if (/^###\s+/.test(line)) {
        return `<h3>${line.replace(/^###\s+/, "")}</h3>`;
      }
      if (/^##\s+/.test(line)) {
        return `<h2>${line.replace(/^##\s+/, "")}</h2>`;
      }
      if (/^#\s+/.test(line)) {
        return `<h1>${line.replace(/^#\s+/, "")}</h1>`;
      }
      if (/^[-*]\s+/.test(line)) {
        return `<li>${line.replace(/^[-*]\s+/, "")}</li>`;
      }
      if (!line.trim()) return "";
      return `<p>${line}</p>`;
    })
    .join("");
}
