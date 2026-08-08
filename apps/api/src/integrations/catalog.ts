import type { IntegrationId, IntegrationInfo } from "@open-cowork/shared";

export interface IntegrationDef {
  id: IntegrationId;
  label: string;
  description: string;
  /** Primary env key used for configured checks and docs. */
  envKey: string;
  /** Accepted env aliases (first non-empty wins). */
  envKeys: string[];
}

export const INTEGRATION_CATALOG: IntegrationDef[] = [
  {
    id: "github",
    label: "GitHub",
    description: "Issues, PRs, repos via the official GitHub MCP server",
    envKey: "GITHUB_TOKEN",
    envKeys: ["GITHUB_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN"],
  },
  {
    id: "atlascloud",
    label: "Atlas Cloud",
    description: "Image / video / LLM models via atlascloud-mcp",
    envKey: "ATLASCLOUD_API_KEY",
    envKeys: ["ATLASCLOUD_API_KEY"],
  },
  {
    id: "replicate",
    label: "Replicate",
    description: "Run Replicate models via replicate-mcp",
    envKey: "REPLICATE_API_TOKEN",
    envKeys: ["REPLICATE_API_TOKEN"],
  },
];

export const INTEGRATION_IDS = INTEGRATION_CATALOG.map((c) => c.id);

export function isIntegrationId(value: string): value is IntegrationId {
  return (INTEGRATION_IDS as string[]).includes(value);
}

export function resolveEnvSecret(
  envKeys: string[],
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  for (const key of envKeys) {
    const v = env[key]?.trim();
    if (v) return v;
  }
  return undefined;
}

export function listIntegrationInfo(
  env: NodeJS.ProcessEnv = process.env,
): IntegrationInfo[] {
  return INTEGRATION_CATALOG.map((def) => ({
    id: def.id,
    label: def.label,
    description: def.description,
    envKey: def.envKey,
    configured: Boolean(resolveEnvSecret(def.envKeys, env)),
  }));
}
