# SOW-0011 - Upstream Sync Conflict: windowing.js

## Status

Status: completed

Sub-state: User chose to finish the sacred-only split (2026-07-12). Implementation revealed the original framing here was partly wrong — see "Correction" in Analysis — and converged on a smaller, cleaner fix than either originally-presented option: `moveOversizedWindow` now has its dead sacred branch removed entirely (zero remaining callers needed it), and `tryEnterSacred` (the one genuine remaining isolation trigger) was neutralized to retile in place instead. Committed in `0643414`.

## Requirements

### Purpose

Present the real bug found in `extension/windowing.js`'s `moveOversizedWindow` during the SOW-0004 upstream rebase, explain why it was resolved conservatively rather than taking either side's raw diff, and get the user's decision on how SOW-0003 should finish handling this function.

### User Request

Part of: "make it so that we rebase first and then have one pending sow for each conflict, so we can compare features." (See SOW-0004.)

### Assistant Understanding

Facts:

- `moveOversizedWindow(window, options)` is a shared function used for two distinct purposes across the codebase: (1) isolating a sacred (maximized/fullscreen) window onto its own adjacent/new workspace (the pre-SOW-0003 model), and (2) placing an ordinary overflowing window (one that doesn't fit in mosaic) onto an adjacent/new workspace — a completely unrelated, still-needed feature.
- It is called from **7 sites** across the tree (`git grep -n "moveOversizedWindow"`): `dragHandler.js:193`, `resizeHandler.js:233`, `tiling.js:1709`, `tiling.js:1849`, `tiling.js:2874`, `windowHandler.js:396`, and internally within `windowing.js` itself.
- Of these, `tiling.js:1709` ("Expelling non-edge-tiled window"), `tiling.js:1849` ("Overflow move failed for ref window"), `tiling.js:2874` ("Rebalance overflow"), and `windowHandler.js:396` ("Re-include: Smart resize not applicable - moving to overflow") are **general overflow paths, not restricted to sacred windows** — they call this function for perfectly ordinary windows that simply don't fit.
- The local WIP's raw diff added, at the top of `moveOversizedWindow`:
  ```js
  if (!isSacred) {
      Logger.log(`moveOversizedWindow: refusing cross-workspace move for non-sacred window ${window.get_id()}`);
      resolve(null);
      return;
  }
  ```
  This would make the function **immediately refuse and no-op for every non-sacred window** — silently breaking all 4 general-overflow call sites listed above. A window that doesn't fit would simply never be moved to another workspace; it would likely stay stuck, overlapping siblings, with no error surfaced (the callers only `.catch()`, and `resolve(null)` is not an error).
- Separately, the WIP's later hunk (placement branching) only kept the sacred-isolation branch and dropped the entire non-sacred `else` branch (adjacent-workspace-fit / new-workspace-creation logic) — consistent with the same (incorrect, if taken literally) assumption that this function would only ever be called for sacred windows now. Taking that hunk literally, combined with a redeclared `const isSacred` a few lines earlier in the same block scope, would also have produced a **duplicate `const` declaration in the same scope — a `SyntaxError` that would have broken the build entirely**, not just a silent behavior regression.
- `dragHandler.js:193` and `resizeHandler.js:233` (the "Sacred isolation failed" catch-message call sites) still call this function expecting it to *isolate* a sacred window — meaning the upstream/old "isolate sacred windows" behavior is still actively invoked from those two files in this WIP snapshot, even though SOW-0003's stated goal is to eliminate that isolation. This suggests `tryEnterSacred`-style callers in `dragHandler.js`/`resizeHandler.js` are simply not yet updated as part of SOW-0003's still-"implementing" status.

Inferences:

- This function was very likely mid-refactor in the user's own WIP: the intent may have been "make `moveOversizedWindow` sacred-only, and reroute the 4 general-overflow call sites through a new/different function" — but that rerouting was never done, leaving the guard as a dangling, breaking change.
- Because of the syntax-error risk and the certain functional breakage, this is not a case where "keep the local WIP's intent" was safe to do literally — doing so would have handed back a build that either doesn't parse or silently disables window overflow for ordinary windows.

Unknowns:

- Whether the user intends to (a) finish the refactor by rerouting the 4 general-overflow call sites to a new sacred-agnostic overflow function and keep the refusal guard, or (b) drop the refusal guard entirely and let `moveOversizedWindow` continue serving both purposes, with sacred-specific behavior handled entirely by the newer `_restoreExistingSacredForIncomingWindow`/`ensureWindowFits` paths (tracked in SOW-0010) that already intercept sacred arrivals *before* they'd ever reach `moveOversizedWindow`.
- Whether `dragHandler.js:193` and `resizeHandler.js:233` (still isolating on sacred) are meant to be removed/disabled as SOW-0003 continues, or left as a redundant safety net.

### Acceptance Criteria

- The user decides the long-term role of `moveOversizedWindow` under SOW-0003 before that SOW is considered ready to close, and confirms the temporary resolution (function left fully functional for both sacred and non-sacred cases, matching upstream's tested behavior plus the WIP's added diagnostic logging) is acceptable in the meantime.

## Analysis

Sources checked:

- `extension/windowing.js` (post-resolution), `git show origin/main:extension/windowing.js`, `git show a02037a:extension/windowing.js`, `git grep -n "moveOversizedWindow"` across `a02037a`, and the call-site context for each of the 7 usages.

Current state (as resolved in SOW-0004, committed to `main` at `1f6657f`) — `moveOversizedWindow` retains its full original branching:

```js
    moveOversizedWindow(window, options = { switchFocus: true }) {
        return new Promise(resolve => {
            const workspaceManager = global.workspace_manager;
            const monitor = window.get_monitor();
            const isSacred = this.isMaximizedOrFullscreen(window);
            const stack = (new Error().stack ?? '')
                .split('\n').slice(1, 4).map(line => line.trim()).join(' | ');
            Logger.log(`[MOVE OVERSIZED] request window=${window.get_id()} sacred=${isSacred} monitor=${monitor} options=${JSON.stringify(options)} stack=${stack}`);

            // Notify that overflow is starting
            ...
            const nextIndex = currentIndex + 1;
            ...
            let target_workspace = null;
            const nextWorkspace = nextIndex < totalWorkspaces ? workspaceManager.get_workspace_by_index(nextIndex) : null;

            if (isSacred) {
                Logger.log(`[PLACEMENT] Sacred window detected - targeting strictly WS-${nextIndex} for isolation`);
                target_workspace = this.createOrReuseAdjacentWorkspace(workspaceManager.get_workspace_by_index(currentIndex));
            } else {
                Logger.log(`[PLACEMENT] Overflow window detected - targeting strictly WS-${nextIndex}`);
                if (nextWorkspace && this._tilingManager && this._tilingManager.canFitWindow(window, nextWorkspace, monitor)) {
                    target_workspace = nextWorkspace;
                } else {
                    target_workspace = this.createOrReuseAdjacentWorkspace(workspaceManager.get_workspace_by_index(currentIndex));
                }
            }
            ...
```

The refusal guard (`if (!isSacred) { resolve(null); return; }`) and the duplicate `const isSacred` were both dropped; the diagnostic logging line was kept since it's harmless and useful.

Risks:

- **If the user later reintroduces the refusal guard without first rerouting the 4 general-overflow call sites, normal window overflow will break again.** This is the primary risk to track.
- The still-isolating call sites in `dragHandler.js`/`resizeHandler.js` (sacred `tryEnterSacred` paths) mean sacred isolation is not actually fully disabled everywhere yet in this WIP — SOW-0003 should not be marked `completed` until this is reconciled (either those call sites are updated/removed, or a deliberate decision is recorded that they should remain as a fallback).

**Correction (found while implementing, 2026-07-12):** the claim above that `dragHandler.js:198` (renumbered from `:193` after later commits) is a sacred-isolation call site was wrong. Re-checked its actual context: it fires from `_grabOpEndHandler` for `this._dragOverflowWindow`, which is only ever set at `dragHandler.js:131` behind an explicit `!this.windowingManager.isMaximizedOrFullscreen(window)` guard — this is a general drag-overflow case, never a sacred window. The **only** genuine sacred-isolation call site in the whole tree was `resizeHandler.js`'s `tryEnterSacred` (then line 297). This changed the right shape of the fix: instead of creating a new `moveOverflowWindow` function and rerouting 6 general call sites away from a sacred-only `moveOversizedWindow`, the simpler and smaller fix was to neutralize the one real isolation trigger (`tryEnterSacred`) and then delete the now-fully-dead sacred branch from `moveOversizedWindow` itself — no call sites needed to change at all, since none of the 6 general-overflow callers ever pass a sacred window in the first place (verified individually: `windowHandler.js` Path 5 "Overflow (Final fallback)" and the "Re-include" path both run only after sacred windows are intercepted earlier in the same functions; `tiling.js`'s three call sites are each explicitly guarded by `!isMaximizedOrFullscreen` or drawn from a pre-filtered window list).

