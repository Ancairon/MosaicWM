# SOW-0010 - Upstream Sync Conflict: windowHandler.js

## Status

Status: completed

Sub-state: User acknowledged both hunks as direct applications of SOW-0003's already-recorded decisions on 2026-07-12. Closed with no further code changes — already committed in SOW-0004 (`1f6657f`). Real-use behavioral validation of the underlying sacred-isolation-disable behavior remains SOW-0003's responsibility, not re-tested here.

## Requirements

### Purpose

Present the two conflicts found in `extension/windowHandler.js` during the SOW-0004 upstream rebase, and record a duplication that was avoided during resolution.

### User Request

Part of: "make it so that we rebase first and then have one pending sow for each conflict, so we can compare features." (See SOW-0004.)

### Assistant Understanding

Facts:

- **Hunk 1** (`_ensureWindowFits`, "Path 1"): upstream kept its original comment ("Path 1: Sacred Isolation (symmetric isolation enforcement)...") and, in this same rebase, independently added an "already constrained" fast-path check right before it. The local WIP's diff also contains that identical "already constrained" fast-path block — but it was **already present, unchanged, a few lines further down** in the same function (both the merge-base and the WIP have it there). Taking the WIP's conflict-side content literally would have duplicated that exact check (once from the conflict hunk, once from the pre-existing unconflicted code just below it) — harmless in effect (the first occurrence would always fire first, making the second unreachable) but sloppy dead code. **Resolved by taking only the local WIP's updated comment** ("Path 1: Sacred window arrives - keep it on current workspace. Isolation to a new workspace is disabled...") and omitting the duplicate block.
- **Hunk 2** (`onWindowCreated`): the code just above this hunk (unconflicted, already common to both sides) has its own `if (isMaximizedOrFullscreen(window)) { ...keep on current workspace...; return; }` guard for when the *new* window itself is sacred. This hunk is instead about an *existing* sacred window already on the workspace the new (non-sacred) window is arriving into. Upstream still isolates in this case (`moveOversizedWindow(window)`, the old model). Local replaces it with a call to the new `_restoreExistingSacredForIncomingWindow(...)` helper, consistent with SOW-0003's no-isolation goal. Kept local's version in full — clean semantic replacement, no dangling references, no other call site depends on the removed branch.

Inferences:

- Both hunks are consistent, deliberate applications of SOW-0003's already-recorded decisions (see that SOW's "Decision 3B"/"Decision 4C" on restore-trigger scope), not new design questions.

Unknowns:

- None beyond what SOW-0003 itself still needs to validate end-to-end (real-use testing of arrival/restore behavior).

### Acceptance Criteria

- The user confirms no duplicate "already constrained" check exists in `_ensureWindowFits` (verified below) and that the `onWindowCreated` replacement matches intended SOW-0003 behavior.

## Analysis

Sources checked:

- `extension/windowHandler.js` (post-resolution), `git show origin/main:extension/windowHandler.js`, `git show a02037a:extension/windowHandler.js`, `.agents/sow/current/SOW-0003-20260624-disable-sacred-isolation.md`.

Current state (as resolved in SOW-0004, committed to `main` at `1f6657f`), Hunk 1 in context:

```js
        if (WindowState.get(window, 'restoringFromMiniature')) {
            Logger.log(`ensureWindowFits: Skipping - restoring from miniature for ${window.get_id()}`);
            return workspace;
        }

        // Path 1: Sacred window arrives - keep it on current workspace.
        // Isolation to a new workspace is disabled; maximized/fullscreen windows coexist with siblings.
        const isIncomingSacred = this.windowingManager.isMaximizedOrFullscreen(window);
        if (isIncomingSacred) {
            Logger.log('Sacred window arrives - keeping on current workspace (isolation disabled)');
            this.tilingManager.tileWorkspaceWindows(workspace, null, monitor, false);
            return workspace;
        }

        if (this._restoreExistingSacredForIncomingWindow(window, workspace, monitor, '_ensureWindowFits')) {
            return workspace;
        }

        // Already constrained, so sibling frames may not have settled yet; tile directly to avoid false overflow.
        if (WindowState.get(window, 'isConstrainedByMosaic')) {
            ...
        }
```

Confirmed: the "already constrained" check appears exactly once (the pre-existing occurrence further down), not duplicated.

Hunk 2, resolved:

