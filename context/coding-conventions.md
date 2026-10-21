# Coding Conventions

How to write code that matches what is already here.

Verified against the code on **2026-08-25**. References use symbols and file paths, not
line numbers.

> This document describes the codebase **as it is**, not as it ought to be. Where current
> practice is weak, it says so and marks it as debt rather than quietly recommending
> something the code does not do.

---

## Language & runtime

- **TypeScript 5.8**, ESM throughout (`"type": "module"` in `package.json`).
- **Target ES2022**, `module: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`,
  `noEmit: true`. Type-checking only — Vite handles transpilation.
- **`strict` is NOT enabled**, and neither is any individual strict flag. `npm run lint`
  (`tsc --noEmit`) passes without strict null checks. Write as if it were on: annotate
  nullable returns and guard optionals explicitly. Turning it on would surface a backlog,
  so do not flip it as a side effect of another change.
- **`allowImportingTsExtensions` is on.** No import in the codebase uses it. Don't start.
- **React 19** with `<React.StrictMode>` in `index.tsx`. Effects run twice in dev — write
  them to tolerate it.
- **No Babel, no polyfills.** Vite 6 + `@vitejs/plugin-react` is the whole pipeline.
- **No ESLint and no Prettier.** `npm run lint` is a type-check, despite the name. There is
  no automated formatter, so match the surrounding file by eye: two-space indent, single
  quotes in `.ts`, double quotes in JSX attributes, semicolons.

---

## Project layout

The application lives under `src/`, grouped by feature.

```
src/main.tsx            Entry: createRoot -> StrictMode -> App
src/app/                The one shell: App.tsx, ErrorBoundary.tsx
src/components/ui/      Shared primitives (PascalCase.tsx)
src/components/layout/  Layout
src/features/<name>/    One folder per workspace
      components/         PascalCase.tsx
      lib/                pure logic, camelCase.ts, tested beside itself
      hooks/              useThing.ts
src/lib/                Framework-free shared logic (camelCase.ts)
src/config/             env.ts, constants.ts
src/types/              Shared types
src/styles/             index.css
tests/                  Cross-cutting harness only: setup.ts, fixtures.ts
context/                These documents
```

**Where does new code go?** Used by one feature — inside that feature. Used by two or more
— up into `src/lib`, `src/components/ui` or `src/types`. **Features must never import from
each other**; ESLint fails the build if they do.

**Pure logic belongs in a `.ts` file, not a `.tsx` component**, so it can be tested without
a DOM. `processData` in `CleaningPanel` and the merge/split logic in `MergePanel` are the
standing examples of logic that should be extracted into `features/<name>/lib/`.

There is **one** top-level shell and one entry point. Do not add a second.

New shared code goes in `utils/` as `camelCase.ts`. New UI goes in `components/` as
`PascalCase.tsx`. Do not introduce a `src/` directory as part of an unrelated change — it
touches every import in the project.

---

## Naming

- **Files** — `PascalCase.tsx` for components, `camelCase.ts` for everything else.
- **Components** — **named exports**, typed as `React.FC<Props>`:
  `export const DataView: React.FC<DataViewProps> = ({ … }) => { … }`.
  `App.tsx` is the one default export.
- **Props interfaces** — `<ComponentName>Props`, declared immediately above the component,
  not exported.
- **Local-only interfaces** — declared in the component file, above the component:
  `ColumnStats` in `AnalysisPanel`, `ProcessedResult` in `CleaningPanel`, `ProcessedFile`
  in `MergePanel`. Only promote a type to `types.ts` when a second file needs it.
- **State** — `camelCase`; booleans take `is` / `has` / `show` prefixes (`isProcessing`,
  `isLoading`, `isOpen`).
- **Module constants** — `UPPER_SNAKE_CASE` (`TEMPLATES` in `FormulaPanel`, `COLORS` in
  `ChartPanel`).
- **IDs** — always `crypto.randomUUID()`. Used for `UploadedFile.id`, `ProcessedResult.id`
  and `ProcessedFile.id`. Do not hand-roll an ID scheme.
- **Generated filenames** — suffix the original stem, never replace it:
  `_modified`, `_processed`, `_split_<value>`, `_part_<n>`. Strip the old extension with
  `name.substring(0, name.lastIndexOf('.')) || name` — the `||` fallback handles files with
  no extension and is load-bearing.

---

## Types

- Shared shapes live in `types.ts`: `ExcelRow`, `UploadedFile`, `ChartConfig`, `AppTab`,
  `CleaningAction`, `ExportFormat`.
