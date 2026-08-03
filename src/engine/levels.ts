import type { Rng } from "./rng";
import { createRng } from "./rng";
import type { Goal } from "./objectives";
import type { PipType } from "./types";
import type { LevelConfig } from "./types";
import { defineLevel } from "./engine";

/** Goal kinds that can appear in a level. */
export type GoalKind = "score" | "collect";

/** Calibration results for a single level number. */
export interface LevelCalibration {
  level: number;
  types: number;
  moves: number;
  pressure: number;
  expected: number;
  target: number;
  starCuts: readonly [number, number, number];
  kind: GoalKind;
  collectNeed: number;
}

const RATE = { 5: 136.5, 6: 84.7 } as const;
const r50 = (v: number): number => Math.round(v / 50) * 50;

/**
 * Pure level calibration, ported from the old `levelConfig(n)`.
 * Kind alternates `["score", "collect"]` by `(n-1) % 2`.
 */
export function levelConfig(n: number): LevelCalibration {
  const types = n <= 3 ? 5 : 6;
  const moves = n <= 3 ? 18 : 24;
  const pressure =
    n <= 3
      ? 0.62 + 0.08 * (n - 1)
      : Math.min(1.1, 0.7 + 0.04 * (n - 4));

  const expected = RATE[types as 5 | 6] * moves;
  const target = r50(expected * pressure);
  const starCuts: [number, number, number] = [
    target,
    r50(Math.max(target * 1.1, expected * 1.0)),
    r50(Math.max(target * 1.3, expected * 1.25)),
  ];

  const kind: GoalKind = (n - 1) % 2 === 0 ? "score" : "collect";
  const collectNeed = Math.max(
    12,
    Math.round((types === 5 ? 29 : 22) * pressure),
  );

  return { level: n, types, moves, pressure, expected, target, starCuts, kind, collectNeed };
}

/* ---- Goal construction ---- */

function buildGoal(
  calibration: LevelCalibration,
  rng: Rng,
): Goal {
  if (calibration.kind === "collect") {
    const pipType: PipType = rng.int(calibration.types);
    return { kind: "collect", pipType, need: calibration.collectNeed };
  }
  return { kind: "score", target: calibration.target };
}

/**
 * Full level setup — calibration + engine config + seeded goal.
 */
export interface LevelSetup {
  calibration: LevelCalibration;
  config: LevelConfig;
  goal: Goal;
}

export function buildLevel(n: number, size = 8): LevelSetup {
  const calibration = levelConfig(n);
  const seed = n; // deterministic per level
  const goal = buildGoal(calibration, createRng(seed));
  const config = defineLevel({
    seed,
    size,
    pipTypes: calibration.types,
    moveLimit: calibration.moves,
  });
  return { calibration, config, goal };
}
