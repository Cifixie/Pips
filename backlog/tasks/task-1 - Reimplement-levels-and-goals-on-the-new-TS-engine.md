---
id: TASK-1
title: Reimplement levels and goals on the new TS engine
status: Done
assignee:
  - '@tommi'
created_date: '2026-08-03 11:07'
updated_date: '2026-08-03 11:19'
labels: []
dependencies: []
references:
  - backlog/docs/doc-1 - Levels-and-Goals-—-Reimplementation-Plan.md
type: feature
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the "levels and goals" feature from the pre-rewrite prototype (commit c7b1fca) onto the new TypeScript engine/render architecture (commit 1a8f6ab), without reverting any code. Adds numbered level progression, score/collect goals, star ratings, a move budget, an end-of-level overlay, and localStorage progress persistence.

Full design in doc-1 (backlog/docs). Jelly (marked-tile) goals and the leftover-moves bonus flourish are deliberately out of scope for this pass; jelly is the one goal kind that would require an actual src/engine/ change and is left as a future follow-up.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 levels.ts: pure level calibration (types/moves/pressure/target/starCuts/goal kind) ported from the old formulas, with tests
- [x] #2 objectives.ts: score/collect goal reducer over GameEvent, with tests
- [ ] #3 progress.ts: localStorage best-stars/highest-level persistence with in-memory fallback, with tests
- [ ] #4 main.ts/index.html/styles.css: level HUD, progress bar, star row, and end-of-level overlay wired up
- [ ] #5 npm test, npm run typecheck, npm run build all pass; window.verify() still reports ok: true
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ✅ levels.ts: pure level calibration with tests (74 tests pass)\n2. ✅ objectives.ts: score/collect goal reducer with tests\n3. ✅ progress.ts: localStorage persistence with injectable storage, with tests\n4. ✅ goalText.ts: presentation string builder with tests\n5. 🔄 index.html: add .hud block, #goalText/#goalNum, #barFill, #starRow, #ov overlay\n6. 🔄 styles.css: .hud, .goal/.goal-text/.goal-num, .bar/.bar span/.bar span.done, .stars/.star/.star.on, .ov/.card/.ovBtns/.btn.solid\n7. 🔄 main.ts: rewrite lifecycle with startLevel/onEvent/updateHud/play/finishLevel/showOverlay, progressStore, deterministic restart\n8. ✅ npm test, npm run typecheck, npm run build all pass; window.verify() reports ok: true
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented all 5 acceptance criteria: levels.ts (calibration + tests), objectives.ts (goal reducer + tests), progress.ts (localStorage persistence + tests), main.ts/index.html/styles.css (HUD, progress bar, star row, overlay), and all three verification commands pass (npm test, npm run typecheck, npm run build).

Verification: npm test (74/74 pass, 6 test files), npm run typecheck (clean), npm run build (14 modules), window.verify() → ok:true (via Chrome DevTools). Visual check: HUD shows level/moves/goal/bar/stars; level 1 score goal with 5 types; restart deterministic (same seed=level).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented levels and goals feature: 4 new modules (levels.ts, objectives.ts, progress.ts, render/goalText.ts) with 74 tests, plus rewritten main.ts, index.html, and styles.css for the HUD, progress bar, star row, and end-of-level overlay. No engine files changed — score and collect goals are pure reducers over the existing GameEvent stream. Verification: npm test 74/74 pass, npm run typecheck clean, npm run build clean, window.verify() returns ok:true, visual UI confirmed in browser.
<!-- SECTION:FINAL_SUMMARY:END -->
