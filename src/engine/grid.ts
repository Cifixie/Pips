import type { Move, PipType, Run } from "./types";
import type { Rng } from "./rng";

/** Cells hold null only mid-cascade, between a clear and the collapse that refills. */
export type Cell = PipType | null;
export type WorkingGrid = Cell[];

export const at = (r: number, c: number, size: number) => r * size + c;
export const rowOf = (i: number, size: number) => Math.floor(i / size);
export const colOf = (i: number, size: number) => i % size;

export function areAdjacent(a: number, b: number, size: number): boolean {
  const dr = Math.abs(rowOf(a, size) - rowOf(b, size));
  const dc = Math.abs(colOf(a, size) - colOf(b, size));
  return dr + dc === 1;
}

export function swapInPlace(grid: WorkingGrid, a: number, b: number): void {
  const t = grid[a];
  grid[a] = grid[b];
  grid[b] = t;
}

/**
 * All horizontal and vertical runs of 3+. Returns runs rather than a bare set
 * of indices so objectives can ask about run length and orientation later
 * without the engine changing.
 */
export function findRuns(grid: readonly Cell[], size: number): Run[] {
  const runs: Run[] = [];

  const scan = (orientation: "row" | "column") => {
    const index = (outer: number, inner: number) =>
      orientation === "row" ? at(outer, inner, size) : at(inner, outer, size);

    for (let outer = 0; outer < size; outer++) {
      let run = 1;
      for (let inner = 1; inner <= size; inner++) {
        const prev = grid[index(outer, inner - 1)];
        const same =
          inner < size && prev !== null && grid[index(outer, inner)] === prev;
        if (same) {
          run++;
          continue;
        }
        if (run >= 3 && prev !== null) {
          const cells: number[] = [];
          for (let k = inner - run; k < inner; k++) cells.push(index(outer, k));
          runs.push({ cells, pipType: prev, orientation });
        }
        run = 1;
      }
    }
  };

  scan("row");
  scan("column");
  return runs;
}

/** Distinct cells covered by the runs — an L or T shape overlaps, so dedupe. */
export function cellsOf(runs: readonly Run[]): number[] {
  const set = new Set<number>();
  for (const run of runs) for (const i of run.cells) set.add(i);
  return [...set].sort((x, y) => x - y);
}

export function countByType(
  grid: readonly Cell[],
  cells: readonly number[],
): Record<PipType, number> {
  const counts: Record<PipType, number> = {};
  for (const i of cells) {
    const t = grid[i];
    if (t !== null) counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

/**
 * Drop survivors, refill the gaps from the top.
 * Mutates `grid`; returns how far each cell fell so the renderer can animate it.
 */
export function collapse(
  grid: WorkingGrid,
  size: number,
  pipTypes: number,
  rng: Rng,
): number[] {
  const falls = new Array<number>(size * size).fill(0);

  for (let c = 0; c < size; c++) {
    let write = size - 1;
    for (let r = size - 1; r >= 0; r--) {
      const v = grid[at(r, c, size)];
      if (v !== null) {
        grid[at(write, c, size)] = v;
        falls[at(write, c, size)] = write - r;
        write--;
      }
    }
    for (let r = write; r >= 0; r--) {
      grid[at(r, c, size)] = rng.int(pipTypes);
      falls[at(r, c, size)] = write + 1;
    }
  }

  return falls;
}

/**
 * Swaps that would produce a match. `limit` lets callers stop at the first hit
 * (deadlock check) or collect them all (hints).
 */
export function findMoves(
  grid: readonly Cell[],
  size: number,
  limit = Infinity,
): Move[] {
  const found: Move[] = [];
  const work = [...grid];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ] as const) {
        const r2 = r + dr;
        const c2 = c + dc;
        if (r2 >= size || c2 >= size) continue;
        const a = at(r, c, size);
        const b = at(r2, c2, size);
        swapInPlace(work, a, b);
        const matches = findRuns(work, size).length > 0;
        swapInPlace(work, a, b);
        if (matches) {
          found.push({ a, b });
          if (found.length >= limit) return found;
        }
      }
    }
  }

  return found;
}

export const hasMove = (grid: readonly Cell[], size: number) =>
  findMoves(grid, size, 1).length > 0;
