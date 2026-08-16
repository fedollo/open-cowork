import type { Session } from "@open-loop/shared";
import type { GitWorkingTreeLine } from "./git-snapshot.js";

function formatIntegrations(session: Session): string {
  const ids = session.integrations ?? [];
  return ids.length > 0 ? ids.join(", ") : "none";
}

function formatMessages(session: Session): string {
  if (session.messages.length === 0) {
    return "_No messages yet._\n";
  }

  return session.messages
    .map((m) => {
      const heading = `### ${m.role} · ${m.createdAt}`;
      return `${heading}\n\n${m.content}\n`;
    })
    .join("\n");
}

function formatGitSection(changes: GitWorkingTreeLine[] | null | undefined): string {
  if (changes === null || changes === undefined) {
    return "_Workspace is not a git repository (or git unavailable)._\n";
  }
  if (changes.length === 0) {
    return "_No uncommitted changes in the working tree._\n";
  }

  const rows = changes
    .map((c) => `| \`${c.status}\` | \`${c.path}\` |`)
    .join("\n");

  return `| Status | Path |\n|--------|------|\n${rows}\n`;
}

export function buildSessionExportMarkdown(
  session: Session,
  gitChanges?: GitWorkingTreeLine[] | null,
): string {
  const lines: string[] = [
    "# Open Loop session export",
    "",
    "## Metadata",
    "",
    `- **Session ID:** \`${session.id}\``,
    `- **Title:** ${session.title}`,
    `- **Workspace:** \`${session.cwd}\``,
    `- **Model:** ${session.model}`,
    `- **Mode:** gauntlet`,
    `- **Status:** ${session.status}`,
    `- **Integrations:** ${formatIntegrations(session)}`,
    `- **Created:** ${session.createdAt}`,
    `- **Updated:** ${session.updatedAt}`,
    "",
  ];

  if (session.gauntlet) {
    lines.push(
      "## Gauntlet",
      "",
      "### Quality bar",
      "",
      session.gauntlet.qualityBar,
      "",
    );
    if (session.gauntlet.boundary) {
      lines.push("### Boundary", "", session.gauntlet.boundary, "");
    }
  }

  lines.push(
    "## Transcript",
    "",
    formatMessages(session),
    "## Workspace changes (git snapshot)",
    "",
    "_Point-in-time working tree status at export — not a full diff._",
    "",
    formatGitSection(gitChanges),
    "---",
    "",
    "_Exported from Open Loop._",
    "",
  );

  return lines.join("\n");
}

export function sessionExportFilename(sessionId: string): string {
  return `open-loop-session-${sessionId}.md`;
}
