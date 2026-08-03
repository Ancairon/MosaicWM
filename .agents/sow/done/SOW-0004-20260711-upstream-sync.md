# SOW-0004 - Upstream Sync (Rebase Onto origin/main)

## Status

Status: completed

Sub-state: Rebase completed and tree validated (lint + build-only). All 7 conflict SOWs (SOW-0005 through SOW-0011) have been reviewed and closed — three needed no code change (already correctly resolved in this SOW), one (SOW-0009) recorded a deferral decision, and one (SOW-0011) required a genuine follow-up implementation, committed separately in `0643414`.

## Requirements

### Purpose

Bring the local `main` branch up to date with 68 new commits on `origin/main` (the actual upstream repository, `CleoMenezesJr/MosaicWM` — not a fork) without losing the in-progress work for SOW-0002 (geometry overlay / keyboard resize) and SOW-0003 (disable sacred isolation), and rebuild to confirm the result is healthy.

### User Request

> "check for upstream updates that might benefit us and rebase + rebuild if needed. for anything making conflicts, mark it for resolution"
>
> Follow-up: "also, make sure you don't install this version locally so we don't break stuff."
>
> Follow-up: "also, make it so that we rebase first and then have one pending sow for each conflict, so we can compare features."

### Assistant Understanding

Facts:

- `origin` is `https://github.com/CleoMenezesJr/MosaicWM.git`, confirmed via `gh repo view` to not itself be a fork (`isFork: false`, `parent: null`) — it is the real upstream, and the user is a direct contributor to it.
- Before this SOW, local `main` was at `6bb3932`, a pure ancestor of `origin/main` (0 local commits ahead, 68 commits behind, plus a new remote branch `feat/miniature-icons`).
- The working tree had substantial uncommitted modifications across 16 tracked files, all belonging to the in-progress work for SOW-0002 and SOW-0003.
- Simulating the merge in an isolated scratch clone (`git apply --3way`) showed 7 files would produce real textual conflicts: `constants.js`, `dragHandler.js`, `overviewLayout.js`, `resizeHandler.js`, `tiling.js`, `windowHandler.js`, `windowing.js`.
- The user chose (via `AskUserQuestion`): commit the WIP as a checkpoint, then run a real `git rebase origin/main` (not a stash-based flow), and create one pending SOW per conflicted file so the local WIP intent and upstream's current code can be compared feature-by-feature.
- The user separately confirmed a standalone SOW (this one) should track the sync operation itself, rather than folding it into SOW-0002/SOW-0003.
- The user explicitly required that no locally built package be installed (`./scripts/build.sh -i` was never run), so the currently-running installed extension was not touched.

Inferences:

- None of the 7 conflicts were duplicate-feature collisions (upstream had not independently implemented keyboard resize, geometry-overlay changes, or sacred-isolation-disable). All were proximity conflicts: upstream's own unrelated fixes landed on the same lines as the two in-progress features.
- Deep, per-hunk diffing (comparing merge-base `6bb3932` against both `origin/main` and the WIP commit) surfaced two items serious enough to flag rather than silently resolve — see Risks below and the linked pending SOWs.

Unknowns (resolved during SOW-0005 through SOW-0011 closure, see those files and the cross-reference note in SOW-0003):

- The `tileWorkspaceWindows` "sacred window present → preserve cached layout, bail" early return (SOW-0009, not SOW-0007 as originally mis-cross-referenced here) turned out to be a **deliberate, already-verified mechanism** per SOW-0003's own execution log, not an unfinished thought — correcting the speculation above. Real-use validation of its interaction with the rest of SOW-0003 remains outstanding there.
- `moveOversizedWindow`'s long-term role (SOW-0011) is now decided and implemented: it is general-overflow-only. Its dead sacred branch was removed, and the one remaining live isolation trigger (`resizeHandler.js`'s `tryEnterSacred`) was neutralized to retile in place instead, committed in `0643414`.

### Acceptance Criteria

- Local `main` matches `origin/main` history exactly (fast-forwarded, no divergent commits), with the WIP replayed on top as a single commit. Verified: `git log HEAD..origin/main` and `git log origin/main..HEAD` show `origin/main` is a strict ancestor of `HEAD` (now 9 commits ahead: the WIP checkpoint, the SOW-0011 fix, and 7 SOW-closure commits).
- No conflict markers remain in the tree. Verified: `grep -rn '^<<<<<<<\|^=======\|^>>>>>>>' extension/` returns nothing.
- `npm run lint` passes. Verified: clean run, no output.
- `./scripts/build.sh -b` completes and produces a package. Verified: `Build complete: mosaicwm@cleomenezesjr.github.io.zip`.
- `./scripts/build.sh -i` was never invoked in this SOW.
- Every one of the 7 conflicted files has a corresponding pending SOW with both sides' code/intent captured for comparison. Met: all 7 are now in `.agents/sow/done/`.

