# Research notes — CD07 (duplicate export) + CD08 (stale file) definitions

Прицельный research 2026-08-06 (parsing stack; scraper-core недоступен в этот ход — fetch
failed + health failed, per scraper-stack-auto правило сделан один fallback на прямые
fetch первичных источников). Цель: дать определениям CD07/CD08 цитируемые опорные точки
и обосновать порог staleness 90d цифрой, а не вкусом. Источники для Part 4.

## (a) CD07 — duplicate export: как формулируют knip / индустрия

**knip — canonical source.** Issue type `duplicates`: «This is exported more than
once» — таблица Issue Types (`https://knip.dev/reference/issue-types`). Категория
`duplicates` стоит рядом с `files` (unused files), `exports` (unused exports),
`cycles` (circular deps). Дубликаты — НЕ auto-fixable (нет значка 🔧), т.е. knip
только сигналит; разруливание — человеком.

**Реальный кейс — mcp-use/mcp-use #1449 «Repo cleanup: resolve duplicate exports»
(closed 2026-05-14).** Формулировка scope, которую мы и переняли:

> «the **3 duplicate exports** flagged by `pnpm knip` — symbols **re-exported from
> more than one entry**, which **forces Knip (and humans) to guess which path is
> canonical**.»

Рекомендованный подход там же (наш `suggested_action` его зеркалит):
1. Re-run knip to refresh duplicate-export sites.
2. **Pick the canonical export path** (prefer the package's documented public entry;
   collapse internal re-exports).
3. Update internal imports to the canonical path; remove the redundant re-export.
4. Если дубликат — для backwards-compat на опубликованном пакете, удаление = breaking
   change → отметить в changeset.

**knip issue #228 (edge case, важен для границы детектора):** экспорт одного символа
под default И под именем — это тоже «duplicate exports» по knip, но автор может
считать его intentional («export under both styles for convenience»). → Наш CD07
сознательно считает только `export { name } from "..."` re-export строки и помечает
finding как WARN (0.7), не verdict — intentional double-export остаётся решением
человека.

**Вывод (a):** определение CD07 «тот же символ ре-экспортирован из >1 barrel/entry
пути; первый путь canonical, последующие помечаются» — дословно соответствует knip
`duplicates` + практике mcp-use #1449. Цитируемо.

## (b) CD08 — stale file: сигнал и пороги staleness

**Сигнал = git last-commit, не mtime.** Все найденные инструменты меряют «возраст»
именно по последнему коммиту, а не по времени модификации файла:

- **git-age** (`github.com/kithfoss/git-age`): «Show how old each tracked file in a
  git repo is **by last commit**». Реализация — `git log --name-only --diff-filter=d`
  за один проход. Известное ограничение: не следует за rename (`--follow`).
- **git-stale-code** (`github.com/marczych/git-stale-code`): «find stale code based
  on **last modification time**» — но реализовано через `git log` (возраст в днях по
  коммиту), не через stat mtime. Пример прогона — rails/rails.
- **repowise**: `index_age_days` / `stale_warning` срабатывает, когда indexed HEAD
  расходится с live `.git/HEAD` — тоже git-якорь, не FS.

**Пороги (диапазон в индустрии).** Нет единого стандарта, но есть устойчивые опоры:

| Источник | fresh | aging | stale | fossilized/critical |
|---|---|---|---|---|
| **git-age** (color bands) | < 90d (green) | 90–364d (yellow) | 365d+ (red) | — |
| **CodePulse branch-aging** | < 7d | 7–30d | 30–90d | 90d+ (fossilized, «do not merge w/o review») |
| **CodePulse enterprise policy** | — | — | warn 30d | auto-archive 90d (with approval) |

- git-age (per-ФАЙЛ возраст, наш случай): **90d = конец «зелёной» зоны**, 365d = красная.
- CodePulse (per-ВЕТКА, агрессивнее, т.к. ветки должны жить днями): stale начинается с
  30d, fossilized с 90d; enterprise auto-archive на 90d.

**Обоснование нашего default 90d.** Для per-файлового staleness (CD08) 90 дней —
это консервативная нижняя граница «жёлтой зоны» git-age и одновременно enterprise
порог CodePulse. Меньше (30–60d) разумно для веток/PR, но для обычных исходников
даёт FP на стабильных, намеренно редко меняющихся модулях (конфиги, протоколы,
валидационные схемы). Поэтому CD08:
- default `stale_file_days = 90` (WARN, confidence 0.5, НЕ verdict на удаление);
- порог — настраиваемый через `DetectorThresholds`, под репо можно опустить/поднять;
- git-age даёт вторую опору 365d для возможной будущей эскалации WARN→stronger.

**Вывод (b):** git last-commit — авторитетный сигнал (mtime врёт под
touch/checkout/formatter); 90d — обоснованный консервативный default для per-файлового
staleness, с диапазоном 30–90 (branches) и 90/365 (files) как цитируемыми опорами.

## Что это даёт Part 4

1. CD07 definition цитируем на knip `duplicates` issue type + mcp-use #1449
   («re-exported from more than one entry… forces humans to guess which path is
   canonical»). Наш detector — прямая механизация этого, с knip #228 edge-case как
   documented boundary (intentional double-export → WARN, не verdict).
2. CD08 staleness: сигнал git last-commit обоснован тремя независимыми инструментами;
   default 90d обоснован диапазоном git-age (90/365) + CodePulse (warn 30 / archive
   90), а не вкусом.

## Источники

- knip Issue Types — https://knip.dev/reference/issue-types (`duplicates`)
- mcp-use/mcp-use #1449 — https://github.com/mcp-use/mcp-use/issues/1449
- knip #228 (default+name double export edge) — https://github.com/webpro-nl/knip/issues/228
- git-age — https://github.com/kithfoss/git-age (пороги 90/365)
- git-stale-code — https://github.com/marczych/git-stale-code (git-log-based age)
- repowise — https://github.com/repowise-dev/repowise (index_age_days/stale_warning)
- CodePulse branch aging — https://codepulsehq.com/guides/git-branch-aging-report (7/30/90, enterprise 90)
