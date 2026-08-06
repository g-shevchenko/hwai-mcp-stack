// Cross-run dead-code memory (spec §2 runtime state).
// Persists which findings a scan already surfaced so a later scan can annotate
// "seen before" (a still-unfixed dead export) vs "new". Local JSONL under the
// service cache dir; aggregate-only — the stable key + id + file + line + ts,
// NEVER the raw message/code. No network, re-runnable.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export interface StoreFinding {
  id: string;
  file: string;
  line?: number;
  confidence?: number;
  message?: string;
}

// Extract the symbol a CD03-style message names, so the key is stable across message
// wording changes but distinct per symbol. Falls back to a short hash of the message.
function symbolOf(message: string | undefined): string {
  if (!message) return "";
  const m = message.match(/"([^"]+)"/);
  if (m) return m[1];
  return createHash("sha1").update(message).digest("hex").slice(0, 8);
}

// Stable, code-free identity for a finding: id + file + symbol. Deliberately excludes
// line (a still-present finding shifts line as the file is edited) and raw message
// text. Two scans of the same still-unfixed finding produce the SAME key; a different
// symbol or file produces a different key.
export function findingKey(f: StoreFinding): string {
  return `${f.id}::${f.file}::${symbolOf(f.message)}`;
}

export class FindingsStore {
  private readonly file: string;

  constructor(cacheDir: string) {
    mkdirSync(cacheDir, { recursive: true });
    this.file = join(cacheDir, "findings.jsonl");
  }

  // Append one JSONL record per finding. Code-free: never stores the raw message.
  recordScan(findings: StoreFinding[], runId: string): void {
    const ts = new Date().toISOString();
    const lines = findings.map((f) =>
      JSON.stringify({ key: findingKey(f), id: f.id, file: f.file, line: f.line ?? null, run: runId, ts }),
    );
    if (lines.length) appendFileSync(this.file, lines.join("\n") + "\n", "utf8");
  }

  // All keys ever surfaced. Tolerates a missing/corrupt store: never throws, starts empty.
  load(): Set<string> {
    const out = new Set<string>();
    if (!existsSync(this.file)) return out;
    let raw: string;
    try {
      raw = readFileSync(this.file, "utf8");
    } catch {
      return out;
    }
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const rec = JSON.parse(t);
        if (rec && typeof rec.key === "string") out.add(rec.key);
      } catch {
        // skip a corrupt line; a partial store must not break the scan
      }
    }
    return out;
  }

  // True when this finding was already surfaced by a prior scan (still-unfixed).
  seenBefore(f: StoreFinding): boolean {
    return this.load().has(findingKey(f));
  }
}
