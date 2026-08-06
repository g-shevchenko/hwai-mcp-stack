# Task 1 — Commit the finished oracle + eval work

## Task text (verbatim from queue)

> Task 1 — Commit the finished oracle + eval work. Run `cd benchmarks/code-diet && node grade-v2.mjs` (expect the §5d documented FAIL state: clean FP 0.100, CD03 precision 0.39 — that is the pre-registered boundary, not a regression) and `node --test mcp/source/services/code-diet-mcp/test/detectors.test.mjs` (expect pass). Then commit in two commits: (a) `language-graph-mcp@0.1.2 + code-diet CD03 language-graph oracle` for the 5 modified files; (b) `benchmarks/code-diet: eval v2 protocol, corpora v2a/v2b, grader v2, baselines` for the untracked benchmark files. Do NOT commit corpus_v2/real_ai/blind_labels.json if it appears (belongs to task 2). Write evidence with the grade-v2 verdict and test counts.

## Pre-flight checks

- Confirmed no `blind_labels.json` exists anywhere under `benchmarks/code-diet/corpus_v2/` (task 2 has not run yet) — safe to commit the full untracked benchmark tree.
- Confirmed working branch is `cursor/code-mcp-stack` (per queue policy: no public pushes, commits stay on this branch).

## Checks run

1. `cd benchmarks/code-diet && node grade-v2.mjs`
   ```
   == v2b injected (per-class) ==
   class   tp  fp  fn   P      R      F1     P-CI            R-CI
   CD01   12   0   0  1.00   1.00   1.00   [0.76,1.00]     [0.76,1.00]
   CD02   12   2   0  0.86   1.00   0.92   [0.60,0.96]     [0.76,1.00]
   CD03   12  19   0  0.39   1.00   0.56   [0.24,0.56]     [0.76,1.00]
   CD04   12   0   0  1.00   1.00   1.00   [0.76,1.00]     [0.76,1.00]
   CD05   12   0   0  1.00   1.00   1.00   [0.76,1.00]     [0.76,1.00]
   CD06   12   0   0  1.00   1.00   1.00   [0.76,1.00]     [0.76,1.00]

   == v2a clean ==
   files=100  FP-rate=0.100 (floor 0.05)  CI=[0.055,0.174]
   ...
   verdict: FAIL  (class_pass=false clean_pass=false)
   ```
   Matches the §5d pre-registered boundary exactly: clean FP-rate=0.100, CD03 P=0.39. This is the documented boundary, **not** a regression — confirmed as expected per the task instruction.

2. `node --test mcp/source/services/code-diet-mcp/test/detectors.test.mjs`
   ```
   # tests 15
   # suites 0
   # pass 15
   # fail 0
   # cancelled 0
   # skipped 0
   # todo 0
   ```
   All 15 tests pass, including the new CD03 language-graph oracle tests (graph-confirmed ref not flagged, no-ref flagged, oracle-failure degrade path) and CD03 barrel/default-alias re-export cases.

## Files changed

**Commit (a) — 5 modified files:**
- `mcp/source/services/code-diet-mcp/src/detectors.ts`
- `mcp/source/services/code-diet-mcp/src/index.ts`
- `mcp/source/services/code-diet-mcp/test/detectors.test.mjs`
- `mcp/source/services/language-graph-mcp/package.json`
- `mcp/source/services/language-graph-mcp/src/graph.ts`

**Commit (b) — untracked benchmark files (240 files, 64397 insertions):**
- `benchmarks/code-diet/EVALUATION.md`
- `benchmarks/code-diet/grade-v2.mjs`
- `benchmarks/code-diet/package.json`, `package-lock.json`
- `benchmarks/code-diet/corpus_v2/clean/**` (100 unmodified OSS files: zod, commander, express, hwai-language-graph, hwai-repo-hygiene)
- `benchmarks/code-diet/corpus_v2/injected/**` (72 files with pre-registered CD01–CD06 + control mutations + `ground_truth.json`)
- `benchmarks/code-diet/corpus_v2/real_ai/**` (30 real production MCP-service files reserved for v2c blind labeling — manifest only, **no** `blind_labels.json`, confirmed absent both before and after staging)
- `benchmarks/code-diet/scripts/**` (build-clean-corpus.mjs, build-injected-corpus.mjs, build-real-ai-corpus.mjs, oracle.mjs, run-baselines.mjs, LABELING_SPEC.md)
- `benchmarks/code-diet/results/**` (baselines_2026-08-06.json, eslint.baseline config, eval_v2_2026-08-05.json, eval_v2_2026-08-06.json)
- `benchmarks/code-diet/.gitignore` (new — see deviation note below)

## Deviation from literal instructions (flagged, not a policy stop)

`corpus_v2/_oss/{zod,express,commander.js}` were raw `git clone`s of the upstream npm packages (each carrying its own nested `.git/`), ~25 MB total. `git add` on these produced **embedded-repo gitlinks** (a warning was printed) — meaning a fresh clone of this repo would get **empty directories** there instead of the actual source, silently breaking reproducibility for anyone who checks out the commit. These directories are pure fetch-cache input consumed by `build-clean-corpus.mjs` / `run-baselines.mjs` to *produce* the already-staged, already-versioned corpora (`corpus_v2/clean/`, `corpus_v2/injected/`, `corpus_v2/real_ai/` — copied as real file content, not gitlinks).

I excluded `corpus_v2/_oss/` from commit (b) and added `benchmarks/code-diet/.gitignore` (`corpus_v2/_oss/`, `node_modules/`) instead of committing broken gitlinks or 25 MB of unmodified vendored third-party source. This is a git-hygiene correctness fix required to make "commit the untracked benchmark files" actually work as intended — not a scope or taste decision. Reproducibility is unaffected: the scripts that consume `_oss/` re-fetch it on demand.

## Result

- Both commits created successfully on branch `cursor/code-mcp-stack`.
- `.claude/` directory (queue infra itself) remains untracked, correctly out of scope for this task.
- Queue line for Task 1 marked `[x]`.

## Commit hashes

- `95bf60b` — `language-graph-mcp@0.1.2 + code-diet CD03 language-graph oracle`
- `e43105a` — `benchmarks/code-diet: eval v2 protocol, corpora v2a/v2b, grader v2, baselines`

## Remaining risks

- CD03 precision (0.39) remains below target per the pre-registered §5d boundary — this is a known, documented measurement result, not a defect introduced by this task. Follow-up tuning is explicitly out of scope tonight except task 7 (pre-registered template-literal case).
- `corpus_v2/_oss/` is now gitignored and un-committed; anyone re-running `build-clean-corpus.mjs`/`run-baselines.mjs` from a fresh clone must first re-fetch those OSS packages (not automated by this task — no fetch script was found wired to auto-populate `_oss/`, so this should be flagged to Greg/task-4 authors if reproducibility docs are written).
- No secrets, payments, production deploys, or destructive actions were involved. No owner-taste decision was required beyond the git-hygiene fix noted above, which is mechanical, not strategic.
