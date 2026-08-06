#!/usr/bin/env node
// Build corpus v2a (clean set): mature human OSS + our own prod code.
// Selection is deterministic (sorted, seeded slice) so the corpus is reproducible.
// Output: corpus_v2/clean/<source>/<file>.ts + corpus_v2/clean/manifest.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // benchmarks/code-diet/
const OUT = path.join(ROOT, "corpus_v2/clean");

const SRC_EXT = /\.(ts|tsx|js|mjs)$/;
const SKIP_DIR = /node_modules|\/dist\/|\/build\/|\/coverage\//;
const SKIP_FILE = /\.test\.|\.spec\.|\.d\.ts$/;
const MIN_BYTES = 400; // skip trivial stubs
const MAX_BYTES = 200_000;

const SOURCES = [
  { name: "zod", dir: path.join(ROOT, "corpus_v2/_oss/zod/packages/zod/src/v4"), take: 110 },
  { name: "commander", dir: path.join(ROOT, "corpus_v2/_oss/commander.js/lib"), take: 10 },
  { name: "express", dir: path.join(ROOT, "corpus_v2/_oss/express/lib"), take: 10 },
  // our own production services (human+AI but shipped, CI-green, reviewed)
  { name: "hwai-language-graph", dir: path.resolve(ROOT, "../../mcp/source/services/language-graph-mcp/src"), take: 40 },
  { name: "hwai-repo-hygiene", dir: path.resolve(ROOT, "../../mcp/source/services/repo-hygiene-mcp/src"), take: 40 },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir)) {
    const full = path.join(dir, e);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (!SKIP_DIR.test(full) && !e.startsWith(".")) walk(full, out);
      continue;
    }
    if (!SRC_EXT.test(e) || SKIP_FILE.test(e)) continue;
    if (st.size < MIN_BYTES || st.size > MAX_BYTES) continue;
    out.push(full);
  }
  return out;
}

fs.rmSync(OUT, { recursive: true, force: true });
const manifest = { built_at: new Date().toISOString(), files: [] };
let total = 0;
for (const s of SOURCES) {
  const files = walk(s.dir).sort().slice(0, s.take);
  const od = path.join(OUT, s.name);
  fs.mkdirSync(od, { recursive: true });
  for (const f of files) {
    const base = path.basename(f);
    const dest = path.join(od, base);
    fs.copyFileSync(f, dest);
    manifest.files.push({ source: s.name, file: `${s.name}/${base}`, bytes: fs.statSync(f).size });
    total++;
  }
}
manifest.total_files = total;
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`clean corpus built: ${total} files -> ${OUT}`);
for (const s of SOURCES) {
  const n = manifest.files.filter((f) => f.source === s.name).length;
  console.log(`  ${s.name}: ${n}`);
}
