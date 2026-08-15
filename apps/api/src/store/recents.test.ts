import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { env } from "../env.js";
import { addRecent, listRecents } from "./recents.js";

let originalRecentsPath = "";
let tempDir = "";

before(async () => {
  originalRecentsPath = env.recentsPath;
  tempDir = await mkdtemp(join(tmpdir(), "recents-test-"));
  (env as { recentsPath: string }).recentsPath = join(tempDir, "recents.json");
});

after(async () => {
  (env as { recentsPath: string }).recentsPath = originalRecentsPath;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

describe("recents store", () => {
  it("stores unique paths with most recent first", async () => {
    const a = await mkdtemp(join(tmpdir(), "recent-a-"));
    const b = await mkdtemp(join(tmpdir(), "recent-b-"));

    await addRecent(a);
    await addRecent(b);
    await addRecent(a);

    const recents = await listRecents();
    assert.deepEqual(recents.slice(0, 2), [a, b]);

    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  });
});
