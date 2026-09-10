/* Quiz engine: "is this a valid word?"
   Pure logic — it knows nothing about the DOM. Exposes WT.quiz. */
(function (WT) {
  "use strict";

  /* Strings that are valid in current tournament word lists but absent from
     ENABLE. We never show these as decoys, because our answer would contradict
     what a studying player will be told everywhere else. Erring wide is safe:
     the only cost of an extra entry here is one fewer decoy candidate.

     The eleven NWL two-letter words ENABLE lacks used to live here. They are now
     in the lexicon proper via tools/supplement.json, so they are taught and
     quizzed like any other word. What remains is what we have NOT verified.
     See PROVENANCE.md, "Lexicon edges". */
  var AMBIGUOUS = new Set([
    // Plurals of the supplemented twos that we looked for in the NWL23 cheat
    // sheet and did NOT find. Absence there is decent but not conclusive
    // evidence, so we neither teach them nor call them non-words.
    "ois", "oks", "ews",
    // Valid in the Collins list, absent from ENABLE. Not checked against a
    // primary Collins source — kept wide on purpose.
    "ch", "ea", "ee", "io", "ny", "ob", "oo", "st", "ug", "ur", "zo"
  ]);

  var ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

  /* Small deterministic RNG (mulberry32) so a quiz can be replayed exactly. */
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

  function shuffle(arr, rand) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /* Decoys are real words with one letter changed, kept only if the result is
     not itself a word. Near-misses are the whole point: "iv" teaches more than
     "qz" does. */
  function makeDecoys(words, wanted, rand, lex) {
    var seen = new Set();
    var out = [];
    var attempts = 0;
    var maxAttempts = wanted * 200 + 500;
    while (out.length < wanted && attempts < maxAttempts) {
      attempts++;
      var base = words[Math.floor(rand() * words.length)];
      var pos = Math.floor(rand() * base.length);
      var letter = ALPHABET[Math.floor(rand() * 26)];
      if (letter === base[pos]) continue;
      var candidate = base.substring(0, pos) + letter + base.substring(pos + 1);
      if (seen.has(candidate)) continue;
      if (lex.has(candidate)) continue;
      if (AMBIGUOUS.has(candidate)) continue;
      seen.add(candidate);
      out.push(candidate);
    }
    return out;
  }

  /* create({ words, size, decoyShare, seed })
       words      - the valid words this quiz draws from
       size       - how many questions (capped by what is available)
       decoyShare - fraction of questions that are non-words (default 0.5)
       seed       - integer; same seed gives the same quiz  */
  function create(opts) {
    var lex = WT.lex;
    var words = (opts.words || []).slice();
    var decoyShare = opts.decoyShare == null ? 0.5 : opts.decoyShare;
    var seed = opts.seed == null ? (Date.now() & 0x7fffffff) : opts.seed;
    var rand = rng(seed);

    var size = Math.min(opts.size || 20, words.length * 2);
    var decoyCount = Math.round(size * decoyShare);
    var realCount = size - decoyCount;

    var reals = shuffle(words, rand).slice(0, realCount);
    var decoys = makeDecoys(words, decoyCount, rand, lex);

    var items = shuffle(
      reals
        .map(function (w) {
          return { text: w, isWord: true };
        })
        .concat(
          decoys.map(function (w) {
            return { text: w, isWord: false };
          })
        ),
      rand
    );

    var index = 0;
    var answers = []; // { text, isWord, said, correct }

    return {
      seed: seed,
      total: items.length,

      current: function () {
        return index < items.length ? items[index] : null;
      },

      position: function () {
        return index;
      },

      /* said === true means the player claimed it is a word. */
      answer: function (said) {
        var item = items[index];
        if (!item) return null;
        var record = {
          text: item.text,
          isWord: item.isWord,
          said: !!said,
          correct: !!said === item.isWord
        };
        answers.push(record);
        index++;
        return record;
      },

      done: function () {
        return index >= items.length;
      },

      /* Results, including the two failure modes kept apart: words you did not
         know, and non-words you accepted. They need different study. */
      results: function () {
        var correct = answers.filter(function (a) {
          return a.correct;
        }).length;
        return {
          total: answers.length,
          correct: correct,
          accuracy: answers.length ? correct / answers.length : 0,
          missedWords: answers
            .filter(function (a) {
              return a.isWord && !a.correct;
            })
            .map(function (a) {
              return a.text;
            }),
          falseAccepts: answers
            .filter(function (a) {
              return !a.isWord && !a.correct;
            })
            .map(function (a) {
              return a.text;
            }),
          answers: answers.slice()
        };
      }
    };
  }

  WT.quiz = { create: create, AMBIGUOUS: AMBIGUOUS };
})(window.WT || (window.WT = {}));
