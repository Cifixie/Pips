import { describe, expect, it } from "vitest";
import { describeGoal } from "./goalText";
import type { Goal } from "../engine/objectives";
import { type PipType } from "../engine/types";

describe("describeGoal", () => {
  it("score goal: 'Reach X points'", () => {
    const goal: Goal = { kind: "score", target: 4200 };
    expect(describeGoal(goal)).toBe("Reach 4,200 points");
  });

  it("score goal with large target uses locale formatting", () => {
    const goal: Goal = { kind: "score", target: 12500 };
    expect(describeGoal(goal)).toBe("Reach 12,500 points");
  });

  it("collect goal: 'Clear N X pieces'", () => {
    const goal: Goal = { kind: "collect", pipType: 0 as PipType, need: 18 };
    expect(describeGoal(goal)).toBe("Clear 18 round pieces");
  });

  it("collect goal: different pip types have different names", () => {
    const names: Record<number, string> = {
      0: "round",
      1: "square",
      2: "triangle",
      3: "diamond",
      4: "hexagon",
      5: "ring",
    };
    for (const [type, name] of Object.entries(names)) {
      const goal: Goal = { kind: "collect", pipType: Number(type) as PipType, need: 10 };
      expect(describeGoal(goal)).toBe(`Clear 10 ${name} pieces`);
    }
  });
});
