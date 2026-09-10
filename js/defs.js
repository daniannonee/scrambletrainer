/* Definition lookup. Two layers, hand-authored wins.

     data/definitions.js  hand-authored, always correct for the sense a player
                          needs. Small.
     data/defs_auto.js    WordNet's first sense, only for words ordinary enough
                          that the first sense is trustworthy. Large.

   Anything in neither has no definition, and screens are expected to cope
   rather than print a placeholder. Exposes WT.defs. */
(function (WT) {
  "use strict";

  function direct(w) {
    var d = typeof WT_DEFS !== "undefined" ? WT_DEFS[w] : null;
    if (d) return { pos: d[0], text: d[1], source: "authored" };
    d = typeof WT_DEFS_AUTO !== "undefined" ? WT_DEFS_AUTO[w] : null;
    if (d) return { pos: d[0], text: d[1], source: "wordnet" };
    return null;
  }

  /* Both dictionaries define base words, not inflections: SPUR is there, SPURS
     is not. Rather than leave a third of the drill's words unexplained, fall
     back to a plausible base and say plainly that is what happened. The
     relationship is deliberately vague — "a form of" — because guessing whether
     something is a plural or a verb tense from spelling alone is unreliable. */
  function baseCandidates(w) {
    var out = [];
    if (/(ies)$/.test(w)) out.push(w.slice(0, -3) + "y");
    if (/(es)$/.test(w)) out.push(w.slice(0, -2));
    if (/s$/.test(w)) out.push(w.slice(0, -1));
    if (/ed$/.test(w)) {
      out.push(w.slice(0, -2), w.slice(0, -1));
      if (w.length > 4 && w[w.length - 3] === w[w.length - 4]) out.push(w.slice(0, -3));
    }
    if (/ing$/.test(w)) {
      out.push(w.slice(0, -3), w.slice(0, -3) + "e");
      if (w.length > 5 && w[w.length - 4] === w[w.length - 5]) out.push(w.slice(0, -4));
    }
    if (/(er|est)$/.test(w)) out.push(w.replace(/(er|est)$/, ""));
    return out.filter(function (b) {
      return b.length >= 2 && b !== w;
    });
  }

  function get(word) {
    var w = String(word || "").toLowerCase();
    var d = direct(w);
    if (d) return d;

    var bases = baseCandidates(w);
    for (var i = 0; i < bases.length; i++) {
      var b = bases[i];
      if (!WT.lex.has(b)) continue;
      var bd = direct(b);
      if (!bd) continue;
      return {
        pos: bd.pos,
        text: "a form of " + b + " — " + bd.text,
        source: "derived",
        base: b
      };
    }
    return null;
  }

  function has(word) {
    return get(word) !== null;
  }

  /* How much of a word list we can actually explain. Used by the tests and
     worth knowing before deciding a level is finished. */
  function coverage(words) {
    var authored = 0;
    var auto = 0;
    words.forEach(function (w) {
      var d = get(w);
      if (!d) return;
      if (d.source === "authored") authored++;
      else auto++;
    });
    return {
      total: words.length,
      defined: authored + auto,
      authored: authored,
      auto: auto
    };
  }

  WT.defs = { get: get, has: has, coverage: coverage };
})(window.WT || (window.WT = {}));
