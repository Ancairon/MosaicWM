# SOW-0007 - Upstream Sync Conflict: overviewLayout.js

## Status

Status: completed

Sub-state: REGRESSION corrected — this SOW's original resolution (re-adding the attached-dialog/transient filter) was wrong; see `## Regression - 2026-07-12` at the end of this file. Fix implemented, lint/build/syntax-validated, and committed (`73885e4`). Real-use confirmation (no `(0,0)` overlap with an attached dialog present) deferred to the nested-shell validation pass for SOW-0002/SOW-0003, matching how this SOW's original real-use evidence was always scoped.

## Requirements

### Purpose

Present the real feature-level difference found in `extension/overviewLayout.js` between the local SOW-0003 WIP and upstream, so the user can confirm the reconciled version is correct before SOW-0003 resumes.

### User Request

Part of: "make it so that we rebase first and then have one pending sow for each conflict, so we can compare features." (See SOW-0004.)

### Assistant Understanding

Facts:

- **Upstream (`origin/main`)**: `computeWindowSlots` is unchanged from the pre-sync baseline. It filters out attached dialogs and transient children (`filteredClones`) before laying out Overview thumbnails, and uses a simple fixed half-gap inset formula for every clone's slot — no special handling for maximized/fullscreen ("sacred") windows.
- **Local WIP (SOW-0003, `a02037a`)**: dropped the `filteredClones` dialog/transient filter entirely (its diff replaced that whole block with just a renamed comment), and added new logic: sort clones so sacred windows are placed first, compute a per-clone `isSacred` flag, apply a shrink factor (`SACRED_OVERVIEW_SHRINK_FACTOR` vs `OVERVIEW_SHRINK_FACTOR`) to mirrored thumbnail size, and resolve collisions via a new `findFreeSlot` helper so overview thumbnails never overlap.
- This overview change is not explicitly mentioned in either SOW-0002 or SOW-0003's stated purpose/acceptance criteria, but the `isSacred`/shrink-factor naming strongly ties it to SOW-0003: once sacred-window isolation is disabled, a maximized/fullscreen window can now appear in the *same* workspace overview as its siblings for the first time (previously it was always isolated onto its own workspace, so the overview never had to render both together) — a companion layout fix is a reasonable, likely-necessary consequence of SOW-0003's core change.
- Verified via `git show origin/main:extension/overviewLayout.js` and `git show a02037a:extension/overviewLayout.js` (not just conflict-marker text) that the dialog/transient filter genuinely disappears in the WIP's diff — this is not a rename or relocation.

Inferences:

