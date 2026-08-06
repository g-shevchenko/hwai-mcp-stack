// TDD verify-red: findings store does not exist yet.
// Cross-run dead-code memory (spec §2 runtime state): persist which findings a scan
// already surfaced so a later scan can annotate "seen before" (a still-unfixed dead
// export) vs "new". Local JSONL under the cache dir; aggregate-only, no code bodies.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FindingsStore, findingKey } from "../dist/findings_store.js";

function tmp() {
  return mkdtempSync(join(tmpdir(), "code-diet-store-"));
}

test("findingKey is stable and code-free (id + file + symbol, no message text)", () => {
  const k1 = findingKey({ id: "CD03", file: "a.ts", message: 'Exported symbol "foo" has no cross-file references (language-graph confirmed).' });
  const k2 = findingKey({ id: "CD03", file: "a.ts", message: 'Exported symbol "foo" has no cross-file references (language-graph confirmed).' });
  assert.equal(k1, k2, "same finding -> same key");
  const k3 = findingKey({ id: "CD03", file: "a.ts", message: 'Exported symbol "bar" has no cross-file references.' });
  assert.notEqual(k1, k3, "different symbol -> different key");
  assert.ok(!k1.includes("no cross-file"), "key must not embed raw message text");
});

test("record + load: a finding persisted in run 1 is seen in run 2", () => {
  const dir = tmp();
  const store = new FindingsStore(dir);
  const findings = [
    { id: "CD03", file: "lib.ts", line: 3, confidence: 0.85, message: 'Exported symbol "dead" ...' },
    { id: "CD04", file: "index.ts", line: 1, confidence: 0.8, message: "Barrel file ..." },
  ];
  store.recordScan(findings, "run-1");
  // New store instance over the same dir (cross-process / cross-run).
  const store2 = new FindingsStore(dir);
  const prior = store2.load();
  assert.ok(prior.has(findingKey(findings[0])), "CD03 finding must persist across runs");
  assert.ok(prior.has(findingKey(findings[1])), "CD04 finding must persist across runs");
});

test("seenBefore: annotates a finding that was already surfaced in a prior scan", () => {
  const dir = tmp();
  const store = new FindingsStore(dir);
  const dead = { id: "CD03", file: "lib.ts", line: 3, confidence: 0.85, message: 'Exported symbol "dead" ...' };
  store.recordScan([dead], "run-1");
  const store2 = new FindingsStore(dir);
  assert.equal(store2.seenBefore(dead), true, "still-unfixed dead export is seen-before");
  const fresh = { id: "CD03", file: "new.ts", line: 1, confidence: 0.5, message: 'Exported symbol "fresh" ...' };
  assert.equal(store2.seenBefore(fresh), false, "a new finding is not seen-before");
});

test("store tolerates a corrupt/empty file (never throws, starts empty)", () => {
  const dir = tmp();
  const store = new FindingsStore(dir);
  // No file yet -> empty set, no throw.
  assert.equal(store.load().size, 0);
  assert.equal(store.seenBefore({ id: "CD03", file: "x.ts", message: 'Exported symbol "y"' }), false);
});

test("recordScan appends a JSONL line per finding with ts + run id, not raw code", () => {
  const dir = tmp();
  const store = new FindingsStore(dir);
  store.recordScan([{ id: "CD06", file: "d.ts", line: 9, confidence: 0.7, message: "never-true" }], "run-xyz");
  const file = join(dir, "findings.jsonl");
  assert.ok(existsSync(file), "findings.jsonl must be written");
  const line = readFileSync(file, "utf8").trim().split("\n")[0];
  const rec = JSON.parse(line);
  assert.equal(rec.id, "CD06");
  assert.equal(rec.file, "d.ts");
  assert.equal(rec.run, "run-xyz");
  assert.ok(rec.key, "record carries the stable key");
  assert.ok(rec.ts, "record carries a timestamp");
  assert.ok(!("message" in rec), "record must NOT store the raw message (code-free, aggregate)");
});