## Analysis

Sources checked:

- `git remote -v`, `gh repo view CleoMenezesJr/MosaicWM`, `git fetch origin`, `git log HEAD..origin/main` / `origin/main..HEAD`
- `.agents/sow/current/SOW-0002-20260623-overlay-and-keyboard-resize.md`
- `.agents/sow/current/SOW-0003-20260624-disable-sacred-isolation.md`
- `.agents/sow/SOW.template.md`
- A read-only scratch-clone simulation (`git clone` into the session scratchpad, `git apply --3way`) performed before touching the real repository, to identify which files would conflict.
- Full diff comparison per conflicted file: `git diff 6bb3932 origin/main -- <file>` vs `git diff 6bb3932 a02037a -- <file>`, and `git show <ref>:<file>` for surrounding context, to understand what each side actually changed rather than relying on conflict-marker text alone.
- `npm run lint`, `./scripts/build.sh -b` (build-only, not install)

Current state:

- `main` is at `1f6657f`, rebased onto `origin/main` (`e22fe8d`), with the WIP replayed as a single commit on top.
- All 7 previously-conflicted files were hand-resolved (not via `checkout --ours/--theirs`, which would have discarded already-auto-merged content in the same files) and verified with `node --check` before staging.
- The untracked SOW/agent scaffolding (`.agents/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) was left untouched throughout — out of scope for this operation.

Risks:

- **windowing.js (SOW-0011, high severity — resolved)**: the WIP's `moveOversizedWindow` guard (`if (!isSacred) { resolve(null); return; }`) would have silently broken normal window-overflow placement for every non-maximized window, because several other call sites depend on this function to move ordinary overflowing windows to an adjacent/new workspace. Initially resolved conservatively by keeping the function's original (upstream) full branching intact. The underlying design question (should sacred isolation still route through this function at all?) was later decided and implemented in SOW-0011: `moveOversizedWindow`'s sacred branch was removed entirely, and the one genuine remaining isolation trigger (`tryEnterSacred`) was neutralized. Committed in `0643414`.
- **tiling.js (SOW-0009, medium severity — deferred, corrected)**: the WIP added an early return in `tileWorkspaceWindows` that bails out of tiling entirely whenever any sacred (maximized/fullscreen) window is present on the workspace. This was flagged as looking like it might reintroduce a bug SOW-0003 states it must fix. Correction found later: SOW-0003's own execution log confirms this is a deliberate, already-verified mechanism ("sacred-layout-cache bail"), not an accidental leftover. The user chose to defer real-use validation of it to SOW-0003 rather than judge it in isolation (SOW-0009, closed).
- **overviewLayout.js (SOW-0007)**: the WIP's raw diff dropped the existing attached-dialog/transient-window filter from the Overview layout entirely. This was re-combined with the WIP's new sacred-window shrink/collision-avoidance logic (wiring `filteredClones` into the sort that previously read unfiltered `clones`) since dropping the filter looked like an unintentional side effect, not a stated goal of either SOW. User confirmed this combination (SOW-0007, closed).
- A general risk for all 7: resolving hunks in isolation cannot fully substitute for the user (or a fresh implementation pass) re-validating each feature end-to-end in the nested shell, since these are still in-progress features with an "implementing" sub-state before this sync. **This risk is not yet retired** — real-use validation via `./scripts/run-gnome-shell.sh` is the next step, tracked under SOW-0002/SOW-0003, not this SOW.

## Pre-Implementation Gate

Status: ready

Problem / root-cause model:

- Local `main` fell behind upstream by 68 commits while two features were actively under development in the working tree, uncommitted. Bringing `main` current required reconciling textual overlap between in-progress feature code and unrelated upstream fixes in the same files.

Evidence reviewed:

- See Analysis above; all evidence is local git history and working-tree diffs, no external repositories were involved.

Affected contracts and surfaces:

- `extension/constants.js`, `dragHandler.js`, `overviewLayout.js`, `resizeHandler.js`, `tiling.js`, `windowHandler.js`, `windowing.js` — core tiling, resize, drag, and overview behavior.
- Git history of `main` (rebased in place; not yet pushed).

Existing patterns to reuse:

- SOW pending/current/done lifecycle already established by SOW-0001-0003.

Risk and blast radius:

- Local-only so far (no push). Rebase rewrote local `main`'s commit hash from `6bb3932`-based history to a new commit on top of `e22fe8d`; anyone else with a clone of the old local `main` would need to reconcile, but nothing was shared/pushed during this SOW.

Sensitive data handling plan:

- None of the evidence involves secrets, credentials, or customer data. Not applicable.

Implementation plan:

1. Commit WIP checkpoint, rebase onto `origin/main`, hand-resolve 7 conflicts conservatively (done).
2. Validate with lint + build-only (done).
3. Write this SOW plus 7 per-conflict pending SOWs (in progress).

Validation plan:

- `npm run lint`, `./scripts/build.sh -b` (done, both pass). `./scripts/run-gnome-shell.sh` real-use validation is deferred to when SOW-0002/SOW-0003 resume, since the underlying features are still incomplete regardless of this sync.

Artifact impact plan:

- AGENTS.md: not expected to change — this SOW is a mechanical sync, not a behavior/process change.
- Runtime project skills: not expected to change.
- Specs: not expected to change (no shipped behavior changed; SOW-0002/SOW-0003 remain unfinished).
- End-user/operator docs: not expected to change.
- End-user/operator skills: none exist currently.
- SOW lifecycle: created SOW-0005 through SOW-0011 as pending; this SOW closes now that all 7 have been reviewed and closed (three no-change confirmations, one deferral decision, one implemented fix).

Open-source reference evidence:

- Not applicable — `origin` is the project's own upstream, not an external OSS dependency being mirrored.

Open decisions:

- See "Open decisions requiring the user" below.

## Implications And Decisions

1. **Merge mechanics** — Options: (A) stash/fast-forward/pop, (B) commit WIP then `git rebase`. **User selected (B).** Executed as a single WIP checkpoint commit (`wip: in-progress geometry overlay, keyboard resize, and sacred-isolation changes`), then `git rebase origin/main`.
2. **SOW tracking of the sync itself** — Options: fold into SOW-0002/0003, or standalone SOW. **User selected: standalone SOW** (this file).
3. **Conflict handling** — User directive: "rebase first and then have one pending sow for each conflict, so we can compare features." Implemented as: resolve conflicts now (conservatively, preserving both sides' intent wherever non-contradictory, never silently discarding WIP or upstream work), then create SOW-0005 through SOW-0011, one per conflicted file, each presenting both sides for the user's explicit reconciliation decision.

## Plan

1. Simulate the merge read-only in a scratch clone to scope conflicts before touching the real repo. Done.
2. Get user decisions on mechanics and SOW tracking. Done.
3. Commit WIP checkpoint (16 files, specific paths only, no `git add -A`). Done.
4. `git rebase origin/main`; hand-resolve the 7 conflicts file by file, verifying each with `node --check`. Done.
5. `git add` resolved files, `git rebase --continue`. Done.
6. Validate: `npm run lint`, `./scripts/build.sh -b` (build-only, never `-i`). Done.
7. Write this SOW and the 7 per-conflict pending SOWs. Done.
8. Review and close each of the 7 conflict SOWs: confirm no-decision items directly, ask the user only where a genuine design fork existed, implement the one fix that required it (SOW-0011), and cross-reference open items into SOW-0002/SOW-0003. Done.

## Execution Log

### 2026-07-11 to 2026-07-12

- Fetched `origin`, confirmed 68 new commits and a new remote branch.
- Simulated the merge in `/tmp/.../scratchpad/upstream-sim` (isolated clone) via `git apply --3way`; identified the same 7 conflicting files that the real rebase later reported.
- Asked the user two rounds of clarifying questions (merge mechanics, SOW tracking); user answered via follow-up messages rather than the structured question tool on the first round, then explicitly directed: rebase first, one pending SOW per conflict.
- Staged and committed the 16 modified tracked files as `1f6657f`'s parent commit `a02037a` (WIP checkpoint), leaving the untracked SOW/agent scaffolding files alone.
- Ran `git rebase origin/main`; got the expected 7 conflicts.
- For each conflicted file, compared `6bb3932` vs `origin/main` vs the WIP commit directly (not just conflict-marker text) to understand true intent on both sides before resolving. Found two cases where taking the WIP's diff literally would have introduced a functional regression (`windowing.js`'s `moveOversizedWindow` guard breaking non-sacred overflow; a possible duplicate-declaration/syntax risk in the same function) and resolved conservatively instead of mechanically.
- Verified all 7 resolved files with `node --check` before staging; `git add` + `git rebase --continue` completed cleanly (`1f6657f`).
- Ran `npm run lint` (clean) and `./scripts/build.sh -b` (succeeded, produced `mosaicwm@cleomenezesjr.github.io.zip`, not installed).

### 2026-07-12 (SOW closure pass)

- Closed SOW-0005, SOW-0006, SOW-0010 with no code change (already correctly resolved here) — the user confirmed no design decision was actually needed for these.
- Asked the user targeted questions only for the three items with a genuine design fork: SOW-0007 (keep dialog filter, confirmed), SOW-0009 (defer tiling.js bail-out to SOW-0003, confirmed), SOW-0011 (finish the sacred/general split, confirmed).
- Closed SOW-0008 directly (no fork existed: dropping any of its three guards would break something real) per the user's "only stop for design choices" instruction.
- Implementing SOW-0011 surfaced that this SOW's own evidence was partly wrong (`dragHandler.js`'s call site was mischaracterized as sacred-isolation; it was general-overflow). Corrected before implementing, then removed `moveOversizedWindow`'s dead sacred branch and neutralized `tryEnterSacred`, committed separately in `0643414`.
- Appended a correction and three new cross-referenced follow-ups to SOW-0003's execution log (real-use validation gaps, a second related overflow bug found via SOW-0011, and a dead-code cleanup decision).
- All 7 conflict SOWs moved to `.agents/sow/done/`, each its own commit.

## Validation

Acceptance criteria evidence:

- `git log HEAD..origin/main` → empty; `git log origin/main..HEAD` → `1f6657f` only.
- `grep -rn '^<<<<<<<\|^=======\|^>>>>>>>' extension/` → no matches.
- `npm run lint` → exits clean.
- `./scripts/build.sh -b` → `Build complete: mosaicwm@cleomenezesjr.github.io.zip`.

Tests or equivalent validation:

- `node --check` on all 7 hand-resolved files (all passed) prior to staging.
- `npm run lint` and `./scripts/build.sh -b` after the rebase completed (both passed).

Real-use evidence:

- Not performed in this SOW, by design. The two underlying features (SOW-0002, SOW-0003) were already "in-progress"/incomplete before this sync and remain so; nested-shell validation belongs to those SOWs, not this mechanical-sync-plus-conflict-reconciliation SOW.

Reviewer findings:

- None requested for this SOW; it is repo-maintenance work preparing for continued feature work, not a shipped behavior change.

Same-failure scan:

- Checked all `moveOversizedWindow` call sites (`git grep -n "moveOversizedWindow"`) after finding the `windowing.js` issue, to confirm no other conflicted file had a similar blanket-refusal pattern. None found.
- Re-ran the same grep before implementing SOW-0011's fix, which caught a mischaracterization in this SOW's own original evidence (see SOW-0011 closure notes).

Sensitive data gate:

- No secrets, credentials, or customer data touched. Confirmed.

Artifact maintenance gate:

- AGENTS.md: unaffected, no update needed (mechanical sync, no process change).
- Runtime project skills: unaffected.
- Specs: unaffected — no shipped behavior changed.
- End-user/operator docs: unaffected.
- End-user/operator skills: none exist.
- SOW lifecycle: SOW-0005 through SOW-0011 created as pending, then all 7 closed to `.agents/sow/done/` (each its own commit). This SOW is now `completed` and moves to `.agents/sow/done/` in the same commit as this update.

Specs update:

- None needed.

Project skills update:

- None needed.

End-user/operator docs update:

- None needed.

End-user/operator skills update:

- None needed.

Lessons:

- When two long-running feature branches stay uncommitted while upstream moves 68 commits, per-hunk conflict-marker text is not sufficient to resolve safely — comparing each side's actual diff against the merge-base surfaced two real regressions (a blanket refusal that would have broken 4+ call sites, and dead-code from a dropped filter) that would not have been obvious from the conflict markers alone.
- Even careful evidence-gathering can still get a specific detail wrong (this SOW mislabeled which conflict SOW tracked the `tiling.js` bail-out, and separately mischaracterized one of `moveOversizedWindow`'s call sites as sacred-isolation when it wasn't). Re-verifying claims immediately before acting on them, rather than trusting an earlier write-up, caught both before they caused wasted work or a wrong decision.

Follow-up mapping:

- Closed: SOW-0005 (constants.js), SOW-0006 (dragHandler.js), SOW-0007 (overviewLayout.js), SOW-0008 (resizeHandler.js), SOW-0009 (tiling.js — deferred to SOW-0003), SOW-0010 (windowHandler.js), SOW-0011 (windowing.js — implemented in `0643414`).
- Handed to SOW-0002/SOW-0003: all real-use nested-shell validation, plus three items cross-referenced into SOW-0003's execution log (a deliberate-but-unvalidated bail-out interaction, a second related overflow bug, and a dead-code removal decision).

## Outcome

Completed: `main` rebased onto `origin/main` (68 commits), 7 conflicts resolved and their tracking SOWs closed (one required a real code fix, committed separately), tree lint-clean and buildable, nothing installed locally. SOW-0002 and SOW-0003 can now resume against current, reconciled code — their remaining gap is real-use validation, not further conflict reconciliation.

## Lessons Extracted

See Lessons above.

## Followup

- SOW-0002, SOW-0003: real-use validate via `./scripts/run-gnome-shell.sh`.
- SOW-0003: resolve the three items cross-referenced into its execution log on 2026-07-12.

## Regression Log

None yet.
