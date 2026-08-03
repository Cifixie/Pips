---
id: TASK-1
title: Reimplement levels and goals on the new TS engine
status: To Do
assignee: []
created_date: '2026-08-03 11:07'
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
- [ ] #2 objectives.ts: score/collect goal reducer over GameEvent, with tests
- [ ] #3 progress.ts: localStorage best-stars/highest-level persistence with in-memory fallback, with tests
- [ ] #4 main.ts/index.html/styles.css: level HUD, progress bar, star row, and end-of-level overlay wired up
- [ ] #5 npm test, npm run typecheck, npm run build all pass; window.verify() still reports ok: true
<!-- AC:END -->
