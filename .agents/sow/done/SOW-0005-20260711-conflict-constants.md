# SOW-0005 - Upstream Sync Conflict: constants.js

## Status

Status: completed

Sub-state: User confirmed combining both constant blocks is correct (via approval of the SOW-closure plan on 2026-07-12). Closed with no further code changes — the resolution was already committed in SOW-0004 (`1f6657f`).

## Requirements

### Purpose

Give the user a clear, isolated record of what collided in `extension/constants.js` during the SOW-0004 upstream rebase, so it can be compared against the other 6 conflicts and confirmed or overridden.

### User Request

Part of: "make it so that we rebase first and then have one pending sow for each conflict, so we can compare features." (See SOW-0004.)

### Assistant Understanding

Facts:

- Upstream (`origin/main`) added three new constants: `MAX_DRAG_LAYOUTS`, `DRAG_LAYOUT_TIME_BUDGET_MS`, `KEYBOARD_RECOMPOSE_MIN_DISPLACEMENT_PX` — used by upstream's own drag-candidate de-duplication and Super+Arrow recompose work (already-merged files, not in conflict).
- The local WIP (SOW-0002) added `RESIZE_CYCLE_FRACTIONS` — an array of size-cycle fractions for `Super+WASD` keyboard resize, consumed at `extension/extension.js:728` (`constants.RESIZE_CYCLE_FRACTIONS`), which merged cleanly with no conflict.
- Both additions occupy the same insertion point (right after `WINDOW_SPACING`), which is why git reported a conflict — there is no semantic overlap between them.

Inferences:

- Dropping either side would break already-merged code that references it: dropping upstream's constants would leave `dragHandler.js`'s drag-candidate logic referencing undefined constants; dropping `RESIZE_CYCLE_FRACTIONS` would break `extension.js:728`'s keyboard-resize handler.

Unknowns:

- None.

### Acceptance Criteria

- The user confirms both constant blocks should coexist (or requests a different resolution).

## Analysis

Sources checked:

- `extension/constants.js` (post-resolution), `git diff 6bb3932 origin/main -- extension/constants.js`, `git diff 6bb3932 a02037a -- extension/constants.js`, `git grep -n "RESIZE_CYCLE_FRACTIONS"`.

Current state (as resolved in SOW-0004, already committed to `main` at `1f6657f`):

```js
export const WINDOW_SPACING = 8; // Pixels

// Cap on distinct drag candidates kept after de-duplication so the live nearest search
// stays cheap. A safety net that keeps the current layout, so it never drops a reachable one.
export const MAX_DRAG_LAYOUTS = 48;
// Wall-clock ceiling for composition generation at drag start; a last-resort guard
// against pathological window counts.
export const DRAG_LAYOUT_TIME_BUDGET_MS = 8;
// A Super+Arrow only counts as an action if it moves the focused window's center at
// least this far in the pressed direction; below it the key is a no-op.
export const KEYBOARD_RECOMPOSE_MIN_DISPLACEMENT_PX = 20;
// Predefined size steps for Super+WASD cycling (fractions of usable tiling dimension).
// Steps below the window minimum size are silently skipped at runtime.
export const RESIZE_CYCLE_FRACTIONS = [
    0.05, 0.10, 0.15, 0.20, 0.25,
    0.30, 0.35, 0.40, 0.45, 0.50,
    0.55, 0.60, 0.65, 0.70, 0.75,
    0.80, 0.85, 0.90, 0.95, 1.00
];
```

Risks:

- None identified — this is additive-only on both sides.

## Pre-Implementation Gate

Status: needs-user-decision

Problem / root-cause model:

- Two unrelated features each added a new constant block at the same file location, producing a textual (not semantic) conflict.

Evidence reviewed:

- See Analysis above.

Affected contracts and surfaces:

- `extension/constants.js` only.

Existing patterns to reuse:

- N/A.

Risk and blast radius:

- Minimal. Both blocks are simple constant exports.

Sensitive data handling plan:

- Not applicable.

Implementation plan:

1. If confirmed, no further action needed — already resolved this way in SOW-0004.
2. If the user wants a different arrangement (e.g., reordering, renaming for grouping), apply as a small follow-up edit.

Validation plan:

- `npm run lint` (already passing on `main`).

Artifact impact plan:

- AGENTS.md: unaffected.
- Runtime project skills: unaffected.
- Specs: unaffected.
- End-user/operator docs: unaffected.
- End-user/operator skills: none exist.
- SOW lifecycle: close once the user confirms or requests changes.

Open-source reference evidence:

- Not applicable.

Open decisions:

1. **Keep both constant blocks as combined (Recommended)** — no functional conflict, both are needed by already-merged code. vs. **Reorganize/rename** — purely cosmetic, only worth doing if the user wants clearer grouping (e.g., a comment header separating "drag" vs "resize" constants).

## Implications And Decisions

1. **Keep both constant blocks as combined** — user confirmed (2026-07-12) via approval of the SOW-closure plan that identified this as the lowest-risk, first-to-close SOW among the 7 upstream-sync conflicts. No reorganization/renaming requested.

## Plan

1. ~~Await user confirmation or override.~~ Done — confirmed.

## Execution Log

### 2026-07-12

- Resolved in SOW-0004 by combining both blocks; no further changes made pending user review.
- User confirmed the resolution; SOW closed and moved to `.agents/sow/done/`.

## Validation

Acceptance criteria evidence:

- User confirmed both constant blocks should coexist (2026-07-12); no different resolution requested.

Tests or equivalent validation:

- `npm run lint` passes on `main` post-rebase (see SOW-0004).

Real-use evidence:

- Deferred to SOW-0002 completion.

Reviewer findings:

- None requested.

Same-failure scan:

- N/A — no other file had a purely-additive constants collision.

Sensitive data gate:

- N/A.

Artifact maintenance gate:

- No artifact changes needed for this item alone.

Specs update:

- None needed.

Project skills update:

- None needed.

End-user/operator docs update:

- None needed.

End-user/operator skills update:

- None needed.

Lessons:

- None beyond what's recorded in SOW-0004.

Follow-up mapping:

- Closed. No further follow-up items.

## Outcome

Closed: both constant blocks (upstream's drag/keyboard-recompose constants and the local WIP's `RESIZE_CYCLE_FRACTIONS`) coexist in `extension/constants.js` as combined in SOW-0004. No code change was needed beyond what SOW-0004 already committed; this SOW only records the user's confirmation and closes the tracking item.

## Lessons Extracted

None beyond what SOW-0004 already recorded.

## Followup

None.

## Regression Log

None yet.
