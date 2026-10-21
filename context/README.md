# Context — ExcelFile Operations

Working documentation for this repository. Written for AI agents (Claude Code, Copilot,
Cursor) and for anyone new to the codebase.

Verified against the code on **2026-09-23**.

---

## Read order

| # | Document | Read it when |
|---|---|---|
| 1 | [`system-rules.md`](system-rules.md) | **Always.** Non-negotiable constraints. |
| 2 | [`architecture.md`](architecture.md) | **Always.** Where things live and why. |
| 3 | [`coding-conventions.md`](coding-conventions.md) | Before writing any code. |
| 4 | [`features-functionalities.md`](features-functionalities.md) | Before building anything — so you don't rebuild what exists, and so you know the known gaps. |
| 5 | [`algorithms.md`](algorithms.md) | Before touching any feature's core logic — the *how*, not just the *what*. |
| 6 | [`agent-rules.md`](agent-rules.md) | **Always, if you are an agent.** How to work here. |
| 7 | [`business-overview.md`](business-overview.md) | For product-behaviour decisions. |
| 8 | `project-memory.md` | Preferences, decisions and open threads not recoverable from the code. **Not in version control** - see below. |
| 9 | [`eGENTIC-design-guide.md`](eGENTIC-design-guide.md) | For anything visual. Corporate brand document. |
| 10 | [`presentation-brief.md`](presentation-brief.md) | Only when producing a deck or a written description of the app. |

`Logo Dark Screens 02@3x.png` is the eGENTIC logo, light-on-dark colourway. It is **not
currently used by the application** — see `project-memory.md` §4 (local only).

### `project-memory.md` is deliberately untracked

It records working preferences and verbatim quotes, so it is excluded by `.gitignore`
and stays on the maintainer's machine. Documents here may cite it; if you are reading a
fresh clone, those references point at a file you do not have, and that is expected.

Everything an outside contributor needs is in the eight tracked documents.

---

## Conventions for these documents

- **Never cite line numbers.** They rot within weeks. Reference symbol names and file paths.
- **Every document carries a "verified against the code on" date.** Update it when you
  re-check, not when you edit prose.
- **Mark inference as inference.** If something is a reading rather than a reading-off,
  say so in the document, at the point of the claim.
- **When you change behaviour a document describes, update it in the same change.**
