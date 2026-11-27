import type { IntegrationId } from "@open-loop/shared";

export const PENDING_TEMPLATE_STORAGE_KEY = "open-loop:pending-template";

/** Full template fields stashed before navigating to the workspace. */
export interface PendingQualityBarTemplate {
  id: string;
  label?: string;
  goal: string;
  qualityBar: string;
  boundary?: string;
  integrations?: IntegrationId[];
}

export function stashPendingTemplate(template: PendingQualityBarTemplate): void {
  sessionStorage.setItem(PENDING_TEMPLATE_STORAGE_KEY, JSON.stringify(template));
}

export function readPendingTemplate(): PendingQualityBarTemplate | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TEMPLATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingQualityBarTemplate;
    if (!parsed.id || !parsed.goal?.trim() || !parsed.qualityBar?.trim()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingTemplate(): void {
  sessionStorage.removeItem(PENDING_TEMPLATE_STORAGE_KEY);
}

export function navigateToSessionWithTemplate(
  template: PendingQualityBarTemplate,
): void {
  stashPendingTemplate(template);
  window.location.assign(`/?template=${encodeURIComponent(template.id)}`);
}

export function cleanTemplateSearchParam(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("template")) return;
  params.delete("template");
  const qs = params.toString();
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${qs ? `?${qs}` : ""}`,
  );
}
