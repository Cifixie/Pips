const N = 8;
let TYPES = 6;
const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const hintEl = document.getElementById("hint");

const lvlEl = document.getElementById("lvl");
const movesEl = document.getElementById("moves");
const goalTextEl = document.getElementById("goalText");
const goalNumEl = document.getElementById("goalNum");
const barEl = document.getElementById("barFill");
const starRowEl = document.getElementById("starRow");
const ovEl = document.getElementById("ov");

let grid = [],
  marks = [],
  cells = [],
  score = 0,
  sel = null,
  cursor = 0;
let level = 1,
  movesLeft = 0,
  moveBudget = 0,
  target = 0,
  goal = null,
  starCuts = [];
let phase = "play"; // play | busy | clear | over
const busyNow = () => phase !== "play";

// ---- progress storage: degrades to memory if localStorage is unavailable ----
const SAVE_KEY = "match-three.progress";
let progress = {};
try {
  progress = JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
} catch (e) {
  progress = {};
}
function saveProgress() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch (e) {}
}

// ---- level shape, calibrated from ~250 logged passes + headless simulation ----
// pts/move measured at human skill: 5 types ~136, 6 types ~85
const RATE = { 5: 136.5, 6: 84.7 };
const r50 = (v) => Math.round(v / 50) * 50;

function levelConfig(n) {
  const types = n <= 3 ? 5 : 6;
  const moves = n <= 3 ? 18 : 24;
  // pressure = target as a fraction of an average full run. the main difficulty dial.
  const pressure =
    n <= 3 ? 0.62 + 0.08 * (n - 1) : Math.min(1.1, 0.7 + 0.04 * (n - 4));

  const expected = RATE[types] * moves;
  const target = r50(expected * pressure);
  // star cuts sit against the expected run, not the target, or they drift out of reach
  const starCuts = [
    target,
    r50(Math.max(target * 1.1, expected * 1.0)),
    r50(Math.max(target * 1.3, expected * 1.25)),
  ];

  const kind = ["score", "collect", "score", "jelly"][(n - 1) % 4];
  // both goal sizes are measured hauls scaled by pressure, so they ramp with the level
  const collectNeed = Math.max(
    12,
    Math.round((types === 5 ? 29 : 22) * pressure),
  );
  const jellyNeed = Math.min(
    15,
    Math.max(12, Math.round((14 * pressure) / 0.86)),
  );
  return {
    types,
    moves,
    pressure,
    expected,
    target,
    starCuts,
    kind,
    collectNeed,
    jellyNeed,
  };
}

const JELLY_MARKS = 16,
  JELLY_ROWS = 7;

function makeGoal(cfg) {
  if (cfg.kind === "collect") {
    const t = Math.floor(Math.random() * cfg.types);
    return {
      kind: "collect",
      type: t,
      need: cfg.collectNeed,
      have: 0,
      text: "Clear " + cfg.collectNeed + " " + SHAPE_NAME[t] + " pieces",
    };
  }
  if (cfg.kind === "jelly") {
    return {
      kind: "jelly",
      need: cfg.jellyNeed,
      have: 0,
      text: "Clear " + cfg.jellyNeed + " marked tiles",
    };
  }
  return {
    kind: "score",
    need: cfg.target,
    have: 0,
    text: "Reach " + cfg.target.toLocaleString() + " points",
  };
}

const SHAPE_NAME = [
  "round",
  "square",
  "triangle",
  "diamond",
  "hexagon",
  "ring",
];

const at = (r, c) => r * N + c;
const rc = (i) => [Math.floor(i / N), i % N];
const rand = () => Math.floor(Math.random() * TYPES);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; i < N * N; i++) {
  const d = document.createElement("div");
  d.className = "cell";
  d.dataset.i = i;
  d.setAttribute("role", "gridcell");
  d.innerHTML = '<span class="pip"></span>';
  boardEl.appendChild(d);
  cells.push(d);
}

// every maximal horizontal or vertical run of 3+, as its own array
function findRuns() {
  const runs = [];
  for (let r = 0; r < N; r++) {
    let run = 1;
    for (let c = 1; c <= N; c++) {
      const v = c < N ? grid[at(r, c)] : null;
      const same = v !== null && v === grid[at(r, c - 1)];
      if (same) run++;
      else {
        if (run >= 3) {
          const g = [];
          for (let k = c - run; k < c; k++) g.push(at(r, k));
          runs.push(g);
        }
        run = 1;
      }
    }
  }
  for (let c = 0; c < N; c++) {
    let run = 1;
    for (let r = 1; r <= N; r++) {
      const v = r < N ? grid[at(r, c)] : null;
      const same = v !== null && v === grid[at(r - 1, c)];
      if (same) run++;
      else {
        if (run >= 3) {
          const g = [];
          for (let k = r - run; k < r; k++) g.push(at(k, c));
          runs.push(g);
        }
        run = 1;
      }
    }
  }
  return runs;
}

