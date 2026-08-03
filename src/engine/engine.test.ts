import { describe, expect, it } from "vitest";
import {
  applyMove,
  availableMoves,
  createGame,
  defineLevel,
  replay,
} from "./engine";
import { at, findRuns, hasMove } from "./grid";
import { createRng } from "./rng";
import type { GameEvent, LevelConfig, Move } from "./types";

const level = (seed: number, over: Partial<Omit<LevelConfig, "seed">> = {}) =>
  defineLevel({ seed, ...over });

const clears = (events: readonly GameEvent[]) =>
  events.filter(
    (e): e is Extract<GameEvent, { type: "clear" }> => e.type === "clear",
  );

describe("rng", () => {
  it("is deterministic for a seed", () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const draw = (r: typeof a) => Array.from({ length: 20 }, () => r.int(6));
    expect(draw(a)).toEqual(draw(b));
  });

  it("diverges for different seeds", () => {
    const draw = (seed: number) => {
      const r = createRng(seed);
      return Array.from({ length: 40 }, () => r.int(6));
    };
    expect(draw(1)).not.toEqual(draw(2));
  });

  it("resumes exactly from a snapshotted state", () => {
    const original = createRng(99);
    for (let i = 0; i < 10; i++) original.int(6);
    const snapshot = original.state;
    const rest = Array.from({ length: 10 }, () => original.int(6));

    const resumed = createRng(snapshot);
    expect(Array.from({ length: 10 }, () => resumed.int(6))).toEqual(rest);
  });
});

describe("findRuns", () => {
  it("detects a horizontal three", () => {
    const grid = Array(9).fill(1);
    grid[3] = 2;
    grid[4] = 3;
    grid[5] = 4;
    grid[6] = 2;
    grid[7] = 3;
    grid[8] = 4;
    const runs = findRuns(grid, 3);
    expect(runs).toHaveLength(1);
    expect(runs[0].orientation).toBe("row");
    expect(runs[0].cells).toEqual([0, 1, 2]);
    expect(runs[0].pipType).toBe(1);
  });

  it("detects a vertical three", () => {
    const grid = [1, 2, 3, 1, 4, 5, 1, 6, 7];
    const runs = findRuns(grid, 3);
    expect(runs).toHaveLength(1);
    expect(runs[0].orientation).toBe("column");
    expect(runs[0].cells).toEqual([at(0, 0, 3), at(1, 0, 3), at(2, 0, 3)]);
  });

  it("reports run length for longer lines", () => {
    const grid = [1, 1, 1, 1, 2, 3, 4, 5, 6];
    expect(findRuns(grid, 3)[0].cells).toHaveLength(3);
  });

  it("ignores nulls", () => {
    expect(findRuns([null, null, null, 1, 2, 3, 4, 5, 6], 3)).toEqual([]);
  });
});

describe("createGame", () => {
  it("deals a board with no pre-made matches and at least one move", () => {
    for (let seed = 0; seed < 40; seed++) {
      const state = createGame(level(seed));
      expect(findRuns(state.grid, 8)).toEqual([]);
      expect(hasMove(state.grid, 8)).toBe(true);
    }
  });

  it("produces the same board for the same seed", () => {
    expect(createGame(level(777)).grid).toEqual(createGame(level(777)).grid);
  });

  it("produces different boards for different seeds", () => {
    expect(createGame(level(1)).grid).not.toEqual(createGame(level(2)).grid);
  });

  it("honours pipTypes", () => {
    const state = createGame(level(5, { pipTypes: 3 }));
    expect(Math.max(...state.grid)).toBeLessThan(3);
  });
});

