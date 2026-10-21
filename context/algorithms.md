# Feature Algorithms

Verified against the code on **2026-10-21**.

> This document explains **how** each feature's core logic actually computes its
> output — the specific rules, thresholds, and edge-case handling — one level more
> detailed than `features-functionalities.md`'s what-exists/gaps checklist. Read
> `architecture.md` first for where things live; read this one when you're about to
> touch a feature's logic and need to know exactly what it does today before changing
> it. As with every document here: **never cite line numbers** — reference symbol
> names and file paths, which survive edits.

Covers every current feature, including the three "Extra Tools" not yet migrated to
native React (still standalone HTML served in a sandboxed iframe) — marked as such
below.

---

## File I/O — `src/lib/excel/index.ts`

The shared read/write contract every panel that operates on the app-wide `files` pool
goes through. (Entry Counter is the one native feature that deliberately does **not**
use this — see below.)

### `readExcelFile(file)`
- `FileReader.readAsArrayBuffer` → `XLSX.read(data, { type: 'array' })` → **first
  worksheet only** (`workbook.SheetNames[0]`) → `sheet_to_json(sheet, { defval: '',
  raw: false })`.
- `raw: false`: cell values arrive as **formatted strings**, not coerced numbers —
  preserves a leading `+`, leading zeros, and long numeric IDs. Any panel that needs a
  real number converts locally (`Number(...)`).
- `defval: ''`: every row gets every column key, even where the source cell was blank
  — this is what makes `columns = Object.keys(data[0])` safe to rely on everywhere
  else.
- **Columns are derived from row 0 only.** A key present on row 5 but absent from row
  0 is invisible to every consumer of `UploadedFile.columns` — rendering, cleaning,
  export, all of it.
- **Only the first worksheet is read.** Every other sheet in the workbook is silently
  discarded. (Contrast with Entry Counter's `countExcel`, which deliberately sums
  across *every* sheet — a different, tool-specific choice, not an inconsistency that
  needs reconciling.)

### `downloadExcelFile(data, fileName, format)`
- `json_to_sheet` → a single sheet named `"Sheet1"` → `XLSX.writeFile` with `bookType`
  mapped from `format` (`xlsx` / `csv` / `txt`, where `txt` means tab-separated).
- The filename's extension is always rewritten to match the chosen format, regardless
  of what was passed in.
- This is the **only** path that should ever call `XLSX.writeFile` for a shared-pool
  file. Route new export UI through `ExportMenu`, which calls back with an
  `ExportFormat`.

---

## Operations & Cleaning — `CleaningPanel.tsx`'s `processData`

