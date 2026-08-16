# CD03 blind-labeling protocol (v3 truth table) — shared rules

You are a BLIND labeler for a dead-code detector evaluation. You MUST NOT read any
detector source, grader, eval result JSON, or this repo's `results/` dir. Work only
from source code ground truth. You are labeling ground truth INDEPENDENTLY.

## Scope: ONLY CD03 (unused export). Ignore every other detector class.

## Labels (exactly one per exported VALUE symbol)

- `verdict_source` — the symbol is exported AND has **zero real references** anywhere
  in the corpus package (no import, no usage, no re-export in any barrel/index file).
  It is genuinely dead. A correct detector SHOULD flag it.
- `detector_fp` — the symbol is exported AND has **≥1 real reference** (imported, used,
  or re-exported by any barrel/index file). Flagging it would be a detector FALSE POSITIVE.
- `not_findings` — out of CD03 scope: type-only exports (`interface` / `type`), the
  barrel/index file's own re-export lines, `export *` star-barrel lines, or local
  (non-exported) symbols.

## Reference-counting rules (be precise)

1. Only VALUE exports are in scope: `export function|class|const|let|var|enum NAME`.
   `export interface|type` are `not_findings` (no runtime reference possible).
2. A REAL reference = the symbol name appears in ANOTHER file as: an `import`,
   a usage expression, or a barrel re-export (`export { X } from ...`,
   `export { default as X } from ...`). Use WORD-BOUNDARY search.
3. A barrel re-export IS a real reference → label the re-exported symbol `detector_fp`.
4. A star-barrel `export * from "./mod"` re-exports ALL of mod's named exports → each
   is `detector_fp`.
5. EXCLUDE the declaration itself: a symbol always appears once at its own declaration.
   That does not count. Only count references in OTHER files.
6. Appearances inside comments or string literals are NOT real references — still dead.
7. `index.ts` / `main.ts` / `mod.ts` are entry-point barrels: their OWN lines are
   `not_findings`, but the symbols they re-export become `detector_fp`.

## Output format — write a JSON fragment

```json
{
  "<rel/path/file.ts>": {
    "verdict_source": ["symbolA"],
    "detector_fp": ["symbolB", "symbolC"],
    "not_findings": ["SomeInterface", "SomeType"]
  }
}
```

Rel path is relative to `corpus_v2/clean/` (e.g. `zod/regexes.ts`). Include EVERY file
you labeled. A file with no in-scope exports still gets an entry (empty arrays).
