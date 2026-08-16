#!/usr/bin/env node
// Grader v3 — CD03 clean-corpus scoring against SOURCE TRUTH (EVALUATION.md §8).
//
// Supersedes grader v2's v2a "any clean-corpus hit = FP" accounting, which mis-scored
// genuinely dead exports in mature OSS (zod extendedDuration/uuid4/uuid6/uuid7) as
// false positives. v3 scores each CD03 finding on the clean corpus against a
// blind-labeled per-symbol truth table:
//   flag on verdict_source  -> TP (the symbol really is dead — correct finding)
//   flag on detector_fp     -> FP (a real cross-file reference exists)
//   flag on not_findings    -> FP (out-of-scope over-fire)
//   flag on UNLABELED symbol -> conservative FP (unknown treated as detector error)
//
// Scope: v3 ONLY re-scores CD03 on the clean corpus (the class the methodology bug
// affected). v2b injected + v2c real-ai accounting is unchanged and lives in
// grade-v2.mjs. This grader emits results/eval_v3_<date>.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSource } from "../../mcp/source/services/code-diet-mcp/dist/detectors.js";
import { buildLanguageGraphOracle } from "./scripts/oracle.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const CLEAN = path.join(ROOT, "corpus_v2/clean");
const RESULTS = path.join(ROOT, "results");
const TRUTH_TABLE = path.join(ROOT, "truth_table_v3.json");

function wilson(k, n, z = 1.96) {
  if (n === 0) return { lo: 0, hi: 0, p: 0 };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half), p };
}

function* walkFiles(dir, base = "") {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, e);
    const rel = base ? `${base}/${e}` : e;
    if (fs.statSync(full).isDirectory()) yield* walkFiles(full, rel);
    else if (/\.(ts|js|mjs)$/.test(e)) yield { rel, full };
  }
}

function entryPointSources(files) {
  return files
    .filter((f) => /(^|\/)(index|main|mod)\.(ts|js|mjs)$/.test(f.rel))
    .map((f) => fs.readFileSync(f.full, "utf8"));
}

if (!fs.existsSync(TRUTH_TABLE)) {
  console.error(`truth table not found: ${TRUTH_TABLE}`);
  console.error("Run the blind labeler first (EVALUATION.md §8b).");
  process.exit(2);
}
const truth = JSON.parse(fs.readFileSync(TRUTH_TABLE, "utf8"));
const truthFiles = truth.files || {};

// Map file rel-path -> symbol -> label. Truth table keys may be "clean/zod/x.ts"
// or "zod/x.ts"; normalize to the walkFiles rel path (strip a leading "clean/").
const labelByFileSymbol = new Map(); // rel -> Map(symbol -> label)
for (const [rawFile, labels] of Object.entries(truthFiles)) {
  const rel = rawFile.replace(/^clean\//, "");
  const m = new Map();
  for (const s of labels.verdict_source || []) m.set(s, "verdict_source");
  for (const s of labels.detector_fp || []) m.set(s, "detector_fp");
  for (const s of labels.not_findings || []) m.set(s, "not_findings");
  labelByFileSymbol.set(rel, m);
}

function symbolOf(finding) {
  const m = finding.message.match(/"([^"]+)"/);
  return m ? m[1] : null;
}

const cleanFiles = [...walkFiles(CLEAN)].filter((f) => f.rel !== "manifest.json");
const cleanTexts = cleanFiles.map((f) => fs.readFileSync(f.full, "utf8"));
const cleanEntry = entryPointSources(cleanFiles);
const cleanCorpusEntry = {
  texts: cleanTexts,
  entryIdx: (() => {
    const s = new Set();
    cleanFiles.forEach((f, i) => {
      if (/(^|\/)(index|main|mod)\.(ts|js|mjs)$/.test(f.rel)) s.add(i);
    });
    return s;
  })(),
};
const cleanOracle = await buildLanguageGraphOracle(CLEAN);

// Per-symbol CD03 accounting against source truth.
let tp = 0;
let fp = 0;
let fn = 0; // verdict_source symbols the detector MISSED
let unlabeledFlagged = 0;
const detail = { tp: [], fp: [], fn: [], unlabeled: [] };

// Track which verdict_source symbols got flagged (for FN computation).
const flaggedSymbols = new Set(); // `${rel}::${symbol}`