- `ExcelRow` is `{ [key: string]: any }`. Row values are `any` by design — a cell can hold
  anything. **Guard before using one**: every panel does `String(...)`, `Number(...)` or a
  `!== undefined && !== null` check before touching a cell.
- `AppTab` is an **enum** and is used as one throughout. Leave it alone.
- Prefer **string-literal unions** for local state — `'merge' | 'split'`,
  `'column' | 'row' | 'percentage'`, `'full' | 'column'`. Do not add new enums.
- `CleaningAction['type']` is the union that drives the `switch` in `processData`. Adding a
  member means adding a `case` — TypeScript will not catch the omission, because the switch
  has no exhaustiveness check.
- 🟡 **`ChartConfig` is dead.** It is declared in `types.ts` and imported by nobody;
  `ChartPanel` duplicates its fields as three `useState` calls, and its `'scatter'` variant
  is unrenderable. Either wire it up or delete it — don't extend it.

---

## React patterns

- **Functional components only.** No classes anywhere.
- **Hooks in use:** `useState` (~58 sites), `useEffect` (~20), `useMemo` (3) and `useRef`
  (2, both in `ExportMenu` for click-outside dismissal). **No** `useCallback`,
  `useContext`, `useReducer`, and **no custom hooks**. If you need shared logic, put it in
  `utils/` only if it is pure; otherwise keep it in the component file.
- **No state-management library.** Do not add Redux, Zustand or Jotai. (`@reduxjs` appears
  in `node_modules` as a transitive dependency — it is not a project dependency and nothing
  imports it.)
- **State lives in `App.tsx` when it must survive a tab switch**, and in the panel
  otherwise. `pendingCleaningAction` is in `App.tsx` for exactly this reason.
- **`CleaningPanel` is mounted permanently and hidden with a class.** This is deliberate —
  see `system-rules.md` §6. Do not normalise it to the conditional pattern.
- **The self-healing selection effect is the local idiom.** Almost every panel has one:

  ```jsx
  useEffect(() => {
    if (!files.find(f => f.id === selectedFileId) && files.length > 0) {
      setSelectedFileId(files[0].id);
    }
  }, [files, selectedFileId]);
  ```

  and its column-level twin, which re-points a stale column selection at
  `activeFile.columns[0]`. Copy this pattern in new panels: a file can be removed, and a
  transform can rename every column, at any time.
- **Derive, don't store.** `activeFile` is always `files.find(f => f.id === selectedFileId)`
  computed during render — never mirrored into state. `VlookupPanel` wraps the equivalent
  in `useMemo`; both are acceptable, plain `find` is the more common form here.
- **Guard on `activeFile` before rendering.** The established shape is an early
  `if (!activeFile) return <div className="text-center py-10">No files available.</div>;`
  after the hooks, never before them.
- **Empty states are early returns**, not conditional JSX blocks: a centred card with a
  `lucide-react` icon, a bold heading and a muted explanatory line. `ComparePanel` and
  `VlookupPanel` gate on `files.length < 2` and say which feature needs the second file.
- **Never define a component inside a render body.** `NavItem` in `Layout.tsx` is declared
  at module level for this reason.

---

## Error handling

The current practice is thin. Match it for consistency, but do not extend it further:

- **`console.error` plus `alert()`** is the whole strategy. `App.handleFilesSelect` and
  `VlookupPanel.handlePerformVlookup` both do exactly this.
- **Plain `Error`, no custom error classes.**
- `try / catch / finally` around anything async, with the loading flag cleared in
  `finally` — `handleFilesSelect` is the reference.
- Operations that cannot proceed **return early and silently** when their inputs are
  incomplete (`handleMerge` with fewer than two files, `handleCompare` with no column
  chosen). The buttons are disabled in those states, so the guard is a backstop.
- 🟡 **`alert()` is debt.** It blocks the tab and cannot be styled. Replacing it with an
  inline error surface would be a real improvement — but do it as its own change, applied
  consistently, not opportunistically in one panel. `VlookupPanel`'s `successMessage`
  banner is the closest thing to a house pattern.

---

## Styling

Tailwind is compiled at **build time** from `tailwind.config.js` (no CDN script, no
importmap). `index.html` links a real `src/styles/index.css`, which self-hosts Roboto
and defines the few global rules (focus rings, `prefers-reduced-motion`). **This section
was out of date** — an earlier version of this doc described a CDN-script, stock-palette
setup with no dark mode; none of that is true anymore.

