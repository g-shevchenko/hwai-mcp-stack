// Deterministic AI-slop detectors (CD01-CD06, notes/code_diet_mcp_spec.md §4).
// Pure functions over source text: no network, no LLM, re-runnable.
// Thresholds here are GENERIC DEFAULTS (public-safe); HWAI-tuned values are the moat
// and are injected via DetectorOptions.thresholds, never committed here.

export interface Finding {
  id: "CD01" | "CD02" | "CD03" | "CD04" | "CD05" | "CD06";
  line: number;
  confidence: number;
  message: string;
  suggested_action: string;
}

export interface DetectorThresholds {
  guard_spam_min: number; // CD02: guards in one function above this is spam
}

export interface DetectorOptions {
  allSources?: string[]; // other repo sources, for reference counting (CD03)
  thresholds?: Partial<DetectorThresholds>;
}

const DEFAULT_THRESHOLDS: DetectorThresholds = {
  guard_spam_min: 5,
};

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

// CD04 — re-export plumbing: a file that ONLY re-exports (barrel), no local logic.
export function detectReExportPlumbing(text: string): Finding[] {
  const lines = text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("//"));
  if (lines.length === 0) return [];
  const reExport = /^\s*export\s*(\{[^}]*\}|\*\s*(?:as\s+\w+)?)\s*from\s*["'][^"']+["']\s*;?\s*$/;
  const allReExport = lines.every((l) => reExport.test(l));
  if (!allReExport) return [];
  return [
    {
      id: "CD04",
      line: 1,
      confidence: 0.8,
      message: `Barrel file: all ${lines.length} non-empty lines are pure re-exports with no added value.`,
      suggested_action: "Import from the concrete module directly; delete the barrel or give it a real responsibility.",
    },
  ];
}

// CD02 — guard-clause / fallback spam: a function body packed with defensive early returns.
// Window = one function body (to the closing brace at the same indent), not a fixed char
// slice — a fixed window leaks guards from sibling functions and flags parsers as spam.
export function detectGuardSpam(text: string, min: number): Finding[] {
  const findings: Finding[] = [];
  const fnStart = /(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = fnStart.exec(text))) {
    const bodyStart = m.index + m[0].length - 1; // at the opening brace
    const body = extractBracedBody(text, bodyStart);
    if (!body) continue;
    const guards = (body.match(/if\s*\([^)]*\)\s*(?:return|throw)\b/g) || []).length;
    if (guards >= min) {
      findings.push({
        id: "CD02",
        line: lineOf(text, m.index),
        confidence: 0.7,
        message: `${guards} defensive guard/throw clauses in one function (threshold ${min}).`,
        suggested_action: "Collapse guards; validate once at the boundary; let the happy path read first.",
      });
    }
  }
  return findings;
}

// Return the text inside the braces starting at `openIndex` (which must be '{').
// Balanced-brace scan; returns null if unbalanced.
function extractBracedBody(text: string, openIndex: number): string | null {
  if (text[openIndex] !== "{") return null;
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return null;
}

function exportedNames(text: string): string[] {
  const names = new Set<string>();
  // CD03 measures RUNTIME references. TS type-only exports (interface / type) have no
  // runtime refs, so a text-grep always misses them -> false positive (dogfood Category D).
  // Only value exports (function/class/const/let/var/enum) are checked for dead refs.
  const decl = /\bexport\s+(?:default\s+)?(?:async\s+)?(function|class|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = decl.exec(text))) names.add(m[2]);
  return [...names];
}

