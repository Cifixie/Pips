import "./styles.css";
import { applyMove, createGame, movesLeft, replay } from "./engine/engine";
import { buildLevel, type LevelSetup } from "./engine/levels";
import {
  applyObjective,
  goalMet,
  goalFraction,
  initialProgress,
  starsFor,
  type Goal,
  type GoalProgress,
} from "./engine/objectives";
import type { Move } from "./engine/types";
import { createBoardView } from "./render/board";
import { createInput } from "./render/input";
import { describeGoal } from "./render/goalText";
import { createProgressStore, type ProgressStore } from "./progress";
import type { GameEvent } from "./engine/types";

const SIZE = 8;

const el = {
  board: document.getElementById("board") as HTMLElement,
  score: document.getElementById("score") as HTMLElement,
  combo: document.getElementById("combo") as HTMLElement,
  hint: document.getElementById("hint") as HTMLElement,
  newGame: document.getElementById("newgame") as HTMLButtonElement,
  lvl: document.getElementById("lvl") as HTMLElement,
  moves: document.getElementById("moves") as HTMLElement,
  goalText: document.getElementById("goalText") as HTMLElement,
  goalNum: document.getElementById("goalNum") as HTMLElement,
  barFill: document.getElementById("barFill") as HTMLElement,
  starRow: document.getElementById("starRow") as HTMLElement,
  ov: document.getElementById("ov") as HTMLElement,
  ovTitle: document.getElementById("ovTitle") as HTMLElement,
  ovSub: document.getElementById("ovSub") as HTMLElement,
  ovStars: document.getElementById("ovStars") as HTMLElement,
  ovLines: document.getElementById("ovLines") as HTMLElement,
  ovMain: document.getElementById("ovMain") as HTMLButtonElement,
  ovAlt: document.getElementById("ovAlt") as HTMLButtonElement,
};

const view = createBoardView(el.board, SIZE);

let state: ReturnType<typeof createGame> = createGame(
  buildLevel(1).config,
);
/** Every move played, for replay verification. */
let history: Move[] = [];
let busy = false;
let comboTimer: number | undefined;

let level = 1;
let calibration: LevelSetup["calibration"];
let goal: Goal;
let progress: GoalProgress;

const progressStore: ProgressStore = createProgressStore();

/* ---- Level lifecycle ---- */

function startLevel(n: number): void {
  // Clear the busy flag and any pending combo so overlay restart works.
  busy = false;
  clearTimeout(comboTimer);

  level = n;
  const setup = buildLevel(n, SIZE);
  calibration = setup.calibration;
  state = createGame(setup.config);
  goal = setup.goal;
  progress = initialProgress(goal);
  history = [];

  view.paint(state.grid);
  updateHud();
  hideOverlay();
  setHint(n);
}

function setHint(n: number): void {
  if (n === 1) {
    el.hint.textContent = "Swap two neighbours to line up three or more.";
  } else if (calibration.types === 6 && buildLevel(n - 1, SIZE).calibration.types === 5) {
    el.hint.textContent = "A sixth shape joins the board — matches come slower now.";
  } else {
    el.hint.textContent = "";
  }
}

function updateHud(): void {
  el.score.textContent = String(state.score);
  el.lvl.textContent = String(level);

  const ml = movesLeft(state);
  if (ml !== null) {
    el.moves.textContent = String(ml);
    el.moves.classList.toggle("low", ml <= 3);
  } else {
    el.moves.textContent = "∞";
    el.moves.classList.remove("low");
  }

  el.goalText.textContent = describeGoal(goal);
  el.goalNum.textContent =
    `${progress.have.toLocaleString()} / ${progress.need.toLocaleString()}`;

  const frac = goalFraction(progress);
  el.barFill.style.width = (frac * 100).toFixed(1) + "%";
  el.barFill.classList.toggle("done", frac >= 1);

  // Live star preview (for score goals, stars can only increase as score goes up)
  renderStars();
}

