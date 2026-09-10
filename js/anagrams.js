/* Anagram puzzles, derived from the lexicon.

   A puzzle is a set of letters and every word that can be spelled with all of
   them. Both halves come from the word list itself, so a puzzle can never have
   an answer the rest of the app would reject.

   Puzzle words are drawn from WT_COMMON (see data/tiers.js) rather than the
   whole lexicon: unscrambling a word nobody has heard of is not a puzzle, it is
   a trick. Answers, though, are checked against the FULL lexicon — if you find
   a valid word we did not pick, you are right and the app should say so.

   Exposes WT.anagrams. Indexes are built lazily, per length. */
(function (WT) {
  "use strict";

  var LENGTHS = [4, 5, 6, 7];
  var cache = Object.create(null);

  function alphagram(word) {
    return word.split("").sort().join("");
  }

  function unpack(packed, n) {
    var out = [];
    for (var i = 0; i < packed.length; i += n) out.push(packed.substr(i, n));
    return out;
  }

  function commonAt(n) {
    if (typeof WT_COMMON === "undefined" || !WT_COMMON[String(n)]) return [];
    return unpack(WT_COMMON[String(n)], n);
  }

  function index(n) {
    if (cache[n]) return cache[n];
    var all = WT.lex.ofLength(n);
    var byAlpha = Object.create(null); // every word, so answers are judged fairly
    for (var i = 0; i < all.length; i++) {
      var a = alphagram(all[i]);
      if (byAlpha[a]) byAlpha[a].push(all[i]);
      else byAlpha[a] = [all[i]];
    }
    // Puzzles are only set from words a person might plausibly know.
    var seeds = commonAt(n).filter(function (w) {
      return WT.lex.has(w);
    });
    var puzzleAlphas = Object.keys(
      seeds.reduce(function (acc, w) {
        acc[alphagram(w)] = 1;
        return acc;
      }, Object.create(null))
    );
    cache[n] = { byAlpha: byAlpha, puzzleAlphas: puzzleAlphas, seeds: seeds };
    return cache[n];
  }

  function lengths() {
    return LENGTHS.filter(function (n) {
      return commonAt(n).length > 20;
    });
  }

  function count(n) {
    return index(n).puzzleAlphas.length;
  }

  /* Shuffle the letters, but never hand back the answer already spelled, and
     avoid leaving a letter where it started when there is a choice. */
  function scramble(alpha, rand) {
    var solutions = index(alpha.length).byAlpha[alpha] || [];
    var letters = alpha.split("");
    for (var attempt = 0; attempt < 40; attempt++) {
      for (var i = letters.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var t = letters[i];
        letters[i] = letters[j];
        letters[j] = t;
      }
      var s = letters.join("");
      if (solutions.indexOf(s) === -1) return s;
    }
    return letters.join("");
  }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* round({ length, size, seed }) -> [{ scrambled, alphagram, answers }] */
  function round(opts) {
    var n = opts.length;
    var idx = index(n);
    var rand = rng(opts.seed == null ? (Date.now() & 0x7fffffff) : opts.seed);
    var pool = idx.puzzleAlphas.slice();
    var out = [];
    var size = Math.min(opts.size || 10, pool.length);
    for (var k = 0; k < size; k++) {
      var pick = Math.floor(rand() * pool.length);
      var alpha = pool.splice(pick, 1)[0];
      out.push({
        alphagram: alpha,
        scrambled: scramble(alpha, rand),
        answers: (idx.byAlpha[alpha] || []).slice().sort()
      });
    }
    return out;
  }

  /* Is `guess` a correct solution to this puzzle? It must use every letter and
     be a real word — checked against the whole lexicon, not just the seeds. */
  function check(puzzle, guess) {
    var g = String(guess || "").toLowerCase();
    if (g.length !== puzzle.alphagram.length) return false;
    if (alphagram(g) !== puzzle.alphagram) return false;
    return WT.lex.has(g);
  }

  WT.anagrams = {
    lengths: lengths,
    count: count,
    round: round,
    check: check,
    alphagram: alphagram
  };
})(window.WT || (window.WT = {}));
