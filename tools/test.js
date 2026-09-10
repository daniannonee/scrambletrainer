/* Headless checks for the logic layers. Run: node tools/test.js
   No test framework — this must keep working with zero install. */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.dirname(__dirname);
const files = [
  "data/lexicon.js",
  "data/definitions.js",
  "data/defs_auto.js",
  "data/tiers.js",
  "js/lexicon.js",
  "js/defs.js",
  "js/stems.js",
  "js/anagrams.js",
  "js/groups.js",
  "js/storage.js",
  "js/review.js",
  "js/leave.js",
  "js/quiz.js",
  "js/levels.js"
];

// Minimal browser stand-ins: a localStorage that behaves, and a window object.
const memory = {};
const sandbox = {
  window: {
    localStorage: {
      getItem: (k) => (k in memory ? memory[k] : null),
      setItem: (k, v) => {
        memory[k] = String(v);
      },
      removeItem: (k) => {
        delete memory[k];
      }
    }
  },
  console
};
sandbox.window.window = sandbox.window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
}
const WT = sandbox.window.WT;
const WT_DEFS = vm.runInContext("WT_DEFS", sandbox);
const WT_DEFS_AUTO_PEEK = vm.runInContext("WT_DEFS_AUTO", sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log("  ok   " + name);
  } else {
    failures++;
    console.log("  FAIL " + name + (detail ? " — " + detail : ""));
  }
}

// --- source of truth: read the raw list independently of the packed data ----
const raw = new Set(
  fs
    .readFileSync(path.join(ROOT, "tools/enable1.txt"), "utf8")
    .split("\n")
    .map((w) => w.trim())
    .filter(Boolean)
);
const supplement = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/supplement.json"), "utf8"));
const added = [...supplement.add.twos, ...supplement.add.threes].sort();
const rawShort = [...raw].filter((w) => w.length >= 1 && w.length <= 8);
const expected = new Set([...rawShort, ...added]);

console.log("\nlexicon");
check("packs and unpacks every 1-8 letter word plus the supplement",
  WT.lex.count() === expected.size, `${WT.lex.count()} vs ${expected.size}`);
check("round-trips the whole list", [...expected].every((w) => WT.lex.has(w)));
check("107 two-letter words (96 ENABLE + 11 supplement)", WT.lex.count(2) === 107,
  String(WT.lex.count(2)));
check("rejects a non-word", !WT.lex.has("zzq"));
check("rejects a 9-letter word (out of shipped range)", !WT.lex.has("wordsmith"));
check("is case-insensitive", WT.lex.has("QAT"));
check("hooks for AA are aah/aal/aas",
  WT.lex.hooks("aa").back.join("") === "hls" && WT.lex.hooks("aa").front.join("") === "b");

console.log("\nsupplement");
const WT_LEX_ADDED = vm.runInContext("WT_LEX_ADDED", sandbox);
check("the build recorded exactly the supplement it merged",
  JSON.stringify(WT_LEX_ADDED) === JSON.stringify(added), WT_LEX_ADDED.join(" "));
check("no supplement word was already in ENABLE", added.every((w) => !raw.has(w)),
  added.filter((w) => raw.has(w)).join(" "));
check("every supplement word is now valid", added.every((w) => WT.lex.has(w)));
check("QI, ZA and QIS are in", ["qi", "za", "qis", "zas"].every((w) => WT.lex.has(w)));
check("supplement words are not also in the ambiguous set",
  added.every((w) => !WT.quiz.AMBIGUOUS.has(w)));
check("deliberately-excluded forms are still non-words",
  Object.keys(supplement.deliberately_not_added)
    .filter((k) => k[0] !== "_")
    .every((w) => !WT.lex.has(w)));
check("deliberately-excluded forms are protected from being decoys",
  Object.keys(supplement.deliberately_not_added)
    .filter((k) => k[0] !== "_")
    .every((w) => WT.quiz.AMBIGUOUS.has(w)));

