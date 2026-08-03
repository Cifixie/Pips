# Match Three

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 28 tests
npm run typecheck
npm run build
```

## The one rule

`src/engine/` imports nothing from the DOM, contains no `await`, and calls no
`Math.random`. Everything else can be rewritten freely; this cannot be broken
without losing what the split bought.

```
src/
  engine/          pure rules — the part worth testing
    rng.ts         seeded RNG, state is one number
    types.ts       LevelConfig, Move, GameEvent, GameState
    grid.ts        findRuns, collapse, findMoves
    engine.ts      createGame, applyMove, replay
  render/
    board.ts       paints the grid, owns all animation timing
    input.ts       pointer + keyboard -> Move
  main.ts          wiring and HUD
  styles.css
```

## How a turn flows

```
input -> Move -> applyMove(state, move) -> { state, events }
                                              |
                        state (authoritative) |  events (ordered log)
                                              v
                                    view.play(events, onEvent)
```

`applyMove` resolves the whole cascade at once and returns what happened.
Nothing in the rules knows an animation takes 170ms. Change `TIMING` in
`board.ts`, or swap the DOM renderer for canvas, and the engine is untouched.

## What seeding buys

A `GameState` is `(config, grid, rng, score, movesUsed)` — all serializable.
So `replay(config, moves)` re-derives the exact final score:

```ts
replay(state.config, history).score === state.score;
```

Open the console and call `verify()` mid-game to watch it. That function is the
future leaderboard check: the client posts a seed and a move list, the server
runs this same engine, and a forged score fails. It also gives you hand-designed
levels, daily puzzles, and reproducible bug reports.

## Where step 3 plugs in

`GameEvent` already carries what objectives need to read:

- `clear.counts` — cleared count per pip type → "clear 20 greens"
- `clear.runs[].cells.length` — run length → "make three 4-in-a-rows"
- `clear.chain` — cascade depth → "reach a x3 chain"
- `LevelConfig.moveLimit` — already enforced; `applyMove` rejects with
  `reason: 'out-of-moves'`

An objective is a reducer over that stream, `(progress, event) => progress`.
Adding a goal type means one new function plus one config shape — no engine
change.

## Two behaviour notes

Deadlocks now **shuffle the existing pips** instead of dealing a fresh board.
The original regenerated, which would let a "clear 20 greens" objective be
helped or hurt by luck. Preserving the pip multiset keeps objectives fair.

The fall animation is unchanged from the original, including a small quirk: the
keyframe translates by `--d * (100% + gap)` where `100%` is the pip's height
(76% of a cell), so tall drops start slightly closer than a full cell each. It
reads fine, so it was left alone rather than silently changed.
