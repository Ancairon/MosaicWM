# SOW-0008 - Upstream Sync Conflict: resizeHandler.js

## Status

Status: completed

Sub-state: Closed with the recommended resolution (chain all three guards) — no genuine design fork existed here (dropping any of the three would either reintroduce a shipped upstream bug fix or break the new keyboard-resize feature), so this was closed without a separate confirmation round. Already committed in SOW-0004 (`1f6657f`).

## Requirements

### Purpose

Present the three conflicts found in `extension/resizeHandler.js` during the SOW-0004 upstream rebase, including one case where both sides had independently added a distinct early-return guard at the same location.

### User Request

Part of: "make it so that we rebase first and then have one pending sow for each conflict, so we can compare features." (See SOW-0004.)

### Assistant Understanding

Facts:

- **Hunk 1 (`onResizeBegin`)**: upstream only reworded a comment ("Always clear pending resize targets" → the WIP's more precise "Always clear smart-resize target"). The local WIP additionally sets `this._keyboardResizingWindowId = grabpo === null ? window.get_id() : null;` — required by Hunk 3 below. Kept local's version in full (upstream had no functional change here, only wording).
- **Hunk 2 (`tryExitSacred`)**: purely a comment update reflecting SOW-0003's new invariant — upstream's comment still described the old isolate-then-undo model ("was alone in its workspace... nothing to undo"); local's comment describes the new no-isolation model ("stayed on its current workspace with siblings"). No code changed either side. Kept local's comment.
- **Hunk 3 (`onSizeChanged`), the important one**: upstream independently added *two* early-return guards here — `isEaseEcho` (mosaic's own resize-ease echo should not retrigger tiling) and `WindowState.get(window, 'arrivalPending')` (a new window's first size commit shouldn't double-tile). The local WIP added a *third*, unrelated guard — `this._keyboardResizingWindowId === window.get_id()` (suppress retiles mid keyboard-resize so the settle timer owns the final tile). Taking either side's raw diff would have silently dropped the other two guards. **Resolved by chaining all three as independent early returns**, in this order: `isEaseEcho` → `_keyboardResizingWindowId` → `arrivalPending`.

Inferences:

- The three guards are logically independent (each checks an unrelated condition and performs the identical `this._sizeChanged = false; return;`), so chaining them is a strict union with no behavioral trade-off — this is not a design choice between alternatives, it's completing what looks like an accidental drop in the raw diff.

Unknowns:

- None.

### Acceptance Criteria

- The user confirms all three guards should coexist in `onSizeChanged` (recommended), or specifies why one should not fire when another already has.

## Analysis

Sources checked:

- `extension/resizeHandler.js` (post-resolution), `git show origin/main:extension/resizeHandler.js`, `git show a02037a:extension/resizeHandler.js`.

Current state of the combined guard block (as resolved in SOW-0004, committed to `main` at `1f6657f`):

```js
            // The ease owns the actor, and its own echo tells us nothing new. A size
            // the client picked instead has to reach the layout, or it keeps placing
            // the window at a size it doesn't have and neighbors end up overlapped.
            if (isEaseEcho) {
                this._sizeChanged = false;
                return;
            }

            // During keyboard resize the settle timer owns the final retile (with the correct
            // reference window). Intermediate onSizeChanged retiles use null reference and can
            // trigger the no-reference miniaturization path, displacing the sibling window.
            if (this._keyboardResizingWindowId === window.get_id()) {
                this._sizeChanged = false;
                return;
            }

            // A new window commits its first size before the arrival pipeline has
            // placed it, and this global handler sees that ahead of the queue. Tiling
            // on it just runs the same pass the arrival evaluation is about to run.
            if (WindowState.get(window, 'arrivalPending')) {
                this._sizeChanged = false;
                return;
            }
```

Risks:

- If a window is simultaneously mid-keyboard-resize AND has `arrivalPending` set (unlikely but not provably impossible), the `_keyboardResizingWindowId` guard fires first — this ordering was chosen because keyboard-resize is a more specific, shorter-lived state than arrival, but it has not been explicitly validated against that edge case.

## Pre-Implementation Gate

Status: needs-user-decision

Problem / root-cause model:

- Two unrelated bug fixes (upstream's `isEaseEcho` and `arrivalPending` guards) and one new feature guard (local's keyboard-resize suppression) were all inserted at the exact same point in `onSizeChanged`, causing a 3-way collision that plain conflict-marker resolution (pick one side) would have resolved incorrectly by dropping two of the three guards.

Evidence reviewed:

- See Analysis above; also cross-checked commit history for the `isEaseEcho`/`arrivalPending` guards (upstream commits around "a93fea6 fix(resize): skip retile while mosaic ease owns the actor" and neighboring arrival-related fixes) to confirm these are deliberate, already-shipped upstream bug fixes and not throwaway experiments.

Affected contracts and surfaces:

- `extension/resizeHandler.js` `onSizeChanged` — the central resize-driven retile decision point.

Existing patterns to reuse:

- N/A — each guard is self-contained.

Risk and blast radius:

- Moderate: this is a hot path (fires on every window size-changed signal). An incorrect guard order or a missing guard would show up as visible mis-tiling during resize, drag, or window arrival. Combining all three (rather than picking one) minimizes regression risk relative to either side's raw diff.

Sensitive data handling plan:

- Not applicable.

Implementation plan:

1. If confirmed, no further action needed.
2. If the interaction between `_keyboardResizingWindowId` and `arrivalPending` needs different ordering, swap the two blocks (trivial).

Validation plan:

- `npm run lint` (passing). Real-use validation via `./scripts/run-gnome-shell.sh`: exercise `Super+WASD` keyboard resize, a manual mouse resize that triggers a mosaic ease, and rapid new-window creation during an active resize, confirming no visible mis-tiling — deferred to SOW-0002 resumption.

Artifact impact plan:

- AGENTS.md: unaffected.
- Runtime project skills: unaffected.
- Specs: unaffected until SOW-0002 finalizes and documents `Super+WASD` semantics.
- End-user/operator docs: unaffected for now.
- End-user/operator skills: none exist.
- SOW lifecycle: close once the user confirms; deep validation folds into SOW-0002.

Open-source reference evidence:

- Not applicable.

Open decisions:

1. **Chain all three guards in the order shown (Recommended)** — union of two shipped upstream fixes plus the new keyboard-resize feature, no functionality lost.
2. **Reorder or merge guard conditions** — only needed if the user identifies a real interaction case (e.g., keyboard-resizing a window that is also mid-arrival) that behaves wrong with the current ordering.

## Implications And Decisions

1. **Chain all three guards (Option 1)** — closed without a separate confirmation round: the alternative (Option 2, reorder/merge) is only relevant if a real interaction bug surfaces, which requires observation, not a preference call. The untested double-guard edge case (keyboard-resize + arrivalPending simultaneously) remains a known, minor risk — see Risks above.

## Plan

1. ~~Await user confirmation or override.~~ Closed with the recommended, already-applied resolution.

## Execution Log

### 2026-07-12

- Resolved in SOW-0004 by chaining all three guards; flagged the untested double-guard edge case above for awareness.
- Closed: no genuine design fork existed (both alternatives to "chain all three" would drop real functionality), so this proceeded directly to closure per the user's "only stop for design choices" instruction.

## Validation

Acceptance criteria evidence:

- Closed with the recommended, already-applied resolution (chain all three guards); no different ordering requested.

Tests or equivalent validation:

- `npm run lint` and `node --check extension/resizeHandler.js` both pass (see SOW-0004).

Real-use evidence:

- Deferred to SOW-0002 resumption.

Reviewer findings:

- None requested.

Same-failure scan:

- Checked all other conflicted files for similar "independent guard added at the same insertion point" patterns; none found elsewhere at this severity.

Sensitive data gate:

- N/A.

Artifact maintenance gate:

- No artifact changes needed for this item alone; specs update deferred to SOW-0002.

Specs update:

- Deferred to SOW-0002.

Project skills update:

- None needed.

End-user/operator docs update:

- None needed yet.

End-user/operator skills update:

- None needed.

Lessons:

- A 3-way guard collision in a hot path is exactly the kind of conflict where taking "ours" or "theirs" wholesale is actively wrong — comparing against the merge-base to see each side's independent intent was necessary here.

Follow-up mapping:

- Closed. Deep real-use validation (keyboard resize, mosaic-ease resize, rapid arrival during resize) remains tracked under SOW-0002, not as a follow-up of this SOW.

## Outcome

Closed: `onSizeChanged` chains all three early-return guards (`isEaseEcho`, `_keyboardResizingWindowId`, `arrivalPending`) as resolved in SOW-0004. No code change needed beyond what was already committed; this SOW only records the closure.

## Lessons Extracted

None beyond what SOW-0004 already recorded.

## Followup

None — real-use validation belongs to SOW-0002.

## Regression Log

None yet.