console.log("\ngroups");
const twos = WT.groups.get("two-letter");
check("two-letter group is the 2-letter words", twos.length === 107 && twos.every((w) => w.length === 2));
check("every group member is in the lexicon",
  WT.groups.ids().every((id) => WT.groups.get(id).every((w) => WT.lex.has(w))));
const q = WT.groups.get("q-without-u");
check("q-without-u has no QU", q.every((w) => w.includes("q") && !w.includes("qu")), q.slice(0, 5).join(","));
check("q-without-u includes qat, faqir, qi and qis",
  ["qat", "faqir", "qi", "qis"].every((w) => q.includes(w)));
const hv = WT.groups.get("high-value-short");
check("high-value words all contain j/x/z/q", hv.every((w) => /[jxzq]/.test(w)));
const vh = WT.groups.get("vowel-heavy");
check("vowel-heavy words are >=2/3 vowels",
  vh.every((w) => [...w].filter((c) => "aeiou".includes(c)).length * 3 >= w.length * 2));
const tft = WT.groups.get("three-from-two");
check("three-from-two are all real 3-letter words",
  tft.every((w) => w.length === 3 && WT.lex.has(w)));
check("three-from-two is a subset of all threes", tft.length <= WT.lex.count(3));

console.log("\ndefinitions");
const missingDefs = twos.filter((w) => !WT_DEFS[w]);
check("every two-letter word has a definition", missingDefs.length === 0, missingDefs.join(" "));
const extraDefs = Object.keys(WT_DEFS).filter((w) => !WT.lex.has(w));
check("no definitions for words outside the lexicon", extraDefs.length === 0, extraDefs.join(" "));
check("definitions are non-empty strings",
  Object.values(WT_DEFS).every((d) => Array.isArray(d) && d[0] && d[1] && d[1].length >= 4));
const WT_DEFS_UNVERIFIED = vm.runInContext("WT_DEFS_UNVERIFIED", sandbox);
check("every flagged-unverified word actually has a definition",
  WT_DEFS_UNVERIFIED.every((w) => WT_DEFS[w]),
  WT_DEFS_UNVERIFIED.filter((w) => !WT_DEFS[w]).join(" "));
check("the supplement words all got definitions", added.every((w) => WT_DEFS[w]),
  added.filter((w) => !WT_DEFS[w]).join(" "));

console.log("\nquiz engine");
let sawDecoy = false;
for (let seed = 1; seed <= 40; seed++) {
  const s = WT.quiz.create({ words: twos, size: 30, decoyShare: 0.5, seed });
  while (!s.done()) {
    const item = s.current();
    if (item.isWord !== WT.lex.has(item.text)) {
      failures++;
      console.log(`  FAIL item label wrong: ${item.text} labelled ${item.isWord}`);
    }
    if (item.text.length !== 2) {
      failures++;
      console.log(`  FAIL wrong length item: ${item.text}`);
    }
    if (!item.isWord) {
      sawDecoy = true;
      if (WT.quiz.AMBIGUOUS.has(item.text)) {
        failures++;
        console.log(`  FAIL ambiguous string used as a decoy: ${item.text}`);
      }
    }
    s.answer(item.isWord); // answer perfectly
  }
  const r = s.results();
  if (r.accuracy !== 1) {
    failures++;
    console.log(`  FAIL perfect play did not score 100% (seed ${seed})`);
  }
}
check("40 seeded quizzes: every item labelled correctly, no ambiguous decoys", true);
check("decoys were actually generated", sawDecoy);

const a = WT.quiz.create({ words: twos, size: 20, seed: 7 });
const b = WT.quiz.create({ words: twos, size: 20, seed: 7 });
check("same seed gives the same quiz",
  JSON.stringify([a.current(), a.total]) === JSON.stringify([b.current(), b.total]));