function renderStars(): void {
  const ml = movesLeft(state);
  const budget = calibration.moves;
  const movesLeftCount = ml !== null ? ml : 0;
  const stars = starsFor(goal, {
    score: state.score,
    starCuts: calibration.starCuts,
    movesLeft: movesLeftCount,
    moveBudget: budget,
  });
  el.starRow.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const d = document.createElement("span");
    d.className = "star" + (i < stars ? " on" : "");
    el.starRow.appendChild(d);
  }
  el.starRow.setAttribute("aria-label", `${stars} of 3 stars`);
}

/* ---- Event handling ---- */

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

  // Goal progress — no-op for non-clear events
  progress = applyObjective(goal, progress, event);
}

/* ---- Play ---- */

async function play(move: Move): Promise<void> {
  if (busy) return;
  busy = true;

  const result = applyMove(state, move);
  const accepted = result.state !== state;
  if (accepted) {
    state = result.state;
    history = [...history, move];
  }

  await view.play(result.events, (event) => {
    onEvent(event);
    updateHud();
  });

  // The engine's score is authoritative; the ticking HUD only approximates it.
  el.score.textContent = String(state.score);
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => el.combo.classList.remove("on"), 700);

  // Check if level ended
  if (accepted) {
    // Collect goals end immediately when met; score goals play out full budget
    if (goal.kind !== "score" && goalMet(progress)) {
      finishLevel(true);
      return;
    }
    const ml = movesLeft(state);
    if (ml === 0) {
      finishLevel(goalMet(progress));
      return;
    }
  }

  busy = false;
}

/* ---- Level end ---- */

function finishLevel(won: boolean): void {
  const ml = movesLeft(state) ?? 0;
  const stars = won ? starsFor(goal, {
    score: state.score,
    starCuts: calibration.starCuts,
    movesLeft: ml,
    moveBudget: calibration.moves,
  }) : 0;

  if (won) {
    progressStore.record(level, stars);
  }
  showOverlay(won, stars);
  busy = true; // blocks input until next startLevel
}

function showOverlay(won: boolean, stars: number): void {
  el.ovTitle.textContent = won
    ? `Level ${level} clear`
    : "Out of moves";

  el.ovSub.textContent = won
    ? stars === 3
      ? "Every star. Nothing left on the table."
      : "Target met."
    : `${describeGoal(goal)} — ${
        goal.kind === "score"
          ? `${state.score.toLocaleString()} reached`
          : `${progress.have} of ${progress.need}`
      }`;

  // Stars
  el.ovStars.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const d = document.createElement("span");
    d.className = "star" + (i < stars ? " on" : "");
    el.ovStars.appendChild(d);
  }

  // Details
  const nextCut = calibration.starCuts.find((c) => state.score < c);
  el.ovLines.innerHTML = won
    ? `Score <b>${state.score.toLocaleString()}</b><br>` +
      `Stars from ${goal.kind === "score" ? "score" : "unused moves"}<br>` +
      (goal.kind === "score"
        ? nextCut
          ? `Next star at <b>${nextCut.toLocaleString()}</b>`
          : "Best possible rating"
        : `Finished with <b>${calibration.moves}</b> moves budgeted`)
    : `Score <b>${state.score.toLocaleString()}</b><br>` +
      `Target was <b>${calibration.target.toLocaleString()}</b>`;

  el.ovMain.textContent = won ? `Level ${level + 1}` : "Try again";
  el.ovAlt.textContent = won ? "Replay" : "Back to level 1";
  el.ovMain.onclick = () => startLevel(won ? level + 1 : level);
  el.ovAlt.onclick = () => startLevel(won ? level : 1);

  el.ov.hidden = false;
  el.ovMain.focus();
}

function hideOverlay(): void {
  el.ov.hidden = true;
}

/* ---- Boot ---- */

createInput(el.board, view, SIZE, { isBusy: () => busy, onMove: play });
el.newGame.addEventListener("click", () => startLevel(level));

startLevel(1);

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
