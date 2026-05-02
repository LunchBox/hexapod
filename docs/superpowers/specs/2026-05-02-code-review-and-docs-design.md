# Code Review & Documentation Update — Design Spec

**Date:** 2026-05-02
**Status:** approved

## Goal

Comprehensive code review of the entire hexapod codebase, fix concrete bugs found, and bring documentation up to date.

## Approach

**Approach 2: Report → Fix → Update Docs** — write the review report first as a complete catalog, then fix bugs, then update docs to reflect fixed state.

## Deliverables

### 1. Code Review Report (`docs/code-review-2026-05-02.md`)

Full catalog of findings with severity ratings:

| Section | Content |
|---|---|
| Executive Summary | 2-3 sentence project health overview |
| Bugs Found | `clearInterval`/`clearTimeout` mix-up, circular dependency, misspelled export, `slice()` confusion |
| Architecture Concerns | Dual React+DOM state, module-level singletons, oversized classes |
| Code Quality | `any` usage, mixed naming, dead exports, missing error handling, no `useMemo` on context |
| Accessibility | `<a href="#">` as buttons, no ARIA, canvas-only interactions |
| Documentation Gaps | No JSDoc, no TODO markers, no test suite |
| Recommendations | Prioritized list with effort estimates |

### 2. Bug Fixes

Four concrete bugs (fix after report is written):

1. **`clearInterval` on `setTimeout` result** — `gaits.ts`: `clearInterval` should be `clearTimeout`
2. **Circular dependency** — `hexapod.ts` ↔ `history.ts`: inlining the import or extracting shared interface
3. **Misspelled export** — `utils.ts`: `degree_to_redius` → `degree_to_radians` (keep old as alias)
4. **Confusing `slice()` call** — `hexapod.ts`: clarify `draw_time_interval` slice args

### 3. Documentation Updates

**README.md:**
- Architecture diagram — reflect React + context + module structure
- Project structure — add missing files (gait_generator.ts, gait_configs.ts, SliderColumn, AttrSlider, LegEditor)
- Commands — add `npm run lint`, `npm run preview`
- Three.js version — correct "pre-r69" → "revision 72"

**CLAUDE.md:**
- Project structure — add missing files
- Architecture — mention gait_generator.ts, type declarations directory

## Scope Boundaries

- **In scope:** report, 4 bug fixes, README + CLAUDE.md updates
- **Out of scope:** refactoring oversized classes, adding TypeScript strict mode, adding tests, accessibility overhaul, removing `any` usage, renaming conventions — these are documented as recommendations only