An ordered reducer over `CleaningAction[]`, run either immediately (the two "Row
Operations" buttons) or queued and applied in one batch (`handleApplyQueue`) or
diverted to a separate result that leaves the source file untouched (`handleProcess`).

| `action.type` | What it actually does |
|---|---|
| `remove_duplicates` | Whole-row identity via `JSON.stringify(row)` collected into a `Set`. **Sensitive to key order** — two rows with identical values but differently-ordered keys are *not* considered duplicates. Matches only exact, complete-row duplicates; there is no "duplicate by column". |
| `remove_empty` | Keeps a row only if at least one value is not `null` / `''` / `undefined` (`Object.values(row).some(...)`). |
| `uppercase` / `lowercase` / `trim` | Only touches the target column, and only when its current value is a JS `string` — a numeric or otherwise non-string cell is left untouched rather than coerced. |
| `add_prefix` | `` `${value}${row[column] || ''}` `` — unconditional every time it runs. Running the same prefix twice doubles it; there's no "already prefixed" check. |
| `remove_prefix` | Strips the prefix only if the stringified value actually `startsWith` it; otherwise the row passes through unchanged. |
| `apply_formula` | Writes `action.value` (the formula **text**, e.g. `=SUM(Revenue)`) into every row of the target column as a literal string. This is the entirety of the Formula Builder → Operations bridge — nothing is ever evaluated, and the exported cell holds text, not a live Excel formula. |

Two output modes once the queue is run:
- **Apply to file** (`handleApplyQueue`) — calls `onUpdateFile`, which overwrites the
  file's `data` in place **and recomputes `columns` from row 0 of the new data**.
  Irreversible: no undo, no confirmation.
- **Process to a result** (`handleProcess`) — leaves the source file untouched. Can
  optionally be scoped to a single column (`exportScope === 'column'`), which rebuilds
  every row as `{ [column]: row[column] }` — a genuine per-row narrowing, not a
  full-row extract with other columns hidden.

---

## Data View — `DataView.tsx`

No transformation logic — a preview-and-export surface. Things worth knowing:
- **Hard-capped at the first 100 *matching* rows** for the on-screen table only —
  export is unaffected and always includes every row. Before 2026-10-21 this was
  unconditionally `data.slice(0, 100)`; a search box (added that day, alongside a
  bounded scrollable container with a sticky header — `max-h-[600px] overflow-auto`,
  matching the table style introduced in Compare Files' Possible Matches section)
  filters `activeFile.data` **first**, over every row, then caps the *filtered*
  result at 100 — finding a specific row no longer depends on it happening to be in
  the untouched first 100.
- **Cell rendering is `row[col]?.toString() || ''`** — a legitimate `0` or `false`
  value renders as an empty cell, visually indistinguishable from an actually-blank
  one. Display-only; the underlying value and the export are correct.

---

## Compare Files — `ComparePanel.tsx` + `src/features/compare/lib/compareFiles.ts`

Set-membership comparison, not a cell-level diff. The matching logic was extracted
into `compareFiles.ts` on 2026-10-19 when a **Match Type** selector was added
(previously the comparison was always exact-text, inlined in the component), then
revised the same day after real-world testing found the first version's fixed-length
phone heuristic broke on short numbers — see below.

```
compareFiles(data1, col1, data2, col2, matchType)
  -> { in1Only, in2Only, common, possibleMatches? }
```

- **`'text'` match type** (the default, unchanged from the original behavior): every
  key is `String(value)` as-is, so `1` and `"1"` are treated as equal. A blank cell
  normalizes to `""` and will match every other blank cell in the other file — this
  existing quirk was deliberately left alone when the match-type option was added.
- **`'phone'` match type — exact tier**: `corePhoneDigits` strips everything but
  digits, then strips a single leading national trunk zero, with **no length
  truncation**. Two values land in `common` only if their core digits are identical
  (e.g. both already in the same national format, or both already written the same
  international way). A blank/no-digit value normalizes to `null`, and `null` keys
  are excluded from matching entirely — unlike text mode, two blank phone cells never
  count as a match.
  - **A fixed-length version of this (keep the last 9 digits) was tried first and
    reverted the same day.** It worked for the specific example tested but broke for
    shorter national numbers: slicing a fixed suffix off an international number can
    clip into the country code instead of stopping exactly at it (e.g. an 8-digit
    national number plus a 2-digit country code is 10 digits — a fixed 9-digit slice
    leaves one stray country-code digit attached, so it never equals the plain
    8-digit national form). A country code is a *prefix*, not a fixed-width field, so
    any single fixed-length truncation is inherently fragile across numbers of
    different lengths. **Do not reintroduce a fixed-length slice here** — that's
    what the possible-matches tier below is for instead.
  - **`'phone'` match type — possible-matches tier** (`findPossiblePhoneMatches`):
    runs only over the leftover `in1Only`/`in2Only` rows (not the full dataset), and
    finds pairs whose core digits share a trailing run of at least
    `MIN_SUFFIX_MATCH_LENGTH` (7) digits, up to `MAX_SUFFIX_CHECK_LENGTH` (15) —
    handling a country-code-vs-trunk-zero difference of *any* length without
    assuming one. Indexes the second file's rows by every suffix length they have in
    that range, then looks up each first-file row trying its longest possible suffix
    first (so the most confident shared tail wins when several are plausible) — this
    keeps the pass roughly O(rows × small constant) rather than comparing every pair,
    which matters given the Merge/Split OOM incident earlier (`guardSplitResultCount`)
    already showed what an unbounded quadratic-shaped operation can do to this app.
    Results are **not** folded into `common` automatically — phone-format
    equivalence across differing lengths is treated as a judgment call for the user,
    surfaced in the UI as a separate "Possible Matches (Review)" table with both raw
    values and the shared digit string. Only populated when `matchType === 'phone'`;
    `undefined` for text mode.
- **Duplicate keys within a file are invisible to the result.** They collapse into the
  same `Set` entry, so every row sharing that key survives into `common` (or the
  relevant "only" set) without being flagged, regardless of match type.
- `common` always contains file1's rows, never file2's — there is no field-level
  comparison of what actually differs between a matched pair, for either match type.
- `in1Only` / `in2Only` ("Unique to File A" / "Unique to File B" in the UI) are rows
  with no exact match on the other side. Both were already independently
  downloadable before the match-type option existed; only the matching logic itself
  changed.

### Possible-match review workflow (`buildAcceptedMatchRows`, added 2026-10-19)

The "Possible Matches" table is interactive, not just read-only, with a search box
and a scrollable sticky-header table (`max-h-80 overflow-y-auto`) — added to fix a
"long unbounded list, not production-level" complaint.

**Three-state review, not a checkbox.** Every candidate starts `'pending'` — a plain
`Map<number, 'pending' | 'accepted' | 'rejected'>` keyed by index into
`result.possibleMatches`, reset to all-pending on every new compare. A first version
used a single `Set<number>` of "accepted" indices with everything pre-checked by
default, reasoning a 7+ digit shared suffix is already strong evidence — that version
shipped and was reverted the same day: defaulting everything to "accepted" meant the
"Unmatched" bucket always showed 0 until a user manually unchecked something, which
reads as broken rather than "nothing rejected yet". `'pending'` rows count toward
neither the Matched nor the Unmatched download and are visually marked as such — a
decision must be made (Accept/Reject button per row, or "Accept All"/"Reject All")
before a row appears in either export.

`buildAcceptedMatchRows(candidates, { format, countryCode? })` turns the accepted
subset into one combined, lossless row per pair for export:
- Every column from file1 is spread in as-is; every column from file2 is added under
  a `B_` prefix (`B_<originalName>`) — this is specifically to avoid a same-named
  column in both files (`Name`, `Email`, very common) silently overwriting the other
  side's value. The pair's `Shared Digits` is always included too.
- `format: 'original'` (the default) adds nothing further — both raw phone values are
  already present via the above, so the export is lossless with zero added
  assumptions.
- `format: 'national'` or `'international'` **additionally** append one
  `Normalized Phone` column (`'0' + sharedDigits`, or `countryCode + sharedDigits`)
  — deliberately additive, never replacing either original value, so a wrong format
  choice never destroys data. `countryCode` is a free-text field the user fills in;
  it is never inferred from the data, since the app has no reliable way to know which
  country's dialing code a given leading digit group represents.
- `ExportMenu` gained an optional `disabled` prop in the same change, used here to
  block the download when nothing is selected, or when International format is
  chosen with no country code entered yet.
- A **Download** target selector (Matched / Unmatched, added same day) lets either
  side of the review be exported — `downloadAcceptedMatches` filters
  `result.possibleMatches` by `getDecision(idx) === ('matched' ? 'accepted' :
  'rejected')` before calling `buildAcceptedMatchRows`, so both sides reuse the
  identical combined-row builder and phone-format options. Exporting "Unmatched"
  with a National/International format still computes `Normalized Phone` from
  `sharedDigits` the same way — the UI adds a caveat that this is just what the
  algorithm found, not a confirmed real number, since the user rejected the pair.
- A separate **File Format** radio section (Excel / CSV / Text, added 2026-10-21)
  picks the `ExportFormat` passed to `downloadAcceptedMatches` — this is a plain
  `Button` now, not an `ExportMenu`, specifically so the format is chosen visibly
  beforehand rather than from a dropdown that appears after clicking. Scoped to this
  one review-export action only; the three top-level result cards (Unique to A/B,
  Common) still use `ExportMenu`'s per-click format dropdown, unchanged.

---

## Merge & Split — `MergePanel.tsx` + `src/features/merge-split/lib/splitFile.ts` +
`src/features/merge-split/lib/mergeColumns.ts`

### Merge whole files (`handleMerge`, still inline in the component)
1. Union every non-blank column name across every selected file into `masterHeaders`
   (insertion order = the order columns are first encountered across files, not
   alphabetical).
2. Rebuild every row from every selected file against `masterHeaders`, filling `''`
   for any column that particular file doesn't have.
3. Concatenate all normalized rows into one result. **Header matching is exact and
   case-sensitive** — `Email` and `email` become two separate output columns. No
   dedup happens across the merged set.
4. Lands in "Generations History" alongside split results, downloadable later in any
   format via `ExportMenu`'s per-click dropdown.

### Merge one column across files (`mergeColumns`, added 2026-10-21)
A second mode ("Merge One Column" vs. "Merge Entire Files" — a radio toggle in the
Merge UI), for a different need: pulling **one column from each file** — not
necessarily the same column name — and stacking just those values into a single
combined column, rather than unioning every column and keeping full rows.
- Per selected file, the user picks which column to pull (defaults to that file's
  first column). `mergeColumns(selections, outputColumnName, includeSourceColumn)`
  stacks them in file-selection order into `{ [outputColumnName]: value, 'Source
  File'?: sourceLabel }` rows — every other column in the source rows is discarded.
- `includeSourceColumn` (added 2026-10-21, defaults to `true`) is a checkbox in the
  UI — "Add a 'Source File' column showing which file each value came from" — so the
  traceability column is opt-out rather than forced, per explicit user request after
  finding it always present with no way to turn it off.
- **Does not land in Generations History.** Unlike whole-file merge, this downloads
  immediately via a dedicated **File Format** radio section (Excel/CSV/Text) chosen
  before clicking — mirroring the Compare panel's possible-match review export
  pattern, per an explicit user request to make the two consistent. There is
  currently no "side-by-side columns" mode (each file as its own column, rows
  aligned by position) — only stacking into one column was asked for; if side-by-side
  is ever wanted, that's a different function, not a flag on this one.

### Split — four methods, all extracted into `splitFile.ts` (2026-09-23; previously
inline in the component)
- **`splitByColumnValue(data, column)`** — groups rows by `String(row[column])`; blank
  values bucket under the literal group name `'Empty_Value'`. Group names get
  filename-illegal characters (`<>:"/\|?*`) replaced with `_` before being used to
  build each result's name.
- **`splitByRowCount(data, rowsPerFile)`** — fixed-size chunks via `slice`; the last
  chunk may be smaller than the rest.
- **`splitByPercentageRows(data, pct)`** / **`splitByPercentageColumns(data, columns,
  pct)`** — `pct` clamped to 1-99; produces exactly two parts, split by row index or
  by column-list index respectively (never both at once).
- **`splitBySize(data, columns, { maxSizeMB, emailMode })`** — the newest method
  (folded in from the standalone File-Splitter tool rather than kept as a separate
  tab, since it needs nothing the shared `files` pool doesn't already provide):
  - Computes each row's estimated **CSV-serialized UTF-8 byte size** via
    `calculateRowByteSize` (per-cell byte counting by code point, +2 bytes plus one
    byte per embedded quote when a cell needs CSV quoting, +1 byte per separator, +2
    bytes for the trailing CRLF).
  - A running chunk closes once adding the next row would exceed `maxSizeMB * 1024 *
    1024`, **but every chunk always keeps at least one row**, even when that single
    row alone exceeds the budget.
  - The header row's byte cost (`headerSize`) is counted against every chunk's
    budget, matching the originally-ported tool's behavior.
  - **This byte estimate drives chunk boundaries regardless of the format the user
    later exports as.** It's an approximation for Excel output specifically — SheetJS's
    actual binary size can't be predicted before the workbook is written. This is a
    known, deliberately-kept limitation carried over from the tool it was ported
    from, not something silently "fixed".
  - **Email List Mode** (`emailMode: true`): collapses every row down to just its
    first column, validated via `isValidEmail` (local part ≤64 chars, domain ≤255
    chars, total ≤320, no leading/trailing/doubled dots, domain must contain a dot,
    TLD ≥2 letters) and deduplicated case-insensitively (a `Set` of lowercased
    values). Invalid and duplicate counts are reported back to the UI rather than
    silently dropped.

### Output-count guard (`guardSplitResultCount`, added 2026-10-08)
`splitByColumnValue` on a high-cardinality column (an ID, a hash), or a too-small
row/size chunk setting on a large file, can produce an enormous number of outputs —
and `MergePanel`'s "Generations History" list renders one full result card (with its
own `ExportMenu` instance) per result with **no virtualization or cap**. This was
observed to crash the browser tab outright (a full renderer "Out of Memory" crash,
not a catchable JS error) once the count reached the tens of thousands. `handleSplit`
now calls `guardSplitResultCount(count)` after computing the raw chunks/groups but
before building any `ProcessedFile[]` or touching `results` state, for every method
except `percentage` (which always produces exactly 2):
- **count > 5000** (`SPLIT_RESULTS_HARD_LIMIT`): refuses outright via `alert()`, no
  way to proceed — this band is where the crash was actually observed.
- **count > 200** (`SPLIT_RESULTS_CONFIRM_THRESHOLD`): asks for confirmation via
  `window.confirm()` first.
- Otherwise: proceeds silently, as before.

Both thresholds are judgment calls, not measured browser limits — revisit if they
prove too conservative or too permissive in practice.

---

## Formula Builder — `FormulaPanel.tsx`

Not AI, despite the label: `String.replace('{col1}', col1)` /
`.replace('{col2}', col2)` against five hard-coded templates (SUM, AVERAGE,
CONCATENATE, IF, VLOOKUP). `.replace()` without a global flag only swaps the *first*
occurrence of each placeholder — harmless today since no current template repeats
`{col1}`/`{col2}`, but a trap for any new template that does. The output is a formula
**string** built from column **names**, not cell references (`=SUM(Revenue)` is not a
valid Excel formula unless `Revenue` is a defined name). Sending it to Operations
writes that literal text into every row of the target column via `apply_formula` (see
above) — nothing is ever evaluated at any point.

---

## Entry Counter — `src/features/entry-counter/lib/countEntries.ts`

The first Extra Tool migrated to a native feature (2026-09-23). Has its **own
independent upload**, deliberately not wired into the shared `files` pool — its read
contract (every sheet summed, zip extraction) is incompatible with `readExcelFile`'s
(sheet 0 only, no zip support).

- **`countCsvTxt(file, hasHeader)`** — reads via `xlsx`'s own CSV support
  (`XLSX.read(text, {type:'string'})` + `sheet_to_json(sheet, {header:1,
  blankrows:false})`) rather than adding a papaparse dependency; `blankrows:false`
  reproduces the original tool's "skip fully-blank lines" behavior. Subtracts 1 for
  the header row only when `hasHeader` is true — a toggle the original standalone
  tool didn't have (it always assumed a header).
- **`countExcel(file)`** — sums `sheet_to_json(sheet).length` across **every** sheet
  in the workbook, unlike the rest of the app's sheet-0-only convention. Intentional
  and specific to this one tool.
- **`expandZip(zipFile, options)`** / **`countAll(files, options)`** — async
  generators; recurse into any `.zip` entry found inside another `.zip` (the original
  tool silently dropped nested zips), and yield one `CountOutcome` per leaf file as
  it's produced, so the UI can stream results in one at a time.
- Unsupported file extensions and read errors both yield a visible row (`status:
  'unsupported'` / `'error'`) instead of being silently dropped — a deliberate
  improvement over the original tool, which gave zero feedback for either case, and
  does not abort the rest of the batch.

---

## Extra Tools not yet migrated (still standalone HTML, sandboxed iframe)

These three still run as-is under `public/extra-tools/`, shown via `ExtraToolFrame`.
Documented here from the original source for completeness, and so the business-rule
details survive even after the original files are eventually deleted post-migration.

### SNTS-Combiner (`SNTS-Combiner.html`)
Combines many delimited text/CSV files (via a zip upload or a multi-file select) into
one output. The delimiter is sniffed **once**, from the first file's header line only
(priority: tab → `;` → `|` → else `,`), and reused for every subsequent file. File 0's
header row is kept; every other file's own header row is discarded. Zip-mode files are
processed in **alphabetically sorted filename order**; multi-file-select mode
processes them in **user-selection order** — a real behavioral difference between the
two upload modes. An optional "zero-prefix" transform unconditionally prepends `'0'`
to selected columns with no check for whether it's already prefixed (reapplying it
double-prefixes). An optional duplicate check counts — but does not remove — rows
sharing a value in a chosen column.

