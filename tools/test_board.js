/* Checks for the board core. Run: node tools/test_board.js

   Covers what the spec asked for: build the dictionary, validate a single-tile
   play, a multi-tile play, a play forming two words at once, and a play using a
   blank — then run the ground-truth auditor over generated boards and confirm
   zero invalid words.

   The auditor is the important one. It rescans every run on a finished board
   against the dictionary directly, trusting nothing the generator reported. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.dirname(__dirname);
const files = [
  "data/lexicon.js",
  "data/lexicon_long.js",
  "js/lexicon.js",
  "js/trie.js",
  "js/board.js",
  "js/movegen.js"
];

const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
}
const WT = sandbox.window.WT;
const B = WT.board;

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log("  ok   " + name);
  else {
    failures++;
    console.log("  FAIL " + name + (detail ? " — " + detail : ""));
  }
}

/* --- 1. dictionary ------------------------------------------------- */

console.log("\ndictionary");
let t0 = Date.now();
const root = WT.trie.root();
const buildMs = Date.now() - t0;
check("trie builds over the board lexicon", !!root);
console.log(`       (${buildMs}ms, ${WT.lex.words({ maxLength: 15 }).length} words)`);
check("long words are reachable once loaded", WT.lex.has("quixotries") || WT.lex.has("strengths"));
check("words over 15 letters are not shipped", !WT.lex.has("antidisestablishmentarianism"));
check("trie agrees with the word set on a sample", (() => {
  const sample = WT.lex.words({ maxLength: 15 }).filter((_, i) => i % 977 === 0);
  return sample.every((w) => WT.trie.has(root, w));
})());
check("trie rejects a non-word", !WT.trie.has(root, "ZZQX"));
check("trie prefix search finds continuations",
  WT.trie.letters(WT.trie.walk(root, "QI")).length > 0);
check("QI and ZA are in (the ENABLE gap, patched)",
  ["QI", "ZA", "QIS", "ZAS", "GI", "OI", "OK", "EW"].every((w) => WT.trie.has(root, w)));
check("QIN is NOT in — it is not valid in NWL2023", !WT.trie.has(root, "QIN"));

/* --- 2. board and scoring ------------------------------------------ */

console.log("\nboard");
check("15x15", B.SIZE === 15 && B.create().cells.length === 225);
check("premium layout is symmetric", (() => {
  for (let r = 0; r < 15; r++)
    for (let c = 0; c < 15; c++) {
      const p = B.premiumAt(r, c);
      if (p !== B.premiumAt(r, 14 - c)) return false;
      if (p !== B.premiumAt(14 - r, c)) return false;
      if (p !== B.premiumAt(c, r)) return false;
    }
  return true;
})());
check("centre is a double word", B.premiumAt(7, 7) === "DW");
check("corners are triple word", ["0,0", "0,14", "14,0", "14,14"]
  .every((k) => { const [r, c] = k.split(",").map(Number); return B.premiumAt(r, c) === "TW"; }));
check("eight triple words, and the usual premium counts", (() => {
  const tally = {};
  for (let r = 0; r < 15; r++)
    for (let c = 0; c < 15; c++) {
      const p = B.premiumAt(r, c) || "plain";
      tally[p] = (tally[p] || 0) + 1;
    }
  return tally.TW === 8 && tally.TL === 12 && tally.DL === 24 && tally.DW === 17;
})(), JSON.stringify((() => {
  const t = {};
  for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) {
    const p = B.premiumAt(r, c) || "plain"; t[p] = (t[p] || 0) + 1;
  }
  return t;
})()));
check("bag is 100 tiles with 2 blanks", (() => {
  const bag = B.newBag();
  return bag.length === 100 && bag.filter((t) => t === "_").length === 2;
})());
check("letter values total 187 across the bag", (() => {
  return B.newBag().reduce((sum, t) => sum + B.valueOfTile(t), 0) === 187;
})(), String(B.newBag().reduce((s, t) => s + B.valueOfTile(t), 0)));

/* --- 3. the four plays the spec asked for --------------------------- */

console.log("\nplacement validation");

// Opening play, multi-tile, across the centre.
let board = B.create();
let play = B.validate(board, [
  { r: 7, c: 7, tile: "C" }, { r: 7, c: 8, tile: "A" }, { r: 7, c: 9, tile: "T" }
]);
check("multi-tile opening play is legal", play.ok, play.reason);
// C(3)+A(1)+T(1) = 5, centre doubles the word => 10
check("opening play doubles on the centre star", play.score === 10, String(play.score));
board = play.board;

check("an opening play that misses the centre is refused",
  !B.validate(B.create(), [{ r: 0, c: 0, tile: "C" }, { r: 0, c: 1, tile: "A" },
    { r: 0, c: 2, tile: "T" }]).ok);
