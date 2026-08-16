export type GauntletBarStatus = "met" | "not_met" | "in_progress" | "unknown";

export interface GauntletProgressStructured {
  pieces: string[];
  verdicts: string[];
  gaps: string[];
  nextSteps: string[];
  rounds: string[];
  barStatus: GauntletBarStatus;
}

type SectionKey = keyof Omit<GauntletProgressStructured, "barStatus">;

const SECTION_KEYS: SectionKey[] = [
  "pieces",
  "verdicts",
  "gaps",
  "nextSteps",
  "rounds",
];

const SECTION_PATTERNS: Record<SectionKey, RegExp[]> = {
  pieces: [/^pieces?\b/i, /^work pieces?\b/i, /^components?\b/i],
  verdicts: [/^critic/i, /^verdicts?\b/i, /^reviews?\b/i, /^critique/i],
  gaps: [/^gaps?\b/i, /^remaining gaps?\b/i, /^open issues?\b/i],
  nextSteps: [/^next steps?\b/i, /^up next\b/i, /^todo\b/i],
  rounds: [/^rounds?\b/i, /^iterations?\b/i],
};

function matchSection(heading: string): SectionKey | null {
  const text = heading.replace(/^#+\s*/, "").trim();
  for (const key of SECTION_KEYS) {
    if (SECTION_PATTERNS[key].some((re) => re.test(text))) return key;
  }
  return null;
}

function pushItem(section: SectionKey, item: string, out: GauntletProgressStructured): void {
  const trimmed = item.trim();
  if (!trimmed) return;
  out[section].push(trimmed);
}

function inferBarStatus(raw: string, structured: GauntletProgressStructured): GauntletBarStatus {
  const explicit = raw.match(/bar status:\s*(met|not met|not_met|in progress|in_progress)/i);
  if (explicit) {
    const v = explicit[1]!.toLowerCase().replace(/\s+/g, "_");
    if (v === "met") return "met";
    if (v === "not_met") return "not_met";
    return "in_progress";
  }

  const lower = raw.toLowerCase();
  if (
    /quality bar (is )?(met|satisfied|passed|achieved)/i.test(raw) ||
    /\bbar met\b/i.test(lower)
  ) {
    return "met";
  }
  if (
    /quality bar (not met|unmet|failed)/i.test(raw) ||
    /does not meet the (quality )?bar/i.test(raw) ||
    /fails the bar/i.test(raw)
  ) {
    return "not_met";
  }

  const hasContent =
    structured.pieces.length +
      structured.verdicts.length +
      structured.gaps.length +
      structured.nextSteps.length >
    0;
  return hasContent ? "in_progress" : "unknown";
}

/** Parse Gauntlet progress markdown into structured sections (best-effort). */
export function parseGauntletProgress(raw: string): GauntletProgressStructured {
  const out: GauntletProgressStructured = {
    pieces: [],
    verdicts: [],
    gaps: [],
    nextSteps: [],
    rounds: [],
    barStatus: "unknown",
  };

  if (!raw.trim()) {
    return out;
  }

  let current: SectionKey | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (/^bar status:/i.test(trimmed)) continue;

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      current = matchSection(heading[2]!);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet && current) {
      pushItem(current, bullet[1]!, out);
      continue;
    }

    if (current && line.trim() && !line.startsWith("#")) {
      pushItem(current, line.trim(), out);
    }
  }

  out.barStatus = inferBarStatus(raw, out);
  return out;
}

export const GAUNTLET_BAR_STATUS_LABELS: Record<GauntletBarStatus, string> = {
  met: "Bar met",
  not_met: "Bar not met",
  in_progress: "In progress",
  unknown: "Unknown",
};
