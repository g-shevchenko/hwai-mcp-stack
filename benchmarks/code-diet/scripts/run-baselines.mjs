#!/usr/bin/env node
// Baselines for eval v2 RQ3 (EVALUATION.md §3): knip, ts-prune, ESLint
// (no-unused-vars + no-unreachable) on the SAME corpus the detector is graded on.
//
// Scope contract (fairness): all three baselines only detect unused-export /
// unused-var / unreachable-code classes. The natural comparison axis is CD03
// (dead exports) + CD06 (dead/unreachable code). CD01/CD02/CD04/CD05 have no
// baseline analogue — that asymmetry is itself part of the RQ3 answer.
//
// Baselines are run on:
//   corpus_v2/_oss/<pkg>      — full OSS packages (knip needs whole-package scope)
//   corpus_v2/clean/hwai-*    — our prod slices
//   corpus_v2/real_ai         — blind-labeled AI code
// The injected corpus is a derived benchmark artifact (flat renamed copies, no
// package manifests), so baselines on it are NOT meaningful for CD03 recall;
// code-diet's v2b recall stands against injection ground truth instead.
//
// Output: results/baselines_<date>.json with per-tool, per-corpus findings and
// set overlap (Jaccard) vs code-diet findings vs ground truth where available.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RESULTS = path.join(ROOT, "results");
const BIN = path.join(ROOT, "node_modules", ".bin");

const stamp = new Date().toISOString().slice(0, 10);
const ESLINT_CONFIG = path.join(RESULTS, `eslint.baseline.${stamp}.config.mjs`);

// ---------- helpers ----------
function sh(bin, args, cwd) {
  try {
    const out = execFileSync(path.join(BIN, bin), args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, out };
  } catch (e) {
    // linters exit non-zero when they find issues — that is data, not failure.
    // knip exits 1 with findings on stdout AND plugin noise on stderr: keep streams
    // separate so stdout stays parseable (stderr must not pollute the JSON).
    return { ok: false, out: e.stdout || "", err: e.stderr || "", code: e.status };
  }
}

function* walkFiles(dir, base = "") {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, e);
    const rel = base ? `${base}/${e}` : e;
    if (e === "node_modules" || e === "dist") continue;
    if (fs.statSync(full).isDirectory()) yield* walkFiles(full, rel);
    else if (/\.(ts|js|mjs)$/.test(e)) yield { rel, full };
  }
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 1;
}

// ---------- knip ----------
function runKnip(dir) {
  // --strict: only the default issue types (files/exports/types), skips plugin
  // config loading (vitest etc.) which crashes on uninstalled dev deps in a corpus.
  const r = sh("knip", ["--reporter", "json", "--no-progress", "--strict"], dir);
  try {
    const j = JSON.parse(r.out);
    // knip json: { issues: [ {file, files:[], exports:[], types:[], ...} ] } or
    // legacy flat shape { files: [], exports: {file: []} } — support both.
    const findings = [];
    const issues = j.issues || [j];
    for (const iss of issues) {
      for (const f of iss.files || []) findings.push({ kind: "unused_file", file: typeof f === "string" ? f : f.name });
      const exp = iss.exports;
      if (Array.isArray(exp)) {
        for (const it of exp) findings.push({ kind: "unused_export", file: iss.file, name: it.name, line: it.line });
      } else if (exp && typeof exp === "object") {
        for (const [file, items] of Object.entries(exp)) {
          for (const it of items) findings.push({ kind: "unused_export", file, name: it.name, line: it.line });
        }
      }
    }
    return { available: true, findings };
  } catch {
    return { available: false, error: (r.err || r.out).slice(0, 500), findings: [] };
  }
}

// ---------- ts-prune ----------
function runTsPrune(dir) {
  const tsconfig = path.join(dir, "tsconfig.json");
  if (!fs.existsSync(tsconfig)) {
    return { available: false, error: "no tsconfig.json in scope", findings: [] };
  }
  const r = sh("ts-prune", ["-p", tsconfig], dir);
  // output: path:line - name ; ts-prune needs a tsconfig file path
  const findings = [];
  for (const line of r.out.split("\n")) {
    const m = line.match(/^(.+?):(\d+)\s+-\s+(\S+)/);
    if (m) findings.push({ kind: "unused_export", file: m[1], line: Number(m[2]), name: m[3] });
  }
  const crashed = /EISDIR|Error:/.test(r.out) && findings.length === 0;
  return { available: !crashed, error: crashed ? r.out.split("\n").find((l) => /Error/.test(l)) : undefined, findings, raw_lines: r.out.split("\n").length };
}