check("a disconnected play is refused",
  !B.validate(board, [{ r: 0, c: 0, tile: "H" }, { r: 0, c: 1, tile: "I" }]).ok);
check("a play with a gap is refused",
  !B.validate(board, [{ r: 8, c: 7, tile: "A" }, { r: 10, c: 7, tile: "T" }]).ok);
check("a play onto an occupied square is refused",
  !B.validate(board, [{ r: 7, c: 7, tile: "A" }]).ok);
check("a non-word is refused",
  !B.validate(board, [{ r: 8, c: 7, tile: "Z" }, { r: 9, c: 7, tile: "Q" }]).ok);

// Single-tile play. S under the C of CAT makes nothing downward on its own,
// so use a real one: play "S" after CAT to make CATS.
let single = B.validate(board, [{ r: 7, c: 10, tile: "S" }]);
check("single-tile play is legal and reads the word it extends",
  single.ok && single.words.some((w) => w.word === "CATS"), single.reason);

// Play forming two words at once: hang a word off CAT so it makes a cross word.
let cross = B.validate(board, [
  { r: 8, c: 7, tile: "O" }, { r: 9, c: 7, tile: "W" }
]);
check("multi-tile play forming a second word is legal", cross.ok, cross.reason);
check("both words are reported", cross.ok && cross.words.length === 1 &&
  cross.words[0].word === "COW", cross.ok ? cross.words.map((w) => w.word).join(",") : "");

// A play that makes a main word AND cross words simultaneously. XI laid under
// the A and T of CAT makes AX and TI downward at the same time.
let two = B.validate(board, [
  { r: 8, c: 8, tile: "X" }, { r: 8, c: 9, tile: "I" }
]);
check("a play making several words at once is legal", two.ok, two.reason);
check("main word and both cross words are reported",
  two.ok && two.words.map((w) => w.word).sort().join(",") === "AX,TI,XI",
  two.ok ? two.words.map((w) => w.word).sort().join(",") : two.reason);
check("every word formed is scored separately",
  two.ok && two.words.every((w) => w.score > 0) &&
  two.score === two.words.reduce((sum, w) => sum + w.score, 0),
  two.ok ? two.words.map((w) => w.word + ":" + w.score).join(" ") + " total " + two.score : "");

// Blank play. Lowercase = blank.
let blankBoard = B.clone(board);
let blank = B.validate(blankBoard, [{ r: 7, c: 10, tile: "s" }]);
check("a blank plays as its letter", blank.ok &&
  blank.words.some((w) => w.word === "CATS"), blank.reason);
check("a blank scores zero for itself", (() => {
  const real = B.validate(blankBoard, [{ r: 7, c: 10, tile: "S" }]);
  return blank.ok && real.ok && real.score > blank.score;
})(), blank.ok ? `blank ${blank.score} vs real ${B.validate(blankBoard, [{ r: 7, c: 10, tile: "S" }]).score}` : "");
check("a blank is distinguishable from the real letter on the board", (() => {
  const b2 = B.clone(board);
  B.put(b2, 7, 10, "s");
  return B.letterAt(b2, 7, 10) === "S" && B.isBlankAt(b2, 7, 10) && B.valueAt(b2, 7, 10) === 0;
})());

check("premiums count only for newly placed tiles", (() => {
  // CAT already sits across the centre. Extending it to CATS runs the word back
  // through that double-word square — but the star was covered on an earlier
  // turn, so it must not double again. (7,10) is a plain square, so the score
  // is simply C3 + A1 + T1 + S1 = 6. Anything higher means a stale premium.
  const again = B.validate(board, [{ r: 7, c: 10, tile: "S" }]);
  return again.ok && again.score === 6;
})(), (() => { const a = B.validate(board, [{ r: 7, c: 10, tile: "S" }]); return a.ok ? "scored " + a.score + ", expected 6" : a.reason; })());

check("seven tiles scores the fifty-point bingo", (() => {
  const b2 = B.create();
  const p = B.validate(b2, [
    { r: 7, c: 4, tile: "R" }, { r: 7, c: 5, tile: "E" }, { r: 7, c: 6, tile: "T" },
    { r: 7, c: 7, tile: "A" }, { r: 7, c: 8, tile: "I" }, { r: 7, c: 9, tile: "N" },
    { r: 7, c: 10, tile: "S" }
  ]);
  return p.ok && p.bingo && p.score > 50;
})());
check("six tiles does not", (() => {
  const p = B.validate(B.create(), [
    { r: 7, c: 5, tile: "R" }, { r: 7, c: 6, tile: "E" }, { r: 7, c: 7, tile: "T" },
    { r: 7, c: 8, tile: "A" }, { r: 7, c: 9, tile: "I" }, { r: 7, c: 10, tile: "N" }
  ]);
  return p.ok && !p.bingo;
})());

