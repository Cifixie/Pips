/** A pip type is just an index into the palette: 0..pipTypes-1. */
export type PipType = number;

export interface LevelConfig {
  readonly size: number;
  readonly pipTypes: number;
  readonly seed: number;
  /** null = endless. */
  readonly moveLimit: number | null;
}

export interface Move {
  readonly a: number;
  readonly b: number;
}

/** A single line of 3+ matching pips. Run length is what "chain" objectives read. */
export interface Run {
  readonly cells: readonly number[];
  readonly pipType: PipType;
  readonly orientation: 'row' | 'column';
}

/**
 * Everything the engine did, in the order it happened.
 *
 * The engine resolves a whole cascade synchronously and hands back this list.
 * How long each step takes on screen is the renderer's business, not the
 * rules' business — that separation is why there is no `await` in here.
 */
export type GameEvent =
  | { type: 'reject'; a: number; b: number; reason: 'not-adjacent' | 'no-match' | 'out-of-moves' }
  | { type: 'swap'; a: number; b: number; grid: readonly PipType[] }
  | {
      type: 'clear';
      cells: readonly number[];
      runs: readonly Run[];
      /** 1 for the swap itself, 2+ for cascades. */
      chain: number;
      points: number;
      /** cleared count per pip type — what "clear 20 greens" objectives read. */
      counts: Readonly<Record<PipType, number>>;
    }
  | { type: 'collapse'; grid: readonly PipType[]; falls: readonly number[] }
  | { type: 'reshuffle'; grid: readonly PipType[]; reason: 'no-moves' };

export interface GameState {
  readonly config: LevelConfig;
  readonly grid: readonly PipType[];
  /** RNG state, so a state is fully serializable and resumable. */
  readonly rng: number;
  readonly score: number;
  readonly movesUsed: number;
}

export interface MoveResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}
