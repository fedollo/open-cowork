import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonObjectFromText } from "../apps/api/src/quality-bars/parse-json.ts";

describe("parseJsonObjectFromText", () => {
  it("parses fenced JSON", () => {
    const raw = parseJsonObjectFromText(
      'Here you go:\n```json\n{"id":"x","label":"Y"}\n```',
    ) as { id: string };
    assert.equal(raw.id, "x");
  });

  it("parses raw object", () => {
    const raw = parseJsonObjectFromText('{"goal":"a","qualityBar":"b"}') as {
      goal: string;
    };
    assert.equal(raw.goal, "a");
  });
});
