/* Word groups: named, reproducible slices of the lexicon.
   Every group is computed from the lexicon at load, so a group can never
   drift out of sync with the word list the quiz checks against.
   Exposes WT.groups. */
(function (WT) {
  "use strict";

  var VOWELS = "aeiou";
  var HIGH_VALUE = "jxzq";

  function vowelCount(w) {
    var n = 0;
    for (var i = 0; i < w.length; i++) if (VOWELS.indexOf(w[i]) !== -1) n++;
    return n;
  }

  /* Each definition returns an array of words. Kept as pure functions so a
     group can be re-derived and diffed against a previous build. */
  var DEFS = {
    "two-letter": {
      label: "All two-letter words",
      build: function (lex) {
        return lex.ofLength(2);
      }
    },
    "three-letter": {
      label: "All three-letter words",
      build: function (lex) {
        return lex.ofLength(3);
      }
    },
    "three-letter-common": {
      label: "Common three-letter words",
      build: function (lex) {
        // The only group that needs outside data: "common" is not something the
        // lexicon knows. WT_COMMON comes from SCOWL — see data/tiers.js.
        if (typeof WT_COMMON === "undefined" || !WT_COMMON["3"]) return [];
        var packed = WT_COMMON["3"];
        var out = [];
        for (var i = 0; i < packed.length; i += 3) {
          out.push(packed.substr(i, 3));
        }
        return out.filter(function (w) {
          return lex.has(w);
        });
      }
    },
    "three-from-two": {
      label: "Three-letter words built by hooking a two",
      build: function (lex) {
        var twos = lex.ofLength(2);
        var out = new Set();
        twos.forEach(function (w) {
          var h = lex.hooks(w);
          h.front.forEach(function (c) {
            out.add(c + w);
          });
          h.back.forEach(function (c) {
            out.add(w + c);
          });
        });
        return Array.from(out).sort();
      }
    },
    "q-without-u": {
      label: "Q without U",
      build: function (lex) {
        var out = [];
        lex.lengths().forEach(function (n) {
          lex.ofLength(n).forEach(function (w) {
            if (w.indexOf("q") !== -1 && w.indexOf("qu") === -1) out.push(w);
          });
        });
        return out.sort();
      }
    },
    "high-value-short": {
      label: "Short words using J, X, Z or Q",
      build: function (lex) {
        var out = [];
        [2, 3, 4].forEach(function (n) {
          lex.ofLength(n).forEach(function (w) {
            for (var i = 0; i < w.length; i++) {
              if (HIGH_VALUE.indexOf(w[i]) !== -1) {
                out.push(w);
                return;
              }
            }
          });
        });
        return out.sort();
      }
    },
    "vowel-heavy": {
      label: "Vowel-heavy words",
      build: function (lex) {
        var out = [];
        [3, 4, 5].forEach(function (n) {
          lex.ofLength(n).forEach(function (w) {
            // At least two-thirds vowels: the words that dump a clogged rack.
            if (vowelCount(w) * 3 >= w.length * 2) out.push(w);
          });
        });
        return out.sort();
      }
    }
  };

  var cache = {};

  function get(id) {
    if (!DEFS[id]) throw new Error("unknown word group: " + id);
    if (!cache[id]) cache[id] = DEFS[id].build(WT.lex);
    return cache[id];
  }

  function label(id) {
    return DEFS[id] ? DEFS[id].label : id;
  }

  function ids() {
    return Object.keys(DEFS);
  }

  WT.groups = { get: get, label: label, ids: ids };
})(window.WT || (window.WT = {}));
