/* What you keep: judging the tiles left on the rack after a play.

   WHAT THIS IS, AND WHAT IT IS EMPHATICALLY NOT
   Serious engines judge a leave with an *equity table* — a number per rack
   combination, derived from millions of simulated games. That data is not
   something this project has, and inventing numbers that look like equity would
   be the worst of both worlds: authoritative-looking and unfounded.

   So this is a small, transparent, additive rubric built from the principles
   every beginner guide agrees on, and — this is the important part — it shows
   its working. Every screen that uses it prints the reasons, not the number
   alone. A player can disagree with a term and still learn what the terms are.

   The principles, and where each comes from being uncontested rather than from
   a source this project cannot verify:
     - Vowel/consonant balance. An all-consonant or all-vowel leave plays badly.
     - S and the blank are the two most useful tiles to hold back.
     - Duplicates are dead weight.
     - Q without a U is a liability.
     - V is the awkward one: it makes no two-letter word at all.

   The scale is deliberately unitless and small. It is a comparison tool for two
   candidate leaves in the same position, not a points-equivalent, and nothing
   in the app converts it to points.

   Exposes WT.leave. */
(function (WT) {
  "use strict";

  var VOWELS = "AEIOU";

  function isVowel(t) {
    return VOWELS.indexOf(String(t).toUpperCase()) !== -1;
  }

  function counts(rack) {
    var c = {};
    rack.forEach(function (t) {
      var k = String(t).toUpperCase();
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }

  /* evaluate(rack) -> { score, reasons: [{ text, delta }] }
     `rack` is the tiles LEFT, not the tiles played. */
  function evaluate(rack) {
    var tiles = (rack || []).map(function (t) { return String(t).toUpperCase(); });
    var reasons = [];
    var score = 0;

    function note(text, delta) {
      if (!delta) return;
      score += delta;
      reasons.push({ text: text, delta: delta });
    }

    if (!tiles.length) {
      return { score: 0, reasons: [{ text: "Nothing left — you played out.", delta: 0 }], empty: true };
    }

    var c = counts(tiles);
    var vowels = tiles.filter(isVowel).length;
    var consonants = tiles.length - vowels - (c["_"] || 0);

    // Balance. The ideal is close to even; the penalty grows with the gap.
    var gap = Math.abs(vowels - consonants);
    if (tiles.length >= 3) {
      if (gap === 0) note("Vowels and consonants are balanced", 3);
      else if (gap === 1) note("Nearly balanced", 2);
      else if (gap >= 4) note(vowels > consonants ? "Far too many vowels" : "Almost no vowels", -5);
      else if (gap >= 2) note(vowels > consonants ? "Vowel-heavy" : "Consonant-heavy", -2);
    }
    if (tiles.length >= 4 && vowels === 0) note("No vowel at all", -3);
    if (tiles.length >= 4 && consonants === 0) note("No consonant at all", -3);

    // The two tiles worth holding.
    if (c["_"]) note(c["_"] > 1 ? "Keeps both blanks" : "Keeps the blank", c["_"] * 6);
    if (c.S) note(c.S > 1 ? "Keeps " + c.S + " S's" : "Keeps the S", c.S === 1 ? 4 : 3);

    // Duplicates are dead weight — except a second S, already counted above.
    var dupes = 0;
    Object.keys(c).forEach(function (k) {
      if (k === "S" || k === "_") return;
      if (c[k] > 1) dupes += c[k] - 1;
    });
    if (dupes) note(dupes === 1 ? "A duplicated letter" : dupes + " duplicated letters", -2 * dupes);

    // The specific awkward holdings.
    if (c.Q && !c.U) note("Q with no U", -6);
    if (c.Q && c.U) note("Q, but with its U", -2);
    if (c.V) note(c.V > 1 ? "Two V's — V makes no two-letter word" : "V makes no two-letter word", -3 * c.V);

    // Too much heavy artillery: high-value consonants that fight each other.
    var clunky = ["J", "K", "X", "Z", "W", "C", "B", "F", "H", "M", "P", "Y"].reduce(
      function (n, k) { return n + (c[k] || 0); }, 0
    );
    if (clunky >= 4) note("Too many awkward consonants at once", -3);

    if (!reasons.length) note("Nothing much either way", 0);
    return { score: score, reasons: reasons, vowels: vowels, consonants: consonants };
  }

  /* The rack left after spending a play's tiles. Mirrors WT.game's cost rule:
     a lowercase placement is a blank, so it costs "_". */
  function after(rack, placements) {
    var left = rack.slice();
    (placements || []).forEach(function (p) {
      var t = p.tile;
      var need = t === t.toLowerCase() && t !== t.toUpperCase() ? "_" : t.toUpperCase();
      var at = left.indexOf(need);
      if (at !== -1) left.splice(at, 1);
    });
    return left;
  }

  /* A one-line verdict for a leave, for when there is no room for the reasons. */
  function describe(result) {
    if (result.empty) return "Played out";
    if (result.score >= 6) return "A strong leave";
    if (result.score >= 2) return "A decent leave";
    if (result.score >= -1) return "An ordinary leave";
    if (result.score >= -5) return "An awkward leave";
    return "A bad leave";
  }

  WT.leave = {
    evaluate: evaluate,
    after: after,
    describe: describe,
    isVowel: isVowel
  };
})(window.WT || (window.WT = {}));
