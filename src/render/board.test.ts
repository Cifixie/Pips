// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMove,
  availableMoves,
  createGame,
  defineLevel,
} from "../engine/engine";
import { createBoardView } from "./board";
import type { GameEvent } from "../engine/types";

/** Reduced motion collapses every wait to zero, so tests run instantly. */
beforeEach(() => {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

const mount = (size = 8) => {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  return { root, view: createBoardView(root, size) };
};

describe("createBoardView", () => {
  it("builds one cell per grid slot", () => {
    const { root } = mount();
    expect(root.querySelectorAll(".cell")).toHaveLength(64);
    expect(root.querySelectorAll('[role="gridcell"]')).toHaveLength(64);
    expect(root.style.getPropertyValue("--n")).toBe("8");
  });

  it("paints pip types onto the cells", () => {
    const { view, root } = mount(3);
    view.paint([0, 1, 2, 3, 4, 5, 0, 1, 2]);
    const types = [...root.querySelectorAll<HTMLElement>(".cell")].map(
      (c) => c.dataset.t,
    );
    expect(types).toEqual(["0", "1", "2", "3", "4", "5", "0", "1", "2"]);
  });

  it("marks fallen cells with their distance", () => {
    const { view } = mount(3);
    view.paint([0, 1, 2, 3, 4, 5, 0, 1, 2], [2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(view.cells[0].classList.contains("fall")).toBe(true);
    expect(view.cells[0].style.getPropertyValue("--d")).toBe("2");
    expect(view.cells[1].classList.contains("fall")).toBe(false);
  });

  it("moves selection and cursor markers", () => {
    const { view } = mount(3);
    view.paint([0, 1, 2, 3, 4, 5, 0, 1, 2]);

    view.setSelection(4);
    expect(view.cells[4].classList.contains("sel")).toBe(true);
    view.setSelection(null);
    expect(view.cells.some((c) => c.classList.contains("sel"))).toBe(false);

    view.setCursor(2);
    view.setCursor(5);
    expect(view.cells[2].classList.contains("cursor")).toBe(false);
    expect(view.cells[5].classList.contains("cursor")).toBe(true);
  });
});

describe("play", () => {
  it("reports events in order as they become visible", async () => {
    const { view } = mount();
    const state = createGame(defineLevel({ seed: 2024 }));
    view.paint(state.grid);

    const result = applyMove(state, availableMoves(state)[0]);
    const seen: GameEvent["type"][] = [];
    await view.play(result.events, (e) => seen.push(e.type));

    expect(seen).toEqual(result.events.map((e) => e.type));
    expect(seen[0]).toBe("swap");
  });

  it("leaves the board showing the final grid from the engine", async () => {
    const { view } = mount();
    const state = createGame(defineLevel({ seed: 909 }));
    view.paint(state.grid);

    const result = applyMove(state, availableMoves(state)[0]);
    await view.play(result.events);

    const shown = view.cells.map((c) => Number(c.dataset.t));
    expect(shown).toEqual([...result.state.grid]);
  });

  it("nudges a rejected swap without repainting", async () => {
    const { view } = mount();
    const state = createGame(defineLevel({ seed: 42 }));
    view.paint(state.grid);

    await view.play([{ type: "reject", a: 0, b: 1, reason: "no-match" }]);

    const shown = view.cells.map((c) => Number(c.dataset.t));
    expect(shown).toEqual([...state.grid]);
    expect(view.cells[0].classList.contains("nudge")).toBe(false);
  });
});
