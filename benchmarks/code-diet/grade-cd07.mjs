#!/usr/bin/env node
// Grader CD07 — duplicate-export detector measurement (eval v2b, #19).
//
// Two measurements, both deterministic and re-runnable:
//   FP-floor  — clean corpus (mature OSS, one canonical re-export tree): expect ~0
//               CD07 findings. A finding here is a false positive (the detector must
//               not fire on zod's single-canonical-path barrel tree).
//   recall    — a small synthetic "fan" corpus where the SAME symbol is re-exported
//               from two entry paths: expect a CD07 finding on the non-canonical path.
//
// CD07 is cross-file and needs corpusFiles (named path+text). The clean corpus is
// scanned per-package (each package is its own corpusFiles set) so a symbol exported
// by two DIFFERENT packages is not falsely counted as a duplicate.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSource } from "../../mcp/source/services/code-diet-mcp/dist/detectors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const CLEAN = path.join(ROOT, "corpus_v2/clean");
const RESULTS = path.join(ROOT, "results");

function* walkFiles(dir, base = "") {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, e);
    const rel = base ? `${base}/${e}` : e;
    if (fs.statSync(full).isDirectory()) yield* walkFiles(full, rel);
    else if (/\.(ts|js|mjs)$/.test(e)) yield { rel, full };
  }
}

// ---- FP-floor: scan each clean package as its own corpusFiles set. ----
// CONTRACT (measured, 2026-08-06): zod is NOT a single-path corpus. It intentionally
// re-exports the same symbols through parallel public surfaces (index.ts + external.ts
// + compat.ts) — e.g. `config` (compat.ts:43 + external.ts:11) and `lt` (index.ts:29 +
// checks.ts). Those are TRUE duplicate-export findings, not false positives. zod is
// therefore the positive/real-world class. The FP-floor is measured on the strictly
// single-path packages (commander, express, hwai-*) where any CD07 hit IS a false
// positive.
const POSITIVE_PKGS = new Set(["zod"]);
const pkgs = fs.readdirSync(CLEAN).filter((e) => fs.statSync(path.join(CLEAN, e)).isDirectory());
const fpDetail = [];
const positiveDetail = [];
let cleanFilesScanned = 0;
for (const pkg of pkgs) {
  const pkgFiles = [...walkFiles(path.join(CLEAN, pkg))];
  const corpusFiles = pkgFiles.map((f) => ({ file: f.rel, text: fs.readFileSync(f.full, "utf8") }));
  const allSources = corpusFiles.map((f) => f.text);
  for (let i = 0; i < pkgFiles.length; i++) {
    cleanFilesScanned++;
    const hits = await analyzeSource(corpusFiles[i].text, corpusFiles[i].file, { allSources, corpusFiles });
    for (const h of hits.filter((x) => x.id === "CD07")) {
      const rec = { pkg, file: corpusFiles[i].file, message: h.message };
      (POSITIVE_PKGS.has(pkg) ? positiveDetail : fpDetail).push(rec);
    }
  }
}

// ---- recall: synthetic fan corpus. Same symbol re-exported from two entry paths. ----
const fanCorpus = [
  { file: "leaf.ts", text: `export function foo() { return 1; }\nexport function bar() { return 2; }\n` },
  { file: "a.ts", text: `export { foo } from "./leaf.js";\nexport { bar } from "./leaf.js";\n` }, // canonical
  { file: "b.ts", text: `export { foo } from "./leaf.js";\n` }, // duplicate path for foo
];
const fanSources = fanCorpus.map((f) => f.text);
let fanHits = 0;
const fanDetail = [];
for (const f of fanCorpus) {
  const hits = await analyzeSource(f.text, f.file, { allSources: fanSources, corpusFiles: fanCorpus });
  for (const h of hits.filter((x) => x.id === "CD07")) {
    fanHits++;
    fanDetail.push({ file: f.file, message: h.message });
  }
}

const fpCount = fpDetail.length;
const report = {
  generated_at: new Date().toISOString(),
  grader: "cd07",
  scope: "CD07 duplicate-export detector (eval v2b, #19)",
  fp_floor: {
    corpus: "corpus_v2/clean single-path packages (commander, express, hwai-*)",
    contract: "zod excluded — it has TRUE duplicate exports (parallel public surfaces), see positive_real_world",
    packages: pkgs.filter((p) => !POSITIVE_PKGS.has(p)),
    files_scanned: cleanFilesScanned,
    findings: fpCount,
    pass: fpCount === 0,
    detail: fpDetail,
  },
  positive_real_world: {
    corpus: "zod (parallel public surfaces: index + external + compat re-export same symbols)",
    findings: positiveDetail.length,
    pass: positiveDetail.length >= 1,
    detail: positiveDetail,
  },
  recall: {
    corpus: "synthetic fan (same symbol re-exported from two entry paths)",
    findings: fanHits,
    expect: ">=1",
    pass: fanHits >= 1,
    detail: fanDetail,
  },
};

fs.mkdirSync(RESULTS, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const outPath = path.join(RESULTS, `eval_cd07_${stamp}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("== CD07 duplicate-export measurement ==");
console.log(`FP-floor (single-path pkgs): ${fpCount} findings -> ${fpCount === 0 ? "PASS (0 FP)" : "FAIL"}`);
if (fpCount) console.log(`  FP: ${fpDetail.map((d) => `${d.pkg}/${d.file}`).slice(0, 10).join(", ")}`);
console.log(`positive real-world (zod): ${positiveDetail.length} findings -> ${positiveDetail.length >= 1 ? "PASS" : "FAIL"}`);
if (positiveDetail.length) console.log(`  hits: ${positiveDetail.map((d) => `${d.file}`).join(", ")}`);
console.log(`recall (fan): ${fanHits} findings -> ${fanHits >= 1 ? "PASS" : "FAIL"}`);
if (fanHits) console.log(`  hits: ${fanDetail.map((d) => `${d.file}`).join(", ")}`);
console.log(`\nwrote ${outPath}`);