for (let i = 0; i < cleanFiles.length; i++) {
  const rel = cleanFiles[i].rel;
  const hits = await analyzeSource(cleanTexts[i], rel, {
    allSources: cleanTexts,
    publicApiSources: cleanEntry,
    corpusEntry: cleanCorpusEntry,
    ...(cleanOracle ? { languageGraphOracle: cleanOracle } : {}),
  });
  const cd03 = hits.filter((h) => h.id === "CD03" && h.confidence >= 0.85); // verdicts only
  const labels = labelByFileSymbol.get(rel);
  for (const h of cd03) {
    const sym = symbolOf(h);
    if (!sym) continue;
    flaggedSymbols.add(`${rel}::${sym}`);
    const label = labels?.get(sym);
    if (label === "verdict_source") {
      tp++;
      detail.tp.push({ file: rel, symbol: sym });
    } else if (label === "detector_fp" || label === "not_findings") {
      fp++;
      detail.fp.push({ file: rel, symbol: sym, label });
    } else {
      // Unlabeled symbol flagged: conservative FP.
      fp++;
      unlabeledFlagged++;
      detail.unlabeled.push({ file: rel, symbol: sym });
    }
  }
}

// FN: every verdict_source symbol NOT flagged by the detector.
for (const [rel, labels] of labelByFileSymbol) {
  for (const [sym, label] of labels) {
    if (label === "verdict_source" && !flaggedSymbols.has(`${rel}::${sym}`)) {
      fn++;
      detail.fn.push({ file: rel, symbol: sym });
    }
  }
}

const precision = tp + fp ? tp / (tp + fp) : 1;
const recall = tp + fn ? tp / (tp + fn) : 1;
const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
const labeledSymbols = [...labelByFileSymbol.values()].reduce((n, m) => n + m.size, 0);
const verdictSourceTotal = detail.tp.length + detail.fn.length;

const report = {
  generated_at: new Date().toISOString(),
  grader: "v3",
  scope: "CD03 on v2a clean corpus, scored against blind-labeled source truth (EVALUATION.md §8)",
  supersedes: "grade-v2.mjs v2a 'any hit = FP' CD03 accounting",
  contract: {
    verdicts_only: "CD03 findings counted only when oracle-confirmed (confidence >= 0.85)",
    tp: "flag on verdict_source symbol",
    fp: "flag on detector_fp / not_findings / unlabeled symbol",
    fn: "verdict_source symbol not flagged",
    unlabeled_policy: "conservative FP (unknown treated as detector error)",
  },
  truth_table: {
    file: "truth_table_v3.json",
    labeled_at: truth.labeled_at,
    files: Object.keys(truthFiles).length,
    labeled_symbols: labeledSymbols,
    verdict_source_symbols: verdictSourceTotal,
  },
  oracle_used: cleanOracle !== null,
  cd03_source_truth: {
    tp, fp, fn, unlabeled_flagged: unlabeledFlagged,
    precision, recall, f1,
    precision_ci: wilson(tp, tp + fp),
    recall_ci: wilson(tp, tp + fn),
  },
  detail,
};

fs.mkdirSync(RESULTS, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const outPath = path.join(RESULTS, `eval_v3_${stamp}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("== v3 CD03 clean-corpus vs SOURCE TRUTH (EVALUATION.md §8) ==");
console.log(`truth table: ${Object.keys(truthFiles).length} files, ${labeledSymbols} labeled symbols, ${verdictSourceTotal} verdict_source`);
console.log(`oracle used: ${cleanOracle !== null}`);
console.log(`tp=${tp}  fp=${fp}  fn=${fn}  (unlabeled flagged as FP: ${unlabeledFlagged})`);
console.log(`precision=${precision.toFixed(3)}  CI=[${report.cd03_source_truth.precision_ci.lo.toFixed(3)},${report.cd03_source_truth.precision_ci.hi.toFixed(3)}]`);
console.log(`recall=${recall.toFixed(3)}  CI=[${report.cd03_source_truth.recall_ci.lo.toFixed(3)},${report.cd03_source_truth.recall_ci.hi.toFixed(3)}]`);
console.log(`f1=${f1.toFixed(3)}`);
if (detail.tp.length) console.log(`TP (correctly found dead): ${detail.tp.map((d) => d.symbol).join(", ")}`);
if (detail.fn.length) console.log(`FN (missed dead): ${detail.fn.map((d) => `${d.file}:${d.symbol}`).join(", ")}`);
if (detail.fp.length) console.log(`FP (${detail.fp.length}): ${detail.fp.map((d) => `${d.file}:${d.symbol}`).slice(0, 20).join(", ")}${detail.fp.length > 20 ? " ..." : ""}`);
console.log(`\nwrote ${outPath}`);
