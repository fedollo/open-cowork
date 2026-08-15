import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Session } from "@open-loop/shared";
import {
  buildSessionExportMarkdown,
  sessionExportFilename,
} from "./export-session.js";

const baseSession: Session = {
  id: "abc123",
  agentId: "agent-1",
  cwd: "/tmp/project",
  model: "composer-2.5",
  title: "Gauntlet: test goal",
  createdAt: "2026-08-15T10:00:00.000Z",
  updatedAt: "2026-08-15T10:05:00.000Z",
  status: "done",
  mode: "gauntlet",
  gauntlet: {
    qualityBar: "All tests pass",
    boundary: "Only docs/",
  },
  integrations: ["github"],
  messages: [
    {
      id: "m1",
      role: "user",
      content: "[Gauntlet]\nGoal: Do thing\nBar: All tests pass",
      createdAt: "2026-08-15T10:01:00.000Z",
    },
    {
      id: "m2",
      role: "assistant",
      content: "Done.",
      createdAt: "2026-08-15T10:04:00.000Z",
    },
  ],
};

describe("buildSessionExportMarkdown", () => {
  it("includes metadata, gauntlet config, and transcript", () => {
    const md = buildSessionExportMarkdown(baseSession, []);
    assert.match(md, /Session ID.*abc123/);
    assert.match(md, /Mode.*gauntlet/);
    assert.match(md, /Integrations.*github/);
    assert.match(md, /Quality bar/);
    assert.match(md, /All tests pass/);
    assert.match(md, /Boundary/);
    assert.match(md, /Only docs/);
    assert.match(md, /### user/);
    assert.match(md, /### assistant/);
    assert.match(md, /Done\./);
  });

  it("lists git changes when provided", () => {
    const md = buildSessionExportMarkdown(baseSession, [
      { status: "M", path: "README.md" },
      { status: "??", path: "docs/new.md" },
    ]);
    assert.match(md, /`M`.*README\.md/);
    assert.match(md, /`\?\?`.*docs\/new\.md/);
  });

  it("notes when git is unavailable", () => {
    const md = buildSessionExportMarkdown(baseSession, null);
    assert.match(md, /not a git repository/i);
  });
});

describe("sessionExportFilename", () => {
  it("uses session id in filename", () => {
    assert.equal(sessionExportFilename("xyz"), "open-loop-session-xyz.md");
  });
});