const s2 = WT.quiz.create({ words: twos, size: 10, decoyShare: 0.5, seed: 99 });
const wrongAll = [];
while (!s2.done()) {
  const it = s2.current();
  wrongAll.push(it);
  s2.answer(!it.isWord); // answer everything wrong
}
const r2 = s2.results();
check("all-wrong scores 0%", r2.accuracy === 0);
check("missed words are the real words", r2.missedWords.every((w) => WT.lex.has(w)));
check("false accepts are the non-words", r2.falseAccepts.every((w) => !WT.lex.has(w)));
check("missed + false = total", r2.missedWords.length + r2.falseAccepts.length === r2.total);

console.log("\ndefinition layers");
const overlap = Object.keys(WT_DEFS).filter((w) => WT_DEFS_AUTO_PEEK[w]);
check("the two definition layers really do overlap", overlap.length > 10, String(overlap.length));
check("hand-authored definitions win over generated ones",
  overlap.every((w) => {
    const d = WT.defs.get(w);
    return d.source === "authored" && d.text === WT_DEFS[w][1];
  }));
check("an inflected form falls back to its base word",
  (() => {
    const d = WT.defs.get("spurs");
    return d && d.source === "derived" && d.base === "spur" && d.text.indexOf("a form of spur") === 0;
  })());
check("the fallback never invents a base that is not a word",
  ["qis", "zas", "aas"].every((w) => {
    const d = WT.defs.get(w);
    return !d || d.source !== "derived" || WT.lex.has(d.base);
  }));
check("a direct definition is never overridden by a fallback",
  WT.defs.get("as").source === "authored" && WT.defs.get("is").source === "authored");
check("and the authored text differs from the generated one",
  WT.defs.get("ad").text === "an advertisement" &&
  WT_DEFS_AUTO_PEEK["ad"][1] !== "an advertisement");
check("generated definitions are used where nothing is authored",
  WT.defs.get("ado") && WT.defs.get("ado").source === "wordnet");
const WT_DEFS_AUTO = vm.runInContext("WT_DEFS_AUTO", sandbox);
check("no generated definition for a short game word",
  !WT_DEFS_AUTO["aa"] && !WT_DEFS_AUTO["ab"] && !WT_DEFS_AUTO["al"] && !WT_DEFS_AUTO["xu"],
  "these are exactly the words WordNet gets wrong");
check("every generated definition is for a word in the lexicon",
  Object.keys(WT_DEFS_AUTO).every((w) => WT.lex.has(w)));
check("generated glosses are trimmed to a readable length",
  Object.values(WT_DEFS_AUTO).every((d) => d[1].length <= 111));

console.log("\nword groups behind each level");
const common3 = WT.groups.get("three-letter-common");
check("common threes are all 3-letter words in the lexicon",
  common3.length > 300 && common3.every((w) => w.length === 3 && WT.lex.has(w)),
  String(common3.length));
check("common threes are a strict subset of all threes", common3.length < WT.lex.count(3));
check("common threes exclude game-only words",
  !common3.includes("aal") && !common3.includes("qis") && common3.includes("ace"));
const c3cov = WT.defs.coverage(common3);
check("most common threes have a definition", c3cov.defined / c3cov.total > 0.85,
  `${c3cov.defined}/${c3cov.total}`);
const qcov = WT.defs.coverage(WT.groups.get("q-without-u"));
check("every Q-without-U word is defined and hand-authored",
  qcov.defined === qcov.total && qcov.authored === qcov.total,
  `${qcov.authored} authored of ${qcov.total}`);

console.log("\nbingo stems");
const top = WT.stems.top(20);
check("twenty stems returned, best first", top.length === 20 &&
  top.every((s, i) => i === 0 || top[i - 1].score >= s.score));
check("the best stem is AEINST", top[0].alphagram === "aeinst", top[0].alphagram);
check("stems are six letters in alphabetical order",
  top.every((s) => s.alphagram.length === 6 &&
    s.alphagram === s.alphagram.split("").sort().join("")));
