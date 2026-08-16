#!/usr/bin/env node
// Grader CD08 — stale-file detector measurement (detect_drift, #17).
//
// CD08 is driven by INJECTED git last-commit ages (spec §8: detectors never touch
// the filesystem/git). This grader computes the ages from real `git log` over the
// code-diet service's own source tree (a live, actively-developed repo), injects
// them, and measures:
//   FP-floor — files committed within the threshold (fresh): expect 0 CD08.
//   recall   — any genuinely old file (age > threshold): expect a CD08 warn.
// Because a healthy repo is mostly fresh, the meaningful number is the FP-floor
// (the detector must not cry "stale" on actively-maintained code).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { analyzeSource } from "../../mcp/source/services/code-diet-mcp/dist/detectors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const RESULTS = path.join(ROOT, "results");
// Measure on the mature clean corpus (zod + express: real OSS with varied commit ages),
// not only the fresh code-diet src — a fresh repo yields recall n/a.
const SRC = path.join(ROOT, "corpus_v2/clean/zod");
const THRESHOLD = 90;

function* walkFiles(dir, base = "") {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, e);
    const rel = base ? `${base}/${e}` : e;
    if (fs.statSync(full).isDirectory()) yield* walkFiles(full, rel);
    else if (/\.(ts|js|mjs)$/.test(e) && !e.endsWith(".d.ts")) yield { rel, full };
  }
}

// Real git last-commit age in days per file (the injected signal).
function gitAgeDays(absFile) {
  try {
    const out = execSync(`git log -1 --format=%ct -- "${absFile}"`, {
      cwd: path.dirname(absFile),
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim();
    if (!out) return null;
    const commitSec = Number(out);
    return Math.floor((Date.now() / 1000 - commitSec) / 86400);
  } catch {
    return null; // untracked / not in git -> no signal, detector inert
  }
}

const files = [...walkFiles(SRC)];
const fileGitAges = {};
for (const f of files) {
  const age = gitAgeDays(f.full);
  if (age !== null) fileGitAges[f.rel] = age;
}

const findings = [];
let fresh = 0;
let stale = 0;
for (const f of files) {
  const text = fs.readFileSync(f.full, "utf8");
  const hits = await analyzeSource(text, f.rel, {
    allSources: files.map((x) => fs.readFileSync(x.full, "utf8")),
    fileGitAges,
  });
  const cd08 = hits.filter((h) => h.id === "CD08");
  const age = fileGitAges[f.rel];
  if (age !== undefined && age > THRESHOLD) stale++;
  else if (age !== undefined) fresh++;
  for (const h of cd08) findings.push({ file: f.rel, ageDays: age, message: h.message });
}

// FP-floor: a CD08 finding on a file whose age is <= threshold is a false positive.
const fp = findings.filter((x) => x.ageDays !== undefined && x.ageDays <= THRESHOLD);
// recall: stale files that got flagged.
const staleFlagged = findings.filter((x) => x.ageDays !== undefined && x.ageDays > THRESHOLD);

const report = {
  generated_at: new Date().toISOString(),
  grader: "cd08",
  scope: "CD08 stale-file detector on the code-diet service's own src (detect_drift, #17)",
  threshold_days: THRESHOLD,
  signal: "git log -1 --format=%ct per file, injected as fileGitAges (spec §8 no-FS)",
  totals: { files: files.length, fresh_files: fresh, stale_files: stale },
  fp_floor: {
    contract: "CD08 on a file with age <= threshold is a false positive",
    findings: fp.length,
    pass: fp.length === 0,
    detail: fp,
  },
  recall: {
    contract: "a file with age > threshold gets a CD08 warn",
    stale_files: stale,
    flagged: staleFlagged.length,
    pass: stale === 0 ? "n/a (no stale files in a fresh repo)" : staleFlagged.length === stale ? true : false,
    detail: staleFlagged,
  },
};

fs.mkdirSync(RESULTS, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const outPath = path.join(RESULTS, `eval_cd08_${stamp}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log("== CD08 stale-file measurement ==");
console.log(`threshold: ${THRESHOLD}d; files: ${files.length} (fresh ${fresh}, stale ${stale})`);
console.log(`FP-floor: ${fp.length} findings on fresh files -> ${fp.length === 0 ? "PASS (0 FP)" : "FAIL"}`);
console.log(`recall: ${staleFlagged.length}/${stale} stale files flagged${stale === 0 ? " (n/a — fresh repo)" : ""}`);
if (findings.length) console.log(`  findings: ${findings.map((x) => `${x.file}(${x.ageDays}d)`).join(", ")}`);
console.log(`\nwrote ${outPath}`);
