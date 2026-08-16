# Task 4 evidence packet

## Task text (verbatim from queue)

> Task 4 — RESULTS.md. Write benchmarks/code-diet/RESULTS.md synthesizing the measured state from EVALUATION.md §5b-§5e + results/eval_v2_*.json + results/baselines_*.json + the task-3 v2c numbers: per-class P/R/F1 with Wilson CI (v2b + v2c), clean FP rate (v2a), baselines overlap (RQ3), polarity guard applied to every comparative claim (if CI crosses zero, publish the bound not the direction), threats to validity, reproducibility commands. This is the measurement backbone of the future engineering note — numbers only, no marketing. Commit. Evidence: section list + any claim that had to be de-directionalized by the polarity guard.

## Files changed

- `benchmarks/code-diet/RESULTS.md` — new file (339 lines). Synthesizes:
  - `benchmarks/code-diet/EVALUATION.md` §5b–§5e (scope-limit finding,
    iteration log, language-graph oracle integration, baselines measured);
  - `benchmarks/code-diet/results/eval_v2_2026-08-06.json` (v2a/v2b/v2c
    per-class TP/FP/FN/precision/recall/F1 + Wilson CI, `oracle_used` flags);
  - `benchmarks/code-diet/results/eval_v2_2026-08-05.json` (pre-oracle
    text-only FP-rate CI, used for the §4 oracle-effect comparison);
  - `benchmarks/code-diet/results/baselines_2026-08-06.json` (knip/ts-prune/
    ESLint per-scope findings + Jaccard overlap, RQ3);
  - task 3's evidence packet numbers (v2c per-class table, already committed
    at `7d7d98a`), cross-checked against the JSON rather than re-typed blind.
- `.claude/queue/tasks.md` — Task 4 line flipped `[ ]` → `[x]` (this edit is
  bundled into the queue-bookkeeping commit below, not the RESULTS.md commit,
  matching the pattern used by tasks 1–3).

No detector, grader, or corpus file was touched — this task only reads
already-committed measurement artifacts and writes a synthesis document.

## Checks run