**What was actually implemented** (`extension/windowing.js`, `extension/resizeHandler.js`, `extension/constants.js`, `extension/tiling.js`, committed in `0643414`):

- `moveOversizedWindow`: removed the `isSacred` computation, the `sacred=` diagnostic log field, and the entire `if (isSacred) {...} else {...}` branch — replaced with just the general (fit-adjacent-or-create-new) placement logic, unconditionally. Kept the function's name (still accurate: "moves a window that doesn't fit") since there was no longer a second use case to separate it from.
- `resizeHandler.js`'s `tryEnterSacred`: after the debounce confirms the window is still sacred, it now calls `this.tilingManager.tileWorkspaceWindows(currentWorkspace, null, currentMonitor, false)` to let siblings coexist, instead of calling `moveOversizedWindow` to isolate it. Removed the now-unused `preMaxSize`/`originalWorkspaceIndex` locals and the `maximizedUndoInfo` tracking that existed solely to hand data from the isolate step to the later restore step.
- Updated the header comment on `tryEnterSacred`, two "skipping isolation" log messages nearby, and `constants.js`'s `SACRED_ENTER_DEBOUNCE_MS` doc comment, all of which described the now-removed isolate behavior.
- Fixed a stale comment in `tiling.js`'s `savePreferredSize` ("Skip sacred windows - managed by maximizedUndoInfo") that referenced the tracking mechanism just removed; the skip behavior itself was unchanged and still correct (a sacred window's frame is the monitor size, not a real preferred size).

