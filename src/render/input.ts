import { areAdjacent, at, colOf, rowOf } from "../engine/grid";
import type { Move } from "../engine/types";
import type { BoardView } from "./board";

export interface InputHooks {
  /** Return true while a cascade is animating; input is ignored then. */
  isBusy(): boolean;
  onMove(move: Move): void;
}

/**
 * Selection is interface state, not game state, so it lives here rather than in
 * GameState. Tap two neighbours, or drag one toward a neighbour.
 */
export function createInput(
  root: HTMLElement,
  view: BoardView,
  size: number,
  hooks: InputHooks,
): void {
  let selected: number | null = null;

  const select = (index: number | null) => {
    selected = index;
    view.setSelection(index);
  };

  function pick(index: number): void {
    if (selected === null || !areAdjacent(selected, index, size)) {
      select(selected === index ? null : index);
      return;
    }
    const from = selected;
    select(null);
    hooks.onMove({ a: from, b: index });
  }

  function drag(from: number, dx: number, dy: number): void {
    const r = rowOf(from, size);
    const c = colOf(from, size);
    const [r2, c2] =
      Math.abs(dx) > Math.abs(dy)
        ? [r, c + Math.sign(dx)]
        : [r + Math.sign(dy), c];
    if (r2 < 0 || r2 >= size || c2 < 0 || c2 >= size) return;
    select(null);
    hooks.onMove({ a: from, b: at(r2, c2, size) });
  }

  let down: { index: number; x: number; y: number } | null = null;

  root.addEventListener("pointerdown", (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>(".cell");
    if (!cell) return;
    down = { index: Number(cell.dataset.i), x: e.clientX, y: e.clientY };
  });

  root.addEventListener("pointerup", (e) => {
    const start = down;
    down = null;
    if (!start || hooks.isBusy()) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > view.cellSize() * 0.4) drag(start.index, dx, dy);
    else pick(start.index);
  });

  root.addEventListener("pointercancel", () => {
    down = null;
  });

  const ARROWS: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };

  let cursor = 0;

  root.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!hooks.isBusy()) pick(cursor);
      return;
    }

    const step = ARROWS[e.key];
    if (!step) return;
    e.preventDefault();

    const r = rowOf(cursor, size) + step[0];
    const c = colOf(cursor, size) + step[1];
    if (r < 0 || r >= size || c < 0 || c >= size) return;

    cursor = at(r, c, size);
    view.setCursor(cursor);
  });

  root.addEventListener("focus", () => view.setCursor(cursor));
  root.addEventListener("blur", () => view.setCursor(null));
}