- Classes exist only if `tailwind.config.js` defines them (stock Tailwind) or extends
  them (the project's additions below). An invented class fails loudly — nothing renders.
- **Dark mode exists**, class-based (`darkMode: 'class'`, toggled on `<html>`). Most
  components pair every light class with a `dark:` variant.

The stock Tailwind ramp names (`gray`, `slate`, `indigo`, `blue`, `green`, `red`, `amber`,
`yellow`) are **redefined in `tailwind.config.js` to the eGENTIC corporate palette** — see
the long comment block at the top of that file before changing any colour. In short:
`indigo`/`blue` render as eGENTIC Blue, `gray`/`slate` as the Gray family, `red` resolves
to the accent Orange and `green` also resolves to Blue (the guide has neither colour), so
**status is carried by icon + wording, never colour alone**. `boxShadow` utilities
(`shadow-sm`, `shadow-lg`, etc.) are redefined as flat 1px hairline borders, since the
guide forbids drop shadows — existing `shadow-*` markup is compliant without rewriting,
but `shadow-{color}-{n}` tint classes (e.g. `shadow-indigo-100`) are a no-op under this
scheme and should not be added.

The real eGENTIC logo lives at `public/brand/egentic-logo.png` (full word + figure mark)
and `public/brand/egentic-flower.png` (the figure mark alone, cropped square — used as
the favicon and anywhere only the flower is wanted). `Layout.tsx`'s sidebar header is the
reference usage.

A screen-translated type scale (`text-display` / `text-title` / `text-subtitle` /
`text-body` / `text-small` / `text-micro`, also in `tailwind.config.js`) exists for the
guide's Headline/Subheadline/Body hierarchy but **is not yet adopted anywhere** — every
panel still uses plain Tailwind sizes (`text-xs` … `text-3xl`). Known gap, not yet fixed;
don't treat the custom tokens as unused/removable.

Shape conventions that are consistent and worth matching:

- Cards: `bg-white rounded-xl shadow-sm border border-gray-200 p-6` (some use `rounded-2xl`
  and `p-8` for hero/empty states).
- Content width: each panel wraps itself in `max-w-Nxl mx-auto` — `3xl` for narrow forms,
  `5xl`/`6xl` for tables and grids.
- Selects are hand-rolled: `appearance-none` plus an absolutely-positioned
  `<ChevronDown className="h-4 w-4" />` in a `pointer-events-none` wrapper. Copy the whole
  block; there is no shared `Select` component.
- Icons: `lucide-react`, imported individually, `h-4 w-4` inline / `h-5 w-5` nav /
  `h-6 w-6` section headers / `h-12 w-12` empty states.

**Use `Button` from `components/Button.tsx`** for actions. It handles `variant`
(`primary` | `secondary` | `danger` | `ghost`), `size` (`sm` | `md` | `lg`), `isLoading`
with a spinner, and disabled styling. Several panels still hand-roll `<button>` elements
with raw classes — that is the older pattern, not the target. New buttons use `Button`.

**Use `ExportMenu`** for anything that offers a file download. It renders the four-item
format dropdown and calls back with an `ExportFormat`.

---

## Imports

- **Use the `@/` alias for anything outside your own folder** — `@/types`,
  `@/lib/excel`, `@/components/ui/Button`. It maps to `./src/*`. Relative imports are for
  siblings in the same directory only; `../../` chains are a smell that something belongs
  further up.
- Import order in practice: React first, then types from `../types`, then components, then
  `lucide-react` icons, then utils. Not enforced, but consistent.
- Import icons individually from `lucide-react` — never a namespace import.
- **If you change a dependency version, change it in `package.json` *and* the `index.html`
  importmap.** See `architecture.md`.

---

## Testing

**There is no test suite.** No test script, no runner, no test files.

Until that changes, verification is manual:

1. `npm run build` — confirm it actually succeeded before believing anything downstream.
2. `npm run preview` — serves the built `dist/`.
3. Exercise the change with a real spreadsheet, and **open the exported file** to confirm
   the round trip.

If you add testable logic, the natural home is `utils/` as pure `.ts` functions — keep
React out of it so a runner needs no DOM. `processData` in `CleaningPanel` and the merge
and split logic in `MergePanel` are the strongest candidates for extraction, and are pure
apart from their surrounding component. Proposing a test setup is welcome; adding one
silently as part of another change is not.
