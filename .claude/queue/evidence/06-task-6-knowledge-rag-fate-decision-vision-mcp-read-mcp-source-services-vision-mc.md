# Task 6 evidence packet

## Task text

> Task 6 — knowledge-rag fate decision (vision-mcp). Read
> mcp/source/services/vision-mcp/src/knowledge-rag.ts (marked
> TODO(unwired-feature)) and mcp/source/services/vision-mcp/src/index.ts.
> Decide: WIRE or REMOVE, using evidence: (a) was it ever wired in git
> history (git log -S findRelevantGotchas), (b) does the vision-mcp
> analysis pipeline have a natural insertion point, (c) cost of wiring vs
> value. Implement the SMALLER option: if wiring needs >100 lines of new
> plumbing, REMOVE the file + its tests instead and note the decision in
> the commit message. Either way: `node --test
> mcp/source/services/vision-mcp/test/*.mjs` must pass, stdio smoke
> (`echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node
> mcp/source/services/vision-mcp/dist/index.js` after build) must list
> tools. Commit with the decision rationale. Evidence: decision + why +
> test output.

## Decision: REMOVE

## Evidence gathered

**(a) Git history.**
```
$ git log -S findRelevantGotchas --oneline -- mcp/source/services/vision-mcp/
6807966 Initial public MCP stack release
```
Only the initial public-release commit ever touched `findRelevantGotchas`
(it added the whole file). No later commit imports or calls it from
`index.ts` or `analysis-pipeline.ts`. A repo-wide grep for
`knowledge-rag|findRelevantGotchas|formatRAGContext|hasKnownIssues`
outside the module itself returned zero hits (only the generated
`dist/knowledge-rag.d.ts` re-declares the exports — build output, not a
caller). It has been dead code since the day it was committed.

**(b) Natural insertion point.**
`analysis-pipeline.ts` is explicitly a *prep-first* pipeline: its own
output notes state "Prep-first mode does not run Ollama or local VLM
reasoning" — analysis/interpretation is deliberately left to the calling
frontier model, not done locally. `knowledge-rag.ts`'s design assumes an
`elementType` string drawn from a UI-category vocabulary (`"video
player"`, `"chart"`, `"button"`, `"heading"`, ...) plus free-text
`commentText`, and searches `KNOWLEDGE_BASE.md` for keyword matches. The
real pipeline never produces either of those: its actual region taxonomy
is `comment_box | outline | arrow | underline | marker_dot`
(`annotation-detector.ts`), and comment text only exists as sparse,
low-confidence OCR hints on a subset of crops. There is no natural
insertion point without first building a translation layer between two
incompatible taxonomies, and `buildPromptScaffold` /
`buildCompactResult` are synchronous today while `findRelevantGotchas` is
`async` — wiring it in means converting that call chain to async and
threading it through `analyzeScreenshotUrl`, the batch path
(`mapWithConcurrency`), and the diff path, plus new config for
`knowledgeBasePath` and new tests. That's well over 100 lines of new
plumbing across multiple files, not a local one-line hookup.

**(c) Cost vs. value.**
`findRelevantGotchas`'s default `knowledgeBasePath` resolves to
`mcp/source/claude/KNOWLEDGE_BASE.md`. A repo-wide search
(`find ... -iname "KNOWLEDGE_BASE.md"`) found **no such file anywhere in
the repo**. Even if fully wired, `findRelevantGotchas` would permanently
no-op (`fs.existsSync` fails, function returns empty gotchas/warnings on
every call) unless someone also authors and maintains that KB document —
a second, ongoing cost beyond the plumbing itself. Low value for a
>100-line plumbing cost that produces no runtime effect until a
currently-nonexistent doc is written.

Per the task's decision rule ("if wiring needs >100 lines of new
plumbing, REMOVE the file + its tests instead"), the smaller option was
implemented: **REMOVE**.

## Files changed

- `mcp/source/services/vision-mcp/src/knowledge-rag.ts` — deleted (245
  lines; the only unwired, unreferenced module in the service).
- `mcp/source/services/vision-mcp/dist/knowledge-rag.{js,js.map,d.ts,d.ts.map}`
  — removed manually, then regenerated build confirmed they don't
  reappear (`dist/` is gitignored, not a tracked change).
- `mcp/source/services/vision-mcp/test/tools-list.test.mjs` — added.
  `knowledge-rag.ts` had no tests of its own to remove (none existed);
  vision-mcp had **no `test/` directory at all** before this change, so
  one was created with a minimal `node:test` suite covering: (1)
  `knowledge-rag.ts`/`knowledge-rag.js` are gone from `src/`/`dist/`
  (regression guard for this decision), and (2) the built stdio server
  still answers `tools/list` with the full expected tool set after the
  removal.
- `.claude/queue/tasks.md` — Task 6 line marked `[x]`.

No other files reference the removed module, so no further changes were
needed.

## Checks run

1. `npm run build` (tsc) — clean, zero errors.
2. `node --test mcp/source/services/vision-mcp/test/*.mjs`:
   ```
   # tests 3
   # suites 0
   # pass 3
   # fail 0
   # cancelled 0
   # skipped 0
   # todo 0
   ```
   (dist build does not ship knowledge-rag / src no longer contains
   knowledge-rag.ts / stdio tools/list responds with expected tools — all
   `ok`.)
3. stdio smoke:
   ```
   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node mcp/source/services/vision-mcp/dist/index.js
   ```
   Responded with a `result.tools` array containing all 9 tools
   (`fetch_image`, `image_url_to_text`, `analyze_screenshot`,
   `prepare_screenshot`, `batch_analyze_screenshots`,
   `batch_prepare_screenshots`, `analyze_screenshot_diff`,
   `prepare_screenshot_diff`, `get_runtime_diagnostics`); stderr showed
   `HWAI Vision MCP Server running on stdio` with no errors.

## Result

Task complete and verified. `src/knowledge-rag.ts` removed with
documented rationale; build, unit tests, and stdio smoke all pass.

## Remaining risks

- Low: if a future contributor wants RAG-enriched gotchas for screenshot
  analysis, this removal means starting from scratch rather than
  reactivating dormant code — acceptable given the taxonomy mismatch
  made the old code unusable as-is regardless.
- None to running services: the module was never imported, so removing
  it changes zero runtime behavior for any existing client.
- The new `test/tools-list.test.mjs` spawns the built `dist/index.js` as
  a child process and talks to it over stdio with a 10s timeout; this is
  consistent with how the task's own smoke check works, but it is the
  first process-spawning test in this service and adds ~120ms to the
  suite (well within normal bounds).

## Commit hash

`1a83b8cf21f0b887467a4dd54502eb264add0a8a`