- Dropping the dialog/transient filter looks like an accidental side effect of editing this function for the sacred-window feature, not a deliberate decision — no SOW records a reason to stop filtering attached dialogs.
- The resolution applied in SOW-0004 combines both: kept the dialog/transient filter, and rewired `orderedClones` to sort from `filteredClones` instead of unfiltered `clones` (previously, taking the WIP's diff literally would have left `filteredClones` defined but unused — dead code, with dialogs still leaking through unfiltered).

Unknowns:

- Whether the user actually intended to drop dialog filtering for some reason not recorded in either SOW. Needs explicit confirmation.

### Acceptance Criteria

- The user confirms combining both behaviors (dialog filter + sacred shrink/collision logic) is correct, or specifies the intended behavior if not.

## Analysis

Sources checked:

- `extension/overviewLayout.js` (post-resolution), `git show origin/main:extension/overviewLayout.js`, `git show a02037a:extension/overviewLayout.js`, `git show 6bb3932:extension/overviewLayout.js` (merge-base).

Current state (as resolved in SOW-0004, already committed to `main` at `1f6657f`):

```js
computeWindowSlots(layout, area) {
    const clones = layout.windows;
    if (!area || clones.length === 0) return [];

    // Filter out attached dialogs and transient children (visually merged with parent window)
    const filteredClones = clones.filter(clone => {
        const metaWindow = clone.metaWindow || clone.source?.metaWindow;
        if (!metaWindow) return true;
        if (metaWindow.is_attached_dialog()) return false;
        if (metaWindow.get_transient_for() !== null) return false;
        return true;
    });
    if (filteredClones.length === 0) return [];

    // Determine workspace from the first clone that has a MetaWindow
    let workspace = null;
    for (const clone of clones) { ... }
    ...
    const orderedClones = [...filteredClones].sort((a, b) => {
        // sacred windows first
        ...
    });

    for (const clone of orderedClones) {
        ...
        const isSacred = mw.is_maximized() || mw.is_fullscreen();
        const rect = isSacred ? mw.get_frame_rect() : (ComputedLayouts.get(mw) || mw.get_frame_rect());
        ...
        // shrink + findFreeSlot collision avoidance
    }
}
```

Risks:

- If the user did *not* intend to keep dialog filtering, reverting this combination is a small, isolated change (remove the `filteredClones` block, point `orderedClones` back at `clones`).
- If the sacred-shrink/collision logic itself is still incomplete (SOW-0003 is "implementing"), further changes to this function are likely as that SOW resumes — this SOW should be treated as a checkpoint, not a final state.

## Pre-Implementation Gate

Status: needs-user-decision

Problem / root-cause model:

- The local WIP's diff for this function silently dropped an existing, unrelated filter while adding new sacred-window layout logic. Both landed on overlapping lines versus upstream's untouched version, producing the rebase conflict.

Evidence reviewed:

- See Analysis above.

Affected contracts and surfaces:

- `extension/overviewLayout.js` — GNOME Shell's Activities Overview thumbnail layout for mosaic-managed workspaces.

Existing patterns to reuse:

- `SACRED_OVERVIEW_SHRINK_FACTOR` / `OVERVIEW_SHRINK_FACTOR` and `findFreeSlot` are already defined elsewhere in this file (unconflicted); this SOW does not need to introduce them.

Risk and blast radius:

- Overview rendering only. No tiling/resize/drag behavior is affected. Low blast radius, but visible to the user immediately on every Overview open.

Sensitive data handling plan:

- Not applicable.

Implementation plan:

1. If confirmed, no further action needed.
2. If the user wants dialog filtering removed, revert `orderedClones` to read from `clones` and delete the `filteredClones` block (2-line change).

Validation plan:

- `npm run lint` (already passing). Real-use validation via `./scripts/run-gnome-shell.sh`: open Overview with a maximized window and an attached dialog present, confirm both dialog exclusion and non-overlapping sacred/sibling thumbnails — deferred to SOW-0003 resumption.

Artifact impact plan:

- AGENTS.md: unaffected.
- Runtime project skills: unaffected.
- Specs: `.agents/sow/specs/extension-behavior.md` may need an update once SOW-0003 finalizes overview behavior for sacred windows — not this SOW's job.
- End-user/operator docs: unaffected for now.
- End-user/operator skills: none exist.
- SOW lifecycle: close once the user confirms; substantive behavior validation belongs to SOW-0003.

Open-source reference evidence:

- Not applicable.

Open decisions:

1. **Keep both (dialog filter + sacred shrink/collision) — Recommended.** Preserves existing behavior (no dialogs cluttering Overview) while adding the new sacred-window handling SOW-0003 needs. Risk: none identified; it's the union of two independent, non-contradictory behaviors.
2. **Drop the dialog filter, keep only local's sacred logic (i.e., take the WIP's diff literally).** Matches the raw uncommitted diff exactly, but reintroduces attached dialogs/transient windows into the Overview thumbnail grid — a visible regression versus the current shipped behavior, with no stated reason for it in either SOW.

## Implications And Decisions

1. **Keep both (dialog filter + sacred shrink/collision)** — user confirmed Option 1 (2026-07-12). No dialog-filter removal requested.

## Plan

1. ~~Await user confirmation or override.~~ Done — confirmed.

## Execution Log

### 2026-07-12

- Resolved in SOW-0004 per Option 1 above (combined both behaviors), flagging the dropped filter for explicit confirmation here.
- User confirmed Option 1; SOW closed and moved to `.agents/sow/done/`.

## Validation

Acceptance criteria evidence:

- User confirmed combining both behaviors is correct (2026-07-12).

Tests or equivalent validation:

- `npm run lint` and `node --check extension/overviewLayout.js` both pass (see SOW-0004).

Real-use evidence:

