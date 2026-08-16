import type { SettingSource } from "@cursor/sdk";

const VALID: SettingSource[] = [
  "project",
  "user",
  "team",
  "mdm",
  "plugins",
  "all",
];

export function resolveSettingSources(raw?: string): SettingSource[] {
  const value = raw?.trim();
  if (!value) return ["project"];

  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const out: SettingSource[] = [];
  for (const part of parts) {
    if (VALID.includes(part as SettingSource) && !out.includes(part as SettingSource)) {
      out.push(part as SettingSource);
    }
  }

  return out.length > 0 ? out : ["project"];
}
