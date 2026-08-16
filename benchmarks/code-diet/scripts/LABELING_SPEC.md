# Blind labeling spec — CD01–CD06 anti-pattern classes

You are labeling source files for the presence of six code anti-pattern classes.
Label ONLY from these definitions. Do not infer detector implementations.

For each file, report which classes are present, with `file`, `line`, and a
one-line justification, or `"clean"` if none apply.

## CD01 — Single-implementation abstraction
An interface or abstract contract with exactly ONE implementation and no
polymorphic use (no second implementor, no `implements`-switch, no
dependency-injection of multiple candidates). The abstraction exists but adds
no substitution point.

## CD02 — Guard spam / defensive over-validation
A function body dominated by redundant guard/validation clauses well beyond
the call site's actual input space — e.g. many near-identical `if (!x) return`
or `if (x == null) throw` blocks stacked where one would do, especially on
internal functions whose inputs are already constrained by the caller.

## CD03 — Unrequested export (dead export)
An exported symbol (function/class/const) that is never referenced anywhere
else in the file set. Not a public API surface (entry-point barrels and their
re-exports are public API, NOT dead).

## CD04 — Re-export plumbing / barrel bloat
A file whose entire body is pure re-exports (`export { x } from ...`,
`export * from ...`) with no added logic, types, or documentation value.

## CD05 — Reinvented utility
A hand-rolled local implementation of a utility the platform/stdlib already
provides (e.g. custom `deepClone`, `sleep`, `groupBy`, `chunk`, `padStart`)
where the stdlib/native equivalent exists and is used elsewhere in the file set.

## CD06 — Dead code / unreachable
Code after a terminal `return`/`throw`/`break` in the same block, or an
unreachable branch (condition statically always false/true), or a declared
never-called private helper.

## Output format
JSON array, one entry per flagged site:
```json
[{ "file": "<rel path>", "class": "CD01", "line": 42, "why": "..." }]
```
A file with no findings contributes no entries. Output ONLY the JSON array.