check("a stem's letters are exactly those that make a real seven",
  top.every((s) =>
    "abcdefghijklmnopqrstuvwxyz".split("").every((c) => {
      const claimed = s.letters.includes(c);
      const actual = WT.stems.wordsFor(s, c).length > 0;
      return claimed === actual;
    })
  ));
check("every example word is a real seven-letter word",
  top.every((s) => s.letters.every((c) =>
    WT.stems.wordsFor(s, c).every((w) => w.length === 7 && WT.lex.has(w)))));
check("example words really are anagrams of stem plus letter",
  top.every((s) => s.letters.every((c) =>
    WT.stems.wordsFor(s, c).every((w) =>
      w.split("").sort().join("") === (s.alphagram + c).split("").sort().join("")))));
check("stem names are anagrams of their stem",
  top.every((s) => !s.aliases.length ||
    s.name.split("").sort().join("") === s.alphagram));
check("SATIRE + N finds the retinas/stainer family",
  WT.stems.wordsFor(WT.stems.get("satire"), "n").includes("retinas"));
check("SATIRE + Q makes nothing", WT.stems.wordsFor(WT.stems.get("satire"), "q").length === 0);

console.log("\nanagram drill");
const drillLengths = WT.anagrams.lengths();
check("offers 4 to 7 letters", JSON.stringify(drillLengths) === "[4,5,6,7]",
  JSON.stringify(drillLengths));
check("every length has plenty of puzzles",
  drillLengths.every((n) => WT.anagrams.count(n) > 500),
  drillLengths.map((n) => n + ":" + WT.anagrams.count(n)).join(" "));
let scrambleGaveAnswer = false;
let badRound = null;
drillLengths.forEach((n) => {
  for (let seed = 1; seed <= 6; seed++) {
    const r = WT.anagrams.round({ length: n, size: 10, seed });
    if (r.length !== 10) badRound = `${n}/${seed}: got ${r.length} puzzles`;
    const seen = new Set();
    r.forEach((p) => {
      if (seen.has(p.alphagram)) badRound = `${n}/${seed}: repeated ${p.alphagram}`;
      seen.add(p.alphagram);
      if (p.scrambled.length !== n) badRound = `${n}/${seed}: wrong tile count`;
      if (WT.anagrams.alphagram(p.scrambled) !== p.alphagram)
        badRound = `${n}/${seed}: scramble is not the same letters`;
      if (!p.answers.length) badRound = `${n}/${seed}: ${p.alphagram} has no answer`;
      if (p.answers.some((w) => !WT.lex.has(w) || w.length !== n))
        badRound = `${n}/${seed}: bogus answer for ${p.alphagram}`;
      if (p.answers.includes(p.scrambled)) scrambleGaveAnswer = true;
    });
  }
});
check("rounds are 10 distinct solvable puzzles at the right length", !badRound, badRound || "");
check("the scramble never just shows the answer", !scrambleGaveAnswer);
const probe = WT.anagrams.round({ length: 5, size: 5, seed: 42 });
check("every answer to a puzzle is accepted",
  probe.every((p) => p.answers.every((w) => WT.anagrams.check(p, w))));
check("a wrong-length or wrong-letter guess is rejected",
  probe.every((p) => !WT.anagrams.check(p, p.alphagram.slice(1)) &&
    !WT.anagrams.check(p, "z".repeat(p.alphagram.length))));
check("guesses are judged case-insensitively",
  probe.every((p) => WT.anagrams.check(p, p.answers[0].toUpperCase())));
check("a real word we did not seed still counts", (() => {
  // Find a puzzle whose alphagram has a second, less common anagram and check
  // that answer is accepted too. This is the "you found one we didn't" path.
  const withMany = WT.anagrams.round({ length: 5, size: 60, seed: 3 })
    .filter((p) => p.answers.length > 1);
  return withMany.length > 0 && withMany.every((p) => p.answers.every((w) => WT.anagrams.check(p, w)));
})());
check("puzzle seeds are ordinary words, not game vocabulary",
  probe.every((p) => p.answers.some((w) => WT.defs.get(w))));
