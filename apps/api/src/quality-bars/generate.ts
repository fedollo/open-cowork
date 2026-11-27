import type {
  QualityBarCategory,
  QualityBarGeneratedDraft,
  QualityBarIntegrationId,
  QualityBarWizardRequest,
} from "@open-loop/shared";
import { QUALITY_BAR_TEMPLATES } from "@open-loop/shared";
import type { SDKMessage } from "@cursor/sdk";
import { createAgent } from "../agents/registry.js";
import { mapSdkEvent } from "../agents/stream-map.js";
import { env } from "../env.js";
import { getQualityBarById } from "../store/quality-bars.js";
import { buildQualityBarGeneratePrompt } from "./generate-prompt.js";
import { parseJsonObjectFromText } from "./parse-json.js";
import { resolve } from "node:path";

const CATEGORIES: QualityBarCategory[] = [
  "dev",
  "visual",
  "video",
  "writing",
  "marketing",
];

const INTEGRATIONS: QualityBarIntegrationId[] = [
  "github",
  "atlascloud",
  "replicate",
];

function repoRoot(): string {
  return resolve(import.meta.dirname, "../../../../");
}

function normalizeDraft(raw: unknown): QualityBarGeneratedDraft {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid generated template");
  }
  const o = raw as Record<string, unknown>;
  const category = o.category as QualityBarCategory;
  if (!CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${String(o.category)}`);
  }
  const integrations = Array.isArray(o.integrations)
    ? (o.integrations as string[]).filter((x): x is QualityBarIntegrationId =>
        INTEGRATIONS.includes(x as QualityBarIntegrationId),
      )
    : undefined;

  const id = String(o.id ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  const label = String(o.label ?? "").trim();
  const goal = String(o.goal ?? "").trim();
  const qualityBar = String(o.qualityBar ?? "").trim();
  const boundary = o.boundary ? String(o.boundary).trim() : undefined;

  if (!id || !label || !goal || !qualityBar) {
    throw new Error("Generated template missing id, label, goal, or qualityBar");
  }

  return {
    id,
    label,
    category,
    goal,
    qualityBar,
    boundary: boundary || undefined,
    integrations: integrations?.length ? integrations : undefined,
  };
}

async function collectAssistantText(
  run: Awaited<ReturnType<Awaited<ReturnType<typeof createAgent>>["agent"]["send"]>>,
): Promise<string> {
  let text = "";
  for await (const event of run.stream()) {
    for (const m of mapSdkEvent(event as SDKMessage)) {
      if (m.type === "assistant_text") text += m.text;
    }
  }
  const result = await run.wait();
  if (result.error) {
    throw new Error(result.error.message ?? "Generation failed");
  }
  if (!text.trim()) {
    throw new Error("Model returned no text");
  }
  return text;
}

export async function generateQualityBarDraft(
  input: QualityBarWizardRequest,
): Promise<QualityBarGeneratedDraft> {
  let reference = QUALITY_BAR_TEMPLATES.find(
    (t) => t.id === input.referenceTemplateId,
  );
  if (input.referenceTemplateId && !reference) {
    const fromStore = await getQualityBarById(input.referenceTemplateId);
    if (fromStore) {
      reference = fromStore;
    }
  }

  const prompt = buildQualityBarGeneratePrompt(input, reference);
  const model = input.model?.trim() || env.defaultModel;
  const { agent } = await createAgent({
    cwd: repoRoot(),
    model,
    mcpServers: {},
  });

  try {
    const run = await agent.send(prompt);
    const text = await collectAssistantText(run);
    const parsed = parseJsonObjectFromText(text);
    return normalizeDraft(parsed);
  } finally {
    await agent[Symbol.asyncDispose]?.().catch(() => undefined);
  }
}
