#!/usr/bin/env node
// Grader v2: per-class precision/recall/F1 + Wilson 95% CI + clean FP rate.
// Reads corpus_v2/clean (v2a) + corpus_v2/injected (v2b ground truth).
// Emits results/eval_v2_<date>.json + prints a RESULTS table.
// Polarity guard: any comparative claim must be checked against its CI before
// being stated directionally (eval-discipline-polarity-guard).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSource } from "../../mcp/source/services/code-diet-mcp/dist/detectors.js";
import { buildLanguageGraphOracle } from "./scripts/oracle.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname; // grade-v2.mjs lives at benchmarks/code-diet/
const CLEAN = path.join(ROOT, "corpus_v2/clean");
const INJECTED = path.join(ROOT, "corpus_v2/injected");
const REAL_AI = path.join(ROOT, "corpus_v2/real_ai");
const RESULTS = path.join(ROOT, "results");

const CD = ["CD01", "CD02", "CD03", "CD04", "CD05", "CD06"];
const FLOORS = { per_class_precision: 0.85, per_class_recall: 0.8, clean_fp_rate: 0.05 };

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

// ---- v2b injected: per-class recall + precision ----
const gt = JSON.parse(fs.readFileSync(path.join(INJECTED, "ground_truth.json"), "utf8")).items;
const gtByFile = new Map(); // file -> Set(class)
for (const it of gt) {
  if (!gtByFile.has(it.file)) gtByFile.set(it.file, new Set());
  gtByFile.get(it.file).add(it.class);
}

// Entry points (index.*, package.json exports targets) define the public API surface.
// CD03 must treat names re-exported from these as public API, not dead (eval v2 §5b).
function entryPointIdx(files) {
  const s = new Set();
  files.forEach((f, i) => {
    if (/(^|\/)(index|main|mod)\.(ts|js|mjs)$/.test(f.rel)) s.add(i);
  });
  return s;
}
function entryPointSources(files) {
  return files
    .filter((f) => /(^|\/)(index|main|mod)\.(ts|js|mjs)$/.test(f.rel))
    .map((f) => fs.readFileSync(f.full, "utf8"));
}

// scan injected files together (shared corpus for CD03 reference counting)
const injFiles = [...walkFiles(INJECTED)].filter((f) => f.rel !== "ground_truth.json");
const injTexts = injFiles.map((f) => fs.readFileSync(f.full, "utf8"));
const injEntry = entryPointSources(injFiles);
const injCorpusEntry = { texts: injTexts, entryIdx: entryPointIdx(injFiles) };
const injOracle = await buildLanguageGraphOracle(INJECTED);
const injFindingsByFile = new Map();
const injHitsByFile = new Map(); // file -> Finding[] (verdict+candidate split needs confidence)
for (let i = 0; i < injFiles.length; i++) {
  const hits = await analyzeSource(injTexts[i], injFiles[i].rel, { allSources: injTexts, publicApiSources: injEntry, corpusEntry: injCorpusEntry, ...(injOracle ? { languageGraphOracle: injOracle } : {}) });
  injFindingsByFile.set(injFiles[i].rel, new Set(hits.map((h) => h.id)));
  injHitsByFile.set(injFiles[i].rel, hits);
}

const perClass = {};
for (const cls of CD) {
  let tp = 0, fn = 0, fp = 0, candidates = 0;
  for (const f of injFiles) {
    const expected = gtByFile.get(f.rel) || new Set(["CLEAN"]);
    const hits = injHitsByFile.get(f.rel) || [];
    // Pre-registered contract (eval v2 §5e): on partial package slices, CD03
    // VERDICTS are only oracle-confirmed findings (confidence >= 0.85).
    // Text-only candidates are diagnostic and excluded from TP/FP accounting.
    const verdictHits = cls === "CD03" ? hits.filter((h) => h.confidence >= 0.85) : hits;
    const found = new Set(verdictHits.map((h) => h.id));
    if (cls === "CD03" && hits.some((h) => h.id === "CD03" && h.confidence < 0.85)) candidates++;
    const expHas = expected.has(cls);
    const foundHas = found.has(cls);
    if (expHas && foundHas) tp++;
    else if (expHas && !foundHas) fn++;
    else if (!expHas && foundHas && !expected.has("CLEAN")) fp++;
    else if (!expHas && foundHas && expected.has("CLEAN")) fp++; // FP on control
  }
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  perClass[cls] = {
    tp, fp, fn,
    precision, recall, f1,
    precision_ci: wilson(tp, tp + fp),
    recall_ci: wilson(tp, tp + fn),
    ...(cls === "CD03" ? { candidates } : {}),
  };
}

