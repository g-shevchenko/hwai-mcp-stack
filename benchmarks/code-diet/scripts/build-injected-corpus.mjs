#!/usr/bin/env node
// Corpus v2b: inject CD01-CD06 anti-patterns into clean files. Ground truth is
// KNOWN BY CONSTRUCTION (the injection log) -> recall is directly measurable.
// Deterministic (seeded) so the corpus is reproducible.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CLEAN = path.join(ROOT, "corpus_v2/clean");
const OUT = path.join(ROOT, "corpus_v2/injected");

// tiny seeded PRNG for reproducible selection
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260805);

const CD = ["CD01", "CD02", "CD03", "CD04", "CD05", "CD06"];

// injectors return { text, marker } — marker is the line substring the grader
// uses to confirm the detector fired at (or near) the injected site.
const INJECTORS = {
  // CD01: interface with exactly 1 impl, no polymorphic use.
  // Detector requires: no [:<(,]<Iface> type usage AND exactly 1 `implements`.
  // Instantiate via `new Impl()` so the interface name never appears as a type.
  CD01: (text) => {
    const n = R();
    return {
      text:
        text +
        `\nexport interface InjectedShape_${n} { area(): number }\n` +
        `class InjectedSquare_${n} implements InjectedShape_${n} { area() { return 1; } }\n` +
        `const _injS_${n} = new InjectedSquare_${n}(); _injS_${n}.area();\n`,
    };
  },
  // CD02: one function packed with guards
  CD02: (text) => ({
    text:
      text +
      `\nexport function injectedGuard_${R()}(a,b,c,d,e,f,g) {\n` +
      `  if (!a) return null; if (!b) return null; if (!c) return null;\n` +
      `  if (!d) return null; if (!e) return null; if (!f) return null; if (!g) return null;\n` +
      `  return a;\n}\n`,
  }),
  // CD03: exported symbol never referenced
  CD03: (text) => ({
    text: text + `\nexport function injectedUnused_${R()}() { return 42; }\n`,
  }),
  // CD04: pure barrel (append a barrel file — handled specially below)
  CD04: null,
  // CD05: leftPad reinvention. Detector matches the literal name (leftPad|padLeft),
  // so the injected helper must use the exact name (no suffix).
  CD05: (text) => ({
    text:
      text +
      `\nexport function leftPad(s, n, ch) { let o = s; while (o.length < n) o = ch + o; return o; }\n` +
      `const _injP_${R()} = leftPad("5", 3, "0");\n`,
  }),
  // CD06: never-true condition
  CD06: (text) => ({
    text: text + `\nfunction _injF_${R()}(x) { if (x !== x) return -1; return x; }\n_injF_${R()}(1);\n`,
  }),
};
let _r = 0;
function R() { return Math.floor(rand() * 1e6).toString(36); }

function listCleanFiles() {
  const out = [];
  for (const src of fs.readdirSync(CLEAN)) {
    const sd = path.join(CLEAN, src);
    if (!fs.statSync(sd).isDirectory()) continue;
    for (const f of fs.readdirSync(sd)) {
      if (/\.(ts|js|mjs)$/.test(f)) out.push({ source: src, file: `${src}/${f}`, full: path.join(sd, f) });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const clean = listCleanFiles();
const log = []; // ground truth
const PER_CLASS = 12;

// CD01/02/03/05/06: inject into a clean file copy
for (const cls of CD.filter((c) => c !== "CD04")) {
  const pool = [...clean];
  for (let i = 0; i < PER_CLASS && pool.length; i++) {
    const idx = Math.floor(rand() * pool.length);
    const pick = pool.splice(idx, 1)[0];
    const orig = fs.readFileSync(pick.full, "utf8");
    const inj = INJECTORS[cls](orig);
    const rel = `${cls.toLowerCase()}-${i}-${pick.file.replace(/[\\/]/g, "__")}`;
    const dest = path.join(OUT, rel);
    fs.writeFileSync(dest, inj.text);
    log.push({ class: cls, file: rel, origin: pick.file });
  }
}

// CD04: standalone barrel files referencing real clean modules
for (let i = 0; i < PER_CLASS; i++) {
  const rel = `cd04-${i}-barrel.ts`;
  fs.writeFileSync(
    path.join(OUT, rel),
    `export { z } from "./somewhere.js";\nexport { default as x } from "./other.js";\n`
  );
  log.push({ class: "CD04", file: rel, origin: null });
}

// also copy a set of untouched clean files as injected-set negatives (control)
const control = clean.slice(0, 20);
for (const c of control) {
  const rel = `control-${c.file.replace(/[\\/]/g, "__")}`;
  fs.copyFileSync(c.full, path.join(OUT, rel));
  log.push({ class: "CLEAN", file: rel, origin: c.file });
}

fs.writeFileSync(path.join(OUT, "ground_truth.json"), JSON.stringify({ built_at: new Date().toISOString(), items: log }, null, 2));
const counts = {};
for (const l of log) counts[l.class] = (counts[l.class] || 0) + 1;
console.log("injected corpus built:", log.length, "items");
console.log("  per class:", JSON.stringify(counts));
