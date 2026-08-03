# SOW-0009 - Upstream Sync Conflict: tiling.js

## Status

Status: completed

Sub-state: User decided (2026-07-12) to keep the flagged early return for now and revisit it during SOW-0003's own real-use validation pass (Option 2), rather than deciding blind mid-rebase. Closed with no code change here. A second, related discovery (see Analysis) was found afterward while implementing SOW-0011 and has been cross-referenced into SOW-0003 for the same validation pass.

## Requirements

### Purpose

Present the three conflicts found in `extension/tiling.js` during the SOW-0004 upstream rebase, and flag a specific hunk that looks like it reintroduces the exact bug SOW-0003 is meant to fix.

### User Request

Part of: "make it so that we rebase first and then have one pending sow for each conflict, so we can compare features." (See SOW-0004.)

### Assistant Understanding

Facts:

- **Hunk 1** (inside the function that builds swap candidate lists): upstream made no change at this exact spot (blank on that side). Local WIP adds `meta_windows = meta_windows.filter(w => !this._windowingManager.isMaximizedOrFullscreen(w));` — filters sacred windows out of the swap-candidate list so tiling only considers non-sacred siblings. No concern; pure insertion, kept as-is.
- **Hunk 2** (inside `tileWorkspaceWindows`, **the flagged one**): the local WIP adds:
  ```js
  if (workspace_windows.some(w => this._windowingManager.isMaximizedOrFullscreen(w))) {
      Logger.log(`tileWorkspaceWindows: Sacred window present on workspace ${workspace.index()} monitor ${monitor} - preserving existing layout cache`);
      this._unlockWorkspaceEarlyReturn(workspace);
      return { overflow: false, layout: null };
  }
  ```
  This bails out of the *entire* tiling pass for the workspace whenever any sacred window is present — before edge-tiling, swap-list building, or any layout computation runs.
- SOW-0003's own recorded facts state: "`tiling.js/_getWorkingInfo` returns `false` (bailing the entire tile pass) when any maximized/fullscreen window is present in the workspace — **this must change so siblings can be tiled while a maximized window coexists**." (`.agents/sow/current/SOW-0003-20260624-disable-sacred-isolation.md:33`)
- `_getWorkingInfo` is called earlier in the same function (line ~1912) and its own bail-out is handled separately (`if (!working_info) { ...; return; }`). The flagged hunk is a *second*, independent bail-out mechanism added further down, checking `workspace_windows` directly rather than going through `_getWorkingInfo`.
- **Hunk 3** (`canFitWindow`): local WIP replaces the old "Symmetric Isolation Policy" (sacred windows only fit in empty workspaces) with a direct "sacred windows always fit, isolation disabled" check. This one is consistent with SOW-0003's stated goal and was kept as-is with no concern.

Inferences:

- Hunk 2 looks like an intermediate, not-yet-reconciled state: it appears to reintroduce the same "don't tile a workspace with a sacred window present" bailout that SOW-0003 says must be removed, just via a different code path than the one SOW-0003 explicitly names. This is plausible for a SOW whose own sub-state is "implementing" (not finished) — the developer may have added this as a temporary safety net while `_getWorkingInfo` was being reworked, and not yet removed it.
- Alternatively, this could be intentional for a narrower reason not yet written into SOW-0003 (e.g., "don't recompute layout while a sacred window's frame is still settling, to avoid flicker" — a caching/timing concern rather than a permanent policy). Nothing in the current WIP or either SOW's text confirms this alternative reading.

Unknowns:

- Whether this early return is a leftover the user intends to remove as SOW-0003 continues, or a deliberate (but undocumented) caching guard. This is the single most important open question among all 7 conflict SOWs regarding SOW-0003's correctness. Resolved for now by deferring to SOW-0003's own validation (see Implications And Decisions).

Related discovery (found 2026-07-12 while implementing SOW-0011, not part of the original rebase conflict):

- `tiling.js` (current line numbers, post SOW-0011 fix), inside the function that computes overflow for a reference window: `if (workspace_windows.length <= 1) { overflow = false; } else { for (const window of workspace_windows) if (this._windowingManager.isMaximizedOrFullscreen(window)) overflow = true; }` — this sets `overflow = true` whenever **any** window on the workspace is sacred, not specifically the reference window being placed. Combined with the overflow-ejection logic a few lines later (`this._windowingManager.moveOversizedWindow(reference_meta_window)`, now the general-overflow function per SOW-0011), this means: whenever a sacred window is present anywhere on a workspace, the next ordinary window to arrive/resize can get treated as "overflowing" and ejected to another workspace, even if it would otherwise fit fine. This is the same family of bug as this SOW's flagged hunk (sacred presence incorrectly gating normal tiling/placement behavior) but in a different function. Not fixed here — same reasoning as the flagged hunk above: this is a SOW-0003 correctness question, not rebase mechanics, and should be validated together with it.