const seededA = WT.anagrams.round({ length: 6, size: 8, seed: 11 });
const seededB = WT.anagrams.round({ length: 6, size: 8, seed: 11 });
check("same seed gives the same round",
  JSON.stringify(seededA) === JSON.stringify(seededB));

console.log("\ndrill records");
WT.store.reset();
check("an unplayed drill reports zeroes", WT.store.drillBest("anagram", 5).rounds === 0);
WT.store.recordDrill("anagram", 5, 7);
WT.store.recordDrill("anagram", 5, 4);
const rec = WT.store.drillBest("anagram", 5);
check("a worse round never lowers your best", rec.best === 7 && rec.lastScore === 4);
check("rounds are counted", rec.rounds === 2);
check("drill records are kept per length", WT.store.drillBest("anagram", 6).rounds === 0);
check("drill records survive a reload",
  JSON.parse(memory["wordtrainer.progress.v1"]).drills["anagram:5"].best === 7);
WT.store.reset();

console.log("\nthe ten levels");
const LV = WT.levels.all();
check("every level is built", LV.every((l) => l.built), LV.filter(l=>!l.built).map(l=>l.id).join(" "));
check("no level still carries an open question",
  LV.every((l) => !l.openQuestion), LV.filter(l=>l.openQuestion).map(l=>l.id).join(" "));
check("every level has words or is a stem level",
  LV.every((l) => l.kind === "stems" || WT.levels.wordsFor(l).length > 0),
  LV.filter(l => l.kind !== "stems" && !WT.levels.wordsFor(l).length).map(l=>l.id).join(" "));
check("every quiz can be filled from its group",
  LV.every((l) => l.kind === "stems" || WT.levels.wordsFor(l).length * 2 >= l.quiz.size));
check("every level id is unique", new Set(LV.map(l=>l.id)).size === LV.length);
check("a quiz runs cleanly for every word level", LV.every((l) => {
  if (l.kind === "stems") return true;
  const q = WT.quiz.create({ words: WT.levels.wordsFor(l), size: l.quiz.size, seed: 5 });
  let n = 0;
  while (!q.done()) {
    const it = q.current();
    if (it.isWord !== WT.lex.has(it.text)) return false;
    if (WT.quiz.AMBIGUOUS.has(it.text) && !it.isWord) return false;
    q.answer(it.isWord);
    n++;
  }
  return n === q.total && q.results().accuracy === 1;
}));

console.log("\nprogress + level state machine");
WT.store.reset();
const levels = WT.levels.all();
check("ten levels defined", levels.length === 10);
check("level 1 starts current", WT.levels.statusOf(levels[0]) === "current");
check("level 2 starts locked", WT.levels.statusOf(levels[1]) === "locked");
WT.levels.complete(levels[0], 0.9);
check("completing level 1 marks it complete", WT.levels.statusOf(levels[0]) === "complete");
check("completing level 1 unlocks level 2", WT.levels.statusOf(levels[1]) === "current");
check("level 3 still locked", WT.levels.statusOf(levels[2]) === "locked");
check("progress counts 1 of 10", WT.levels.overallProgress().done === 1);
// Walk the whole path and confirm each completion unlocks exactly the next one.
levels.forEach((l) => WT.levels.complete(l, 0.95));
check("completing every level finishes the path",
  WT.levels.overallProgress().done === 10 &&
  levels.every((l) => WT.levels.statusOf(l) === "complete"));
WT.store.reset();
check("reset relocks everything but level 1",
  WT.levels.statusOf(levels[0]) === "current" &&
  levels.slice(1).every((l) => WT.levels.statusOf(l) === "locked"));
