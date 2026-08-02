# Pips

A match-three puzzle game in a single HTML file. Swap two neighbouring
tiles to line up three or more; matches clear, tiles fall, cascades
score more.

That's the whole game. There are no levels, lives, timers, move limits,
power-ups, or unlockables — just a board and a number that goes up.

**[Play it →](https://pipfall.vercel.app/)**

## Running it

Open `index.html`. No build step, no dependencies, no server needed.
Deployed on Vercel as a static file — no config, no `vercel.json`.

## Notes

Each colour has its own shape (circle, square, triangle, diamond,
hexagon, ring), so the board is readable without relying on colour.
Tap to select or drag toward a neighbour; arrow keys and space work too.