### Acceptance Criteria

- The user decides whether to keep, remove, or narrow this early return before SOW-0003 is considered ready to validate end-to-end.

## Analysis

Sources checked:

- `extension/tiling.js` (post-resolution), `git show origin/main:extension/tiling.js`, `git show a02037a:extension/tiling.js`, `.agents/sow/current/SOW-0003-20260624-disable-sacred-isolation.md`.

Current state (as resolved in SOW-0004, committed to `main` at `1f6657f`) — the flagged block, in context:

```js
        const working_info = this._getWorkingInfo(workspace, reference_meta_window, _monitor, excludeFromTiling);
        if(!working_info) {
            this._unlockWorkspaceEarlyReturn(workspace);
            return { overflow: false, layout: null };
        }
        let meta_windows = working_info.meta_windows;
        const windows = working_info.windows;
        let work_area = working_info.work_area;
        const monitor = working_info.monitor;

        const workspace_windows = this._windowingManager.getMonitorWorkspaceWindows(workspace, monitor);
        if (workspace_windows.some(w => this._windowingManager.isMaximizedOrFullscreen(w))) {
            Logger.log(`tileWorkspaceWindows: Sacred window present on workspace ${workspace.index()} monitor ${monitor} - preserving existing layout cache`);
            this._unlockWorkspaceEarlyReturn(workspace);
            return { overflow: false, layout: null };
        }

        let edgeTiledWindows = [];
        ...
```

Risks:

- **If left as-is, this early return means `tileWorkspaceWindows` never actually retiles siblings while any sacred window is present on the workspace** — which is very likely to make SOW-0003's headline behavior (siblings retile normally alongside a coexisting maximized/fullscreen window) simply not work in practice, regardless of what `_getWorkingInfo` or `canFitWindow` now allow. This would only be caught by real-use testing (`./scripts/run-gnome-shell.sh`), which has not yet been performed for SOW-0003.
- Removing it outright without understanding why it was added risks losing an intentional (if undocumented) safety net around layout-cache timing.

## Pre-Implementation Gate

Status: needs-user-decision

Problem / root-cause model:

- SOW-0003's implementation appears incomplete: one code path (`_getWorkingInfo`, and `canFitWindow`) was updated to stop treating sacred windows as tiling-blocking, but a second, independent bail-out (`tileWorkspaceWindows`'s own `workspace_windows.some(isMaximizedOrFullscreen)` check) still exists and would produce the same net effect (no tiling while a sacred window is present) that the SOW's acceptance criteria says must be fixed.

Evidence reviewed:

- See Analysis above and the direct SOW-0003 citation.

Affected contracts and surfaces:

- `extension/tiling.js` `tileWorkspaceWindows` — the core per-workspace tiling entry point, called from many other files.

Existing patterns to reuse:

- `_getWorkingInfo`'s own bail-out pattern (`if (!working_info) { this._unlockWorkspaceEarlyReturn(workspace); return {...}; }`) is already the established way to skip tiling for a workspace; the flagged hunk duplicates that pattern via a separate condition.

Risk and blast radius:

- High if left unresolved: this is the central tiling entry point; an incorrect bail-out here silently disables retiling for any workspace containing a maximized/fullscreen window, which after SOW-0003 ships will be a much more common situation (since sacred windows no longer get moved to their own workspace).

Sensitive data handling plan:

- Not applicable.

Implementation plan:

