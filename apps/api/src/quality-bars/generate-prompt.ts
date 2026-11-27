import type { QualityBarTemplate } from "@open-loop/shared";
import type { QualityBarWizardRequest } from "@open-loop/shared";

function exemplarBlock(t: QualityBarTemplate): string {
  return `### ${t.label} (${t.id})
Goal: ${t.goal}
Quality bar: ${t.qualityBar}
Boundary: ${t.boundary ?? "(none)"}`;
}

export function buildQualityBarGeneratePrompt(
  input: QualityBarWizardRequest,
  reference?: QualityBarTemplate,
): string {
  const exemplars = reference
    ? exemplarBlock(reference)
    : [
        exemplarBlock({
          id: "readme-docs",
          label: "README & docs polish",
          category: "dev",
          goal: "Add a polished README section for first-time contributors.",
          qualityBar:
            "A fresh reader can clone → running UI in under 5 minutes using only the README. Every command copy-pasteable and verified.",
          boundary: "Only README.md and docs/. No apps/ or packages/ code.",
        }),
        exemplarBlock({
          id: "video-demo-text-to-video",
          label: "Demo clip 15s",
          category: "video",
          goal: "Generate a 15s product demo clip via Atlas Seedance.",
          qualityBar:
            "MP4 plays in QuickTime/VLC; non-technical viewer understands the product in 15s; log row in docs/video-generation-log.md with model and cost.",
          boundary: "Atlas MCP only. Only assets/videos/ and docs/video-generation-log.md.",
          integrations: ["atlascloud"],
        }),
      ].join("\n\n");

  const integrations =
    input.integrations?.length ? input.integrations.join(", ") : "none";

  if (input.mode === "refine" && input.draft) {
    return [
      "You are an expert at writing Gauntlet Loop quality bar templates for Open Loop.",
      "Refine the draft below. Keep concrete, inspectable criteria — no vibes.",
      "",
      `User instruction: ${input.refineInstruction?.trim() || "Improve clarity and measurability."}`,
      `Category: ${input.category}`,
      `Integrations to mention if relevant: ${integrations}`,
      "",
      "Current draft:",
      JSON.stringify(input.draft, null, 2),
      "",
      "Respond with ONLY a JSON object (no markdown prose):",
      `{ "id": "slug", "label": "...", "category": "${input.category}", "goal": "...", "qualityBar": "...", "boundary": "...", "integrations": [] }`,
      "",
      "Rules:",
      "- qualityBar must be testable by a harsh critic reading files/output — commands, timings, pass/fail.",
      "- boundary lists hard limits (paths, no-go zones).",
      "- id: lowercase hyphenated slug, max 40 chars.",
    ].join("\n");
  }

  return [
    "You are an expert at writing Gauntlet Loop quality bar templates for Open Loop.",
    "Gauntlet = builder vs harsh critic loop until the quality bar is met.",
    "",
    `User intent: ${input.intent.trim()}`,
    `Category: ${input.category}`,
    `Integrations to use in template (if applicable): ${integrations}`,
    reference ? `Style reference template:\n${exemplars}` : `Examples of strong templates:\n${exemplars}`,
    "",
    "Write ONE new template as JSON only (no markdown outside the JSON):",
    `{`,
    `  "id": "suggested-slug",`,
    `  "label": "short human name",`,
    `  "category": "${input.category}",`,
    `  "goal": "what the lead agent should achieve",`,
    `  "qualityBar": "concrete inspectable done criteria for critics",`,
    `  "boundary": "hard limits — paths, max scope",`,
    `  "integrations": ${JSON.stringify(input.integrations ?? [])}`,
    `}`,
    "",
    "Rules:",
    "- qualityBar is the most important field — specific, measurable, critic-friendly.",
    "- Avoid: good enough, nice, vibes, improve quality.",
    "- Prefer: commands, file paths, time limits, test pass, visual checks at N px.",
    "- goal = outcome; qualityBar = how a critic verifies it without trusting the builder.",
  ].join("\n");
}
