#!/usr/bin/env node
// Deterministic grader for the code-diet benchmark corpus.
// This IS the reproducible evidence for the engineering note (SPEC §5).
// Floors are GENERIC defaults (public-safe); HWAI-tuned thresholds are the moat.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSource } from "../../mcp/source/services/code-diet-mcp/dist/detectors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(__dirname, "corpus");

const FLOORS = { precision: 0.9, recall: 0.9, clean_max_fp_rate: 0.05 };

function listCases() {
  const cases = [];
  for (const kind of ["slop", "clean"]) {
    const dir = path.join(CORPUS, kind);
    if (!fs.existsSync(dir)) continue;
    for (const c of fs.readdirSync(dir)) {
      const cdir = path.join(dir, c);
      if (fs.statSync(cdir).isDirectory()) cases.push({ kind, name: c, dir: cdir });
    }
  }
  return cases;
}

function runCase(c) {
  const sources = fs.readdirSync(c.dir).filter((f) => /\.(ts|js|mjs)$/.test(f));
  const texts = sources.map((f) => fs.readFileSync(path.join(c.dir, f), "utf8"));
  const expected = JSON.parse(fs.readFileSync(path.join(c.dir, "expected.json"), "utf8"));
  const findings = [];
  for (let i = 0; i < sources.length; i++) {
    for (const h of analyzeSource(texts[i], sources[i], { allSources: texts })) {
      findings.push({ ...h, file: sources[i] });
    }
  }
  const ids = findings.map((f) => f.id);
  const expectedIds = expected.expected_ids || [];
  const tp = expectedIds.filter((e) => ids.includes(e)).length;
  const fp = ids.filter((i) => !expectedIds.includes(i)).length;
  const fn = expectedIds.filter((e) => !ids.includes(e)).length;
  return { case: `${c.kind}/${c.name}`, expectedIds, ids, tp, fp, fn, findings_count: findings.length, max_hits: expected.max_hits };
}

const cases = listCases();
if (!cases.length) {
  console.error("no benchmark cases found");
  process.exit(2);
}

let sumTp = 0, sumFp = 0, sumFn = 0, cleanFpCases = 0, cleanCases = 0;
const rows = [];
for (const c of cases) {
  const r = runCase(c);
  rows.push(r);
  sumTp += r.tp; sumFp += r.fp; sumFn += r.fn;
  if (c.kind === "clean") {
    cleanCases++;
    if (r.findings_count > (r.max_hits ?? 0)) cleanFpCases++;
  }
}

const precision = sumTp + sumFp ? sumTp / (sumTp + sumFp) : 1;
const recall = sumTp + sumFn ? sumTp / (sumTp + sumFn) : 1;
const cleanFpRate = cleanCases ? cleanFpCases / cleanCases : 0;

console.log("case                 expected      found         tp fp fn");
for (const r of rows) {
  console.log(
    r.case.padEnd(20),
    JSON.stringify(r.expectedIds).padEnd(13),
    JSON.stringify(r.ids).padEnd(13),
    String(r.tp).padStart(2),
    String(r.fp).padStart(2),
    String(r.fn).padStart(2),
  );
}
console.log("\nmetrics:");
console.log(`  precision        ${precision.toFixed(3)}  (floor ${FLOORS.precision})`);
console.log(`  recall           ${recall.toFixed(3)}  (floor ${FLOORS.recall})`);
console.log(`  clean FP rate    ${cleanFpRate.toFixed(3)}  (floor ${FLOORS.clean_max_fp_rate})`);

const pass = precision >= FLOORS.precision && recall >= FLOORS.recall && cleanFpRate <= FLOORS.clean_max_fp_rate;
console.log(`\nverdict: ${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
