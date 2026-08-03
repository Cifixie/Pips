---
id: doc-1
title: Levels and Goals — Reimplementation Plan
type: specification
created_date: '2026-08-03 11:06'
---

# Reimplement levels & goals on the new TypeScript engine

## Context

The project was rewritten from a single-file `game.js` prototype into a clean
TypeScript + Vite engine/render split (commit `1a8f6ab`, "restructured code").
That rewrite didn't carry forward a "levels and goals" feature that had been
built on top of the old prototype (commit `c7b1fca`, "next version with levels
and goals") — numbered levels, goal types (score / collect / jelly), star
ratings, a move budget, and an end-of-level overlay. The user does not want to
revert to the old commit; they want that feature's *intent* reimplemented
cleanly on the new architecture.

This turns out to be an easier fit than it sounds: the new engine's
`README.md` already documents an intended extension point for exactly this
("Where step 3 plugs in") — `GameEvent`'s `clear` variant already carries
per-pip-type cleared counts, run/chain data, and `LevelConfig.moveLimit` is
already enforced end-to-end. Objectives are meant to be reducers over that
event stream, added with "one new function plus one config shape — no engine
change" — and with jelly goals left out (see below), that promise holds
exactly: **no `src/engine/` file needs to change at all**, only new files are
added alongside it.

Three decisions were made, confirmed with the user:
- **Jelly (marked-tile) goals are dropped for now.** The old prototype's
  third goal kind required marked board cells, which are authoritative,
  replay-relevant state that no existing `GameEvent` exposes — the one part
  of this feature that would have needed an actual engine change. Only
  `score` and `collect` goals are ported; the level-kind rotation becomes a
  simple alternation between them instead of the old 4-way
  `["score","collect","score","jelly"]` cycle. Revisit jelly later as a
  separate, self-contained addition once the rest is in place.
- **Level seeding is deterministic** (`seed = level number`), so restarting a
  level always deals the same board — a deliberate change from the old
  prototype (which predated seeding and reshuffled every attempt), chosen
  because it fits the engine's existing seed+replay model and keeps
  star-chasing comparisons fair.
- **The leftover-moves bonus flourish is dropped entirely** — no cosmetic
  "+50 per unused move" pop animation. A level ends immediately once the goal
  is met or moves run out.

## Engine layer (`src/engine/`)

No changes to `types.ts`, `engine.ts`, or `grid.ts` — with jelly goals
dropped, `score` and `collect` goals are fully expressible as reducers over
the existing `GameEvent` stream (`clear.points` and `clear.counts` already
carry everything they need), so the "no engine change" promise in the README
holds exactly. Everything below is new files only.

### `levels.ts` (new)
Pure calibration, faithfully ported from the old `levelConfig(n)`/`makeGoal`,
keeping the exact RATE table (`{5: 136.5, 6: 84.7}`) and `r50` rounding.
`jellyNeed` and the jelly branch of the kind rotation are dropped; kind
alternates `["score","collect"]` by `(n-1)%2` instead of the old 4-way cycle:

```ts
export type GoalKind = "score" | "collect";

export interface LevelCalibration {
  level: number; types: number; moves: number; pressure: number;
  expected: number; target: number; starCuts: readonly [number, number, number];
  kind: GoalKind; collectNeed: number;
}

export function levelConfig(n: number): LevelCalibration { ... }

export interface LevelSetup {
  calibration: LevelCalibration;
  config: LevelConfig;
  goal: Goal;
}

export function buildLevel(n: number, size = 8): LevelSetup {
  const calibration = levelConfig(n);
  const seed = n; // deterministic per level, per user decision
  const goal = buildGoal(calibration, createRng(seed));
  const config = defineLevel({
    seed, size,
    pipTypes: calibration.types,
    moveLimit: calibration.moves,
  });
  return { calibration, config, goal };
}
```

`buildGoal` uses its own short-lived `Rng` (seeded the same as the level, one
draw for `collect`'s random pip type, zero otherwise) — separate from the
`Rng` embedded in `GameState`, and never touches `engine.ts`.

Test file `levels.test.ts`: table-driven checks reproducing the old formulas
(`types`/`moves`/`pressure`/`target` rounding, monotonic `starCuts`, `kind`
alternating `["score","collect"]` mod 2 from `n=1`); `buildLevel` determinism
(same `n` → identical `config`/`goal`).

### `objectives.ts` (new)
The reducer the README describes:

```ts
export type Goal =
  | { kind: "score"; target: number }
  | { kind: "collect"; pipType: PipType; need: number };

export interface GoalProgress { have: number; need: number; }

export function initialProgress(goal: Goal): GoalProgress { ... }

// (progress, event) => progress. Score-kind sums event.points itself
// rather than reading state.score, staying a pure fold with no side channel.
export function applyObjective(goal: Goal, progress: GoalProgress, event: GameEvent): GoalProgress { ... }

export const goalMet = (progress: GoalProgress): boolean => progress.have >= progress.need;
export const goalFraction = (progress: GoalProgress): number => ...; // clamped 0..1

export function starsFor(goal: Goal, args: {
  score: number; starCuts: readonly [number, number, number];
  movesLeft: number; moveBudget: number;
}): number {
  // score goals: count starCuts cleared by final score.
  // collect goals: based on fraction of moves left (>=0.4 -> 3, >=0.2 -> 2, else 1).
}
```

Test file `objectives.test.ts`: synthetic `GameEvent[]` fixtures per goal kind
verifying the fold sums correctly and ignores non-`clear` events;
`goalMet`/`goalFraction` boundary values; `starsFor` parity at the 0.4/0.2
thresholds and for score-kind star-cut counting.

## Persistence (`src/progress.ts`, new)

Faithful, slightly more testable port of the old localStorage progress
tracker (key `match-three.progress`), with the same try/catch
degrade-to-memory behavior:

```ts
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface ProgressStore {
  bestStars(level: number): number;
  highestLevel(): number;
  record(level: number, stars: number): void;
}
export function createProgressStore(storage: StorageLike = localStorage): ProgressStore { ... }
```

`storage` is injectable so `progress.test.ts` doesn't need jsdom/localStorage
— covers record/read of best stars (only upgrades on a higher rating),
`highestLevel` tracking, and a fake `StorageLike` that throws on
`getItem`/`setItem` still leaving `record`/`bestStars` working in-memory.

## Render layer (`src/render/`)

`board.ts` needs no changes — with jelly dropped, there's no per-cell marked
state to render, so `paint()`/`play()` are untouched.

### `goalText.ts` (new)
Presentation-only string builder, kept out of `objectives.ts` since it's tied
to the `data-t` shape order in `styles.css`, not engine logic:

```ts
export function describeGoal(goal: Goal): string {
  // "Reach 4,200 points" / "Clear 20 round pieces"
}
```

Test file `goalText.test.ts`: one assertion per goal kind.

## HTML/CSS

### `index.html`
- Inside `<header>`: add a `.hud` block (level number, moves-left counter with
  a `.low` class at ≤3, existing `#newgame` button relabeled "Restart").
- Between `</header>` and `#board`: add goal text/number, a progress bar, and
  a star row (`#goalText`, `#goalNum`, `#barFill`, `#starRow`).
- Sibling to `.wrap`: the end-of-level overlay (`#ov`, hidden by default) with
  title, subtitle, star row, detail lines, and two action buttons
  (`#ovMain`/`#ovAlt`).

### `styles.css`
Port `.hud`, `.goal`/`.goal-text`/`.goal-num`, `.bar`/`.bar span`/`.bar
span.done`, `.stars`/`.star`/`.star.on`, `.ov`/`.card`/`.ovBtns`/`.btn.solid`
verbatim from the `c7b1fca` diff, adapted to the current custom properties
(`--ink`, `--muted`, `--slot`, `--c1`, `--c2` — no new tokens needed).
`.cell.mk::after` and its `.cell.mk.sel::after` override are skipped — they
only ever applied to jelly-marked cells.

## `src/main.ts` — lifecycle rewrite

State additions: `level`, `calibration`, `config`, `goal`, `progress`
(`GoalProgress`), plus the existing `state`/`history`/`busy`, and a
module-level `progressStore = createProgressStore()`.

- `startLevel(n)`: guards on `busy`; rebuilds via `buildLevel(n, SIZE)` →
  `createGame(config)`; resets `history`, `progress = initialProgress(goal)`,
  `busy = false`; calls `view.paint(state.grid)`, `updateHud()`; hides the
  overlay; sets hint copy (including the old "a sixth shape joins the board"
  transition message when `calibration.types` steps from 5 to 6).
- `onEvent(event)`: keep existing score/combo/hint handling, add
  `progress = applyObjective(goal, progress, event)` unconditionally (no-op
  for non-`clear` events), then `updateHud()`.
- `updateHud()`: score/level/`movesLeft(state)` (reuse the engine's existing
  export, don't reimplement it) with `.low` at ≤3; `describeGoal(goal)` +
  `progress.have`/`progress.need`; bar width from `goalFraction(progress)` +
  `.done` toggle; star row from `starsFor(goal, {...})`.
- `play(move)`: after the existing post-cascade HUD sync, check whether the
  level just ended: `goal.kind !== "score" && goalMet(progress)` → win now;
  else `movesLeft(state) === 0` → end (win iff `goalMet(progress)`); score
  goals always play out the full move budget. On level end, call
  `finishLevel(won)` and leave `busy = true` (input stays blocked) — it's only
  cleared by the next `startLevel()` call, so a separate `phase` state machine
  isn't needed (the old prototype's 4-state enum never distinguished behavior
  beyond "is input blocked," which a single boolean already captures once the
  engine resolves a whole cascade synchronously with no `await` in the
  middle).
- `finishLevel(won)`: compute `stars = won ? starsFor(...) : 0`; if `won`,
  `progressStore.record(level, stars)`; call `showOverlay(won, stars)`. No
  leftover-move bonus step (dropped per user decision).
- `showOverlay(won, stars)`: port title/subtitle/star-row/detail-lines text
  from the old `showOverlay`, using `calibration.starCuts`/`calibration.target`/
  `calibration.moves` in place of the old module-level variables; wire
  `#ovMain`/`#ovAlt` to `startLevel(won ? level + 1 : level)` /
  `startLevel(won ? level : 1)`.
- `el.newGame` click handler becomes `() => startLevel(level)` (Restart the
  current level, deterministically the same board) instead of dealing an
  unleveled random board.
- `Object.assign(window, { verify: ... })` stays as-is, unaffected — since the
  bonus flourish is dropped, `state.score` remains exactly what the overlay
  displays.

`main.ts` stays untested, consistent with today's convention (only `engine/`
and `render/` have `*.test.ts` files) — the new logic it orchestrates is
covered by `levels.test.ts`/`objectives.test.ts`/`progress.test.ts`/
`board.test.ts`/`goalText.test.ts`.

## Verification

1. `npm test` — all existing engine/render suites unaffected (no engine files
   changed); new suites (`levels`, `objectives`, `progress`, `goalText`) pass.
2. `npm run typecheck` and `npm run build`.
3. `npm run dev` and manually play through:
   - Level 1 (score goal): HUD shows level/moves/goal/bar/stars; reaching
     target keeps playing to the move limit; overlay shows correct stars and
     next-star hint.
   - A collect-goal level (level 2): goal text names the right shape; progress
     bar tracks cleared count of that pip type; level ends the instant the
     goal is met (doesn't wait out moves).
   - Restart (`#newgame`) deals the identical board for the current level
     (deterministic seed) rather than a new random one.
   - Reload the page, replay a couple of levels, confirm `progressStore`
     (localStorage key `match-three.progress`) persists best stars per level
     across reloads.
   - Run `window.verify()` in the console mid-game and after a level end —
     `ok: true` in both cases.