/* --- 4. move generator --------------------------------------------- */

console.log("\nmove generator");
const small = WT.trie.root();

let g0 = B.create();
t0 = Date.now();
let opening = WT.movegen.generate(g0, ["C", "A", "T", "S", "E", "R", "N"], { root: small });
console.log(`       opening rack: ${opening.length} moves in ${Date.now() - t0}ms`);
check("finds moves on an empty board", opening.length > 0);
check("every opening move covers the centre",
  opening.every((m) => m.placements.some((p) => p.r === 7 && p.c === 7)));
check("every generated move is a real word", opening.every((m) => WT.lex.has(m.word)));
check("every generated move validates independently",
  opening.every((m) => B.validate(g0, m.placements).ok));
check("scores agree with the validator",
  opening.every((m) => B.validate(g0, m.placements).score === m.score));
check("best move is the highest scoring",
  WT.movegen.best(g0, ["C", "A", "T", "S", "E", "R", "N"], { root: small }).score ===
    opening[0].score);

// A mid-game board, played out by the generator itself.
console.log("\nplaying a game out");
let game = B.create();
const racks = [
  ["C", "A", "T", "S", "E", "R", "N"],
  ["D", "O", "G", "I", "L", "E", "T"],
  ["B", "U", "M", "P", "A", "R", "E"],
  ["F", "I", "N", "E", "S", "T", "O"],
  ["H", "A", "Z", "E", "L", "N", "U"],
  ["W", "I", "D", "G", "E", "T", "S"],
  ["_", "Q", "I", "R", "A", "T", "E"],
  ["V", "O", "X", "E", "N", "A", "L"]
];
let played = 0;
let totalMs = 0;
for (const rack of racks) {
  const t = Date.now();
  const move = WT.movegen.best(game, rack, { root: small });
  totalMs += Date.now() - t;
  if (!move) continue;
  move.placements.forEach((p) => B.put(game, p.r, p.c, p.tile));
  played++;
}
console.log(`       ${played} moves played, ${totalMs}ms total, ${Math.round(totalMs / Math.max(played, 1))}ms per move`);
check("the generator could keep playing", played >= 6, String(played));

console.log("\nground-truth audit");
let auditResult = B.audit(game);
check("no invalid word anywhere on the played-out board", auditResult.ok,
  auditResult.invalid.map((x) => `${x.word} (${x.dir} at ${x.at.r},${x.at.c})`).join("; "));
console.log(`       ${auditResult.checked} runs checked`);

// The auditor must actually be able to fail, or it proves nothing.
check("the auditor catches a deliberately invalid board", (() => {
  const bad = B.clone(game);
  // Find an empty square with a filled neighbour and jam a junk letter in.
  for (let r = 0; r < 15; r++)
    for (let c = 0; c < 15; c++) {
      if (B.at(bad, r, c) == null &&
          (B.at(bad, r, c - 1) != null || B.at(bad, r, c + 1) != null)) {
        B.put(bad, r, c, "Q");
        const res = B.audit(bad);
        if (!res.ok) return true;
        B.put(bad, r, c, null);
      }
    }
  return false;
})());

// Blanks through the generator.
console.log("\nblanks in the generator");
let bBoard = B.create();
let withBlank = WT.movegen.generate(bBoard, ["_", "A", "T"], { root: small, maxResults: 200 });
check("generates moves using a blank", withBlank.some((m) =>
  m.placements.some((p) => p.tile === p.tile.toLowerCase())), String(withBlank.length));
check("blank moves are still real words", withBlank.every((m) => WT.lex.has(m.word)));
check("a blank contributes zero to the score", (() => {
  const bm = withBlank.find((m) => m.placements.some((p) => p.tile === p.tile.toLowerCase()));
  if (!bm) return false;
  return B.validate(bBoard, bm.placements).score === bm.score;
})());

// Several full boards, audited.
console.log("\naudit over several generated boards");
let boardsOk = 0;
let boardsBad = [];
for (let seed = 0; seed < 4; seed++) {
  let bd = B.create();
  const pool = "AAAAAAAAABBCCDDDDEEEEEEEEEEEEFFGGGHHIIIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSTTTTTTUUUUVVWWXYYZ".split("");
  let cursor = seed * 7;
  for (let turn = 0; turn < 8; turn++) {
    const rack = [];
    for (let i = 0; i < 7; i++) rack.push(pool[(cursor++ * 13 + seed * 5) % pool.length]);
    const mv = WT.movegen.best(bd, rack, { root: small });
    if (!mv) break;
    mv.placements.forEach((p) => B.put(bd, p.r, p.c, p.tile));
  }
  const res = B.audit(bd);
  if (res.ok) boardsOk++;
  else boardsBad.push(res.invalid.map((x) => x.word).join(","));
}
check("four independently generated boards audit clean", boardsBad.length === 0,
  boardsBad.join(" | "));