// ---- v2c real_ai: blind-labeled, per-class precision/recall + Wilson CI ----
// Blind labels come from an independent labeler with NO access to detectors/
// expected keys (blind-validation-when-author-contaminated). A file absent
// from blind_labels.json is treated as clean (no CD class present), same
// default-to-CLEAN convention as v2b's gtByFile lookup above.
const blindLabelsPath = path.join(REAL_AI, "blind_labels.json");
const blindLabels = fs.existsSync(blindLabelsPath)
  ? JSON.parse(fs.readFileSync(blindLabelsPath, "utf8"))
  : [];
const v2cByFile = new Map(); // file -> Set(class)
for (const it of blindLabels) {
  if (!v2cByFile.has(it.file)) v2cByFile.set(it.file, new Set());
  v2cByFile.get(it.file).add(it.class);
}

const realAiFiles = [...walkFiles(REAL_AI)].filter(
  (f) => f.rel !== "blind_labels.json" && f.rel !== "manifest.json"
);
const realAiTexts = realAiFiles.map((f) => fs.readFileSync(f.full, "utf8"));
const realAiEntry = entryPointSources(realAiFiles);
const realAiCorpusEntry = { texts: realAiTexts, entryIdx: entryPointIdx(realAiFiles) };
const realAiOracle = await buildLanguageGraphOracle(REAL_AI);
const realAiFindingsByFile = new Map();
const realAiHitsByFile = new Map();
for (let i = 0; i < realAiFiles.length; i++) {
  const hits = await analyzeSource(realAiTexts[i], realAiFiles[i].rel, { allSources: realAiTexts, publicApiSources: realAiEntry, corpusEntry: realAiCorpusEntry, ...(realAiOracle ? { languageGraphOracle: realAiOracle } : {}) });
  realAiFindingsByFile.set(realAiFiles[i].rel, new Set(hits.map((h) => h.id)));
  realAiHitsByFile.set(realAiFiles[i].rel, hits);
}

const perClassV2c = {};
for (const cls of CD) {
  let tp = 0, fn = 0, fp = 0, candidates = 0;
  for (const f of realAiFiles) {
    const expected = v2cByFile.get(f.rel) || new Set(["CLEAN"]);
    const hits = realAiHitsByFile.get(f.rel) || [];
    const verdictHits = cls === "CD03" ? hits.filter((h) => h.confidence >= 0.85) : hits;
    const found = new Set(verdictHits.map((h) => h.id));
    if (cls === "CD03" && hits.some((h) => h.id === "CD03" && h.confidence < 0.85)) candidates++;
    const expHas = expected.has(cls);
    const foundHas = found.has(cls);
    if (expHas && foundHas) tp++;
    else if (expHas && !foundHas) fn++;
    else if (!expHas && foundHas && !expected.has("CLEAN")) fp++;
    else if (!expHas && foundHas && expected.has("CLEAN")) fp++; // FP on control
  }
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  perClassV2c[cls] = {
    tp, fp, fn,
    precision, recall, f1,
    precision_ci: wilson(tp, tp + fp),
    recall_ci: wilson(tp, tp + fn),
    ...(cls === "CD03" ? { candidates } : {}),
  };
}

// ---- v2a clean: FP rate ----
const cleanFiles = [...walkFiles(CLEAN)].filter((f) => f.rel !== "manifest.json");
const cleanTexts = cleanFiles.map((f) => fs.readFileSync(f.full, "utf8"));
const cleanEntry = entryPointSources(cleanFiles);
const cleanCorpusEntry = { texts: cleanTexts, entryIdx: entryPointIdx(cleanFiles) };
let cleanWithFp = 0;
const cleanFpDetail = [];
const cleanOracle = await buildLanguageGraphOracle(CLEAN);
for (let i = 0; i < cleanFiles.length; i++) {
  const hits = await analyzeSource(cleanTexts[i], cleanFiles[i].rel, { allSources: cleanTexts, publicApiSources: cleanEntry, corpusEntry: cleanCorpusEntry, ...(cleanOracle ? { languageGraphOracle: cleanOracle } : {}) });
  if (hits.length > 0) {
    cleanWithFp++;
    cleanFpDetail.push({ file: cleanFiles[i].rel, ids: hits.map((h) => h.id) });
  }
}
const cleanFpRate = cleanFiles.length ? cleanWithFp / cleanFiles.length : 0;
const cleanFpCi = wilson(cleanWithFp, cleanFiles.length);

