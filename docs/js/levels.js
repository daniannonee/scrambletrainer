/* The Path: the v1 level sequence, defined as data.
   Adding a level should be an edit here plus (sometimes) a word group — never
   new screen code. Exposes WT.levels. */
(function (WT) {
  "use strict";

  /* `tile` is the letter shown on this level's tile on the path — chosen to
     stand for the level's content (Q for Q-without-U, X for the heavy tiles),
     so the path says what each level is about before you read a word of it. */
  var LEVELS = [
    {
      id: "l1-twos",
      tile: "A",
      title: "The two-letter words",
      blurb:
        "A hundred and seven words, and they matter more than any other group of the " +
        "same size. They are how you play into a tight board and how you make two " +
        "words at once.",
      group: "two-letter",
      steps: ["teach", "quiz"],
      quiz: { size: 30, decoyShare: 0.5, passAccuracy: 0.85 },
      built: true
    },
    {
      id: "l2-twos-recall",
      tile: "E",
      title: "Twos from memory",
      blurb: "The same hundred and seven, no list in front of you, and more questions.",
      group: "two-letter",
      steps: ["quiz"],
      quiz: { size: 50, decoyShare: 0.5, passAccuracy: 0.9 },
      built: true
    },
    {
      id: "l3-threes-common",
      tile: "T",
      title: "Common three-letter words",
      blurb:
        "The threes you already half-know, before the obscure ones. Ordinary English " +
        "words, not game vocabulary.",
      group: "three-letter-common",
      steps: ["teach", "quiz"],
      quiz: { size: 30, decoyShare: 0.5, passAccuracy: 0.85 },
      built: true
    },
    {
      id: "l4-threes-from-twos",
      tile: "H",
      title: "Growing a two into a three",
      blurb: "Front and back hooks: the letters that turn a word you know into a longer one.",
      group: "three-from-two",
      steps: ["teach", "quiz"],
      quiz: { size: 30, decoyShare: 0.5, passAccuracy: 0.85 },
      built: true
    },
    {
      id: "l5-q-without-u",
      tile: "Q",
      title: "Q without U",
      blurb: "A short list with an outsized payoff, and the reason a Q is not a dead tile.",
      group: "q-without-u",
      steps: ["teach", "quiz"],
      quiz: { size: 24, decoyShare: 0.5, passAccuracy: 0.85 },
      built: true
    },
    {
      id: "l6-high-value",
      tile: "J",
      title: "The heavy tiles",
      blurb: "Short words that use J, X, Z and Q, where the points actually are.",
      group: "high-value-short",
      steps: ["teach", "quiz"],
      quiz: { size: 30, decoyShare: 0.5, passAccuracy: 0.85 },
      built: true
    },
    {
      id: "l7-high-value-recall",
      tile: "X",
      title: "Heavy tiles from memory",
      blurb: "The same words without the list.",
      group: "high-value-short",
      steps: ["quiz"],
      quiz: { size: 40, decoyShare: 0.5, passAccuracy: 0.9 },
      built: true
    },
    {
      id: "l8-vowel-dumps",
      tile: "O",
      title: "Dumping vowels",
      blurb: "What to play when the rack is all A, E, I and O.",
      group: "vowel-heavy",
      steps: ["teach", "quiz"],
      quiz: { size: 30, decoyShare: 0.5, passAccuracy: 0.85 },
      built: true
    },
    {
      id: "l9-vowel-recall",
      tile: "I",
      title: "Vowel dumps from memory",
      blurb: "The same words without the list.",
      group: "vowel-heavy",
      steps: ["quiz"],
      quiz: { size: 40, decoyShare: 0.5, passAccuracy: 0.9 },
      built: true
    },
    {
      id: "l10-stems",
      tile: "S",
      title: "Your first bingo stems",
      blurb:
        "Six-letter combinations that turn a seventh tile into a fifty-point bonus. " +
        "A different question: not whether a word is valid, but whether a letter finishes one.",
      kind: "stems",
      stemCount: 20,
      group: null,
      steps: ["teach", "quiz"],
      quiz: { size: 30, passAccuracy: 0.85 },
      built: true
    }
  ];

  var byId = {};
  LEVELS.forEach(function (l, i) {
    l.index = i;
    byId[l.id] = l;
  });

  function all() {
    return LEVELS;
  }

  function get(id) {
    return byId[id];
  }

  /* Status is derived, never stored: a level is unlocked when the one before it
     is complete. That keeps saved progress from disagreeing with a reordered
     path after an update. */
  function statusOf(level) {
    var saved = WT.store.levelState(level.id);
    if (saved.status === "complete") return "complete";
    if (level.index === 0) return "current";
    var prev = LEVELS[level.index - 1];
    var prevSaved = WT.store.levelState(prev.id);
    return prevSaved.status === "complete" ? "current" : "locked";
  }

  function wordsFor(level) {
    return level.group ? WT.groups.get(level.group) : [];
  }

  function complete(level, accuracy) {
    var prev = WT.store.levelState(level.id);
    WT.store.setLevelState(level.id, {
      status: "complete",
      bestAccuracy: Math.max(prev.bestAccuracy || 0, accuracy),
      attempts: (prev.attempts || 0) + 1,
      completedAt: new Date().toISOString()
    });
  }

  function recordAttempt(level, accuracy) {
    var prev = WT.store.levelState(level.id);
    WT.store.setLevelState(level.id, {
      status: prev.status === "complete" ? "complete" : "current",
      bestAccuracy: Math.max(prev.bestAccuracy || 0, accuracy),
      attempts: (prev.attempts || 0) + 1
    });
  }

  function overallProgress() {
    var done = LEVELS.filter(function (l) {
      return WT.store.levelState(l.id).status === "complete";
    }).length;
    return { done: done, total: LEVELS.length };
  }

  WT.levels = {
    all: all,
    get: get,
    statusOf: statusOf,
    wordsFor: wordsFor,
    complete: complete,
    recordAttempt: recordAttempt,
    overallProgress: overallProgress
  };
})(window.WT || (window.WT = {}));
