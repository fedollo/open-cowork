import type { McpServerConfig } from "@cursor/sdk";
import type { IntegrationId } from "@open-loop/shared";
import {
  INTEGRATION_CATALOG,
  isIntegrationId,
  resolveEnvSecret,
} from "./catalog.js";

export class IntegrationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationConfigError";
  }
}

export function normalizeIntegrationIds(raw: unknown): IntegrationId[] {
  if (!Array.isArray(raw)) return [];
  const out: IntegrationId[] = [];
  for (const item of raw) {
    if (typeof item === "string" && isIntegrationId(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

/**
 * Build SDK mcpServers for enabled integrations.
 * Throws IntegrationConfigError if an id is enabled but its env key is missing.
 */
export function buildMcpServers(
  enabledIds: IntegrationId[],
  env: NodeJS.ProcessEnv = process.env,
): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {};

  for (const id of enabledIds) {
    const def = INTEGRATION_CATALOG.find((c) => c.id === id);
    if (!def) {
      throw new IntegrationConfigError(`Unknown integration: ${id}`);
    }
    const secret = resolveEnvSecret(def.envKeys, env);
    if (!secret) {
      throw new IntegrationConfigError(
        `Integration "${def.label}" requires ${def.envKey} in .env`,
      );
    }

    switch (id) {
      case "github":
        servers.github = {
          type: "http",
          url: "https://api.githubcopilot.com/mcp/",
          headers: {
            Authorization: `Bearer ${secret}`,
          },
        };
        break;
      case "atlascloud":
        servers.atlascloud = {
          type: "stdio",
          command: "npx",
          args: ["-y", "atlascloud-mcp"],
          env: {
            ATLASCLOUD_API_KEY: secret,
          },
        };
        break;
      case "replicate":
        servers.replicate = {
          type: "stdio",
          command: "npx",
          args: ["-y", "replicate-mcp"],
          env: {
            REPLICATE_API_TOKEN: secret,
          },
        };
        break;
    }
  }

  return servers;
}