- Cross-checked every number quoted in RESULTS.md against its source file
  before writing (not transcribed from memory):
  - v2a/v2b/v2c per-class tables against `results/eval_v2_2026-08-06.json`
    (`python3 -m json.tool` inspection of the `v2a`/`v2b`/`v2c` keys).
  - Baseline counts and Jaccard values against
    `results/baselines_2026-08-06.json` (`scopes.*` keys for
    oss/commander.js, oss/express, oss/zod, clean/*, real_ai).
  - Corpus sizes (100 / 92 / 30) against `corpus_v2/clean/manifest.json`
    (`total_files: 110`, grader scores 100 — gap noted, not hidden),
    `corpus_v2/injected/ground_truth.json` (`items` = 92, class counts
    12×6 + 20 clean controls), `corpus_v2/real_ai/manifest.json` (30 files).
  - v2c per-class numbers cross-checked against task 3's evidence packet
    (`03-task-3-*.md`) and found to match `eval_v2_2026-08-06.json` exactly.
- `grep -n "^## \|^### "` on the draft to verify section-numbering
  consistency; found and fixed a numbering bug (subsections under "## 7.
  Polarity guard" were internally labeled 6.1/6.2 instead of 7.1/7.2, and
  cross-references elsewhere in the doc pointed at the old numbers). Fixed
  with targeted `sed` passes and re-grepped to confirm every `§6`/`§7`
  cross-reference now resolves to the correct section (the one remaining
  `§6` reference is a legitimate pointer to `EVALUATION.md`'s own §6, not
  this document's section 6).
- Manually re-read the finished file end-to-end for the "numbers only, no
  marketing" constraint — removed/avoided superlative language throughout
  (e.g. no "significantly", "clearly better", "proves"); every claim is
  either a plain numeric readout or an explicit CI-bounded statement.
- `git status --porcelain` before commit — confirmed only
  `benchmarks/code-diet/RESULTS.md` was staged for the code commit; queue
  bookkeeping (`tasks.md`, this evidence file) committed separately per the
  task 1–3 pattern.

No test suite applies to a markdown-only change; the smallest useful
verification for this task is numeric cross-checking against source JSON
(done above), not `node --test`.

## Result

`benchmarks/code-diet/RESULTS.md` written with these sections (also listed
as RESULTS.md's own §10, per the task's "Evidence: section list" ask):

1. Corpus sizes (v2a=100, v2b=92, v2c=30, as scored by the grader)
2. v2b — per-class precision/recall/F1 with Wilson 95% CI (injected ground truth)
3. v2a — clean-corpus FP rate with Wilson CI + full iteration history (§5c table)
4. Effect of the language-graph oracle on CD03 (the one claim requiring de-directionalization on its primary axis — see below)
5. v2c — real-AI blind-labeled per-class results (diagnostic, not gated)
6. RQ3 — baseline overlap (knip / ts-prune / ESLint), raw findings + Jaccard tables
7. Polarity guard — claims de-directionalized in this document
8. Threats to validity (construct / internal / external / conclusion, + a noted sampling-accounting gap)
9. Reproducibility (exact commands: build code-diet-mcp, unit tests, corpus rebuild scripts, baselines, grader; explicit note that the `npm run eval:v2` entrypoint EVALUATION.md §6 describes does not yet exist)
10. Section list (this list, restated inside RESULTS.md itself)

**Claims de-directionalized by the polarity guard (§7 of RESULTS.md):**

1. **"The language-graph oracle reduced the clean FP rate."** Point estimates
   moved 0.120 → 0.100, but the two Wilson CIs (`[0.070, 0.198]` text-only vs
   `[0.055, 0.174]` +oracle) overlap almost completely. Published as: a
   point-estimate shift only, explicitly **not** a statistically supported
   directional claim at N=100. (The oracle's bug-fix effect — fixing
   generic-function invisibility in the language-graph parser — is kept as a
   separate, non-statistical code fact, not folded into this directional
   claim.)
2. **"code-diet is accurate on CD01/CD02/CD04/CD05/CD06 for real AI code
   (v2c)."** All five classes show tp=fp=fn=0 with the grader's divide-by-
   zero 1.00 convention and a degenerate `[0.00, 0.00]` CI. Published as:
   zero statistical power, explicitly **not** evidence of "100% accuracy" —
   only the CD03 row (precision 0.00, CI `[0.00, 0.23]`) is a real signal
   from v2c.

One additional near-miss noted but handled inline rather than as a separate
de-directionalized claim (folded into §2, cross-referenced from §7): v2b
CD02's precision (0.86 point estimate vs the 0.85 pre-registered floor) has
a CI (`[0.60, 0.96]`) that contains the floor value, so "CD02 meets the
precision floor" is stated as a point-estimate observation only, with the
overlap called out explicitly rather than asserted as a pass.

Two comparisons were checked and found to **not** need de-directionalizing
(both confirmed, non-ambiguous failures even at the CI bound): v2a clean FP
rate (0.100, CI lower bound 0.055) vs the 0.05 floor; v2b CD03 precision
(0.39, CI `[0.24, 0.56]`) vs the 0.85 floor.

## Remaining risks

- RESULTS.md inherits every measurement risk already logged in the task 1–3
  evidence packets (CD03 text-heuristic precision ceiling, v2c's small N and
  labeling-methodology judgment calls, the `corpus_v2/_oss/` gitignore
  reproducibility gap) — this task did not re-verify those underlying
  measurements by re-running `grade-v2.mjs`/`run-baselines.mjs`; it read the
  already-committed JSON outputs as the source of truth, per the task's own
  framing ("synthesizing the measured state").
- The `corpus_v2/clean/manifest.json` 110-vs-100-files gap (§1/§8 of
  RESULTS.md) is flagged but not root-caused in this pass — it's an honest
  open item for whoever writes the engineering note, not a blocker for this
  synthesis task.
- The reproducibility section (§9) notes that `npm run eval:v2`
  (`EVALUATION.md` §6) does not exist as an actual script in
  `benchmarks/code-diet/package.json` — this is reported as a gap rather
  than silently worked around, since fixing it was out of this task's scope
  (RESULTS.md synthesizes existing measurements; it does not add tooling).
- No secrets, payments, production deploys, or destructive actions were
  involved. No owner-taste/strategy decision was required — this task is a
  faithful numeric transcription with the pre-registered polarity-guard rule
  applied mechanically, not an editorial judgment call.

## Commit hash

- `96d9d73` — "benchmarks/code-diet: RESULTS.md — measured state synthesis (v2a/v2b/v2c, RQ3, polarity guard)"
- Queue bookkeeping (this evidence file + `tasks.md` checkbox) is committed
  separately, immediately after this packet is written, matching the task
  1–3 pattern.