let orderOk = true;
levels.forEach((l, i) => {
  // Standing at level i: it should be open, and everything after it shut.
  if (WT.levels.statusOf(l) !== "current") orderOk = false;
  levels.slice(i + 1).forEach((later) => {
    if (WT.levels.statusOf(later) !== "locked") orderOk = false;
  });
  WT.levels.complete(l, 0.9);
});
check("levels unlock strictly one at a time, in order", orderOk);
WT.store.reset();
WT.levels.complete(levels[0], 0.9);

WT.store.recordAnswers([
  { text: "aa", isWord: true, correct: false },
  { text: "aa", isWord: true, correct: false },
  { text: "ab", isWord: true, correct: true },
  { text: "zz", isWord: false, correct: false }
]);
check("missed words ranked by how often they were wrong", WT.store.missedWords()[0] === "aa");
check("correct words are not listed as missed", !WT.store.missedWords().includes("ab"));
check("decoys are not tracked", WT.store.wordStat("zz").seen === 0);

// Persistence across a "reload": drop the in-memory state, re-read from storage.
const saved = memory["wordtrainer.progress.v1"];
check("progress was written to storage", !!saved);
const reloaded = JSON.parse(saved);
check("saved record has level 1 complete", reloaded.levels["l1-twos"].status === "complete");
check("saved record keeps word stats", reloaded.wordStats.aa.wrong === 2);

/* --- the review scheduler ---------------------------------------------
   Driven with explicit day numbers rather than the clock, so the intervals are
   actually tested instead of assumed. */
WT.store.reset();
const R = WT.review;
const D0 = R.today();

// Entry rule: only missed words are scheduled.
R.applyAnswers(
  [
    { text: "qi", isWord: true, correct: false },
    { text: "za", isWord: true, correct: true },
    { text: "qx", isWord: false, correct: false }
  ],
  D0
);
check("a missed word enters the schedule", !!WT.store.reviewGet("qi"));
check("a word answered right is never scheduled", !WT.store.reviewGet("za"));
check("decoys are never scheduled", !WT.store.reviewGet("qx"));
check("a missed word is due tomorrow, not today", WT.store.reviewGet("qi").due === D0 + 1);
check("nothing is due on the day it was missed", R.dueCount(D0) === 0);
check("it is due the next day", R.dueCount(D0 + 1) === 1);

// Boxes widen on success and collapse on failure.
let box = R.fresh("test");
const seen = [];
for (let i = 0; i < R.INTERVALS.length; i++) {
  const day = seen.length ? seen[seen.length - 1] : D0;
  box = R.next(box, true, day);
  seen.push(box.due == null ? day : box.due);
}
check("box climbs to retired after enough correct answers", box.box === R.RETIRED);
check("a retired word has no due date", box.due === null);
check("a retired word is not in the due queue", !R.due(Infinity, D0 + 9999).includes("test"));

const gaps = [];
let climb = R.fresh("gap");
let at = D0;
for (let i = 0; i < R.INTERVALS.length - 1; i++) {
  climb = R.next(climb, true, at);
  gaps.push(climb.due - at);
  at = climb.due;
}
check(
  "each correct answer waits strictly longer than the last",
  gaps.every((g, i) => i === 0 || g > gaps[i - 1])
);
check("the first correct answer waits INTERVALS[1] days", gaps[0] === R.INTERVALS[1]);

const dropped = R.next({ word: "w", box: 4, due: D0, right: 9, wrong: 0 }, false, D0);
check("one wrong answer drops a word all the way to box 0", dropped.box === 0);
check("a dropped word is due tomorrow", dropped.due === D0 + 1);

