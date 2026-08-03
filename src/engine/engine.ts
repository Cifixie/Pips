import { createRng, type Rng } from "./rng";
import {
  areAdjacent,
  cellsOf,
  collapse,
  countByType,
  findMoves,
  findRuns,
  hasMove,
  swapInPlace,
  type WorkingGrid,
} from "./grid";
import type {
  GameEvent,
  GameState,
  LevelConfig,
  Move,
  MoveResult,
  PipType,
} from "./types";

const DEFAULTS = { size: 8, pipTypes: 6, moveLimit: null } as const;

export function defineLevel(
  config: Partial<LevelConfig> & { seed: number },
): LevelConfig {
  return { ...DEFAULTS, ...config };
}

/** Random board with no pre-made matches and at least one legal move. */
function generateGrid(config: LevelConfig, rng: Rng): PipType[] {
  const { size, pipTypes } = config;

  for (let attempt = 0; attempt < 100; attempt++) {
    const grid: WorkingGrid = Array.from({ length: size * size }, () =>
      rng.int(pipTypes),
    );

    let guard = 0;
    let runs = findRuns(grid, size);
    while (runs.length && guard++ < 400) {
      for (const i of cellsOf(runs)) grid[i] = rng.int(pipTypes);
      runs = findRuns(grid, size);
    }

    if (!runs.length && hasMove(grid, size)) return grid as PipType[];
  }

  throw new Error(
    `Could not generate a playable ${size}x${size} board with ${pipTypes} types`,
  );
}

/**
 * Deadlock recovery. Shuffles the pips already on the board rather than dealing
 * new ones, so a "clear 20 greens" objective can't be helped or hurt by luck.
 */
function reshuffleGrid(
  grid: readonly PipType[],
  config: LevelConfig,
  rng: Rng,
): PipType[] {
  const { size } = config;

  for (let attempt = 0; attempt < 200; attempt++) {
    const next = [...grid];
    for (let i = next.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [next[i], next[j]] = [next[j], next[i]];
    }
    if (!findRuns(next, size).length && hasMove(next, size)) return next;
  }

  return generateGrid(config, rng);
}

export function createGame(config: LevelConfig): GameState {
  const rng = createRng(config.seed);
  const grid = generateGrid(config, rng);
  return { config, grid, rng: rng.state, score: 0, movesUsed: 0 };
}

export const movesLeft = (state: GameState): number | null =>
  state.config.moveLimit === null
    ? null
    : state.config.moveLimit - state.movesUsed;

export const isOver = (state: GameState): boolean => movesLeft(state) === 0;

/** Legal swaps from here — for hint buttons and tests. */
export const availableMoves = (state: GameState): Move[] =>
  findMoves(state.grid, state.config.size);

/**
 * Apply one swap. Resolves the entire cascade and returns the new state plus an
 * ordered log of what happened. Pure: same input, same output, always.
 */
export function applyMove(state: GameState, move: Move): MoveResult {
  const { size, pipTypes } = state.config;
  const { a, b } = move;

  const reject = (
    reason: "not-adjacent" | "no-match" | "out-of-moves",
  ): MoveResult => ({
    state,
    events: [{ type: "reject", a, b, reason }],
  });

  if (isOver(state)) return reject("out-of-moves");
  if (!areAdjacent(a, b, size)) return reject("not-adjacent");

  const grid: WorkingGrid = [...state.grid];
  swapInPlace(grid, a, b);
  if (!findRuns(grid, size).length) return reject("no-match");

  const rng = createRng(state.rng);
  const events: GameEvent[] = [
    { type: "swap", a, b, grid: [...grid] as PipType[] },
  ];
  let score = state.score;
  let chain = 0;

  for (;;) {
    const runs = findRuns(grid, size);
    if (!runs.length) break;

    chain++;
    const cells = cellsOf(runs);
    const points = cells.length * 10 * chain;
    score += points;

    events.push({
      type: "clear",
      cells,
      runs,
      chain,
      points,
      counts: countByType(grid, cells),
    });

    for (const i of cells) grid[i] = null;
    const falls = collapse(grid, size, pipTypes, rng);
    events.push({ type: "collapse", grid: [...grid] as PipType[], falls });
  }

  let final = grid as PipType[];
  if (!hasMove(final, size)) {
    final = reshuffleGrid(final, state.config, rng);
    events.push({ type: "reshuffle", grid: [...final], reason: "no-moves" });
  }

  return {
    state: {
      ...state,
      grid: final,
      rng: rng.state,
      score,
      movesUsed: state.movesUsed + 1,
    },
    events,
  };
}

/**
 * Re-derive a finished game from its seed and move list.
 * This is the server-side score check: never trust a posted score, replay it.
 */
export function replay(config: LevelConfig, moves: readonly Move[]): GameState {
  let state = createGame(config);
  for (const move of moves) state = applyMove(state, move).state;
  return state;
}