1. Await the user's decision (see Open decisions).
2. If removed: delete the flagged block; verify tiling still correctly excludes sacred windows from the swap/layout math via the already-present filters (Hunk 1 in this file, and `_getWorkingInfo`/`canFitWindow` changes tracked in SOW-0003).
3. If narrowed: replace the blanket bail-out with whatever the real intended condition is (e.g., only skip while a sacred window's frame is mid-transition, using an existing transition-flag pattern from `resizeHandler.js`).

Validation plan:

- Real-use validation via `./scripts/run-gnome-shell.sh` is required regardless of which option is chosen: maximize one window among 2-3 siblings, then resize/move a sibling, and confirm the workspace actually retiles. This is the most important validation step across all 7 conflict SOWs, since it directly tests SOW-0003's headline acceptance criterion. Deferred to SOW-0003 resumption.

Artifact impact plan:

- AGENTS.md: unaffected.
- Runtime project skills: unaffected.
- Specs: `.agents/sow/specs/extension-behavior.md:27` ("Fullscreen and maximized windows receive dedicated workspaces") must be updated once SOW-0003 ships, regardless of this hunk's outcome — tracked there, not here.
- End-user/operator docs: unaffected for now.
- End-user/operator skills: none exist.
- SOW lifecycle: this SOW closes once the user decides; the real fix (if any) and its validation belong to SOW-0003.

Open-source reference evidence:

- Not applicable.

Open decisions:

1. **Remove the flagged early return entirely** — aligns with SOW-0003's stated acceptance criterion at face value. Risk: if it was guarding against a real timing/flicker issue, removing it could reintroduce that issue; would need real-use testing to confirm.
2. **Keep it for now, revisit during SOW-0003's own validation pass (Recommended as the immediate next step, not a final answer)** — since SOW-0003 is still "implementing" and this file is about to receive more changes anyway, treat this as a known, tracked issue to resolve during that SOW's own real-use validation rather than deciding blind, right now, mid-rebase.
3. **Narrow the condition** — e.g., only bail out while the sacred window is mid-transition (has an active `WindowState` transition flag), not simply "present." Requires identifying the right flag; not yet investigated.

## Implications And Decisions

1. **Option 2 selected**: keep the flagged early return for now; revisit during SOW-0003's own real-use validation pass rather than deciding blind mid-rebase. User confirmed 2026-07-12.

## Plan

1. ~~Await user decision.~~ Done — Option 2 selected.
2. Recorded in SOW-0003's execution log (append-only note, since SOW-0003 stays open) so both this issue and the related discovery above carry forward together.

## Execution Log

### 2026-07-12

- Identified during SOW-0004's conflict resolution; kept the WIP's code as-is (did not silently "fix" it) and flagged it here for explicit decision, since altering SOW-0003's in-progress logic is outside the scope of a rebase-conflict-resolution task.
- User selected Option 2 (defer to SOW-0003). While implementing SOW-0011 afterward, found a related, second occurrence of the same bug family (see Analysis) and cross-referenced it here and into SOW-0003 rather than fixing it unilaterally.
- SOW closed and moved to `.agents/sow/done/`; both flagged issues remain open follow-ups under SOW-0003.

## Validation

Acceptance criteria evidence:

- User decided to defer this to SOW-0003's own real-use validation (Option 2), 2026-07-12. That validation itself remains pending under SOW-0003.

Tests or equivalent validation:

- `npm run lint` and `node --check extension/tiling.js` both pass (see SOW-0004). No behavioral test has been run against this specific code path yet.

Real-use evidence:

- Not yet performed. This is the single highest-priority real-use test to run once SOW-0003 resumes.

Reviewer findings:

- None requested.

Same-failure scan:

- Checked `_getWorkingInfo` and `canFitWindow` (both already updated per SOW-0003's decisions) to confirm they do NOT contain an equivalent lingering bail-out — they don't; this hunk is the only one found.

Sensitive data gate:

- N/A.

Artifact maintenance gate:

- Specs update (`extension-behavior.md:27`) deferred to SOW-0003.

Specs update:

- Deferred to SOW-0003.

Project skills update:

- None needed.

End-user/operator docs update:

- None needed yet.

End-user/operator skills update:

- None needed.

Lessons:

- Reading a SOW's own recorded acceptance criteria while resolving an unrelated rebase conflict caught a probable implementation gap that conflict-marker text alone would never have surfaced.

Follow-up mapping:

- Closed here; both the original flagged hunk and the related discovery are cross-referenced into SOW-0003 and must be resolved (and real-use validated) before SOW-0003 can be marked `completed`.

## Outcome

Closed: user decided to defer the flagged `tileWorkspaceWindows` early return (and a related discovery in the overflow-computation logic found while implementing SOW-0011) to SOW-0003's own validation pass, rather than deciding blind mid-rebase. No code change made here; this SOW records the decision and hands both issues off intact.

## Lessons Extracted

- A rebase-conflict-resolution pass surfaced two related, non-trivial correctness questions in SOW-0003's still-in-progress feature that neither raw diff nor conflict markers made obvious — both are now explicit, evidence-backed follow-ups instead of silently-carried risk.

## Followup

- SOW-0003 must resolve and real-use validate: (1) the `tileWorkspaceWindows` early return flagged here, and (2) the related `overflow = true` when any sacred window is present, found in SOW-0011.

## Regression Log

None yet.
