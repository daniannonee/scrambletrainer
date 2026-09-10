/* Prefix trie over the lexicon, for the move generator.

   The generator walks letter by letter and needs three questions answered
   thousands of times per search:

     is this node a word end?      isWord(node)
     can this letter continue?     child(node, letter)
     which letters can continue?   letters(node)

   A Set of words answers the first cheaply and the other two not at all, which
   is why this exists alongside WT.lex rather than replacing it.

   Nodes are plain objects keyed by uppercase letter, with `$` marking a word
   end. Measured on the full 168,551-word board lexicon: ~270ms to build and
   ~23MB of heap in V8 — cheap enough to build lazily on the device rather than
   ship a packed structure. Building is lazy and cached: nothing pays for it
   until a board mode opens.

   Everything here is UPPERCASE. Board cells store blanks as lowercase (see
   js/board.js), so callers uppercase before asking. Exposes WT.trie. */
(function (WT) {
  "use strict";

  var END = "$";
  var cache = null;
  var cachedKey = null;

  function build(words) {
    var root = {};
    for (var i = 0; i < words.length; i++) {
      var w = words[i].toUpperCase();
      var node = root;
      for (var j = 0; j < w.length; j++) {
        var ch = w[j];
        node = node[ch] || (node[ch] = {});
      }
      node[END] = 1;
    }
    return root;
  }

  /* The trie over every word that can fit on a board. Built once, then reused.
     `opts.maxLength` lets a caller ask for a smaller trie (the tests use short
     ones so they run instantly). */
  function root(opts) {
    var o = opts || {};
    var key = (o.minLength || 2) + ":" + (o.maxLength || 15);
    if (cache && cachedKey === key) return cache;
    cache = build(
      WT.lex.words({ minLength: o.minLength || 2, maxLength: o.maxLength || 15 })
    );
    cachedKey = key;
    return cache;
  }

  function child(node, letter) {
    if (!node) return null;
    return node[letter] || null;
  }

  function isWord(node) {
    return !!(node && node[END]);
  }

  /* Every letter that can follow this node. The move generator uses this to try
     only letters that continue a real word — which is what keeps a blank from
     exploding the search into 26 branches at every square. */
  function letters(node) {
    if (!node) return [];
    var out = [];
    for (var k in node) {
      if (k !== END && node.hasOwnProperty(k)) out.push(k);
    }
    return out;
  }

  /* Walk a whole prefix. Returns the node, or null if the prefix is dead. */
  function walk(node, prefix) {
    var n = node;
    var p = String(prefix).toUpperCase();
    for (var i = 0; i < p.length && n; i++) n = child(n, p[i]);
    return n || null;
  }

  function has(node, word) {
    return isWord(walk(node, word));
  }

  function reset() {
    cache = null;
    cachedKey = null;
  }

  WT.trie = {
    build: build,
    root: root,
    child: child,
    isWord: isWord,
    letters: letters,
    walk: walk,
    has: has,
    reset: reset,
    END: END
  };
})(window.WT || (window.WT = {}));
