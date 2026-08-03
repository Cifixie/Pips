import { describe, expect, it } from "vitest";
import {
  initialProgress,
  applyObjective,
  goalMet,
  goalFraction,
  starsFor,
  type Goal,
  type GoalProgress,
} from "./objectives";
import type { GameEvent, PipType } from "./types";

const clearEvent = (points: number, counts: Record<PipType, number>): GameEvent => ({
  type: "clear",
  cells: [0, 1, 2],
  runs: [],
  chain: 1,
  points,
  counts,
});

const rejectEvent = (): GameEvent => ({
  type: "reject",
  a: 0,
  b: 1,
  reason: "not-adjacent",
});

describe("initialProgress", () => {
  it("score goal: have=0, need=target", () => {
    const goal: Goal = { kind: "score", target: 4200 };
    const p = initialProgress(goal);
    expect(p).toEqual({ have: 0, need: 4200 });
  });

  it("collect goal: have=0, need=need", () => {
    const goal: Goal = { kind: "collect", pipType: 2 as PipType, need: 20 };
    const p = initialProgress(goal);
    expect(p).toEqual({ have: 0, need: 20 });
  });
});

describe("applyObjective", () => {
  describe("score goal", () => {
    it("sums clear.event.points", () => {
      const goal: Goal = { kind: "score", target: 5000 };
      let p: GoalProgress = initialProgress(goal);
      p = applyObjective(goal, p, clearEvent(300, {}));
      expect(p.have).toBe(300);
      p = applyObjective(goal, p, clearEvent(200, {}));
      expect(p.have).toBe(500);
    });

    it("ignores non-clear events", () => {
      const goal: Goal = { kind: "score", target: 5000 };
      let p = initialProgress(goal);
      p = applyObjective(goal, p, rejectEvent());
      expect(p.have).toBe(0);
    });
  });

  describe("collect goal", () => {
    it("sums counts for the target pip type", () => {
      const goal: Goal = { kind: "collect", pipType: 1 as PipType, need: 20 };
      let p = initialProgress(goal);
      p = applyObjective(goal, p, clearEvent(30, { 1: 3, 2: 2 }));
      expect(p.have).toBe(3);
      p = applyObjective(goal, p, clearEvent(40, { 1: 5 }));
      expect(p.have).toBe(8);
    });

    it("counts 0 when pip type not present", () => {
      const goal: Goal = { kind: "collect", pipType: 3 as PipType, need: 20 };
      const p = initialProgress(goal);
      const next = applyObjective(goal, p, clearEvent(30, { 1: 3 }));
      expect(next.have).toBe(0);
    });

    it("ignores non-clear events", () => {
      const goal: Goal = { kind: "collect", pipType: 1 as PipType, need: 20 };
      let p = initialProgress(goal);
      p = applyObjective(goal, p, rejectEvent());
      expect(p.have).toBe(0);
    });
  });
});

describe("goalMet", () => {
  it("false when have < need", () => {
    expect(goalMet({ have: 99, need: 100 })).toBe(false);
  });

  it("true when have === need", () => {
    expect(goalMet({ have: 100, need: 100 })).toBe(true);
  });

  it("true when have > need", () => {
    expect(goalMet({ have: 150, need: 100 })).toBe(true);
  });
});

describe("goalFraction", () => {
  it("0 when have is 0", () => {
    expect(goalFraction({ have: 0, need: 100 })).toBe(0);
  });

  it("1 when have >= need", () => {
    expect(goalFraction({ have: 100, need: 100 })).toBe(1);
    expect(goalFraction({ have: 200, need: 100 })).toBe(1);
  });

  it("clamped at 0 for negative have", () => {
    expect(goalFraction({ have: -10, need: 100 })).toBe(0);
  });

  it("partial progress between 0 and 1", () => {
    expect(goalFraction({ have: 50, need: 100 })).toBe(0.5);
  });
});

describe("starsFor", () => {
  describe("score goal", () => {
    it("0 stars when score below first cut", () => {
      const stars = starsFor(
        { kind: "score", target: 4200 },
        { score: 0, starCuts: [4200, 5000, 5500], movesLeft: 0, moveBudget: 18 },
      );
      expect(stars).toBe(0);
    });

    it("1 star when score hits first cut", () => {
      const stars = starsFor(
        { kind: "score", target: 4200 },
        { score: 4200, starCuts: [4200, 5000, 5500], movesLeft: 0, moveBudget: 18 },
      );
      expect(stars).toBe(1);
    });

    it("2 stars when score hits second cut", () => {
      const stars = starsFor(
        { kind: "score", target: 4200 },
        { score: 5000, starCuts: [4200, 5000, 5500], movesLeft: 0, moveBudget: 18 },
      );
      expect(stars).toBe(2);
    });

    it("3 stars when score hits third cut", () => {
      const stars = starsFor(
        { kind: "score", target: 4200 },
        { score: 5500, starCuts: [4200, 5000, 5500], movesLeft: 0, moveBudget: 18 },
      );
      expect(stars).toBe(3);
    });
  });

  describe("collect goal", () => {
    it("1 star when movesLeft fraction < 0.2", () => {
      const goal: Goal = { kind: "collect", pipType: 1, need: 20 };
      // 2 moves left out of 18 = 0.111
      const stars = starsFor(goal, {
        score: 0, starCuts: [0, 0, 0], movesLeft: 2, moveBudget: 18,
      });
      expect(stars).toBe(1);
    });

    it("2 stars when movesLeft fraction >= 0.2", () => {
      const goal: Goal = { kind: "collect", pipType: 1, need: 20 };
      // 4 moves left out of 18 = 0.222
      const stars = starsFor(goal, {
        score: 0, starCuts: [0, 0, 0], movesLeft: 4, moveBudget: 18,
      });
      expect(stars).toBe(2);
    });

    it("2 stars when fraction exactly 0.2 (boundary)", () => {
      // 18 moves budget, 4 left → 4/18 ≈ 0.222, that's > 0.2
      // For exact 0.2: 20 budget, 4 left → 4/20 = 0.2
      const goal: Goal = { kind: "collect", pipType: 1, need: 20 };
      const stars = starsFor(goal, {
        score: 0, starCuts: [0, 0, 0], movesLeft: 4, moveBudget: 20,
      });
      expect(stars).toBe(2);
    });

    it("3 stars when movesLeft fraction >= 0.4", () => {
      const goal: Goal = { kind: "collect", pipType: 1, need: 20 };
      // 8 moves left out of 20 = 0.4
      const stars = starsFor(goal, {
        score: 0, starCuts: [0, 0, 0], movesLeft: 8, moveBudget: 20,
      });
      expect(stars).toBe(3);
    });

    it("3 stars when all moves left", () => {
      const goal: Goal = { kind: "collect", pipType: 1, need: 20 };
      const stars = starsFor(goal, {
        score: 0, starCuts: [0, 0, 0], movesLeft: 18, moveBudget: 18,
      });
      expect(stars).toBe(3);
    });
  });
});
