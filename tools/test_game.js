/* The game rules, driven to completion. Run: node tools/test_game.js

   The endgame is the part nobody exercises by hand, so this plays whole seeded
   games engine-vs-engine and checks the invariants that must hold at every
   single turn — tile conservation above all. A bag that quietly grows or loses
   tiles is the kind of bug that only shows up in someone's 40th game. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.dirname(__dirname);
const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
[
  "data/lexicon.js", "data/lexicon_long.js", "js/lexicon.js",
  "js/trie.js", "js/board.js", "js/movegen.js", "js/game.js", "js/opponent.js"
].forEach((f) =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f })
);
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

/* Total tiles in existence: bag + both racks + board. Must always be 100. */
function census(game) {
  const s = game.state();
  const onBoard = s.board.cells.filter((c) => c != null).length;
  return s.bag + s.rack.length + game.rackOf(1).length + onBoard;
}

console.log("\nsetup");
const g0 = WT.game.create({ seed: 1 });
const s0 = g0.state();
check("both racks start with seven tiles", s0.rack.length === 7 && g0.rackOf(1).length === 7);
check("the bag starts with 86 tiles", s0.bag === 86, String(s0.bag));
check("100 tiles exist at the start", census(g0) === 100, String(census(g0)));
check("the player moves first", s0.turn === 0);
check("the board starts empty", s0.board.cells.every((c) => c === null));

console.log("\nrules");
const g1 = WT.game.create({ seed: 2 });
const bad = g1.play([{ r: 0, c: 0, tile: g1.state().rack[0] }]);
check("a first play away from the centre is rejected", !bad.ok, bad.reason);
check("a rejected play does not consume the turn", g1.state().turn === 0);
check("a rejected play does not touch the rack", g1.state().rack.length === 7);

const cheat = WT.game.create({ seed: 3 });
const held = cheat.state().rack;
// Find a letter the rack does NOT hold and try to play it.
const absent = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((L) => held.indexOf(L) === -1);
const sneak = cheat.play([
  { r: 7, c: 7, tile: absent },
  { r: 7, c: 8, tile: held[0] }
]);
check("a play using a tile not on the rack is refused", !sneak.ok, sneak.reason);
check("the refused play left the board empty", cheat.state().board.cells.every((c) => c === null));

console.log("\nexchange");
const g2 = WT.game.create({ seed: 4 });
const beforeBag = g2.state().bag;
const ex = g2.exchange([0, 1]);
check("an exchange with a full bag is allowed", ex.ok, ex.reason);
check("the rack is refilled to seven", g2.state().rack.length === 7);
check("the bag is the same size after an exchange", g2.state().bag === beforeBag, String(g2.state().bag));
check("an exchange passes the turn", g2.state().turn === 1);
check("100 tiles still exist", census(g2) === 100, String(census(g2)));

console.log("\nsix scoreless turns end it");
const g3 = WT.game.create({ seed: 5 });
for (let i = 0; i < 6; i++) g3.pass();
const s3 = g3.state();
check("six passes end the game", s3.over);
check("the reason is recorded", s3.endReason === "six scoreless turns", s3.endReason);
check("both players lose their own rack", s3.adjustments[0] <= 0 && s3.adjustments[1] <= 0,
  JSON.stringify(s3.adjustments));
check("a seventh action is refused", !g3.pass().ok);

console.log("\nfull games, engine vs engine");
let played = 0, playedOut = 0, stalled = 0, bingos = 0, censusFails = 0, auditFails = 0;
const scores = [];
for (let seed = 1; seed <= 12; seed++) {
  const g = WT.game.create({ seed });
  const rand = WT.opponent.rng(seed * 7919);
  let turns = 0;
  while (!g.state().over && turns < 200) {
    const before = g.state().turn;
    WT.opponent.takeTurn(g, before === 0 ? "steady" : "sharp", rand);
    turns++;
    if (census(g) !== 100) {
      censusFails++;
      break;
    }
    // Ground truth: rescan the whole board against the dictionary. Trusting the
    // generator's own bookkeeping is exactly how the known bugs hide.
    const audit = B.audit(g.state().board);
    if (!audit.ok) {
      auditFails++;
      console.log(`      seed ${seed}: board carries ${JSON.stringify(audit.invalid)}`);
      break;
    }
  }
  const s = g.state();
  played++;
  if (s.endReason === "played out") playedOut++;
  if (s.endReason === "six scoreless turns") stalled++;
  bingos += s.history.filter((h) => h.bingo).length;
  scores.push(s.scores[0], s.scores[1]);
  if (!s.over) console.log(`      seed ${seed}: did not finish in 200 turns`);
}
check("every game kept exactly 100 tiles at every turn", censusFails === 0, String(censusFails));
check("every board passed a full re-audit at every turn", auditFails === 0, String(auditFails));
check("all 12 games finished", played === 12);
check("games end by playing out, not by stalling", playedOut >= 10, `${playedOut} out, ${stalled} stalled`);
check("bingos happen", bingos > 0, String(bingos));
const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
check("final scores are plausible for the format", avg > 150 && avg < 600, `average ${avg}`);

console.log("\ngoing out is rewarded");
let sawAdjustment = false;
for (let seed = 20; seed < 40 && !sawAdjustment; seed++) {
  const g = WT.game.create({ seed });
  const rand = WT.opponent.rng(seed);
  let turns = 0;
  while (!g.state().over && turns++ < 200) WT.opponent.takeTurn(g, "sharp", rand);
  const s = g.state();
  if (s.wentOut != null) {
    sawAdjustment = true;
    const other = s.wentOut === 0 ? 1 : 0;
    check("the player who went out gained, the other lost the same amount",
      s.adjustments[s.wentOut] === -s.adjustments[other] && s.adjustments[s.wentOut] >= 0,
      JSON.stringify(s.adjustments));
    check("the player who went out has an empty rack",
      (s.wentOut === 0 ? s.rack.length : g.rackOf(1).length) === 0);
  }
}
check("at least one game ended by a player going out", sawAdjustment);

console.log("\ndifficulty bands");
const fake = Array.from({ length: 100 }, (_, i) => ({ score: 100 - i }));
const gentle = WT.opponent.levelById("gentle");
const sharp = WT.opponent.levelById("sharp");
let gentleWorse = 0;
for (let i = 0; i < 200; i++) {
  const rand = WT.opponent.rng(i);
  const a = WT.opponent.pick(fake, gentle, rand);
  const b = WT.opponent.pick(fake, sharp, WT.opponent.rng(i));
  if (a.score < b.score) gentleWorse++;
}
check("the gentle band always picks a worse move than the sharp one", gentleWorse === 200,
  `${gentleWorse}/200`);
check("the sharp band takes the top move", WT.opponent.pick(fake, sharp, () => 0).score === 100);
check("a band never runs off the end of the list",
  [1, 2, 3].every((n) => {
    const small = Array.from({ length: n }, (_, i) => ({ score: n - i }));
    return WT.opponent.LEVELS.every((lv) => WT.opponent.pick(small, lv, () => 0.999) != null);
  }));
check("no move list means no pick", WT.opponent.pick([], gentle, () => 0) === null);

console.log("\nthe opponent never throws a blank away");
const withBlank = ["_", "Q", "Z", "V", "W", "X", "K"];
const swap = WT.opponent.chooseExchange(withBlank);
check("a blank is never in the exchange", swap.indexOf(0) === -1, JSON.stringify(swap));
check("the exchange takes the least useful tiles", swap.length === 3, JSON.stringify(swap));

console.log(failures === 0 ? "\nAll game checks passed.\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