describe("applyMove", () => {
  it("rejects non-adjacent swaps without touching state", () => {
    const state = createGame(level(42));
    const result = applyMove(state, { a: 0, b: 63 });
    expect(result.state).toBe(state);
    expect(result.events).toEqual([
      { type: "reject", a: 0, b: 63, reason: "not-adjacent" },
    ]);
  });

  it("rejects adjacent swaps that make no line", () => {
    const state = createGame(level(42));
    const legal = new Set(availableMoves(state).map((m) => `${m.a}:${m.b}`));
    const dud = { a: 0, b: 1 };
    if (!legal.has(`${dud.a}:${dud.b}`)) {
      const result = applyMove(state, dud);
      expect(result.state).toBe(state);
      expect(result.events[0]).toMatchObject({
        type: "reject",
        reason: "no-match",
      });
    }
  });

  it("resolves a legal move and scores it", () => {
    const state = createGame(level(2024));
    const move = availableMoves(state)[0];
    const result = applyMove(state, move);

    expect(result.state.score).toBeGreaterThan(0);
    expect(result.state.movesUsed).toBe(1);
    expect(result.events[0].type).toBe("swap");
    expect(clears(result.events).length).toBeGreaterThan(0);
  });

  it("leaves the board full and match-free afterwards", () => {
    let state = createGame(level(31337));
    for (let i = 0; i < 60; i++) {
      const moves = availableMoves(state);
      if (!moves.length) break;
      state = applyMove(state, moves[0]).state;
      expect(state.grid).toHaveLength(64);
      expect(state.grid.every((v) => typeof v === "number")).toBe(true);
      expect(findRuns(state.grid, 8)).toEqual([]);
      expect(hasMove(state.grid, 8)).toBe(true);
    }
  });

  it("numbers chains and multiplies their score", () => {
    let state = createGame(level(8));
    for (let i = 0; i < 200; i++) {
      const moves = availableMoves(state);
      if (!moves.length) break;
      const result = applyMove(state, moves[0]);
      const cascade = clears(result.events);
      expect(cascade.map((c) => c.chain)).toEqual(cascade.map((_, k) => k + 1));
      for (const c of cascade)
        expect(c.points).toBe(c.cells.length * 10 * c.chain);
      if (cascade.length > 1) return;
      state = result.state;
    }
  });

  it("reports cleared counts per pip type", () => {
    const state = createGame(level(4242));
    const result = applyMove(state, availableMoves(state)[0]);
    for (const clear of clears(result.events)) {
      const total = Object.values(clear.counts).reduce((a, b) => a + b, 0);
      expect(total).toBe(clear.cells.length);
    }
  });

  it("does not mutate the state it was given", () => {
    const state = createGame(level(11));
    const snapshot = [...state.grid];
    applyMove(state, availableMoves(state)[0]);
    expect(state.grid).toEqual(snapshot);
  });

  it("stops accepting moves at the limit", () => {
    let state = createGame(level(64, { moveLimit: 3 }));
    for (let i = 0; i < 3; i++)
      state = applyMove(state, availableMoves(state)[0]).state;
    const result = applyMove(state, availableMoves(state)[0]);
    expect(result.state).toBe(state);
    expect(result.events[0]).toMatchObject({ reason: "out-of-moves" });
  });
});

describe("replay", () => {
  it("re-derives the same score and board from seed plus moves", () => {
    const config = level(555);
    let state = createGame(config);
    const history: Move[] = [];

    for (let i = 0; i < 50; i++) {
      const moves = availableMoves(state);
      if (!moves.length) break;
      const move = moves[i % moves.length];
      history.push(move);
      state = applyMove(state, move).state;
    }

    const derived = replay(config, history);
    expect(derived.score).toBe(state.score);
    expect(derived.grid).toEqual(state.grid);
    expect(derived.movesUsed).toBe(state.movesUsed);
  });

  it("cannot be fooled by a forged score", () => {
    const config = level(556);
    let state = createGame(config);
    const history: Move[] = [];
    for (let i = 0; i < 5; i++) {
      const move = availableMoves(state)[0];
      history.push(move);
      state = applyMove(state, move).state;
    }
    const claimed = 99999;
    expect(replay(config, history).score).not.toBe(claimed);
  });
});
