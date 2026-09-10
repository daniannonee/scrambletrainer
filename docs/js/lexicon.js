/* Lexicon: turns the packed WT_LEX strings into fast lookups.
   No dependencies. Exposes WT.lex. */
(function (WT) {
  "use strict";

  var ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
  var MAX_SHORT = 8; // data/lexicon.js stops here; the rest is lexicon_long.js

  var byLength = {}; // n -> [word, ...]
  var sets = {}; // n -> Set of words of that length
  var all = null; // Set of every shipped word
  var ready = false;
  var longReady = false; // 9-15 letter words, only for board play

  function unpack(packed, n) {
    var out = new Array(Math.floor(packed.length / n));
    for (var i = 0, k = 0; i < packed.length; i += n, k++) {
      out[k] = packed.substr(i, n);
    }
    return out;
  }

  function init() {
    if (ready) return;
    if (typeof WT_LEX === "undefined") {
      throw new Error("lexicon data not loaded — check the data/lexicon.js script tag");
    }
    all = new Set();
    Object.keys(WT_LEX).forEach(function (key) {
      var n = parseInt(key, 10);
      var words = unpack(WT_LEX[key], n);
      byLength[n] = words;
      sets[n] = new Set(words);
      for (var i = 0; i < words.length; i++) all.add(words[i]);
    });
    ready = true;
  }

  /* The long tail lives in its own file so the study modes never pay for it.
     Unpacking is triggered automatically the first time anything asks about a
     word longer than eight letters, so callers never have to remember. */
  function initLong() {
    if (longReady) return true;
    init();
    if (typeof WT_LEX_LONG === "undefined") return false;
    Object.keys(WT_LEX_LONG).forEach(function (key) {
      var n = parseInt(key, 10);
      var words = unpack(WT_LEX_LONG[key], n);
      byLength[n] = words;
      sets[n] = new Set(words);
      for (var i = 0; i < words.length; i++) all.add(words[i]);
    });
    longReady = true;
    return true;
  }

  /* Is this string a valid word in the shipped lexicon? */
  function has(word) {
    init();
    var w = String(word || "").toLowerCase();
    if (w.length > MAX_SHORT && !longReady) initLong();
    return all.has(w);
  }

  /* Every word of a given length, alphabetical. Returns a copy. */
  function ofLength(n) {
    init();
    if (n > MAX_SHORT) initLong();
    return (byLength[n] || []).slice();
  }

  /* Every word the app can see, for building a trie. Pulls in the long tail. */
  function words(opts) {
    init();
    var o = opts || {};
    if ((o.maxLength || 15) > MAX_SHORT) initLong();
    var lo = o.minLength || 1;
    var hi = o.maxLength || (longReady ? 15 : MAX_SHORT);
    var out = [];
    for (var n = lo; n <= hi; n++) {
      var ws = byLength[n];
      if (ws) out.push.apply(out, ws);
    }
    return out;
  }

  function lengths() {
    init();
    return Object.keys(byLength)
      .map(Number)
      .filter(function (n) {
        return byLength[n].length > 0;
      })
      .sort(function (a, b) {
        return a - b;
      });
  }

  function count(n) {
    init();
    return n == null ? all.size : (byLength[n] || []).length;
  }

  /* Letters that make a longer word when stuck on the front / back of `word`.
     Derived from the lexicon itself, so it is always consistent with it. */
  function hooks(word) {
    init();
    var w = String(word).toLowerCase();
    var front = [];
    var back = [];
    for (var i = 0; i < ALPHABET.length; i++) {
      var c = ALPHABET[i];
      if (all.has(c + w)) front.push(c);
      if (all.has(w + c)) back.push(c);
    }
    return { front: front, back: back };
  }

  WT.lex = {
    init: init,
    initLong: initLong,
    words: words,
    maxLength: function () {
      return longReady ? 15 : MAX_SHORT;
    },
    has: has,
    ofLength: ofLength,
    lengths: lengths,
    count: count,
    hooks: hooks,
    alphabet: ALPHABET
  };
})(window.WT || (window.WT = {}));