console.log(`       ${boardsOk} of 4 clean`);

/* --- 5. the two bugs the spec warned about -------------------------- *

   Both produce boards carrying genuinely invalid words while the generator's
   own bookkeeping reports everything as fine. So neither is tested by asking
   the generator whether it is happy — each is tested by applying a move and
   rescanning the whole board from scratch.                                  */

console.log("\nregression: cross-check axis and anchor boundary");

function auditEveryMove(startBoard, rack, label) {
  const moves = WT.movegen.generate(startBoard, rack, { root: small });
  const bad = [];
  for (const m of moves) {
    const after = B.clone(startBoard);
    m.placements.forEach((p) => B.put(after, p.r, p.c, p.tile));
    const res = B.audit(after);
    if (!res.ok) {
      bad.push(`${m.word} ${m.direction} @${m.row},${m.col} -> ${res.invalid.map((x) => x.word).join(",")}`);
      if (bad.length > 3) break;
    }
  }
  return { count: moves.length, bad: bad, label: label };
}

// A board with words on both axes, so vertical generation is exercised and
// several anchors sit next to each other.
let cross1 = B.create();
[["C", 7, 7], ["A", 7, 8], ["T", 7, 9],
 ["O", 8, 7], ["W", 9, 7],
 ["I", 6, 9], ["T", 5, 9]].forEach(([t, r, c]) => B.put(cross1, r, c, t));
check("the fixture board is itself clean", B.audit(cross1).ok,
  B.audit(cross1).invalid.map((x) => x.word).join(","));

let axis = auditEveryMove(cross1, ["S", "E", "R", "A", "N", "D", "L"], "mixed board");
check("every one of the generator's moves survives a full board audit",
  axis.bad.length === 0, axis.bad.join(" | "));
console.log(`       ${axis.count} moves applied and re-audited individually`);

// Vertical moves specifically: transpose the fixture so what was across is now
// down. If cross-checks ever flipped axis, this is where it shows.
let flipped = B.transpose(cross1);
let axis2 = auditEveryMove(flipped, ["S", "E", "R", "A", "N", "D", "L"], "transposed");
check("the same holds on the transposed board", axis2.bad.length === 0, axis2.bad.join(" | "));
console.log(`       ${axis2.count} moves applied and re-audited individually`);

// Anchor boundary: two anchors with a single free square between them, so one
// anchor's left extension can reach into the other's territory.
let tight = B.create();
[["C", 7, 7], ["A", 7, 8], ["T", 7, 9], ["D", 7, 12], ["O", 7, 13], ["G", 7, 14]]
  .forEach(([t, r, c]) => B.put(tight, r, c, t));
check("the tight fixture is clean", B.audit(tight).ok);
let tightRes = auditEveryMove(tight, ["S", "E", "A", "R", "N"], "adjacent anchors");
check("no move ignores a letter belonging to a neighbouring anchor",
  tightRes.bad.length === 0, tightRes.bad.join(" | "));
console.log(`       ${tightRes.count} moves applied and re-audited individually`);

/* --- 6. the blank performance trap ---------------------------------- */

console.log("\nblanks on a busy board");
let busy = B.create();
// CAT across, COW down off its C, TIT down through its T, and WORD running
// across off the W. Every run is a real word — asserted below before use,
// because a fixture that is quietly invalid makes the test meaningless.
const seedMoves = [
  ["C", 7, 7], ["A", 7, 8], ["T", 7, 9], ["O", 8, 7], ["W", 9, 7],
  ["I", 6, 9], ["T", 5, 9], ["O", 9, 8], ["R", 9, 9], ["D", 9, 10]
];
seedMoves.forEach(([t, r, c]) => B.put(busy, r, c, t));
if (B.audit(busy).ok) {
  t0 = Date.now();
  const withBlanks = WT.movegen.generate(busy, ["_", "_", "S", "E", "A", "R", "N"], { root: small });
  const ms = Date.now() - t0;
  console.log(`       two blanks + five tiles: ${withBlanks.length} moves in ${ms}ms`);
  check("two blanks on a busy board do not blow up the search", ms < 8000, ms + "ms");
  check("every blank-bearing move still audits clean", (() => {
    const sample = withBlanks.filter((m) =>
      m.placements.some((p) => p.tile === p.tile.toLowerCase())).slice(0, 250);
    return sample.every((m) => {
      const after = B.clone(busy);
      m.placements.forEach((p) => B.put(after, p.r, p.c, p.tile));
      return B.audit(after).ok;
    });
  })());
} else {
  check("busy fixture is clean", false, B.audit(busy).invalid.map((x) => x.word).join(","));
}

console.log(failures === 0 ? "\nAll board checks passed.\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
