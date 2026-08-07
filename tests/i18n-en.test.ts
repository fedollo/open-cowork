import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..");

const ITALIAN_MARKERS = [
  "Nuova sessione",
  "Cartella (path assoluto)",
  "Modello",
  "Avvia",
  "Scegli una cartella",
  "Workspace agentico",
  "Inserisci un path",
  "mancante. Copia",
  "Run fallita",
  "In attesa di eventi",
  "Nessun albero",
  "Descrivi l'obiettivo",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (
      name.name === "node_modules" ||
      name.name === "dist" ||
      name.name === ".open-cowork" ||
      name.name === "plans" ||
      name.name.startsWith(".")
    ) {
      continue;
    }
    const full = join(dir, name.name);
    if (name.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|md|sh|html)$/.test(name.name)) out.push(full);
  }
  return out;
}

describe("English-only UI/API copy", () => {
  it("source files do not contain known Italian UI strings", () => {
    const files = walk(join(ROOT, "apps")).concat(
      walk(join(ROOT, "scripts")),
      walk(join(ROOT, "docs")),
      [join(ROOT, "README.md")],
    );
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const marker of ITALIAN_MARKERS) {
        if (text.includes(marker)) {
          hits.push(`${file}: ${marker}`);
        }
      }
    }
    assert.deepEqual(hits, [], `Italian strings found:\n${hits.join("\n")}`);
  });
});