// ---------- eslint ----------
function runEslint(dirs) {
  fs.writeFileSync(
    ESLINT_CONFIG,
    `import tseslint from "typescript-eslint";
export default [{ files: ["**/*.{js,mjs,ts}"], languageOptions: { parser: tseslint.parser }, plugins: { "@typescript-eslint": tseslint.plugin }, rules: { "no-unused-vars": "off", "@typescript-eslint/no-unused-vars": ["error", { args: "none", varsIgnorePattern: "^_", caughtErrors: "none" }], "no-unreachable": "error" } }];\n`
  );
  const r = sh("eslint", ["--no-config-lookup", "--config", ESLINT_CONFIG, "-f", "json", ...dirs], ROOT);
  const findings = [];
  try {
    const j = JSON.parse(r.out);
    for (const f of j) {
      const rel = path.relative(ROOT, f.filePath);
      for (const m of f.messages || []) {
        if (m.ruleId === "@typescript-eslint/no-unused-vars" || m.ruleId === "no-unused-vars" || m.ruleId === "no-unreachable") {
          findings.push({ kind: m.ruleId, file: rel, line: m.line, message: m.message.slice(0, 120) });
        }
      }
    }
  } catch {
    return { available: false, error: r.out.slice(0, 500), findings };
  }
  return { available: true, findings };
}

// ---------- code-diet findings per scope (for overlap) ----------
import { analyzeSource } from "../../../mcp/source/services/code-diet-mcp/dist/detectors.js";

async function codeDietFindings(dir) {
  const files = [...walkFiles(dir)];
  const texts = files.map((f) => fs.readFileSync(f.full, "utf8"));
  const out = [];
  for (let i = 0; i < files.length; i++) {
    const hits = await analyzeSource(texts[i], files[i].rel, { allSources: texts });
    for (const h of hits) out.push({ file: files[i].rel, class: h.id, line: h.line });
  }
  return out;
}

// ---------- run ----------
// Scopes are per-package / per-slice roots because knip requires a package.json
// and ts-prune requires a tsconfig.json. Each scope is run with cwd=scope root.
const scopes = [];
const OSS = path.join(ROOT, "corpus_v2/_oss");
for (const pkg of ["commander.js", "express", "zod"]) {
  const d = path.join(OSS, pkg);
  if (fs.existsSync(path.join(d, "package.json"))) scopes.push({ name: `oss/${pkg}`, dir: d });
}
const CLEAN = path.join(ROOT, "corpus_v2/clean");
for (const sub of fs.readdirSync(CLEAN).sort()) {
  const d = path.join(CLEAN, sub);
  if (fs.statSync(d).isDirectory()) scopes.push({ name: `clean/${sub}`, dir: d });
}
scopes.push({ name: "real_ai", dir: path.join(ROOT, "corpus_v2/real_ai") });

const out = { generated_at: new Date().toISOString(), note: "baselines per package/slice scope; CD03/CD06 axis only; knip needs package.json, ts-prune needs tsconfig.json", scopes: {} };

for (const { name, dir } of scopes) {
  const knip = runKnip(dir);
  const tsprune = runTsPrune(dir);
  const eslint = runEslint([dir]);
  const knipSet = (knip.findings || []).map((f) => `${f.file}:${f.name || ""}`);
  const tspSet = (tsprune.findings || []).map((f) => `${f.file}:${f.name || ""}`);
  const esSet = (eslint.findings || []).map((f) => `${f.file}:${f.line}`);
  const diet = await codeDietFindings(dir);
  const dietCD03 = diet.filter((d) => d.class === "CD03").map((d) => d.file);
  const dietCD06 = diet.filter((d) => d.class === "CD06").map((d) => d.file);
  const knipFiles = [...new Set((knip.findings || []).map((f) => f.file).filter(Boolean))];
  const esFiles = [...new Set((eslint.findings || []).map((f) => path.relative(dir, path.join(ROOT, f.file))))];
  out.scopes[name] = {
    knip: { available: knip.available, count: (knip.findings || []).length, error: knip.error, sample: (knip.findings || []).slice(0, 10) },
    ts_prune: { available: tsprune.available, count: (tsprune.findings || []).length, error: tsprune.error, sample: (tsprune.findings || []).slice(0, 10) },
    eslint: { available: eslint.available, count: (eslint.findings || []).length, error: eslint.error, sample: (eslint.findings || []).slice(0, 10) },
    code_diet: { count: diet.length, cd03_files: dietCD03.length, cd06_files: dietCD06.length },
    overlap: {
      knip_tsprune_jaccard: jaccard(knipSet, tspSet),
      diet_cd03_vs_knip_filelevel_jaccard: jaccard(dietCD03, knipFiles),
      diet_cd03_cd06_vs_eslint_filelevel_jaccard: jaccard([...dietCD03, ...dietCD06], esFiles),
    },
  };
  console.log(`[${name}] knip=${out.scopes[name].knip.available ? out.scopes[name].knip.count : "n/a"} ts-prune=${out.scopes[name].ts_prune.available ? out.scopes[name].ts_prune.count : "n/a"} eslint=${out.scopes[name].eslint.available ? out.scopes[name].eslint.count : "n/a"}`);
}

fs.mkdirSync(RESULTS, { recursive: true });
fs.writeFileSync(path.join(RESULTS, `baselines_${stamp}.json`), JSON.stringify(out, null, 2));
console.log(`\nwrote results/baselines_${stamp}.json`);
