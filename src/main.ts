import "./styles.css";
import { applyMove, createGame, defineLevel, replay } from "./engine/engine";
import { createBoardView } from "./render/board";
import { createInput } from "./render/input";
import type { GameEvent, GameState, Move } from "./engine/types";
import { randomSeed } from "./engine/rng";

const SIZE = 8;

const el = {
  board: document.getElementById("board") as HTMLElement,
  score: document.getElementById("score") as HTMLElement,
  combo: document.getElementById("combo") as HTMLElement,
  hint: document.getElementById("hint") as HTMLElement,
  newGame: document.getElementById("newgame") as HTMLButtonElement,
};

const view = createBoardView(el.board, SIZE);

let state: GameState = createGame(
  defineLevel({ seed: randomSeed(), size: SIZE }),
);
/** Every move played, for replay verification. */
let history: Move[] = [];
let busy = false;
let comboTimer: number | undefined;

function newGame(): void {
  if (busy) return;
  state = createGame(defineLevel({ seed: randomSeed(), size: SIZE }));
  history = [];
  el.score.textContent = "0";
  el.combo.classList.remove("on");
  el.hint.textContent = "Swap two neighbours to line up three or more.";
  view.setSelection(null);
  view.paint(state.grid);
}

/** HUD reacts to the same event stream the animation does, so they stay in step. */
function onEvent(event: GameEvent): void {
  switch (event.type) {
    case "reject":
      if (event.reason === "no-match")
        el.hint.textContent = "That swap makes no line of three.";
      break;

    case "swap":
      el.hint.textContent = "";
      break;

    case "clear":
      el.score.textContent = String(
        Number(el.score.textContent) + event.points,
      );
      if (event.chain > 1) {
        el.combo.textContent = `×${event.chain} chain`;
        el.combo.classList.add("on");
      }
      break;

    case "reshuffle":
      el.hint.textContent = "No moves left — board reshuffled.";
      break;
  }
}

async function play(move: Move): Promise<void> {
  if (busy) return;
  busy = true;

  const result = applyMove(state, move);
  const accepted = result.state !== state;
  if (accepted) {
    state = result.state;
    history = [...history, move];
  }

  await view.play(result.events, onEvent);

  // The engine's score is authoritative; the ticking HUD only approximates it.
  el.score.textContent = String(state.score);
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => el.combo.classList.remove("on"), 700);

  busy = false;
}

createInput(el.board, view, SIZE, { isBusy: () => busy, onMove: play });
el.newGame.addEventListener("click", newGame);

view.paint(state.grid);

/**
 * Dev handle for the thing seeded RNG buys us: a server holding only the seed
 * and the move list can re-derive the score and reject a forged one.
 */
Object.assign(window, {
  verify: () => {
    const derived = replay(state.config, history);
    return {
      seed: state.config.seed,
      moves: history.length,
      reported: state.score,
      derived: derived.score,
      ok: derived.score === state.score,
    };
  },
});
