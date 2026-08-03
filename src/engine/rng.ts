/**
 * mulberry32 — small, fast, good enough for a puzzle game.
 *
 * The point of using this instead of Math.random is that `state` is a single
 * number. Store it in GameState and the whole game becomes reproducible:
 * same seed + same moves = same board, every time, on any machine.
 */
export interface Rng {
  /** Current internal state. Snapshot this into GameState. */
  readonly state: number;
  /** Float in [0, 1). */
  float(): number;
  /** Integer in [0, n). */
  int(n: number): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;

  function float(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    get state() {
      return a;
    },
    float,
    int: (n: number) => Math.floor(float() * n),
  };
}

/** For "new game" buttons and daily-puzzle seeds. */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
