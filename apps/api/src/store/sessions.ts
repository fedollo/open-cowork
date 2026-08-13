import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Session } from "@open-loop/shared";
import { env } from "../env.js";

async function ensureDir(): Promise<void> {
  await mkdir(env.sessionsDir, { recursive: true });
}

function sessionPath(id: string): string {
  return join(env.sessionsDir, `${id}.json`);
}

export async function listSessions(): Promise<Session[]> {
  await ensureDir();
  const files = await readdir(env.sessionsDir);
  const sessions: Session[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(env.sessionsDir, file), "utf8");
      sessions.push(JSON.parse(raw) as Session);
    } catch {
      // skip corrupt files
    }
  }
  return sessions.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function getSession(id: string): Promise<Session | null> {
  await ensureDir();
  try {
    const raw = await readFile(sessionPath(id), "utf8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await ensureDir();
  await writeFile(sessionPath(session.id), JSON.stringify(session, null, 2), "utf8");
}
