// TDD verify-red: detectors do not exist yet. This test MUST fail first
// (assertion failure), then we implement src/detectors.ts to make it pass.
// Anti-pattern classes CD01-CD06 from notes/code_diet_mcp_spec.md.
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSource } from "../dist/detectors.js";

test("CD04 re-export plumbing: pure barrel file is flagged", () => {
  const src = `export { foo } from "./foo.js";\nexport { bar } from "./bar.js";\n`;
  const findings = analyzeSource(src, "index.ts");
  const cd04 = findings.filter((f) => f.id === "CD04");
  assert.ok(cd04.length >= 1, "expected a CD04 barrel-file finding");
});

test("CD02 guard-clause spam: function with many defensive guards is flagged", () => {
  const guards = Array.from({ length: 7 }, (_, i) => `  if (!a${i}) return null;`).join("\n");
  const src = `export function f(a0,a1,a2,a3,a4,a5,a6) {\n${guards}\n  return a0;\n}\n`;
  const findings = analyzeSource(src, "f.ts");
  assert.ok(findings.some((f) => f.id === "CD02"), "expected a CD02 guard-spam finding");
});

test("CD03 unrequested export: exported symbol with zero references is flagged", () => {
  const src = `export function neverUsed() { return 1; }\n`;
  const findings = analyzeSource(src, "u.ts", { allSources: [src] });
  assert.ok(findings.some((f) => f.id === "CD03"), "expected a CD03 unused-export finding");
});

test("clean referenced code yields no findings (false-positive floor)", () => {
  const lib = `export function add(a: number, b: number): number { return a + b; }\n`;
  const caller = `import { add } from "./lib.js";\nexport const total = add(1, 2);\n`;
  const findings = analyzeSource(lib, "lib.ts", { allSources: [lib, caller] });
  assert.equal(findings.length, 0, `expected 0 findings, got ${JSON.stringify(findings)}`);
});

test("CD03 does NOT flag TS types/interfaces (compile-time, no runtime refs)", () => {
  // Types are compile-time only; a text-grep for runtime refs always misses them.
  // Flagging them is the Category-D false positive found in dogfooding.
  const src = [
    `export interface OptimizeOptions { width?: number; }`,
    `export type OptimizationResult = { ok: boolean };`,
    `export interface TraceMetadata { id: string };`,
  ].join("\n");
  const findings = analyzeSource(src, "types.ts", { allSources: [src] });
  const cd03 = findings.filter((f) => f.id === "CD03");
  assert.equal(cd03.length, 0, `expected 0 CD03 on type-only exports, got ${JSON.stringify(cd03)}`);
});

test("CD01 abstraction bloat: interface with exactly 1 impl and no polymorphic use is flagged", () => {
  const src = [
    `export interface Shape { area(): number }`,
    `class Square implements Shape { area() { return 1; } }`,
    `const s = new Square(); s.area();`,
  ].join("\n");
  const findings = analyzeSource(src, "s.ts", { allSources: [src] });
  assert.ok(findings.some((f) => f.id === "CD01"), "expected a CD01 single-impl-interface finding");
});

test("CD01 clean: interface with 2+ implementations is NOT flagged", () => {
  const src = [
    `interface Shape { area(): number }`,
    `class Square implements Shape { area() { return 1; } }`,
    `class Circle implements Shape { area() { return 2; } }`,
    `function render(x: Shape) { return x.area(); }`,
  ].join("\n");
  const findings = analyzeSource(src, "s.ts", { allSources: [src] });
  assert.ok(!findings.some((f) => f.id === "CD01"), "expected no CD01 for polymorphic interface");
});

test("CD05 reinvention: helper duplicating stdlib padStart is flagged", () => {
  const src = [
    `export function leftPad(s: string, n: number, ch: string): string {`,
    `  let out = s; while (out.length < n) out = ch + out; return out;`,
    `}`,
    `const x = leftPad("5", 3, "0");`,
  ].join("\n");
  const findings = analyzeSource(src, "p.ts", { allSources: [src] });
  assert.ok(findings.some((f) => f.id === "CD05"), "expected a CD05 left-pad reinvention finding");
});

test("CD06 dead code: never-true condition is flagged", () => {
  const src = [
    `function f(x: number): number {`,
    `  if (x !== x) return -1;`,
    `  return x;`,
    `}`,
    `f(1);`,
  ].join("\n");
  const findings = analyzeSource(src, "d.ts", { allSources: [src] });
  assert.ok(findings.some((f) => f.id === "CD06"), "expected a CD06 never-true-condition finding");
});

test("CD06 dead code: if (false) constant branch is flagged", () => {
  const src = `function g() {\n  if (false) { doThing(); }\n  return 1;\n}\ng();`;
  const findings = analyzeSource(src, "d.ts", { allSources: [src] });
  assert.ok(findings.some((f) => f.id === "CD06"), "expected a CD06 if(false) finding");
});
