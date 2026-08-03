import type { Goal } from "../engine/objectives";

const SHAPE_NAME = [
  "round",
  "square",
  "triangle",
  "diamond",
  "hexagon",
  "ring",
] as const;

/**
 * Presentation-only string builder for goal text.
 * Kept out of objectives.ts — tied to CSS `data-t` shape order, not engine logic.
 */
export function describeGoal(goal: Goal): string {
  if (goal.kind === "score") {
    return `Reach ${goal.target.toLocaleString()} points`;
  }
  const name = SHAPE_NAME[goal.pipType] ?? "pieces";
  return `Clear ${goal.need} ${name} pieces`;
}