// merge runs that share a cell, so an L or T counts as one match
function findMatches() {
  const runs = findRuns();
  if (runs.length < 2) return runs;

  const parent = runs.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const owner = new Map();
  runs.forEach((g, i) =>
    g.forEach((cell) => {
      if (owner.has(cell)) {
        const a = find(owner.get(cell)),
          b = find(i);
        if (a !== b) parent[b] = a;
      } else owner.set(cell, i);
    }),
  );

  const merged = new Map();
  runs.forEach((g, i) => {
    const root = find(i);
    if (!merged.has(root)) merged.set(root, new Set());
    const s = merged.get(root);
    for (const cell of g) s.add(cell);
  });
  return [...merged.values()].map((s) => [...s]);
}

const matchedCells = (groups) => groups.flat();

// cheap boolean for the hasMove hot path — no allocation, exits early
function hasMatch() {
  for (let r = 0; r < N; r++) {
    let run = 1;
    for (let c = 1; c < N; c++) {
      if (grid[at(r, c)] === grid[at(r, c - 1)]) {
        if (++run >= 3) return true;
      } else run = 1;
    }
  }
  for (let c = 0; c < N; c++) {
    let run = 1;
    for (let r = 1; r < N; r++) {
      if (grid[at(r, c)] === grid[at(r - 1, c)]) {
        if (++run >= 3) return true;
      } else run = 1;
    }
  }
  return false;
}

// 30 / 70 / 130 / 200, then +60 per cell past six
const groupPoints = (n) =>
  n <= 3 ? 30 : n === 4 ? 70 : n === 5 ? 130 : 200 + (n - 6) * 60;
const chainMult = (chain) => 1 + (chain - 1) * 0.5;

function scorePass(groups, chain) {
  let base = 0;
  for (const g of groups) base += groupPoints(g.length);
  return Math.round(base * chainMult(chain));
}

function hasMove() {
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ]) {
        const r2 = r + dr,
          c2 = c + dc;
        if (r2 >= N || c2 >= N) continue;
        const a = at(r, c),
          b = at(r2, c2);
        [grid[a], grid[b]] = [grid[b], grid[a]];
        const ok = hasMatch();
        [grid[a], grid[b]] = [grid[b], grid[a]];
        if (ok) return true;
      }
    }
  }
  return false;
}

function fill() {
  do {
    grid = Array.from({ length: N * N }, rand);
    let guard = 0;
    while (hasMatch() && guard++ < 400) {
      for (const i of matchedCells(findMatches())) grid[i] = rand();
    }
  } while (!hasMove());
}

function paint(falls) {
  for (let i = 0; i < N * N; i++) {
    const el = cells[i];
    el.dataset.t = grid[i];
    el.classList.remove("pop", "fall");
    if (falls && falls[i]) {
      el.style.setProperty("--d", falls[i]);
      void el.offsetWidth;
      el.classList.add("fall");
    }
  }
  cells.forEach((el, i) => {
    el.classList.toggle("sel", i === sel);
    el.classList.toggle("mk", !!marks[i]);
  });
}

// ---------------- level lifecycle ----------------

function startLevel(n) {
  level = n;
  const cfg = levelConfig(n);
  TYPES = cfg.types;
  target = cfg.target;
  starCuts = cfg.starCuts;
  movesLeft = moveBudget = cfg.moves;
  score = 0;
  sel = null;
  goal = makeGoal(cfg);

  marks = new Array(N * N).fill(false);
  if (goal.kind === "jelly") {
    // the bottom row is reached in under half of all runs, so it stays clear
    const pool = [];
    for (let i = 0; i < JELLY_ROWS * N; i++) pool.push(i);
    for (let k = 0; k < JELLY_MARKS; k++)
      marks[pool.splice(Math.floor(Math.random() * pool.length), 1)[0]] = true;
  }

  fill();
  paint();
  comboEl.classList.remove("on");
  hintEl.textContent =
    n === 1
      ? "Swap two neighbours to line up three or more."
      : cfg.types === 6 && levelConfig(n - 1).types === 5
        ? "A sixth shape joins the board — matches come slower now."
        : "";
  phase = "play";
  ovEl.hidden = true;
  updateHud();
}

// score levels rate the final score; goal levels rate how few moves it took
function starsFor() {
  if (goal.kind === "score") {
    let s = 0;
    for (const c of starCuts) if (score >= c) s++;
    return s;
  }
  const frac = movesLeft / moveBudget;
  return frac >= 0.4 ? 3 : frac >= 0.2 ? 2 : 1;
}
const starBasis = () => (goal.kind === "score" ? "score" : "unused moves");

