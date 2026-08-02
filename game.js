const N = 8,
  TYPES = 6;
const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const hintEl = document.getElementById("hint");

let grid = [],
  cells = [],
  score = 0,
  sel = null,
  busy = false,
  cursor = 0;

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

function findMatches() {
  const hit = new Set();
  for (let r = 0; r < N; r++) {
    let run = 1;
    for (let c = 1; c <= N; c++) {
      const same = c < N && grid[at(r, c)] === grid[at(r, c - 1)];
      if (same) run++;
      else {
        if (run >= 3) for (let k = c - run; k < c; k++) hit.add(at(r, k));
        run = 1;
      }
    }
  }
  for (let c = 0; c < N; c++) {
    let run = 1;
    for (let r = 1; r <= N; r++) {
      const same = r < N && grid[at(r, c)] === grid[at(r - 1, c)];
      if (same) run++;
      else {
        if (run >= 3) for (let k = r - run; k < r; k++) hit.add(at(k, c));
        run = 1;
      }
    }
  }
  return hit;
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
        const ok = findMatches().size > 0;
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
    let m = findMatches();
    while (m.size && guard++ < 400) {
      m.forEach((i) => (grid[i] = rand()));
      m = findMatches();
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
  cells.forEach((el, i) => el.classList.toggle("sel", i === sel));
}

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
    const hit = findMatches();
    if (!hit.size) break;
    chain++;
    score += hit.size * 10 * chain;
    scoreEl.textContent = score;
    if (chain > 1) {
      comboEl.textContent = "×" + chain + " chain";
      comboEl.classList.add("on");
    }
    hit.forEach((i) => cells[i].classList.add("pop"));
    await wait(170);
    hit.forEach((i) => (grid[i] = null));
    paint(collapse());
    await wait(200);
  }
  setTimeout(() => comboEl.classList.remove("on"), 700);

  if (!hasMove()) {
    hintEl.textContent = "No moves left — board reshuffled.";
    fill();
    paint();
  }
}

async function trySwap(a, b) {
  busy = true;
  sel = null;
  [grid[a], grid[b]] = [grid[b], grid[a]];
  if (findMatches().size) {
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
  busy = false;
}

const adjacent = (a, b) => {
  const [r1, c1] = rc(a),
    [r2, c2] = rc(b);
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
};

function pick(i) {
  if (busy) return;
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
  const cell = e.target.closest(".cell");
  if (!cell) return;
  down = { i: +cell.dataset.i, x: e.clientX, y: e.clientY };
});
boardEl.addEventListener("pointerup", (e) => {
  if (!down || busy) {
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
boardEl.addEventListener("focus", () =>
  cells[cursor].classList.add("cursor"),
);
boardEl.addEventListener("blur", () =>
  cells[cursor].classList.remove("cursor"),
);

document.getElementById("newgame").addEventListener("click", () => {
  if (busy) return;
  score = 0;
  sel = null;
  scoreEl.textContent = "0";
  comboEl.classList.remove("on");
  hintEl.textContent = "Swap two neighbours to line up three or more.";
  fill();
  paint();
});

fill();
paint();