// ---- verdict ----
const report = {
  generated_at: new Date().toISOString(),
  floors: FLOORS,
  oracle_used: { v2b_injected: injOracle !== null, v2a_clean: cleanOracle !== null, v2c_real_ai: realAiOracle !== null },
  // Pre-registered contract (eval v2 §5e): on partial package slices the
  // language-graph oracle is an under-approximation of the real reference
  // graph, so a text finding that survives the oracle is a CANDIDATE, not a
  // VERDICT. CD03 verdicts are restricted to oracle-confirmed cases
  // (confidence >= 0.85); candidates (confidence < 0.85) are reported in
  // diagnostics only and never counted as TP/FP.
  cd03_contract: "verdicts on oracle-confirmed only; candidates are diagnostic (eval v2 §5e)",
  v2b: { files: injFiles.length, per_class: perClass },
  v2a: {
    files: cleanFiles.length,
    clean_fp_rate: cleanFpRate,
    clean_fp_ci: cleanFpCi,
    fp_files: cleanFpDetail,
  },
  v2c: {
    files: realAiFiles.length,
    blind_labeled_files: v2cByFile.size,
    per_class: perClassV2c,
  },
};
const classPass = CD.every((c) => perClass[c].precision >= FLOORS.per_class_precision && perClass[c].recall >= FLOORS.per_class_recall);
const cleanPass = cleanFpRate <= FLOORS.clean_fp_rate;
report.verdict = classPass && cleanPass ? "PASS" : "FAIL";
report.class_pass = classPass;
report.clean_pass = cleanPass;

fs.mkdirSync(RESULTS, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(RESULTS, `eval_v2_${stamp}.json`), JSON.stringify(report, null, 2));

// ---- print ----
console.log("== v2b injected (per-class) ==");
console.log("class   tp  fp  fn   P      R      F1     P-CI            R-CI");
for (const c of CD) {
  const r = perClass[c];
  const pci = `[${r.precision_ci.lo.toFixed(2)},${r.precision_ci.hi.toFixed(2)}]`;
  const rci = `[${r.recall_ci.lo.toFixed(2)},${r.recall_ci.hi.toFixed(2)}]`;
  console.log(
    `${c}   ${String(r.tp).padStart(2)} ${String(r.fp).padStart(3)} ${String(r.fn).padStart(3)}  ${r.precision.toFixed(2)}   ${r.recall.toFixed(2)}   ${r.f1.toFixed(2)}   ${pci.padEnd(14)}  ${rci}`
  );
}
console.log(`\n== v2a clean ==`);
console.log(`files=${cleanFiles.length}  FP-rate=${cleanFpRate.toFixed(3)} (floor ${FLOORS.clean_fp_rate})  CI=[${cleanFpCi.lo.toFixed(3)},${cleanFpCi.hi.toFixed(3)}]`);
if (cleanFpDetail.length) {
  console.log(`FP files (${cleanFpDetail.length}):`);
  for (const d of cleanFpDetail.slice(0, 15)) console.log(`  ${d.file}: ${d.ids.join(",")}`);
  if (cleanFpDetail.length > 15) console.log(`  ... +${cleanFpDetail.length - 15} more`);
}
console.log(`\n== v2c real_ai (blind-labeled, diagnostic only — not gated by pre-registered floors) ==`);
console.log(`files=${realAiFiles.length}  blind_labeled_files=${v2cByFile.size}`);
console.log("class   tp  fp  fn   P      R      F1     P-CI            R-CI");
for (const c of CD) {
  const r = perClassV2c[c];
  const pci = `[${r.precision_ci.lo.toFixed(2)},${r.precision_ci.hi.toFixed(2)}]`;
  const rci = `[${r.recall_ci.lo.toFixed(2)},${r.recall_ci.hi.toFixed(2)}]`;
  console.log(
    `${c}   ${String(r.tp).padStart(2)} ${String(r.fp).padStart(3)} ${String(r.fn).padStart(3)}  ${r.precision.toFixed(2)}   ${r.recall.toFixed(2)}   ${r.f1.toFixed(2)}   ${pci.padEnd(14)}  ${rci}`
  );
}
console.log(`\nverdict: ${report.verdict}  (class_pass=${classPass} clean_pass=${cleanPass}; v2c is diagnostic and not part of this verdict per pre-registered floors §4)`);
if (perClass.CD03?.candidates || perClassV2c.CD03?.candidates) {
  console.log(`CD03 contract: verdicts counted only when oracle-confirmed; text-only candidates (diagnostic): v2b=${perClass.CD03?.candidates || 0}, v2c=${perClassV2c.CD03?.candidates || 0}`);
}
process.exit(report.verdict === "PASS" ? 0 : 1);