function goalPct() {
  return Math.max(
    0,
    Math.min(1, goal.kind === "score" ? score / target : goal.have / goal.need),
  );
}

function updateHud() {
  scoreEl.textContent = score.toLocaleString();
  lvlEl.textContent = level;
  movesEl.textContent = movesLeft;
  movesEl.classList.toggle("low", movesLeft <= 3);
  goalTextEl.textContent = goal.text;
  goalNumEl.textContent =
    goal.kind === "score"
      ? score.toLocaleString() + " / " + target.toLocaleString()
      : goal.have + " / " + goal.need;
  const pct = goalPct();
  barEl.style.width = (pct * 100).toFixed(1) + "%";
  barEl.classList.toggle("done", pct >= 1);

  const won = starsFor();
  starRowEl.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const d = document.createElement("span");
    d.className = "star" + (i < won ? " on" : "");
    starRowEl.appendChild(d);
  }
  starRowEl.setAttribute("aria-label", won + " of 3 stars");
}

// counts goal progress for one resolved pass, before the cells are nulled
function creditGoal(groups) {
  if (goal.kind === "collect") {
    for (const g of groups)
      for (const i of g) if (grid[i] === goal.type) goal.have++;
  } else if (goal.kind === "jelly") {
    for (const g of groups)
      for (const i of g)
        if (marks[i]) {
          marks[i] = false;
          goal.have++;
        }
  }
  if (goal.kind === "score") goal.have = score;
}

const goalMet = () =>
  goal.kind === "score" ? score >= target : goal.have >= goal.need;

function collapse() {
  const falls = new Array(N * N).fill(0);
  for (let c = 0; c < N; c++) {
    let write = N - 1;
    for (let r = N - 1; r >= 0; r--) {
      const v = grid[at(r, c)];
      if (v !== null) {
        grid[at(write, c)] = v;
        falls[at(write, c)] = write - r;
        write--;
      }
    }
    for (let r = write; r >= 0; r--) {
      grid[at(r, c)] = rand();
      falls[at(r, c)] = write + 1;
    }
  }
  return falls;
}

async function resolve() {
  let chain = 0;
  while (true) {
    const groups = findMatches();
    if (!groups.length) break;
    chain++;
    score += scorePass(groups, chain);

    const biggest = Math.max(...groups.map((g) => g.length));
    if (chain > 1) {
      comboEl.textContent = "×" + chainMult(chain) + " chain";
      comboEl.classList.add("on");
    } else if (biggest >= 4) {
      comboEl.textContent = biggest + " in a row";
      comboEl.classList.add("on");
    }

    creditGoal(groups);
    updateHud();

    const hit = matchedCells(groups);
    hit.forEach((i) => cells[i].classList.add("pop"));
    await wait(170);
    hit.forEach((i) => (grid[i] = null));
    paint(collapse());
    await wait(200);
  }
  setTimeout(() => comboEl.classList.remove("on"), 700);

  // the level only ends once every cascade has settled.
  // score levels play out the full budget — ending on target would put stars out of reach.
  if (goal.kind !== "score" && goalMet()) {
    await finishLevel(true);
    return;
  }
  if (movesLeft <= 0) {
    await finishLevel(goalMet());
    return;
  }
  if (goal.kind === "score" && score >= target)
    hintEl.textContent = "Target met — every further move is star progress.";

  if (!hasMove()) {
    hintEl.textContent = "No moves left — board reshuffled.";
    fill();
    paint();
  }
}

// each unused move pops a pip for a bonus — the juiciest 20 lines in the genre
async function spendLeftoverMoves() {
  while (movesLeft > 0) {
    movesLeft--;
    score += 50;
    const i = Math.floor(Math.random() * N * N);
    cells[i].classList.add("pop");
    updateHud();
    await wait(80);
    cells[i].classList.remove("pop");
  }
}

async function finishLevel(won) {
  phase = won ? "clear" : "over";
  sel = null;
  paint();

  const stars = won ? Math.max(1, starsFor()) : 0; // before the bonus spends them

  if (won && movesLeft > 0) {
    hintEl.textContent =
      "Bonus for " +
      movesLeft +
      " unused move" +
      (movesLeft === 1 ? "" : "s") +
      ".";
    await spendLeftoverMoves();
  }
  if (won) {
    const prev = progress[level] || 0;
    if (stars > prev) {
      progress[level] = stars;
      saveProgress();
    }
    if ((progress.best || 0) < level) {
      progress.best = level;
      saveProgress();
    }
  }
  showOverlay(won, stars);
}

