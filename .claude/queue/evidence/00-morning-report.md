# Morning report — code-diet scientific eval finish (night 2026-08-06)

Queue: `.claude/queue/tasks.md` (8 items). Branch: `cursor/code-mcp-stack` (no public
pushes made; `g-shevchenko/mcp-token-savers` / `hwai-code-savers` scaffolds untouched —
`no_moat_leak.mjs` was not applicable, no task touched public-bound material).

## 1. Completed items (7 of 8, all before this report)

| # | Task | Result | Commit(s) |
|---|---|---|---|
| 1 | Commit finished language-graph oracle + eval v2 protocol/corpora/grader/baselines | `grade-v2.mjs` matched the pre-registered §5d boundary exactly (clean FP 0.100, CD03 P 0.39, verdict FAIL — expected, not a regression); `detectors.test.mjs` 15/15 pass | `95bf60b`, `e43105a` |
| 2 | Blind-label corpus v2c (30 real-AI files), no key access, no source/grader access | 1 CD03 finding (`vision-mcp/artifact-store.ts:16`), 0 for all other classes; `blind_labels.json` committed alone | `86f419c` |
| 3 | Extend grader for v2c + full run | Added `v2c` section (same TP/FP/FN + Wilson CI logic as v2b) to `grade-v2.mjs`; diagnostic only, not gated. Full output captured to `results/eval_v2_full_2026-08-06.txt` | `7d7d98a` |
| 4 | `RESULTS.md` — measured-state synthesis | 339-line doc: v2a/v2b/v2c tables, RQ3 baseline overlap, polarity guard (2 claims de-directionalized), threats to validity, repro commands | `96d9d73` |
| 5 | `EVALUATION.md` §7 status flip + §5f v2c subsection | All phase-done conditions marked true; contamination-log statement recorded (no detector change after blind labels existed) | `73b04a0` |
| 6 | vision-mcp `knowledge-rag.ts` fate decision | **REMOVE** (dead since initial commit, taxonomy mismatch with real pipeline, >100-line wiring cost, target `KNOWLEDGE_BASE.md` doesn't exist in repo). Build clean, 3/3 new tests pass, stdio smoke lists all 9 tools | `1a83b8c` |
| 7 | CD03 template-literal FP (pre-registered regression gate) | Reproduced on real prod dogfood source (`repo-quality-gate-mcp/scripts/benchmark-local.mjs`); TDD red→green fix (`blankTemplateLiterals()`), self-caught and fixed a secondary regression during verification; clean FP rate confirmed unchanged at 0.100 vs baseline | `76334d3` |

Each task also has its own queue-bookkeeping commit (`tasks.md` checkbox + evidence
packet) immediately following the content commit above — see `git log` for the full
interleave.

## 2. Stopped items

None. No task required secrets, payments, production deploy, DNS, destructive deletes,
legal judgment, or an owner-taste/strategy call that would have blocked it — task 6's
WIRE-vs-REMOVE decision was made mechanically via the task's own pre-registered
decision rule (>100 lines of plumbing ⇒ REMOVE), not an open taste call.

## 3. Files changed (by task)

- **Task 1**: `code-diet-mcp/src/{detectors.ts,index.ts}`, `code-diet-mcp/test/detectors.test.mjs`, `language-graph-mcp/{package.json,src/graph.ts}` (commit a); `benchmarks/code-diet/**` — EVALUATION.md, grade-v2.mjs, package.json/lock, `corpus_v2/{clean,injected,real_ai}/**`, `scripts/**`, `results/**`, new `.gitignore` (commit b, 240 files).
- **Task 2**: `benchmarks/code-diet/corpus_v2/real_ai/blind_labels.json` (new, 1 entry).
- **Task 3**: `benchmarks/code-diet/grade-v2.mjs`, `results/eval_v2_2026-08-06.json`, `results/eval_v2_full_2026-08-06.txt` (new).
- **Task 4**: `benchmarks/code-diet/RESULTS.md` (new).
- **Task 5**: `benchmarks/code-diet/EVALUATION.md` (§5f + §7 only).
- **Task 6**: deleted `vision-mcp/src/knowledge-rag.ts` (245 lines); new `vision-mcp/test/tools-list.test.mjs`.
- **Task 7**: `code-diet-mcp/src/detectors.ts`, `code-diet-mcp/test/detectors.test.mjs`, `benchmarks/code-diet/EVALUATION.md` (§5c row 5), `benchmarks/code-diet/results/eval_v2_2026-08-06.json` (regenerated).
- **Task 8 (this task)**: `.claude/queue/evidence/00-morning-report.md` (new), `benchmarks/code-diet/EVALUATION.md` (title line only).

No file outside `benchmarks/code-diet/`, `mcp/source/services/code-diet-mcp/`,
`mcp/source/services/language-graph-mcp/`, `mcp/source/services/vision-mcp/`, and
`.claude/queue/` was touched all night.

## 4. Checks passed / failed

| Task | Check | Result |
|---|---|---|
| 1 | `node grade-v2.mjs` | verdict **FAIL** — matches pre-registered §5d boundary exactly (clean FP 0.100, CD03 P 0.39); expected, not a regression |
| 1 | `node --test code-diet-mcp/test/detectors.test.mjs` | **15/15 pass** |
| 2 | `node -e "require('./blind_labels.json')"` + file-count check | parsed clean, 30/30 files match manifest |
| 3 | `node grade-v2.mjs` (extended), `node -c grade-v2.mjs`, `node --test detectors.test.mjs` | grader syntax OK, run captured; detectors untouched, 15/15 still pass |
| 4 | numeric cross-check of every quoted figure against source JSON | all matched; no test suite applies (doc-only) |
| 5 | numeric cross-check (3-way: RESULTS.md / task-3 packet / JSON) | all matched; no test suite applies (doc-only) |
| 6 | `npm run build`, `node --test vision-mcp/test/*.mjs`, stdio `tools/list` smoke | build clean; **3/3 pass**; 9/9 tools listed, no stderr errors |
| 7 | TDD red (`2/17 fail` as expected) → green (`17/17`) → self-caught regression → green (`18/18`); `node grade-v2.mjs` final re-run | **18/18 pass**; clean FP rate 0.100 identical to pre-task-7 baseline — confirmed no regression |

Overall `grade-v2.mjs` verdict remains **FAIL** end-to-end tonight — this is the
pre-registered, already-documented CD03-precision-ceiling boundary (§5b/§5d), not a
new failure introduced by any of tasks 1–7.

## 5. v2c blind-label headline numbers (real AI-generated code, N=30, 1 blind finding)

Final state, after task 7's fix (`results/eval_v2_2026-08-06.json` → `v2c`):

| class | tp | fp | fn | precision | recall | 95% CI (P) | 95% CI (R) |
|---|---|---|---|---|---|---|---|
| CD03 | 0 | 12 | 1 | **0.00** | **0.00** | [0.00, 0.24] | [0.00, 0.79] |
| CD01/CD02/CD04/CD05/CD06 | 0 | 0 | 0 | 1.00* | 1.00* | [0.00, 0.00] | [0.00, 0.00] |

\* Grader's divide-by-zero convention on n=0 — **zero statistical power**, not evidence
of accuracy (per RESULTS.md's polarity guard, this is explicitly *not* published as
"100% accurate"). The one real signal is CD03: on 30 real production MCP-service
files, code-diet's CD03 detector fired 12 times where the blind labeler did not flag
CD03, and missed the 1 genuine CD03 finding. This confirms — on an independent,
externally-labeled sample — the same CD03 precision ceiling already measured on the
injected corpus (v2b: P=0.39, CI [0.24, 0.56]), and the real-AI number lands even
lower (within a wide CI due to small N).

## 6. Next recommended human decision (Greg)

**Public engineering note readiness: not yet, on accuracy grounds — but publishable now as a scoped "measured, not marketing" methodology note.**

- CD03 (unreferenced-export detector) is below its 0.85 precision floor on **both**
  independent samples measured tonight — injected (0.39, CI [0.24,0.56]) and blind-labeled
  real AI code (0.00, CI [0.00,0.24]). This is a text-heuristic ceiling (cross-file/
  cross-service consumers outside the sample look "unreferenced"), not a bug fixable by
  further regex tuning — task 7 already fixed the one reproducible template-literal FP
  class and confirmed no effect on this ceiling.
- The other 5 classes (CD01/CD02/CD04/CD05/CD06) are strong on the injected corpus
  (P/R ≥ 0.86, mostly 1.00) but carry **zero statistical power on v2c** (no real-AI
  positive examples were found in the 30-file sample) — any public claim about them
  on real-world code would be unsupported by tonight's evidence.
- Recommended options for Greg to choose between (owner-taste call, correctly out of
  scope for this queue):
  1. **Hold** the note until CD03 gets a real fix (language-graph-backed cross-file
     export/reference resolution, not incremental regex tuning) — costlier but removes
     the biggest known gap before going public.
  2. **Publish now**, scoped explicitly: "5/6 classes strong on synthetic-injection
     recall/precision; CD03 has a known, measured precision ceiling on both synthetic
     and real AI code; here are the exact numbers and CIs" — consistent with the
     polarity-guard discipline already applied throughout `RESULTS.md`.
- Secondary, non-blocking gaps to flag alongside whichever option is chosen (all
  already logged in task 1/4 evidence, not new): `corpus_v2/_oss/` is gitignored so a
  fresh clone can't reproduce baselines without a re-fetch step; `corpus_v2/clean/manifest.json`
  lists 110 files but the grader scores 100 (gap noted, not root-caused); `EVALUATION.md`
  §6 references an `npm run eval:v2` entrypoint that does not exist in
  `benchmarks/code-diet/package.json`.

## 7. EVALUATION.md status flip

Tasks 2, 3, 4, 5 are all marked `[✓]` in `.claude/queue/tasks.md` (confirmed by reading
the queue file directly, not inferred) — condition met, so `benchmarks/code-diet/EVALUATION.md`'s
title-line status was flipped from `Status: **design**` to `Status: **measured**` as
part of this task (see commit below). This aligns the document with `RESULTS.md`, which
already opened with `Status: **measured**` since task 4.

## 8. Remaining risks (carried forward from tasks 1–7, condensed)

- CD03's text-heuristic precision ceiling is a known, measured, unresolved limitation —
  not a defect introduced tonight, but the primary blocker for an unscoped public
  accuracy claim (see §6).
- v2c's N=30 (1 blind finding) is small; the CD03 CI is wide ([0.00, 0.24]) and the
  5 zero-instance classes carry no statistical power — any narrative must state this.
- The blind labeler (task 2) made a documented judgment call to not flag ~28
  "unreferenced-within-sample" exports it judged likely to have out-of-sample
  consumers; under a stricter literal labeling rule, v2c's true CD03 precision could
  differ from 0.00 in either direction. This is a labeling-methodology risk, not a
  grader or detector bug.
- `corpus_v2/_oss/` reproducibility gap, the 110-vs-100 clean-corpus file-count gap, and
  the missing `npm run eval:v2` script are all open items for whoever finalizes the
  engineering note (see §6).
- No secrets, payments, production deploys, DNS, or destructive actions were involved
  in any task tonight, including this one.

## Commit

This report and the `EVALUATION.md` title-line flip are committed together as this
task's single commit — see `git log` for the hash (`code-diet: task 8 — morning report
+ EVALUATION.md status flip to measured`).
