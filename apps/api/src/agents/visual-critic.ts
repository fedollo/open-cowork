import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  completeAtlasChat,
  type AtlasContentPart,
  type AtlasUsage,
} from "./atlas-chat.js";

const BEFORE = join(".open-loop", "shots", "before.png");
const AFTER = join(".open-loop", "shots", "after.png");
const MAX_BYTES = 6_000_000;

export interface ShotVerdict {
  accepted: boolean;
  publicText: string;
  continuation: string;
  usage?: AtlasUsage;
}

type Pair =
  | { ok: false; publicText: string }
  | { ok: true; before: Buffer; after: Buffer };

export async function inspectShotPair(cwd: string): Promise<Pair> {
  const beforePath = join(cwd, BEFORE);
  const afterPath = join(cwd, AFTER);
  const before = await readPng(beforePath);
  const after = await readPng(afterPath);
  if (!before || !after) {
    return {
      ok: false,
      publicText:
        "Visual critic rejected the run. Save .open-loop/shots/before.png before editing and .open-loop/shots/after.png from the same camera after the change. Both files must be PNGs under 6 MB.",
    };
  }
  if (sha(before) === sha(after)) {
    return {
      ok: false,
      publicText:
        "Visual critic rejected the run. before.png and after.png are the same file. Capture again after a change a player can see.",
    };
  }
  const a = pngSize(before);
  const b = pngSize(after);
  if (!a || !b) {
    return {
      ok: false,
      publicText:
        "Visual critic rejected the run. One of the shot files is not a PNG.",
    };
  }
  if (a.w !== b.w || a.h !== b.h) {
    return {
      ok: false,
      publicText: `Visual critic rejected the run. Resolution changed from ${a.w}x${a.h} to ${b.w}x${b.h}. Recapture both shots from the same camera.`,
    };
  }
  return { ok: true, before, after };
}

export async function judgeBeforeAfter(opts: {
  cwd: string;
  model: string;
  qualityBar: string;
  signal?: AbortSignal;
}): Promise<ShotVerdict> {
  const pair = await inspectShotPair(opts.cwd);
  if (!pair.ok) {
    return {
      accepted: false,
      publicText: pair.publicText,
      continuation: `${pair.publicText}\nKeep working. Do not stop until a new after.png would survive this check.`,
    };
  }

  const parts: AtlasContentPart[] = [
    {
      type: "text",
      text: [
        "BEFORE is the first image. AFTER is the second.",
        "Quality bar:",
        opts.qualityBar,
        "First line must be exactly `VERDICT: ACCEPT` or `VERDICT: REJECT`.",
        "ACCEPT only when a player can see a change that meets the bar without reading notes.",
        "REJECT when the pictures look the same, the frame is black, or the only change is HUD text.",
        "Then name the largest gap in under 120 words.",
      ].join("\n"),
    },
    { type: "image_url", image_url: { url: dataUrl(pair.before) } },
    { type: "image_url", image_url: { url: dataUrl(pair.after) } },
  ];

  const completion = await completeAtlasChat({
    model: opts.model,
    messages: [
      {
        role: "system",
        content:
          "You are a harsh visual critic with fresh context. You did not build this work. Judge only the two images and the quality bar.",
      },
      { role: "user", content: parts },
    ],
    signal: opts.signal,
  });
  const text = [completion.message.content, completion.message.reasoning_content]
    .filter(Boolean)
    .join("\n");
  const accepted = /^VERDICT:\s*ACCEPT\b/im.test(text);
  const publicText = accepted
    ? `Visual critic accepted the screenshots.\n${text}`
    : `Visual critic rejected the screenshots.\n${text || "No verdict text."}`;
  return {
    accepted,
    publicText,
    continuation: `${publicText}\nThe screenshots failed the bar. Change what the player sees, then replace .open-loop/shots/after.png.`,
    usage: completion.usage,
  };
}

async function readPng(path: string): Promise<Buffer | null> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size <= 0 || info.size > MAX_BYTES) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

function sha(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function dataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString("base64")}`;
}