- Deferred to SOW-0003 resumption (needs a nested-shell session with a maximized window + dialog present).

Reviewer findings:

- None requested.

Same-failure scan:

- Checked whether any other conflicted file similarly dropped a pre-existing filter/guard silently; see SOW-0011 for the analogous (and more severe) finding in `windowing.js`.

Sensitive data gate:

- N/A.

Artifact maintenance gate:

- Specs update deferred to SOW-0003, once overview-for-sacred-windows behavior is finalized end to end.

Specs update:

- Deferred to SOW-0003.

Project skills update:

- None needed.

End-user/operator docs update:

- None needed yet.

End-user/operator skills update:

- None needed.

Lessons:

- Comparing each side against the merge-base (not just conflict-marker text) is what surfaced the dropped filter — the raw conflict markers alone would have made it look like a simple comment change.

Follow-up mapping:

- Closed. Real-use validation (nested-shell check with a maximized window + attached dialog present) remains tracked under SOW-0003, not as a follow-up of this SOW.

## Outcome

Closed: `overviewLayout.js`'s `computeWindowSlots` keeps both the pre-existing attached-dialog/transient filter and the new sacred-window shrink/collision-avoidance logic, combined, as resolved in SOW-0004. No code change needed beyond what was already committed; this SOW only records the user's confirmation and closes the tracking item.

## Lessons Extracted

None beyond what SOW-0004 already recorded.

## Followup

None — real-use validation belongs to SOW-0003.

## Regression Log

None yet (see dated regression section below — logged there per this repo's regression procedure, not here).

## Regression - 2026-07-12

**What broke:** This SOW's resolution (combining the pre-existing attached-dialog/transient filter with the new sacred-window shrink/collision logic in `computeWindowSlots`) reintroduced a bug that SOW-0002 had already found and fixed. SOW-0002's execution log (2026-06-24 entry) documents that this exact filter was deliberately removed after root-causing GNOME Shell's own `workspace.js` (`addWindow`/`_isOverviewWindow`): `layout.windows` (`_sortedWindows`) already contains only the windows GNOME Shell decided belong in the overview, so filtering again here leaves the dropped clones unallocated at `(0, 0)`, visually overlapping the tiled thumbnails — the exact overlap complaint SOW-0002 was created to fix.

**Why this SOW got it wrong:** When resolving the SOW-0004 rebase conflict, I found the merge-base (`6bb3932`) had the filter, upstream still had it, and the local WIP's diff dropped it with no comment explaining why. Reading only those three states, dropping the filter looked like an unlabeled accidental regression, so I restored it "to be safe" and asked the user to confirm — without first reading SOW-0002's own execution log, which already recorded the deliberate, evidence-backed decision to remove it. The user's "keep both, combined" answer was given in good faith based on the (incomplete) evidence I presented; the mistake is mine, not theirs.

**Signal I missed at the time:** The very code I was editing had an unconflicted comment sitting a few lines below the reintroduced filter, present in both `origin/main`'s ancestor state and the WIP, that already said: *"layout.windows already contains only the windows GNOME Shell decided belong in the overview (`_sortedWindows`). No further filtering is needed: dropping any window here would leave its clone unallocated, making it stay at (0,0) and visually overlap with tiled window thumbnails."* That comment directly contradicts re-adding the filter and should have been caught during the original conflict resolution.

**Fix:** Removed the `filteredClones` block and reverted `orderedClones`/the workspace lookup to read from `clones` directly, matching SOW-0002's original, root-caused fix. `extension/overviewLayout.js`, committed in `73885e4`.

**Validation:** `node --check extension/overviewLayout.js` (pass), `npm run lint` (pass), `./scripts/build.sh -b` (pass, build-only, not installed). Real-use confirmation (open Overview with an attached dialog present, confirm no `(0,0)` overlap) is deferred to the nested-shell validation pass the user is running for SOW-0002/SOW-0003 — this SOW does not claim that evidence itself.

**Process note:** Per this repo's regression procedure, this SOW was moved back from `.agents/sow/done/` to `.agents/sow/current/`, marked `in-progress` with this regression note, and this section was appended at the end rather than editing the original narrative above. Once the nested-shell pass confirms no overlap regression, this SOW can close again with `Status: completed`.
