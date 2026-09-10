/* Board strategy: reading the pre-generated choice puzzles.

   Every number a puzzle states was computed at build time by the same move
   generator and board auditor the rest of the app uses — see
   tools/build_strategy.js. Nothing here decides what is good; it reads what was
   measured and hands it to the screen.

   Exposes WT.strategy. */
(function (WT) {
  "use strict";

  function poolSize() {
    return typeof WT_STRATEGY === "undefined" ? 0 : WT_STRATEGY.length;
  }

  function decodeBoard(str) {
    var board = WT.board.create();
    for (var i = 0; i < str.length && i < board.cells.length; i++) {
      board.cells[i] = str[i] === "." ? null : str[i];
    }
    return board;
  }

  function decodePlay(str) {
    if (!str) return [];
    return str.split(";").map(function (part) {
      var bits = part.split(",");
      return { r: parseInt(bits[0], 10), c: parseInt(bits[1], 10), tile: bits[2] };
    });
  }

  function option(row, base) {
    return {
      placements: decodePlay(row[base]),
      word: row[base + 1],
      score: row[base + 2],
      leave: row[base + 3].split(""),
      leaveScore: row[base + 4],
      opens: row[base + 5]
    };
  }

  function get(index) {
    var n = poolSize();
    if (!n) return null;
    var i = ((index % n) + n) % n;
    var row = WT_STRATEGY[i];
    return {
      index: i,
      board: decodeBoard(row[0]),
      rack: row[1].split(""),
      theirRack: row[2].split(""),
      greedy: option(row, 3),
      better: option(row, 9),
      kind: row[15] // "leave" or "opens" — what the better play is better AT
    };
  }

  /* The two options in a stable but non-obvious order, so the higher-scoring
     one is not always on the same side. Seeded by index: the same puzzle always
     presents the same way, which matters if someone comes back to it. */
  function optionsFor(puzzle) {
    var greedyFirst = puzzle.index % 2 === 0;
    return greedyFirst
      ? [puzzle.greedy, puzzle.better]
      : [puzzle.better, puzzle.greedy];
  }

  function isBetter(puzzle, option) {
    return option === puzzle.better;
  }

  /* The sentence that explains WHY, built from measured numbers only. */
  function verdict(puzzle) {
    var cost = puzzle.greedy.score - puzzle.better.score;
    if (puzzle.kind === "opens") {
      var saved = puzzle.greedy.opens - puzzle.better.opens;
      return (
        puzzle.greedy.word + " scores " + cost + " more, but it leaves a board " +
        "where they could answer for " + puzzle.greedy.opens + ". " +
        puzzle.better.word + " holds them to " + puzzle.better.opens + " — " +
        saved + " points of danger removed for " + cost + " given up."
      );
    }
    return (
      puzzle.greedy.word + " scores " + cost + " more, but look at what each " +
      "leaves you holding. " + puzzle.better.word + " keeps a rack you can " +
      "actually play next turn."
    );
  }

  /* Progress is per-puzzle, not a score: this is study, not a test. */
  function seen() {
    return WT.store.strategySeen();
  }

  function record(index, correct) {
    return WT.store.recordStrategy(index, correct);
  }

  function stats() {
    var all = WT.store.strategyAll();
    var keys = Object.keys(all);
    var right = keys.filter(function (k) { return all[k].correct; }).length;
    return { pool: poolSize(), attempted: keys.length, right: right };
  }

  /* The next puzzle worth showing: unseen first, then ones got wrong. */
  function nextIndex() {
    var all = WT.store.strategyAll();
    var n = poolSize();
    var i;
    for (i = 0; i < n; i++) {
      if (!all[i]) return i;
    }
    for (i = 0; i < n; i++) {
      if (all[i] && !all[i].correct) return i;
    }
    return n ? Math.floor(Math.random() * n) : -1;
  }

  WT.strategy = {
    poolSize: poolSize,
    get: get,
    optionsFor: optionsFor,
    isBetter: isBetter,
    verdict: verdict,
    seen: seen,
    record: record,
    stats: stats,
    nextIndex: nextIndex
  };
})(window.WT || (window.WT = {}));