```js
                if (this._restoreExistingSacredForIncomingWindow(window, workspace, monitor, 'onWindowCreated')) {
                    return GLib.SOURCE_REMOVE;
                }
```

Risks:

- None identified for these two hunks specifically. The broader open question of whether `moveOversizedWindow` (called elsewhere, e.g. line 850 area historically) should still isolate at all is tracked in SOW-0011, not here — this file's own logic no longer calls it for the cases these two hunks cover.

## Pre-Implementation Gate

Status: ready

Problem / root-cause model:

- Both hunks are upstream's untouched "old isolate" model colliding with local's already-decided "no isolation, restore/keep-in-place" model from SOW-0003. Not a real design fork — SOW-0003 already recorded the decision.

Evidence reviewed:

- See Analysis above.

Affected contracts and surfaces:

- `extension/windowHandler.js` — `_ensureWindowFits` and `onWindowCreated`.

Existing patterns to reuse:

- `_restoreExistingSacredForIncomingWindow` (already defined elsewhere in the WIP, unconflicted) is the shared helper both call sites now use.

Risk and blast radius:

- Low — consistent, already-decided policy application; no dangling references found.

Sensitive data handling plan:

- Not applicable.

Implementation plan:

1. No further action needed for these two hunks specifically.

Validation plan:

- Real-use validation via `./scripts/run-gnome-shell.sh`: open a new window while a maximized window already occupies the workspace, confirm it restores/keeps the maximized window in place rather than isolating it — deferred to SOW-0003 resumption (shared with SOW-0009's validation step).

Artifact impact plan:

- AGENTS.md: unaffected.
- Runtime project skills: unaffected.
- Specs: deferred to SOW-0003.
- End-user/operator docs: unaffected for now.
- End-user/operator skills: none exist.
- SOW lifecycle: close once the user confirms.

Open-source reference evidence:

- Not applicable.

Open decisions:

- None blocking — recommend closing this SOW once the user has reviewed it, since both hunks are direct, uncontroversial applications of SOW-0003's own recorded decisions.

## Implications And Decisions

1. **Both hunks confirmed as direct applications of SOW-0003's recorded decisions** — user acknowledged (2026-07-12); no changes requested.

## Plan

1. ~~Await user acknowledgment.~~ Done — acknowledged.

## Execution Log

### 2026-07-12

- Resolved in SOW-0004; caught and avoided a duplicate "already constrained" block in Hunk 1 by checking the surrounding unconflicted code before resolving.
- User acknowledged both hunks; SOW closed and moved to `.agents/sow/done/`. Real-use validation of the underlying behavior remains tracked under SOW-0003.

## Validation

Acceptance criteria evidence:

- Confirmed no duplicate block exists (see Analysis).

Tests or equivalent validation:

- `npm run lint` and `node --check extension/windowHandler.js` both pass (see SOW-0004).

Real-use evidence:

- Deferred to SOW-0003 resumption.

Reviewer findings:

- None requested.

Same-failure scan:

- Checked all other conflicted files for a similar "conflict-side content duplicates already-present unconflicted code" pattern; none found elsewhere.

Sensitive data gate:

- N/A.

Artifact maintenance gate:

- No artifact changes needed for this item alone; specs update deferred to SOW-0003.

Specs update:

- Deferred to SOW-0003.

Project skills update:

- None needed.

End-user/operator docs update:

- None needed yet.

End-user/operator skills update:

- None needed.

Lessons:

- Always check whether a conflict-side hunk duplicates content that already exists nearby, unconflicted, before taking it wholesale — conflict markers only show the disputed lines, not the surrounding context that reveals duplication.

Follow-up mapping:

- Closed. Real-use validation of the underlying sacred-arrival/restore behavior remains tracked under SOW-0003, not as a follow-up of this SOW.

## Outcome

Closed: both `windowHandler.js` hunks (the "Path 1: Sacred window arrives" comment/logic and the `onWindowCreated` restore-existing-sacred replacement) are confirmed as direct, uncontroversial applications of SOW-0003's already-recorded decisions, as resolved in SOW-0004. No code change needed beyond what was already committed; this SOW only records the user's acknowledgment and closes the tracking item.

## Lessons Extracted

None beyond what SOW-0004 already recorded.

## Followup

None — real-use validation of the behavior itself belongs to SOW-0003.

## Regression Log

None yet.