**New dead code discovered, not removed (flagged as a follow-up):** with `maximizedUndoInfo` never set anymore, `resizeHandler.js`'s `handleUnmaximizeUndo` (only called when that key exists) is now unreachable, along with `scheduleSacredRestoreSafety`, `completeSacredReturn`, and the `isRestoringSacred` `WindowState` flag (set only inside `handleUnmaximizeUndo`, read in 3 places in `tiling.js`). Left in place rather than removed in this pass — this goes beyond what was scoped/approved here (finishing the `moveOversizedWindow` split plus neutralizing `tryEnterSacred`), and removing ~80 lines of now-dead restore-tracking machinery is a separate cleanup decision that should be made deliberately under SOW-0003, not folded silently into this conflict-resolution SOW.

## Pre-Implementation Gate

Status: needs-user-decision

Problem / root-cause model:

- SOW-0003's WIP began repurposing `moveOversizedWindow` into a sacred-only function but did not finish rerouting its non-sacred callers, leaving a guard that would break 4 call sites and a redeclaration that would break the build. Resolved by reverting this specific function to its fully-functional (upstream-equivalent) form while preserving the WIP's diagnostic logging, deferring the actual design decision to the user.

Evidence reviewed:

- See Analysis above.

Affected contracts and surfaces:

- `extension/windowing.js` `moveOversizedWindow` — shared by sacred-isolation and general-overflow placement across `dragHandler.js`, `resizeHandler.js`, `tiling.js`, `windowHandler.js`.

Existing patterns to reuse:

- `_restoreExistingSacredForIncomingWindow` and the `ensureWindowFits`/`onWindowCreated` sacred-arrival checks (SOW-0010) already intercept sacred windows *before* they'd reach this function in the two call paths that matter most for SOW-0003's headline behavior — meaning `moveOversizedWindow` may not even need its own sacred-vs-general split at all if those upstream interception points are sufccient.

