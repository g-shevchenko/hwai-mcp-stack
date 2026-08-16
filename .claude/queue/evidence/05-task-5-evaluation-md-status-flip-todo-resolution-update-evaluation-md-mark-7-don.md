# Task 5 evidence packet

## Task text (verbatim from queue)

> Task 5 — EVALUATION.md status flip + todo resolution. Update EVALUATION.md:
> mark §7 done-condition items that are now true (corpora built, v2c
> blind-labeled, baselines measured, grader v2 emits CI); add a short "v2c
> blind-label results" subsection (§5f) with the task-3 numbers and the
> contamination-log statement that no detector change was made after seeing
> blind labels. Commit. Evidence: diff summary.

## Files changed

- `benchmarks/code-diet/EVALUATION.md` — the only source file touched.
  - **New §5f "v2c blind-label results (2026-08-06)"** (inserted between
    §5e and §6): the task-3 v2c per-class table (tp/fp/fn/precision/
    recall/F1/Wilson CI for CD01–CD06), pulled verbatim from
    `results/eval_v2_2026-08-06.json` → `v2c` / `results/eval_v2_full_2026-08-06.txt`
    (same numbers as RESULTS.md §5 and the task-3 evidence packet:
    CD03 tp=0 fp=13 fn=1, precision 0.00 CI [0.00,0.23]; the other five
    classes n=0, degenerate 1.00*/[0.00,0.00]). Interpretation ties CD03's
    result to the pre-existing §5b/§5d out-of-sample-consumer boundary
    (same phenomenon, now observed on the real-AI stratum). Explicit
    **contamination-log statement**: no change was made to detector source
    (`detectors.ts`/`dist/detectors.js`) after blind labels existed or
    after seeing this result; the only code change in the window was
    grader instrumentation (`grade-v2.mjs` v2c scoring block, task 3),
    which is not a detector change and does not trigger a re-label.
  - **§7 "Done condition for this phase"** rewritten from a single
    prose paragraph into a dated, checked list:
    - [x] v2a+v2b corpora built (task 1)
    - [x] v2c blind-labeled (task 2)
    - [x] 3 baselines measured (prior session, §5e)
    - [x] grader v2 emits per-class P/R/F1 + Wilson CI for v2a, v2b, **and now v2c** (task 3)
    - [x] polarity guard applied to every comparative claim (RESULTS.md §7)
    - [x] RESULTS.md written (task 4)
    - Closing line: done condition is met, todo #8 (engineering note) is
      unlocked, and reiterates the contamination-log statement (none) so
      the unlock is traceable to the same evidence as §5f.
  - No other section of EVALUATION.md was touched. §1–§5e, §6, and the
    document's `Status: design` header line were left exactly as-is —
    this task only asked for the §7 flip + §5f addition, not a full
    document status rename (that is task 8's job: "update title line from
    Status: design to Status: measured if tasks 2-5 all completed").

## Diff summary

```
 benchmarks/code-diet/EVALUATION.md | 50 +++++++++++++++++++++++++++++++++++---
 1 file changed, 47 insertions(+), 3 deletions(-)
```

3 lines removed = the old single-paragraph §7 text; 47 lines added = new §5f
(30 lines) + new §7 checklist (17 lines).

## Checks run

- Read the full current `EVALUATION.md` (262 lines) before editing, to
  place §5f correctly (between §5e and §6) and confirm §7's exact prior
  wording for a precise `Edit` match.
- Cross-checked every number in the new §5f table against three
  independently-produced sources that must agree: `RESULTS.md` §5 (task
  4), the task-3 evidence packet's pasted table, and
  `results/eval_v2_2026-08-06.json`'s `v2c` object — all three match.
- `git status --porcelain` before commit — confirmed only
  `benchmarks/code-diet/EVALUATION.md` was staged for the content commit;
  `.claude/queue/tasks.md` (line 30 flipped to `[x]`) and this evidence
  file are committed separately as the queue-bookkeeping commit, matching
  the pattern of tasks 1–4.
- Visual re-read of the rendered section (`sed -n '250,300p'`) to confirm
  markdown table alignment and heading levels are correct.
- No code was changed, so no test suite applies to this task (pure
  documentation edit). This matches the task's own scope: it explicitly
  forbids touching detectors and only asks for an EVALUATION.md edit.

## Result

Task complete. `EVALUATION.md` §7 now accurately reflects that all
phase-done conditions are true (corpora built, v2c blind-labeled, 3
baselines measured, grader v2 emits CI for all three strata, polarity
guard applied, RESULTS.md written), and the new §5f gives the v2c
blind-label numbers a home in the SSOT doc with an explicit
contamination-log statement, mirroring RESULTS.md §8's carried-forward
note but scoped to just this result as the task asked ("a short
subsection").

## Remaining risks

- §5f's contamination-log statement is a "none recorded" attestation
  based on the task 2/task 3/task 1 evidence packets' own git-diff
  claims (no detector source touched); this packet does not re-diff
  `detectors.ts` against its state at blind-label time — it is trusting
  the upstream evidence packets' own verification. If any of those were
  inaccurate, this statement would inherit the error.
- The §7 checklist marks "3 baselines measured" as true citing §5e, which
  predates this queue run (committed before task 1 per repo history) —
  this task did not re-verify the baselines numbers, only confirmed §5e
  already documents them.
- Per policy, `.claude/queue/current-task.md` and `.claude/queue/status.json`
  are untracked queue-runner bookkeeping files unrelated to this task;
  left untouched/unstaged, consistent with tasks 1–4.

## Commit hashes

- Code commit (`EVALUATION.md` only): `73b04a0` — "benchmarks/code-diet:
  EVALUATION.md §7 status flip + §5f v2c blind-label results"
- Queue bookkeeping commit (`tasks.md` + this evidence file): next commit,
  see `git log`.