### EGT Control Logger (`EGT-Control-Logger.html`)
A Spain-specific compliance tool (`lang="es"`), tied to Spain's "Lista Robinson"
do-not-contact registry (the `robinson` column). Parses tab-delimited `.txt` files,
dropping any row without a `fecha_campana` value. Requires the user to **manually type
in** a "Column A" value per record (sourced from an external system with no
bulk-import path) before exporting a multi-sheet `.xlsx` (one sheet per `YYYYMM`, with
computed ratio columns like `E = registros_iniciales / colA`). **A real defect**:
`colAValues` resets to empty every time the loaded file set changes after step 2 has
already begun, silently discarding values the user already typed in.

### VLookup (`vlookup.html`) — replaced Smart Lookup in the sidebar, 2026-10-19
Built by merging a newer tool the user supplied ("Match & Fill") with Smart Lookup's
matching engine — see [[egentic-workbench-vlookup-merge]] in memory for the full
provenance. Still a standalone HTML iframe tool, not yet native.

**File reading** (from Match & Fill, kept as-is): configurable header row per file
with an auto-detection heuristic (`guessHeaderRow` — scores each of the first 20 rows
by how densely its populated columns stay filled for the next 15 rows, weighted
toward rows that look like text labels rather than data via `textiness`), a visible
warning if the guessed row doesn't look header-like, multi-sheet selection, and a
hand-rolled CSV parser that sniffs the delimiter (comma/semicolon/tab) and preserves
each cell's exact source-formatted date text (`cell.w`) rather than reinterpreting it
— deliberately avoiding SheetJS's own CSV ingestion, which guesses dates with a
US-centric MM/DD convention.

