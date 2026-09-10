/* Generate the daily puzzle pool.  Run: node tools/build_daily.js [count]

   A daily puzzle is a mid-game board plus a rack. The player commits one play
   and is graded against the best play that rack can make on that board.

   WHY THIS IS A BUILD STEP AND NOT DONE ON THE DEVICE
   Generating a board means playing several turns of self-play with the move
   generator, then searching the final rack for its optimum — roughly two
   seconds of work, on top of a trie build. Doing that when someone opens the
   app would mean staring at a spinner before a puzzle appeared. Doing it here
   means the daily is just data: a board string, a rack, and the answer.

   Every puzzle is audited before it is kept. A board carrying an invalid word
   would be unfixable once shipped, so the auditor runs on each one and any
   board it rejects is thrown away rather than patched.

   Output: data/daily.js */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.dirname(__dirname);
const COUNT = parseInt(process.argv[2], 10) || 400;

const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
[
  "data/lexicon.js", "data/lexicon_long.js", "js/lexicon.js",
  "js/trie.js", "js/board.js", "js/movegen.js"
].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f }));
const WT = sandbox.window.WT;
const B = WT.board;

/* Deterministic RNG so a rebuild reproduces the same pool exactly. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const root = WT.trie.root();

/* Play a few turns of self-play, then hand back the position and what is left
   in the bag. Deliberately does NOT always take the top move — a board built
   only from optimal plays ends up sparse and strange. */
function buildPosition(seed) {
  const rand = rng(seed);
  const bag = shuffled(B.newBag(), rand);
  const board = B.create();
  const turns = 4 + Math.floor(rand() * 4); // 4-7 turns of history

  for (let t = 0; t < turns; t++) {
    const rack = bag.splice(0, 7);
    if (rack.length < 7) return null;
    const moves = WT.movegen.generate(board, rack, { root });
    if (!moves.length) return null;
    // Somewhere in the top third, so the board looks played rather than solved.
    const pick = moves[Math.floor(rand() * Math.min(moves.length, Math.max(3, moves.length / 3)))];
    pick.placements.forEach((p) => B.put(board, p.r, p.c, p.tile));
    // Put back the tiles the move did not use.
    const usedTiles = pick.placements.map((p) =>
      p.tile === p.tile.toLowerCase() ? "_" : p.tile);
    const leftovers = rack.slice();
    usedTiles.forEach((tile) => {
      const i = leftovers.indexOf(tile);
      if (i >= 0) leftovers.splice(i, 1);
    });
    bag.unshift(...leftovers);
  }
  return { board, bag, rand };
}

/* A puzzle worth setting: the rack has a clear best play, that play is not
   trivially the only option, and the board it sits on is clean. */
function makePuzzle(seed) {
  const pos = buildPosition(seed);
  if (!pos) return null;
  const { board, bag, rand } = pos;

  const audit = B.audit(board);
  if (!audit.ok) return null; // never ship a board with an invalid word on it

  const rack = bag.slice(0, 7);
  if (rack.length < 7) return null;

  const moves = WT.movegen.generate(board, rack, { root });
  if (moves.length < 25) return null; // too few options to be a puzzle
  const best = moves[0];
  if (best.score < 20) return null; // not worth anyone's morning
  if (moves[1] && moves[1].score === best.score && moves[2] &&
      moves[2].score === best.score) {
    // Several plays tie for best: fine, but make sure it is not because the
    // board is degenerate.
    if (moves.length < 60) return null;
  }

  // Applying the best play must leave the board clean too.
  const after = B.clone(board);
  best.placements.forEach((p) => B.put(after, p.r, p.c, p.tile));
  if (!B.audit(after).ok) return null;

  const scores = moves.map((m) => m.score);
  return {
    board: board.cells.map((c) => (c == null ? "." : c)).join(""),
    rack: rack.join(""),
    best: best.score,
    word: best.word,
    // Where the best play goes, so the answer can be shown afterwards.
    play: best.placements.map((p) => p.r + "," + p.c + "," + p.tile).join(";"),
    // A few reference points, so a score can be described without shipping
    // every move: the median play and the count.
    median: scores[Math.floor(scores.length / 2)],
    options: moves.length,
    tiles: board.cells.filter((c) => c != null).length
  };
}

console.log(`generating ${COUNT} puzzles…`);
const pool = [];
let seed = 1;
let rejected = 0;
const t0 = Date.now();
while (pool.length < COUNT && seed < COUNT * 40) {
  const p = makePuzzle(seed++);
  if (p) pool.push(p);
  else rejected++;
  if (pool.length && pool.length % 50 === 0 && pool.length !== (pool.lastLogged || 0)) {
    pool.lastLogged = pool.length;
    process.stdout.write(`  ${pool.length}/${COUNT}\r`);
  }
}
const ms = Date.now() - t0;
delete pool.lastLogged;

if (pool.length < COUNT) {
  console.error(`\nonly produced ${pool.length} of ${COUNT} — loosen the filters`);
  process.exit(1);
}

const bestScores = pool.map((p) => p.best).sort((a, b) => a - b);
console.log(`\n${pool.length} puzzles in ${(ms / 1000).toFixed(1)}s (${rejected} candidates rejected)`);
console.log(`  best play : ${bestScores[0]} low, ${bestScores[Math.floor(bestScores.length / 2)]} median, ${bestScores[bestScores.length - 1]} high`);
console.log(`  tiles down: ${Math.min(...pool.map((p) => p.tiles))}–${Math.max(...pool.map((p) => p.tiles))}`);
console.log(`  options   : ${Math.min(...pool.map((p) => p.options))}–${Math.max(...pool.map((p) => p.options))} legal plays per puzzle`);

const body = JSON.stringify(pool.map((p) => [p.board, p.rack, p.best, p.word, p.play, p.median, p.options]));
const js =
  "/* Generated by tools/build_daily.js - do not edit by hand.\n" +
  "   The daily puzzle pool. Each entry is\n" +
  "     [board, rack, bestScore, bestWord, bestPlay, medianScore, legalPlays]\n" +
  "   board is 225 characters, '.' for empty, uppercase for a tile, lowercase\n" +
  "   for a blank. bestPlay is 'r,c,tile;...'.\n" +
  "\n" +
  `   ${pool.length} puzzles. js/daily.js indexes into this by the number of days\n` +
  "   since the epoch it defines, so everyone gets the same board on the same\n" +
  "   day with no server. The pool repeats once it runs out - rerun this script\n" +
  "   with a larger count well before that.\n" +
  "\n" +
  "   Every board here was checked by the ground-truth auditor at build time,\n" +
  "   before and after the best play. */\n" +
  "var WT_DAILY = " + body + ";\n";

fs.writeFileSync(path.join(ROOT, "data", "daily.js"), js);
console.log(`wrote data/daily.js (${(fs.statSync(path.join(ROOT, "data", "daily.js")).size / 1024).toFixed(0)} KB)`);
