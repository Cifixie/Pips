import type { GameEvent, PipType } from "../engine/types";

/**
 * Durations live here, not in the engine. They match the CSS transitions in
 * styles.css — change both together.
 */
const TIMING = { swap: 90, pop: 170, fall: 200, nudge: 240 };

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export interface BoardView {
  readonly cells: readonly HTMLElement[];
  paint(grid: readonly PipType[], falls?: readonly number[]): void;
  /** Walks the event stream, pacing it for the eye. `onEvent` fires as each
   *  event becomes visible, so HUD updates stay in sync with the animation. */
  play(
    events: readonly GameEvent[],
    onEvent?: (event: GameEvent) => void,
  ): Promise<void>;
  setSelection(index: number | null): void;
  setCursor(index: number | null): void;
  cellSize(): number;
}

export function createBoardView(root: HTMLElement, size: number): BoardView {
  const cells: HTMLElement[] = [];

  root.style.setProperty("--n", String(size));
  root.replaceChildren();

  for (let i = 0; i < size * size; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.i = String(i);
    cell.setAttribute("role", "gridcell");
    cell.innerHTML = '<span class="pip"></span>';
    root.appendChild(cell);
    cells.push(cell);
  }

  let selection: number | null = null;
  let cursor: number | null = null;

  function paint(grid: readonly PipType[], falls?: readonly number[]): void {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      cell.dataset.t = String(grid[i]);
      cell.classList.remove("pop", "fall");
      const distance = falls?.[i] ?? 0;
      if (distance > 0) {
        cell.style.setProperty("--d", String(distance));
        void cell.offsetWidth; // restart the animation
        cell.classList.add("fall");
      }
    }
    applySelection();
  }

  function applySelection(): void {
    cells.forEach((cell, i) => cell.classList.toggle("sel", i === selection));
  }

  async function nudge(a: number, b: number): Promise<void> {
    cells[a].classList.add("nudge");
    cells[b].classList.add("nudge");
    await wait(TIMING.nudge);
    cells[a].classList.remove("nudge");
    cells[b].classList.remove("nudge");
  }

  async function play(
    events: readonly GameEvent[],
    onEvent?: (event: GameEvent) => void,
  ): Promise<void> {
    const scale = reducedMotion() ? 0 : 1;

    for (const event of events) {
      onEvent?.(event);

      switch (event.type) {
        case "reject":
          if (event.reason === "no-match") await nudge(event.a, event.b);
          break;

        case "swap":
          paint(event.grid);
          await wait(TIMING.swap * scale);
          break;

        case "clear":
          for (const i of event.cells) cells[i].classList.add("pop");
          await wait(TIMING.pop * scale);
          break;

        case "collapse":
          paint(event.grid, event.falls);
          await wait(TIMING.fall * scale);
          break;

        case "reshuffle":
          paint(event.grid);
          break;
      }
    }
  }

  return {
    cells,
    paint,
    play,
    setSelection(index) {
      selection = index;
      applySelection();
    },
    setCursor(index) {
      if (cursor !== null) cells[cursor].classList.remove("cursor");
      cursor = index;
      if (cursor !== null) cells[cursor].classList.add("cursor");
    },
    cellSize: () => cells[0].offsetWidth,
  };
}
