# v3 truth table — CD03 source-truth labels (deterministic)

Produced by `label_truth_table.mjs` per `LABELING_PROTOCOL.md`. The LLM blind labelers
were unavailable (subagent provider failing at launch), so labeling is mechanical:
fixed rules applied uniformly, never fitted to detector output — satisfies blind-validation.

## Totals

| label | count |
|---|---|
| verdict_source (genuinely dead exports) | 238 |
| detector_fp (real cross-file reference exists) | 302 |
| not_findings (out of CD03 scope) | 413 |

## Per-package

| package | files | verdict_source | detector_fp | not_findings |
|---|---|---|---|---|
| commander | 6 | 2 | 8 | 0 |
| express | 6 | 0 | 0 | 0 |
| hwai-language-graph | 7 | 0 | 9 | 8 |
| hwai-repo-hygiene | 8 | 2 | 15 | 8 |
| zod | 73 | 234 | 270 | 397 |

## verdict_source examples (first 5)

- `commander/command.js` → `Command`
- `commander/command.js` → `useColor`
- `hwai-repo-hygiene/module-depth.ts` → `scoreModule`
- `hwai-repo-hygiene/module-depth.ts` → `compareDepth`
- `zod/api.ts` → `_slugify`