function showOverlay(won, stars) {
  document.getElementById("ovTitle").textContent = won
    ? "Level " + level + " clear"
    : "Out of moves";
  document.getElementById("ovSub").textContent = won
    ? stars === 3
      ? "Every star. Nothing left on the table."
      : "Target met."
    : goal.text +
      " — " +
      (goal.kind === "score"
        ? score.toLocaleString() + " reached"
        : goal.have + " of " + goal.need);

  const sEl = document.getElementById("ovStars");
  sEl.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const d = document.createElement("span");
    d.className = "star" + (i < stars ? " on" : "");
    sEl.appendChild(d);
  }

  const nextCut = starCuts.find((c) => score < c);
  document.getElementById("ovLines").innerHTML = won
    ? "Score <b>" +
      score.toLocaleString() +
      "</b><br>" +
      "Stars from " +
      starBasis() +
      "<br>" +
      (goal.kind === "score"
        ? nextCut
          ? "Next star at <b>" + nextCut.toLocaleString() + "</b>"
          : "Best possible rating"
        : "Finished with <b>" + moveBudget + "</b> moves budgeted")
    : "Score <b>" +
      score.toLocaleString() +
      "</b><br>Target was <b>" +
      target.toLocaleString() +
      "</b>";

  const main = document.getElementById("ovMain"),
    alt = document.getElementById("ovAlt");
  main.textContent = won ? "Level " + (level + 1) : "Try again";
  alt.textContent = won ? "Replay" : "Back to level 1";
  main.onclick = () => startLevel(won ? level + 1 : level);
  alt.onclick = () => startLevel(won ? level : 1);
  ovEl.hidden = false;
  main.focus();
}

async function trySwap(a, b) {
  phase = "busy";
  sel = null;
  [grid[a], grid[b]] = [grid[b], grid[a]];
  if (hasMatch()) {
    movesLeft--;
    updateHud();
    paint();
    hintEl.textContent = "";
    await resolve();
  } else {
    [grid[a], grid[b]] = [grid[b], grid[a]];
    paint();
    cells[a].classList.add("nudge");
    cells[b].classList.add("nudge");
    hintEl.textContent = "That swap makes no line of three.";
    await wait(240);
    cells[a].classList.remove("nudge");
    cells[b].classList.remove("nudge");
  }
  if (phase === "busy") phase = "play";
}

const adjacent = (a, b) => {
  const [r1, c1] = rc(a),
    [r2, c2] = rc(b);
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
};

function pick(i) {
  if (busyNow()) return;
  if (sel === null) {
    sel = i;
    paint();
    return;
  }
  if (sel === i) {
    sel = null;
    paint();
    return;
  }
  if (adjacent(sel, i)) trySwap(sel, i);
  else {
    sel = i;
    paint();
  }
}

// pointer: tap to select, or drag toward a neighbour
let down = null;
boardEl.addEventListener("pointerdown", (e) => {
  if (busyNow()) return;
  const cell = e.target.closest(".cell");
  if (!cell) return;
  down = { i: +cell.dataset.i, x: e.clientX, y: e.clientY };
});
boardEl.addEventListener("pointerup", (e) => {
  if (!down || busyNow()) {
    down = null;
    return;
  }
  const dx = e.clientX - down.x,
    dy = e.clientY - down.y;
  const size = cells[0].offsetWidth;
  if (Math.hypot(dx, dy) > size * 0.4) {
    const [r, c] = rc(down.i);
    const [r2, c2] =
      Math.abs(dx) > Math.abs(dy)
        ? [r, c + Math.sign(dx)]
        : [r + Math.sign(dy), c];
    if (r2 >= 0 && r2 < N && c2 >= 0 && c2 < N) {
      sel = null;
      paint();
      trySwap(down.i, at(r2, c2));
    }
  } else {
    pick(down.i);
  }
  down = null;
});

// keyboard: arrows move, space or enter selects
boardEl.addEventListener("keydown", (e) => {
  if (busyNow()) return;
  const [r, c] = rc(cursor);
  let nr = r,
    nc = c;
  if (e.key === "ArrowUp") nr--;
  else if (e.key === "ArrowDown") nr++;
  else if (e.key === "ArrowLeft") nc--;
  else if (e.key === "ArrowRight") nc++;
  else if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    pick(cursor);
    return;
  } else return;
  e.preventDefault();
  if (nr < 0 || nr >= N || nc < 0 || nc >= N) return;
  cells[cursor].classList.remove("cursor");
  cursor = at(nr, nc);
  cells[cursor].classList.add("cursor");
});
boardEl.addEventListener("focus", () => cells[cursor].classList.add("cursor"));
boardEl.addEventListener("blur", () =>
  cells[cursor].classList.remove("cursor"),
);

document.getElementById("newgame").addEventListener("click", () => {
  if (phase === "busy") return;
  startLevel(level);
});

startLevel(1);
