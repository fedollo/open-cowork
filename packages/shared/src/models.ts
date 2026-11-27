/** Chat models served by Atlas Cloud's OpenAI-compatible API. */
export const ATLAS_CHAT_MODELS = [
  {
    id: "moonshotai/kimi-k3.1-pro",
    label: "Kimi K3.1 Pro",
  },
  {
    id: "openai/gpt-6.2-sol",
    label: "GPT 6.2 Sol",
  },
] as const;

export type AtlasChatModelId = (typeof ATLAS_CHAT_MODELS)[number]["id"];

export const DEFAULT_ATLAS_MODEL_ID: AtlasChatModelId =
  "moonshotai/kimi-k3.1-pro";

export function isAtlasChatModel(id: string): id is AtlasChatModelId {
  return ATLAS_CHAT_MODELS.some((model) => model.id === id);
}

/** Keep agent runs on the Atlas catalog. Unknown ids fall back to Kimi K3.1 Pro. */
export function resolveAtlasChatModel(
  id: string | undefined | null,
): AtlasChatModelId {
  const trimmed = id?.trim();
  if (trimmed && isAtlasChatModel(trimmed)) return trimmed;
  return DEFAULT_ATLAS_MODEL_ID;
}