**Matching** (from Smart Lookup, ported as-is): type detection via sampling up to 50
values and checking whether date/number/phone classification crosses a 60% threshold
(checked in that priority order), defaulting to `'text'` otherwise. Numbers round to 3
decimals; dates resolve to a canonical `YYYY-MM-DD` (Excel serial dates via the
standard 25569-day epoch offset; ambiguous `D/M` vs `M/D` strings default to
**month-first** unless the first numeric part is >12); phone numbers keep only the
**last 12 digits** after stripping non-digits and leading zeros. Four parallel
indexes (one per type) let a value match even if the target and reference columns
were auto-detected as different types. Falls back to Levenshtein-similarity fuzzy
suggestions (≥65% similarity) that are **display-only** and never count as a real
match.

**What's new in the merge** (beyond gluing the two together):
- **Multiple reference files**, each with its own sheet, header row, and match
  column — reference rows are converted to row-objects per file (`objRows`) purely
  for the matching engine, which needs named-property access; the union of every
  file's headers populates the "columns to pull in" selector.
- **The target side stays array-of-arrays** (header row at index 0) end-to-end,
  never converted to objects — this is what lets every original target column
  survive into the export, in its original order, exactly like Match & Fill's export
  already guaranteed. Return columns are appended by output name (or filled in place
  if a column with that exact name already exists in the target).
- **Inline edit + re-run**: a source key value can be corrected directly in the
  results table; edits persist in `existingEdits` (keyed by 0-based target data-row
  index) across re-runs without re-uploading.
- Every meaningful field carries a `title` attribute (hover tooltip) explaining what
  it does, rather than one upfront explanation block or a separate help modal.

`smart-lookup-tool.html` itself is untouched and still physically present under
`public/extra-tools/`, but is **no longer referenced** from `types.ts`'s `EXTRA_TOOLS`
registry or the sidebar — it's an orphaned file pending deletion once the new tool is
confirmed working.

---

## Export — `ExportMenu.tsx` + `downloadExcelFile`

One real decision point (xlsx / csv / txt), rendered as four menu entries. **Two of
the four are currently identical**: "CSV UTF-8 (Comma)" and "CSV (Comma delimited)"
both call `onExport('csv')` and produce byte-identical output — the encoding choice
the two labels imply doesn't actually exist. Not yet fixed as of this writing.