Risk and blast radius:

- High: this function sits on the general window-overflow path, which is core, frequently-exercised behavior (any window too big to fit gets moved here). A regression here would be immediately visible and disruptive.

Sensitive data handling plan:

- Not applicable.

Implementation plan:

1. Await user decision on the two options below.
2. If Option A: reroute the 4 general-overflow call sites to a new function (e.g. `moveOverflowWindow`), then reintroduce the sacred-only refusal in `moveOversizedWindow`, and update/remove the still-isolating calls in `dragHandler.js:193`/`resizeHandler.js:233`.
3. If Option B: leave `moveOversizedWindow` as fully general-purpose (current state), and separately decide (in SOW-0003) whether `dragHandler.js:193`/`resizeHandler.js:233` should stop calling it for sacred windows, relying entirely on the `ensureWindowFits`/`onWindowCreated` interception points instead.

Validation plan:

- Real-use validation via `./scripts/run-gnome-shell.sh`: (1) create more windows than fit on a monitor and confirm the overflow window still lands on an adjacent/new workspace (general-overflow regression check); (2) maximize/fullscreen a window and confirm it does NOT get isolated to a new workspace (SOW-0003's headline check) — both deferred to SOW-0003 resumption.

Artifact impact plan:

- AGENTS.md: unaffected.
- Runtime project skills: unaffected.
- Specs: `.agents/sow/specs/extension-behavior.md:27` update deferred to SOW-0003, contingent on which option is chosen here.
- End-user/operator docs: unaffected for now.
- End-user/operator skills: none exist.
- SOW lifecycle: this SOW closes once the user decides; the actual refactor (if Option A) or cleanup (if Option B) is implemented under SOW-0003.

Open-source reference evidence:

- Not applicable.

Open decisions:

1. **Option A — Finish the split**: create a dedicated general-overflow function, reroute the 4 non-sacred call sites to it, keep `moveOversizedWindow` sacred-only, and remove/update the still-isolating calls in `dragHandler.js`/`resizeHandler.js`. Pro: cleanest long-term separation of concerns, matches what the WIP's diff appears to have been reaching for. Con: more implementation work, touches 6 files.
2. **Option B — Keep `moveOversizedWindow` general-purpose (current temporary state)**: rely on the already-updated `ensureWindowFits`/`onWindowCreated` interception points (SOW-0010) to keep sacred windows from ever reaching this function during normal arrival flows, and separately decide whether the two remaining direct-isolation call sites (`dragHandler.js:193`, `resizeHandler.js:233`) are dead code to remove or an intentional fallback to keep. Pro: smaller change, lower risk, function keeps working for everything today. Con: leaves a not-fully-explicit sacred/general split inside one function, and leaves those two call sites unreconciled with SOW-0003's stated goal until addressed.

Recommendation: **Option B** as the immediate path — superseded; see "What was actually implemented" above. The user chose to finish the split (Option A framing), but investigation showed the real fix was smaller than Option A described (no new function or call-site reroutes were needed, since only one genuine sacred-isolation caller existed and it has been neutralized directly).

## Implications And Decisions

1. **Finish the sacred-only split** — user chose this (2026-07-12). Implemented as: delete `moveOversizedWindow`'s now-fully-dead sacred branch, and neutralize `tryEnterSacred` (the one real remaining isolation trigger) to retile in place instead of isolating. No general-overflow call site needed to change, since none of them ever passed a sacred window (verified individually per call site).
2. **Dead-code removal (`handleUnmaximizeUndo` and related)** — deferred, not decided here. Flagged as a new SOW-0003 follow-up rather than folded into this pass, since it's a separate, larger cleanup decision.

## Plan

1. ~~Await user decision.~~ Done — user chose to finish the split.
2. ~~Whichever option is chosen, record it in SOW-0003.~~ Done — see the cross-reference note appended to SOW-0003's execution log.

## Execution Log

### 2026-07-12

- Found while comparing the WIP's raw diff against the merge-base: the refusal guard would have broken 4 call sites, and a redeclared `const isSacred` would have thrown a `SyntaxError`. Resolved by reverting this function to its fully-functional form (matching upstream) while keeping the WIP's added diagnostic logging, and flagged the underlying design decision here rather than resolving it unilaterally.
- User chose to finish the sacred-only split. Before implementing, re-verified every call site individually (rather than trusting the earlier summary) and found the original "2 still-isolating call sites" claim was half-wrong: `dragHandler.js`'s call is general-overflow, not sacred. Only `resizeHandler.js`'s `tryEnterSacred` was genuine.
- Implemented: removed `moveOversizedWindow`'s dead sacred branch; changed `tryEnterSacred` to retile in place instead of isolating; updated the comments/log messages that described the old behavior; fixed one stale comment in `tiling.js` referencing the removed `maximizedUndoInfo` mechanism.
- Verified with `node --check` on all 4 touched files, `npm run lint`, and `./scripts/build.sh -b` (build-only, not installed) — all passed. Committed as `0643414`.
- Discovered (but did not remove) a chunk of now-dead code downstream of this change (`handleUnmaximizeUndo`, `scheduleSacredRestoreSafety`, `completeSacredReturn`, `isRestoringSacred`); flagged as a new SOW-0003 follow-up.
- SOW closed and moved to `.agents/sow/done/`.

## Validation

Acceptance criteria evidence:

- User decided the long-term role of `moveOversizedWindow` (2026-07-12): general-overflow only, sacred branch removed. Implemented and committed in `0643414`.

Tests or equivalent validation:

- `node --check` on `windowing.js`, `resizeHandler.js`, `tiling.js`, `constants.js`; `npm run lint`; `./scripts/build.sh -b` (build-only, not installed) — all passed post-implementation.

Real-use evidence:

- Not yet performed. General-overflow regression check and sacred-non-isolation check are both still required before SOW-0003 can close (see Validation plan above) — this SOW's code change makes that validation possible but does not substitute for it.

Reviewer findings:

- None requested.

Same-failure scan:

- `git grep -n "moveOversizedWindow"` was used specifically to find every call site before deciding how to resolve this conflict, and re-run again before implementing the chosen option — the second pass is what caught the incorrect "2 still-isolating call sites" claim from the first pass. Also grepped for `maximizedUndoInfo`/`isolat` across `extension/` afterward to find other now-stale comments and confirm no other live code depended on the removed tracking.

Sensitive data gate:

- N/A.

Artifact maintenance gate:

- Specs update deferred to SOW-0003, since the shipped behavior (`.agents/sow/specs/extension-behavior.md:27`) should be updated once SOW-0003's real-use validation confirms the full feature works end to end, not piecemeal per conflict SOW.

Specs update:

- Deferred to SOW-0003.

Project skills update:

- None needed.

End-user/operator docs update:

- None needed yet.

End-user/operator skills update:

- None needed.

Lessons:

- A blanket "prefer local WIP" default is not safe when the WIP is itself an unfinished refactor — checking every call site of a shared function before resolving its conflict is what caught a would-be regression that neither side's raw diff, nor the conflict markers alone, made obvious.
- Even a carefully-evidenced SOW can still get a specific claim wrong (the "2 still-isolating call sites" count) — re-verifying each call site individually right before implementing, rather than trusting the earlier write-up, caught it before any unnecessary code churn (a new function + 6 rerouted call sites) was created for a problem that only needed a 1-caller fix.

Follow-up mapping:

- Closed. Two items handed to SOW-0003: (1) real-use validation of both the general-overflow and sacred-non-isolation paths, (2) whether to remove the now-dead `handleUnmaximizeUndo`/`scheduleSacredRestoreSafety`/`completeSacredReturn`/`isRestoringSacred` machinery.

## Outcome

Closed: `moveOversizedWindow` is now general-overflow-only (dead sacred branch removed), and `tryEnterSacred` retiles siblings in place instead of isolating — the last live path that still isolated a sacred window. Implemented and committed in `0643414`, validated with lint/build/syntax checks (not yet real-use tested; that belongs to SOW-0003).

## Lessons Extracted

See Lessons above.

## Followup

- SOW-0003: real-use validate the general-overflow and sacred-coexistence paths together.
- SOW-0003: decide whether to remove the now-dead restore-tracking code flagged above.

## Regression Log

None yet.
