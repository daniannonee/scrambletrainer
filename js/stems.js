/* Bingo stems, derived from the lexicon rather than sourced.

   A stem is six letters that combine with many of the remaining twenty-six to
   make a seven-letter word. That is a countable property of the word list, so
   there is nothing to source and nothing that can drift: change the lexicon and
   the stems change with it.

   Method: take every seven-letter word, sort its letters, and for each position
   drop one letter to get a six-letter alphagram plus the letter that was
   dropped. A stem's score is how many distinct letters work.

   Exposes WT.stems. Computation is lazy — level 10 is the only caller. */
(function (WT) {
  "use strict";

  var cache = null;
  var sevensByAlpha = null;

  function alphagram(word) {
    return word.split("").sort().join("");
  }

  function unpack(packed, n) {
    var out = [];
    for (var i = 0; i < packed.length; i += n) out.push(packed.substr(i, n));
    return out;
  }

  function build() {
    var lex = WT.lex;
    var sevens = lex.ofLength(7);

    // alphagram -> the seven-letter words that spell it
    sevensByAlpha = Object.create(null);
    for (var i = 0; i < sevens.length; i++) {
      var a = alphagram(sevens[i]);
      if (sevensByAlpha[a]) sevensByAlpha[a].push(sevens[i]);
      else sevensByAlpha[a] = [sevens[i]];
    }

    // six-letter alphagram -> the letters that complete it. Only the letters are
    // stored; the words are looked back up on demand, which keeps this small
    // enough to run on a phone.
    var stems = Object.create(null);
    var alphas = Object.keys(sevensByAlpha);
    for (var k = 0; k < alphas.length; k++) {
      var g = alphas[k];
      var last = "";
      for (var p = 0; p < g.length; p++) {
        var dropped = g[p];
        if (dropped === last) continue; // alphagram is sorted, so dupes adjoin
        last = dropped;
        var six = g.slice(0, p) + g.slice(p + 1);
        var cur = stems[six];
        if (cur === undefined) stems[six] = dropped;
        else if (cur.indexOf(dropped) === -1) stems[six] = cur + dropped;
      }
    }

    // A recognisable six-letter word to name the stem by. AEINST is far easier
    // to hold on to as TISANE than as TENIAS, so prefer ordinary English (see
    // WT_COMMON in data/tiers.js) and fall back to any anagram.
    var common6 = new Set(
      typeof WT_COMMON !== "undefined" && WT_COMMON["6"] ? unpack(WT_COMMON["6"], 6) : []
    );
    var known6 =
      typeof WT_KNOWN6 !== "undefined" ? new Set(unpack(WT_KNOWN6, 6)) : new Set();
    function rank(w) {
      return common6.has(w) ? 0 : known6.has(w) ? 1 : 2;
    }
    var namesByAlpha = Object.create(null);
    var sixes = lex.ofLength(6);
    for (var j = 0; j < sixes.length; j++) {
      var sa = alphagram(sixes[j]);
      if (namesByAlpha[sa]) namesByAlpha[sa].push(sixes[j]);
      else namesByAlpha[sa] = [sixes[j]];
    }
    Object.keys(namesByAlpha).forEach(function (sa) {
      namesByAlpha[sa].sort(function (a, b) {
        return rank(a) - rank(b) || a.localeCompare(b);
      });
    });

    var list = Object.keys(stems).map(function (six) {
      var letters = stems[six].split("").sort();
      var names = namesByAlpha[six] || [];
      // Every recognisable word the stem spells, best-known first. Listing
      // them beats picking one: TINEAS and TISANE are equally good names for
      // AEINST and there is no signal that separates them, so show both.
      var known = names.filter(function (w) {
        return rank(w) < 2;
      });
      return {
        alphagram: six,
        name: known.length ? known[0] : names.length ? names[0] : six,
        names: known,
        aliases: names,
        familiar: known.length > 0,
        letters: letters,
        score: letters.length
      };
    });

    list.sort(function (a, b) {
      return b.score - a.score || a.alphagram.localeCompare(b.alphagram);
    });
    return list;
  }

  function all() {
    if (!cache) cache = build();
    return cache;
  }

  /* The highest-yield stems, best first. The stem itself is the alphagram —
     that is what you actually hold in your head at the board — and `name` is a
     mnemonic when a recognisable anagram exists. Filtering to stems with a
     familiar name would drop AEINST, the single best stem in the language,
     because TISANE is an uncommon word. */
  function top(n) {
    return all().slice(0, n || 20);
  }

  function get(alphagramOrName) {
    var key = String(alphagramOrName).toLowerCase();
    var sorted = alphagram(key);
    return (
      all().filter(function (s) {
        return s.alphagram === sorted || s.alphagram === key;
      })[0] || null
    );
  }

  /* Does stem + letter make a seven? Answered from the lexicon, so it cannot
     disagree with the rest of the app. */
  function works(stem, letter) {
    var s = typeof stem === "string" ? get(stem) : stem;
    if (!s) return false;
    return s.letters.indexOf(String(letter).toLowerCase()) !== -1;
  }

  /* Looked up rather than stored — see build(). */
  function wordsFor(stem, letter) {
    var s = typeof stem === "string" ? get(stem) : stem;
    if (!s) return [];
    all(); // make sure sevensByAlpha exists
    var key = alphagram(s.alphagram + String(letter).toLowerCase());
    return (sevensByAlpha[key] || []).slice().sort();
  }

  WT.stems = { all: all, top: top, get: get, works: works, wordsFor: wordsFor, alphagram: alphagram };
})(window.WT || (window.WT = {}));