// applyAnswers reports what actually moved, which is what the result screen shows.
WT.store.reset();
R.applyAnswers([{ text: "qi", isWord: true, correct: false }], D0);
const moved = R.applyAnswers([{ text: "qi", isWord: true, correct: true }], D0 + 1);
check("a correct review answer is not reported as newly added", moved.added.length === 0);
check("promotion is recorded", WT.store.reviewGet("qi").box === 1);
const relapse = R.applyAnswers([{ text: "qi", isWord: true, correct: false }], D0 + 3);
check("a relapse is reported", relapse.relapsed.includes("qi"));
check("a relapse resets the box", WT.store.reviewGet("qi").box === 0);
check("a promotion that does not retire is reported as promoted", moved.promoted.includes("qi"));
check("a promotion is not also reported as graduated", !moved.graduated.includes("qi"));

// The session must be big enough to hold every due word alongside its decoys.
const size = R.sessionSize(12);
check("session size leaves room for every due word", Math.round(size * (1 - R.DECOY_SHARE)) >= 12);
check("a backlog is capped per sitting", R.SESSION_MAX <= 30);

// Old saved records predate the reviews key and must still load.
WT.store.reset();
memory["wordtrainer.progress.v1"] = JSON.stringify({
  version: 1,
  levels: { "l1-twos": { status: "complete", bestAccuracy: 0.9, attempts: 1 } },
  wordStats: { aa: { seen: 1, wrong: 1 } }
});
// Re-running storage.js gives a fresh module whose cached state is null, so it
// re-reads the record above from "disk" exactly as a reload would. Do NOT call
// reset() here — it would delete the very record under test.
vm.runInContext(fs.readFileSync(path.join(ROOT, "js/storage.js"), "utf8"), sandbox, {
  filename: "js/storage.js"
});
const legacy = sandbox.window.WT.store;
check("a pre-review saved record still loads its levels", legacy.levelState("l1-twos").status === "complete");
check("a pre-review saved record reads as nothing scheduled", Object.keys(legacy.reviewAll()).length === 0);

/* --- the leave rubric -------------------------------------------------
   A transparent rubric is only useful if it actually ranks the racks a player
   would rank the same way, so these are comparisons, not magic numbers. */
console.log("\nleave");
const L = WT.leave;
const sc = (s) => L.evaluate(s.split("")).score;

check("a balanced leave beats an all-consonant one", sc("AERT") > sc("BCDF"));
check("a balanced leave beats an all-vowel one", sc("AERT") > sc("AEIOU"));
check("keeping the blank is worth more than anything else",
  sc("_ERT") > sc("SERT") && sc("SERT") > sc("BERT"));
check("keeping the S beats keeping an ordinary consonant", sc("AERS") > sc("AERB"));
check("duplicates hurt", sc("AERT") > sc("AEET"));
check("Q with no U is the worst common holding", sc("QRTV") < sc("AERT"));
check("Q with its U is less bad than Q alone", sc("QUAT") > sc("QRTV"));
check("V is penalised for making no two-letter word", sc("AERV") < sc("AERT"));
check("a pile of awkward consonants is penalised", sc("JKXZWC") < sc("AEINRT"));
check("playing out returns the empty verdict", L.evaluate([]).empty === true);
check("every reason carries a delta and text",
  L.evaluate("QRTV".split("")).reasons.every((r) => typeof r.text === "string" && "delta" in r));
check("the score is the sum of its reasons",
  (() => {
    const r = L.evaluate("_QAEBB".split(""));
    return r.score === r.reasons.reduce((a, x) => a + x.delta, 0);
  })());

// after(): a lowercase placement is a blank and must cost "_", not the letter.
check("spending a normal tile removes that letter",
  L.after(["A", "B", "C"], [{ r: 0, c: 0, tile: "B" }]).join("") === "AC");
check("spending a blank removes the blank, not the letter it became",
  L.after(["A", "_", "C"], [{ r: 0, c: 0, tile: "b" }]).join("") === "AC");
check("describe() covers the whole range",
  ["_AEINRS", "AERT", "AEET", "QRTVXZ"].every((r) => typeof L.describe(L.evaluate(r.split(""))) === "string"));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