// CD03 — unrequested export: exported symbol never referenced anywhere in the corpus.
export function detectUnusedExports(text: string, allSources: string[]): Finding[] {
  const findings: Finding[] = [];
  const corpus = allSources.length ? allSources : [text];
  for (const name of exportedNames(text)) {
    const ref = new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\b`, "g");
    let count = 0;
    for (const src of corpus) count += (src.match(ref) || []).length;
    // 1 occurrence = the declaration itself; >1 means referenced somewhere.
    if (count <= 1) {
      findings.push({
        id: "CD03",
        line: lineOf(text, text.indexOf(name)),
        confidence: 0.6,
        message: `Exported symbol "${name}" has no references in the scanned corpus.`,
        suggested_action: "Delete it, or un-export if it is only used locally. Verify with language-graph before removal.",
      });
    }
  }
  return findings;
}

// CD01 — abstraction bloat: interface with exactly 1 implementation and no
// polymorphic usage (the interface is never used as a TYPE elsewhere). A 1:1
// interface adds an indirection layer with no abstraction payoff.
export function detectAbstractionBloat(text: string, allSources: string[]): Finding[] {
  const findings: Finding[] = [];
  const corpus = allSources.length ? allSources : [text];
  const ifaceRe = /\binterface\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = ifaceRe.exec(text))) {
    const name = m[1];
    let implCount = 0;
    let typeUseCount = 0;
    for (const src of corpus) {
      implCount += (src.match(new RegExp(`\\bimplements\\s+${name}\\b`, "g")) || []).length;
      // polymorphic use = the interface name appears as a type annotation / generic arg
      typeUseCount += (src.match(new RegExp(`[:<(,]\\s*${name}\\b`, "g")) || []).length;
    }
    if (implCount === 1 && typeUseCount === 0) {
      findings.push({
        id: "CD01",
        line: lineOf(text, m.index),
        confidence: 0.55,
        message: `Interface "${name}" has exactly 1 implementation and no polymorphic type usage.`,
        suggested_action: "Inline the interface into its single implementor, or add a second implementation to justify the abstraction.",
      });
    }
  }
  return findings;
}

// CD05 — reinvention: helper duplicating a stdlib capability. Conservative allowlist
// of well-known "reinvented" helpers (left-pad class). Named-match on the function +
// a manual-loop body heuristic to keep FP low.
const REINVENTION_PATTERNS: { re: RegExp; stdlib: string }[] = [
  { re: /\b(?:export\s+)?function\s+(leftPad|padLeft)\s*\(/, stdlib: "String.prototype.padStart" },
  { re: /\b(?:export\s+)?function\s+(rightPad|padRight)\s*\(/, stdlib: "String.prototype.padEnd" },
];

export function detectReinvention(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const { re, stdlib } of REINVENTION_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    findings.push({
      id: "CD05",
      line: lineOf(text, m.index),
      confidence: 0.65,
      message: `Helper "${m[1]}" reinvents ${stdlib}.`,
      suggested_action: `Replace with ${stdlib} (stdlib, no new dependency).`,
    });
  }
  return findings;
}

// CD06 — dead code: never-true condition (constant-false guard) makes a branch
// unreachable. Conservative: only constant / self-inequality patterns.
const NEVER_TRUE = [
  /\bif\s*\(\s*false\s*\)/,
  /\bif\s*\(\s*0\s*\)/,
  /\bif\s*\(\s*null\s*\)/,
  /\bif\s*\(\s*undefined\s*\)/,
  /\bif\s*\(\s*""\s*\)/,
  /\bif\s*\(\s*''\s*\)/,
  /\bif\s*\(\s*([A-Za-z_$][\w$]*)\s*!==\s*\1\s*\)/, // x !== x (NaN check done wrong)
];

export function detectDeadCode(text: string): Finding[] {
  const findings: Finding[] = [];
  for (const re of NEVER_TRUE) {
    const m = re.exec(text);
    if (!m) continue;
    findings.push({
      id: "CD06",
      line: lineOf(text, m.index),
      confidence: 0.7,
      message: `Never-true condition "${m[0]}" makes the branch unreachable.`,
      suggested_action: "Remove the dead branch, or fix the condition if it was meant to be reachable.",
    });
  }
  return findings;
}

export function analyzeSource(text: string, _path = "<input>", options: DetectorOptions = {}): Finding[] {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const allSources = options.allSources || [text];
  return [
    ...detectReExportPlumbing(text),
    ...detectGuardSpam(text, thresholds.guard_spam_min),
    ...detectUnusedExports(text, allSources),
    ...detectAbstractionBloat(text, allSources),
    ...detectReinvention(text),
    ...detectDeadCode(text),
  ];
}
