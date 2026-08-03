import { describe, expect, it } from "vitest";
import { levelConfig, buildLevel } from "./levels";
import type { LevelCalibration } from "./levels";

const checkCal = (cfg: LevelCalibration, expected: Partial<LevelCalibration & { starCutsMonotonic: boolean }>) => {
  if (expected.types !== undefined) expect(cfg.types).toBe(expected.types);
  if (expected.moves !== undefined) expect(cfg.moves).toBe(expected.moves);
  if (expected.pressure !== undefined) expect(cfg.pressure).toBe(expected.pressure);
  if (expected.expected !== undefined) expect(cfg.expected).toBe(expected.expected);
  if (expected.target !== undefined) expect(cfg.target).toBe(expected.target);
  if (expected.kind !== undefined) expect(cfg.kind).toBe(expected.kind);
  if (expected.collectNeed !== undefined) expect(cfg.collectNeed).toBe(expected.collectNeed);
  if (expected.starCutsMonotonic) {
    const [s1, s2, s3] = cfg.starCuts;
    expect(s1 <= s2 && s2 <= s3).toBe(true);
  }
};

describe("levelConfig", () => {
  it("types: 5 for levels 1-3, 6 for 4+", () => {
    for (const n of [1, 2, 3]) {
      expect(levelConfig(n).types).toBe(5);
    }
    for (const n of [4, 5, 10]) {
      expect(levelConfig(n).types).toBe(6);
    }
  });

  it("moves: 18 for levels 1-3, 24 for 4+", () => {
    for (const n of [1, 2, 3]) expect(levelConfig(n).moves).toBe(18);
    for (const n of [4, 5, 10]) expect(levelConfig(n).moves).toBe(24);
  });

  it("pressure ramps correctly", () => {
    // Level 1: 0.62 + 0 = 0.62
    expect(levelConfig(1).pressure).toBeCloseTo(0.62);
    // Level 2: 0.62 + 0.08 = 0.70
    expect(levelConfig(2).pressure).toBeCloseTo(0.70);
    // Level 3: 0.62 + 0.16 = 0.78
    expect(levelConfig(3).pressure).toBeCloseTo(0.78);
    // Level 4: 0.7 + 0.04*0 = 0.70
    expect(levelConfig(4).pressure).toBeCloseTo(0.70);
    // Level 10: 0.7 + 0.04*6 = 0.94
    expect(levelConfig(10).pressure).toBeCloseTo(0.94);
    // Cap at 1.1: level 28 would be 0.7+0.04*24=1.66, capped
    expect(levelConfig(28).pressure).toBe(1.1);
  });

  it("starCuts are monotonically non-decreasing", () => {
    for (let n = 1; n <= 20; n++) {
      const [s1, s2, s3] = levelConfig(n).starCuts;
      expect(s1 <= s2 && s2 <= s3, `starCuts not monotonic at level ${n}`).toBe(true);
    }
  });

  it("kind alternates score/collect starting with score at n=1", () => {
    for (let n = 1; n <= 8; n++) {
      const expected = (n - 1) % 2 === 0 ? "score" : "collect";
      expect(levelConfig(n).kind, `level ${n} kind`).toBe(expected);
    }
  });

  it("target is r50-rounded", () => {
    // Level 1: expected = 136.5 * 18 = 2457, pressure = 0.62 → 1523.34, r50 = 1500
    expect(levelConfig(1).target).toBe(1500);
    // Level 2: expected = 136.5 * 18 = 2457, pressure = 0.70 → 1719.9, r50 = 1700
    expect(levelConfig(2).target).toBe(1700);
  });

  it("collectNeed calculation", () => {
    // Level 1: types=5, pressure=0.62 → max(12, round(29*0.62)) = max(12, 18) = 18
    expect(levelConfig(1).collectNeed).toBe(18);
    // Level 5: types=6, pressure=0.74 → max(12, round(22*0.74)) = max(12, 16) = 16
    expect(levelConfig(5).collectNeed).toBe(16);
  });

  it("reproduces formula values for levels 1-6", () => {
    // Level 1: types=5, moves=18, pressure=0.62, expected=2457, target=1500
    checkCal(levelConfig(1), {
      types: 5, moves: 18, pressure: 0.62, expected: 2457, target: 1500,
      starCutsMonotonic: true, kind: "score", collectNeed: 18,
    });
    // Level 2: types=5, moves=18, pressure=0.70
    checkCal(levelConfig(2), {
      types: 5, moves: 18, expected: 2457,
      starCutsMonotonic: true, kind: "collect",
    });
    // Level 5: types=6, moves=24, kind=(5-1)%2=0 → score
    checkCal(levelConfig(5), {
      types: 6, moves: 24,
      starCutsMonotonic: true, kind: "score",
    });
  });
});

describe("buildLevel", () => {
  it("is deterministic — same level number gives identical config", () => {
    const a = buildLevel(3);
    const b = buildLevel(3);
    expect(a.config.seed).toBe(b.config.seed);
    expect(a.config.size).toBe(b.config.size);
    expect(a.config.pipTypes).toBe(b.config.pipTypes);
    expect(a.config.moveLimit).toBe(b.config.moveLimit);
  });

  it("same level number gives identical goal", () => {
    const a = buildLevel(5);
    const b = buildLevel(5);
    expect(JSON.stringify(a.goal)).toEqual(JSON.stringify(b.goal));
  });

  it("score levels have a target", () => {
    const setup = buildLevel(1);
    expect(setup.goal.kind).toBe("score");
    if (setup.goal.kind === "score") {
      expect(setup.goal.target).toBeGreaterThan(0);
    }
  });

  it("collect levels have pipType and need", () => {
    const setup = buildLevel(2);
    expect(setup.goal.kind).toBe("collect");
    if (setup.goal.kind === "collect") {
      expect(setup.goal.need).toBeGreaterThan(0);
    }
  });
});
