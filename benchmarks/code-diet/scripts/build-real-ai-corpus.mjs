#!/usr/bin/env node
// Corpus v2c: real AI-generated code for blind labeling (EVALUATION.md §2).
// Source: our own MCP services (mcp/source/services/*/src) — LLM-authored
// production code. Deterministic seeded selection of N files for the blind
// labeling subagent. The labeling agent receives ONLY these files + the class
// spec; detector code and expected keys are off-limits.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO = path.resolve(ROOT, "../..");
const SRC = path.join(REPO, "mcp/source/services");
const OUT = path.join(ROOT, "corpus_v2/real_ai");
const N = Number(process.argv[2] || 30);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260806);

function* walk(dir, base = "") {
  for (const e of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, e);
    const rel = base ? `${base}/${e}` : e;
    if (e === "node_modules" || e === "dist") continue;
    if (fs.statSync(full).isDirectory()) yield* walk(full, rel);
    else if (/\.ts$/.test(e)) yield { rel, full };
  }
}

const candidates = [...walk(SRC)].filter((f) => {
  const bytes = fs.statSync(f.full).size;
  return bytes > 2000 && bytes < 60000; // substantive but labelable in one pass
});

// seeded shuffle + pick N
for (let i = candidates.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
}
const picked = candidates.slice(0, N);

fs.rmSync(OUT, { recursive: true, force: true });
const manifest = { built_at: new Date().toISOString(), files: [] };
for (const f of picked) {
  const dest = path.join(OUT, f.rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f.full, dest);
  manifest.files.push({ file: f.rel, bytes: fs.statSync(f.full).size });
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`v2c real_ai corpus: ${picked.length} files -> ${OUT}`);
