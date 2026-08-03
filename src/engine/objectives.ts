import type { GameEvent, PipType } from "./types";

/* ---- Goal shape ---- */

export type Goal =
  | { kind: "score"; target: number }
  | { kind: "collect"; pipType: PipType; need: number };

export interface GoalProgress {
  have: number;
  need: number;
}

/** Initial progress for a goal — have is 0. */
export function initialProgress(goal: Goal): GoalProgress {
  return { have: 0, need: goal.kind === "score" ? goal.target : goal.need };
}

/**
 * Reduce (progress, event) → new progress.
 * Score-kind sums event.points (from clear events) into have.
 * Collect-kind sums event.counts[pipType] into have.
 * Non-clear events are no-ops.
 */
export function applyObjective(
  goal: Goal,
  progress: GoalProgress,
  event: GameEvent,
): GoalProgress {
  if (event.type !== "clear") return progress;

  const prev = { have: progress.have, need: progress.need };
  if (goal.kind === "score") {
    return { ...prev, have: prev.have + event.points };
  }
  // collect
  const gained = event.counts[goal.pipType] ?? 0;
  return { ...prev, have: prev.have + gained };
}

/** True when the accumulated `have` meets or exceeds `need`. */
export const goalMet = (progress: GoalProgress): boolean =>
  progress.have >= progress.need;

/** Fraction of progress clamped to [0, 1]. */
export const goalFraction = (progress: GoalProgress): number =>
  Math.max(0, Math.min(1, progress.have / progress.need));

/**
 * Derive a star rating (0-3) from a completed level's final state.
 *
 * Score goals: count starCuts cleared by final score.
 * Collect goals: >= 40% moves left → 3, >= 20% → 2, else 1.
 */
export function starsFor(goal: Goal, args: {
  score: number;
  starCuts: readonly [number, number, number];
  movesLeft: number;
  moveBudget: number;
}): number {
  if (goal.kind === "score") {
    let s = 0;
    for (const cut of args.starCuts) {
      if (args.score >= cut) s++;
    }
    return s;
  }
  const frac = args.movesLeft / args.moveBudget;
  if (frac >= 0.4) return 3;
  if (frac >= 0.2) return 2;
  return 1;
}
