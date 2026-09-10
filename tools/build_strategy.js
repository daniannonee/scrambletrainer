/* Generate the board-strategy puzzles. Run: node tools/build_strategy.js [count]

   THE ONE IDEA THIS MODE TEACHES
   The highest-scoring play is not always the best play. That claim is easy to
   assert and hard to demonstrate, so nothing here is asserted: every puzzle is
   a position where the difference is COMPUTED and can be checked.

   A puzzle is a board, a rack, and two candidate plays:
     - the top-scoring play
     - a lower-scoring play that is better on one of two measurable counts

   The two counts, and exactly what each means:

   1. WHAT YOU LEAVE. The tiles still on your rack afterwards, judged by
      js/leave.js. That file is a transparent rubric, not an equity table, and
      it shows its working on screen — see its header for why.

   2. WHAT YOU OPEN. The best score available to the opponent on the resulting
      board. This is a real number from the move generator, not a guess — but it
      depends on what they hold, which is unknowable. So the build picks ONE
      rack from the tiles still unseen, records it in the puzzle, and the screen
      names it: "if they hold AEINRST". A disclosed assumption a player can
      check beats an undisclosed model they cannot.

   Both boards are audited before a puzzle is kept, same as the daily.

   Output: data/strategy.js */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.dirname(__dirname);
const COUNT = parseInt(process.argv[2], 10) || 60;

const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
[
  "data/lexicon.js", "data/lexicon_long.js", "js/lexicon.js",
  "js/trie.js", "js/board.js", "js/movegen.js", "js/leave.js"
].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f })
);
const WT = sandbox.window.WT;
const B = WT.board;

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

/* Build a mid-game position by self-play, and hand back what is left unseen. */
function position(rand, turns) {
  let board = B.create();
  let bag = shuffled(B.newBag(), rand);
  for (let t = 0; t < turns; t++) {
    const rack = bag.splice(0, 7);
    const moves = WT.movegen.generate(board, rack, { root });
    if (!moves.length) return null;
    // Not always the best move: a board built only from optimal plays is not a
    // board anyone actually faces.
    const pick = moves[Math.floor(rand() * Math.min(moves.length, 12))];
    const verdict = B.validate(board, pick.placements);
    if (!verdict.ok) return null;
    board = verdict.board;
    bag = bag.concat(rack.filter((_, i) => !pick.placements.some((p, j) => j === i)));
    bag = shuffled(bag, rand);
  }
  const rack = bag.splice(0, 7);
  return { board, rack, unseen: bag };
}

/* The best reply available on `board` to a given rack. */
function bestReply(board, rack) {
  const m = WT.movegen.best(board, rack, { root });
  return m ? { score: m.score, word: m.word } : { score: 0, word: null };
}

function encodeBoard(board) {
  return board.cells.map((c) => (c == null ? "." : c)).join("");
}

function encodePlay(placements) {
  return placements.map((p) => `${p.r},${p.c},${p.tile}`).join(";");
}

const out = [];
const rand = rng(20260910);
let tried = 0, rejected = 0;
const started = Date.now();

while (out.length < COUNT && tried < COUNT * 30) {
  tried++;
  const pos = position(rand, 4 + Math.floor(rand() * 8));
  if (!pos) { rejected++; continue; }
  if (!B.audit(pos.board).ok) { rejected++; continue; }

  const moves = WT.movegen.generate(pos.board, pos.rack, { root });
  if (moves.length < 12) { rejected++; continue; }

  // One disclosed opponent rack, drawn from what is genuinely still unseen.
  const theirRack = shuffled(pos.unseen, rand).slice(0, 7);
  if (theirRack.length < 7) { rejected++; continue; }

  const top = moves[0];
  const candidates = moves.slice(1, 25);

  const evalMove = (m) => {
    const verdict = B.validate(pos.board, m.placements);
    if (!verdict.ok) return null;
    if (!B.audit(verdict.board).ok) return null;
    const leftRack = WT.leave.after(pos.rack, m.placements);
    return {
      move: m,
      board: verdict.board,
      score: verdict.score,
      leave: leftRack,
      leaveScore: WT.leave.evaluate(leftRack).score,
      opens: bestReply(verdict.board, theirRack).score
    };
  };

  const a = evalMove(top);
  if (!a) { rejected++; continue; }

  let best = null;
  for (const cand of candidates) {
    const b = evalMove(cand);
    if (!b) continue;
    const scoreGiven = a.score - b.score;
    if (scoreGiven <= 0 || scoreGiven > 14) continue; // must cost something, but not the game

    const leaveGain = b.leaveScore - a.leaveScore;
    const opensSaved = a.opens - b.opens;

    // Keep only positions where the cheaper play is CLEARLY better on one of
    // the two measures — a marginal difference teaches nothing.
    const strongLeave = leaveGain >= 6 && opensSaved >= -4;
    const strongBlock = opensSaved >= 18 && leaveGain >= -3;
    if (!strongLeave && !strongBlock) continue;

    const margin = (strongBlock ? opensSaved : 0) + leaveGain * 2 - scoreGiven;
    if (!best || margin > best.margin) {
      best = { alt: b, margin, kind: strongBlock ? "opens" : "leave", scoreGiven, leaveGain, opensSaved };
    }
  }
  if (!best) { rejected++; continue; }

  out.push([
    encodeBoard(pos.board),
    pos.rack.join(""),
    theirRack.join(""),
    // the greedy play
    encodePlay(a.move.placements), a.move.word, a.score, a.leave.join(""), a.leaveScore, a.opens,
    // the better play
    encodePlay(best.alt.move.placements), best.alt.move.word, best.alt.score,
    best.alt.leave.join(""), best.alt.leaveScore, best.alt.opens,
    best.kind
  ]);
  if (out.length % 10 === 0) {
    process.stdout.write(`  ${out.length}/${COUNT}\r`);
  }
}

const byKind = out.reduce((acc, r) => { acc[r[15]] = (acc[r[15]] || 0) + 1; return acc; }, {});
const header = `/* Generated by tools/build_strategy.js - do not edit by hand.
   Board-strategy puzzles. Each entry is
     [board, yourRack, theirRack,
      greedyPlay, greedyWord, greedyScore, greedyLeave, greedyLeaveScore, greedyOpens,
      betterPlay, betterWord, betterScore, betterLeave, betterLeaveScore, betterOpens,
      kind]
   board is 225 characters, '.' empty, uppercase a tile, lowercase a blank.
   plays are 'r,c,tile;...'. "opens" is the best score theirRack could make on
   the resulting board — a disclosed assumption, not a hidden model.

   ${out.length} puzzles: ${JSON.stringify(byKind)}
*/
var WT_STRATEGY = `;

fs.writeFileSync(
  path.join(ROOT, "data/strategy.js"),
  header + JSON.stringify(out) + ";\n"
);

const size = fs.statSync(path.join(ROOT, "data/strategy.js")).size;
console.log(
  `\ndata/strategy.js: ${out.length} puzzles, ${(size / 1024).toFixed(0)}KB, ` +
  `${((Date.now() - started) / 1000).toFixed(1)}s (${rejected} positions rejected)`
);
console.log("  by kind:", JSON.stringify(byKind));
if (out.length) {
  const given = out.map((r) => r[5] - r[11]);
  const opens = out.map((r) => r[8] - r[14]);
  console.log(`  points given up: ${Math.min(...given)}–${Math.max(...given)}`);
  console.log(`  danger removed : ${Math.min(...opens)}–${Math.max(...opens)}`);
}
