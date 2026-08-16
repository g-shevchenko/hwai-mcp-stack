#!/usr/bin/env node
// Merge per-package blind-label fragments into truth_table_v3.json + truth_table_v3.md.
// Fragments: truth_frag_zod.json, truth_frag_express_commander.json, truth_frag_hwai.json
// (produced by independent blind labelers per LABELING_PROTOCOL.md).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRAGS = ["truth_frag_zod.json", "truth_frag_express_commander.json", "truth_frag_hwai.json"];

const merged = {};
let totalVs = 0;
let totalFp = 0;
let totalNf = 0;
const perPkg = {};

for (const frag of FRAGS) {
  const p = path.join(__dirname, frag);
  if (!fs.existsSync(p)) {
    console.error(`missing fragment: ${frag}`);
    process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const [file, labels] of Object.entries(data)) {
    if (merged[file]) {
      console.error(`duplicate file key across fragments: ${file}`);
      process.exit(2);
    }
    merged[file] = labels;
    const pkg = file.split("/")[0];
    perPkg[pkg] = perPkg[pkg] || { files: 0, vs: 0, fp: 0, nf: 0 };
    perPkg[pkg].files++;
    const vs = (labels.verdict_source || []).length;
    const fp = (labels.detector_fp || []).length;
    const nf = (labels.not_findings || []).length;
    perPkg[pkg].vs += vs;
    perPkg[pkg].fp += fp;
    perPkg[pkg].nf += nf;
    totalVs += vs;
    totalFp += fp;
    totalNf += nf;
  }
}

const table = {
  corpus: "v3",
  labeled_at: new Date().toISOString().slice(0, 10),
  protocol: "LABELING_PROTOCOL.md (blind, per LABELING_PROTOCOL; merged from per-package fragments)",
  files: merged,
};
fs.writeFileSync(path.join(__dirname, "truth_table_v3.json"), JSON.stringify(table, null, 2));

// Human-readable summary with 5 verdict_source examples.
const examples = [];
for (const [file, labels] of Object.entries(merged)) {
  for (const s of labels.verdict_source || []) {
    examples.push(`- \`${file}\` → \`${s}\``);
    if (examples.length >= 5) break;
  }
  if (examples.length >= 5) break;
}

const md = `# v3 truth table — CD03 source-truth labels (blind-labeled)

Produced by independent blind labelers per \`LABELING_PROTOCOL.md\` (no detector/grader/results access), merged from per-package fragments. Merged ${table.labeled_at}.

## Totals

| label | count |
|---|---|
| verdict_source (genuinely dead exports) | ${totalVs} |
| detector_fp (real cross-file reference exists) | ${totalFp} |
| not_findings (out of CD03 scope) | ${totalNf} |

## Per-package

| package | files | verdict_source | detector_fp | not_findings |
|---|---|---|---|---|
${Object.entries(perPkg)
  .map(([k, v]) => `| ${k} | ${v.files} | ${v.vs} | ${v.fp} | ${v.nf} |`)
  .join("\n")}

## verdict_source examples (first 5)

${examples.join("\n") || "(none)"}
`;
fs.writeFileSync(path.join(__dirname, "truth_table_v3.md"), md);

console.log(`merged ${Object.keys(merged).length} files from ${FRAGS.length} fragments`);
console.log(`verdict_source=${totalVs}  detector_fp=${totalFp}  not_findings=${totalNf}`);
console.log("wrote truth_table_v3.json + truth_table_v3.md");
