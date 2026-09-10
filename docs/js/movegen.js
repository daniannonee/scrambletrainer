/* Move generator: every legal placement for a rack on a board.

   Appel & Jacobson's anchor algorithm. For each anchor square, build every
   possible left part from rack tiles, then extend right through the trie,
   pruning against cross-check sets so a branch dies the moment it would make an
   invalid perpendicular word.

   THE AXIS RULE, which is the whole defence against the bug that made this hard
   the first time: this file searches HORIZONTALLY and computes cross-checks
   VERTICALLY, always, in whatever board it is handed. Vertical moves come from
   handing it a transposed board and mapping the results back. There is no "H"
   or "V" flag anywhere in the search, so there is nothing to get backwards.

   Exposes WT.movegen. */
(function (WT) {
  "use strict";

  var B = WT.board;
  var T = WT.trie;
  var SIZE = 15;
  var BLANK = "_";
  var ALL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  /* --- cross-checks -------------------------------------------------- *
     For every empty square: which letters could sit here without breaking the
     VERTICAL word they would join? A square with no vertical neighbours allows
     everything. Computed from the board it is given, in that board's own
     coordinates — see the axis rule above.                                */

  function crossChecks(board, root) {
    var checks = new Array(SIZE * SIZE);
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var i = r * SIZE + c;
        if (!B.isEmpty(board, r, c)) {
          checks[i] = null;
          continue;
        }
        var above = "";
        var rr = r - 1;
        while (B.at(board, rr, c) != null) {
          above = B.letterAt(board, rr, c) + above;
          rr--;
        }
        var below = "";
        rr = r + 1;
        while (B.at(board, rr, c) != null) {
          below += B.letterAt(board, rr, c);
          rr++;
        }
        if (!above && !below) {
          checks[i] = null; // no vertical neighbour: anything goes
          continue;
        }
        var allowed = Object.create(null);
        for (var k = 0; k < 26; k++) {
          var ch = ALL_LETTERS[k];
          if (T.has(root, above + ch + below)) allowed[ch] = true;
        }
        checks[i] = allowed;
      }
    }
    return checks;
  }

  function allows(checks, r, c, letter) {
    var set = checks[r * SIZE + c];
    return set === null || set === undefined ? true : !!set[letter];
  }

  /* --- anchors ------------------------------------------------------- */

  function anchorSet(board) {
    var anchors = Object.create(null);
    if (B.isBoardEmpty(board)) {
      anchors[B.CENTER * SIZE + B.CENTER] = true;
      return anchors;
    }
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (!B.isEmpty(board, r, c)) continue;
        if (
          B.at(board, r - 1, c) != null ||
          B.at(board, r + 1, c) != null ||
          B.at(board, r, c - 1) != null ||
          B.at(board, r, c + 1) != null
        ) {
          anchors[r * SIZE + c] = true;
        }
      }
    }
    return anchors;
  }

  /* How far left of an anchor we may build a left part from the rack.
     It stops at the board edge, at a filled square, AND at another anchor —
     the last one matters: without it, this anchor's search can lay a tile flush
     against a filled square that the neighbouring anchor owns, quietly ignoring
     the letter already sitting there. */
  function freeLeft(board, anchors, r, c) {
    var n = 0;
    var cc = c - 1;
    while (cc >= 0 && B.isEmpty(board, r, cc) && !anchors[r * SIZE + cc]) {
      n++;
      cc--;
    }
    return n;
  }

  /* --- the search ---------------------------------------------------- */

  /* generate(board, rack, opts) -> [{ row, col, direction, word, tiles, placements, score }]
       rack   array of tiles, "_" for a blank
       opts   { root, maxResults, allowBlanksInLeftPart } */
  function generate(board, rack, opts) {
    var o = opts || {};
    var root = o.root || T.root();
    var moves = [];

    // Hand the real board down so a found move can be scored against it
    // directly, rather than transposing back once per candidate.
    var ctx = {
      root: root,
      board: board,
      isValidWord: o.isValidWord,
      allowBlanksInLeftPart: o.allowBlanksInLeftPart
    };

    collect(board, rack, root, ctx, false, moves);
    collect(B.transpose(board), rack, root, ctx, true, moves);

    // Both passes can find the same one-tile play (it reads the same across and
    // down when the tile has neighbours on both axes). Keep one of each.
    var seen = Object.create(null);
    var unique = [];
    moves.forEach(function (m) {
      var key =
        m.word + "|" + m.row + "|" + m.col + "|" + m.direction + "|" +
        m.placements.map(function (p) { return p.r + "," + p.c + p.tile; }).join(";");
      if (seen[key]) return;
      seen[key] = true;
      unique.push(m);
    });

    unique.sort(function (a, b) {
      return b.score - a.score || a.word.localeCompare(b.word);
    });
    return o.maxResults ? unique.slice(0, o.maxResults) : unique;
  }

  function collect(board, rack, root, o, transposed, out) {
    var anchors = anchorSet(board);
    var checks = crossChecks(board, root);
    var allowBlankLeft = !!o.allowBlanksInLeftPart;

    Object.keys(anchors).forEach(function (key) {
      var idx = parseInt(key, 10);
      var r = Math.floor(idx / SIZE);
      var c = idx % SIZE;

      // If the square to the left already holds a tile, the left part is fixed:
      // it is whatever is written there.
      if (!B.isEmpty(board, r, c - 1) && B.at(board, r, c - 1) != null) {
        var prefix = "";
        var cc = c - 1;
        while (B.at(board, r, cc) != null) {
          prefix = B.letterAt(board, r, cc) + prefix;
          cc--;
        }
        var node = T.walk(root, prefix);
        if (node) {
          extendRight(
            board, checks, anchors, root, node, prefix, rack.slice(), [],
            r, c, c - prefix.length, transposed, o, out
          );
        }
        return;
      }

      var limit = freeLeft(board, anchors, r, c);
      leftPart(
        board, checks, anchors, root, root, "", rack.slice(), [],
        limit, r, c, transposed, o, out, allowBlankLeft
      );
    });
  }

  /* Build the part of the word that sits left of the anchor, from rack tiles
     only. This phase cannot be pruned by the trie the way extendRight can — we
     do not know the path is real until it is walked — so a blank here means 26
     live branches at every square, which is where generation time explodes on a
     busy board. Blanks are therefore off by default in this phase; they still
     reach the board through extendRight, which is prunable. */
  function leftPart(
    board, checks, anchors, root, node, partial, rack, used,
    limit, r, anchorCol, transposed, o, out, allowBlankLeft
  ) {
    extendRight(
      board, checks, anchors, root, node, partial, rack, used,
      r, anchorCol, anchorCol - partial.length, transposed, o, out
    );
    if (limit <= 0) return;

    for (var i = 0; i < rack.length; i++) {
      var tile = rack[i];
      if (tile === BLANK && !allowBlankLeft) continue;
      var candidates = tile === BLANK ? T.letters(node) : [tile.toUpperCase()];
      for (var k = 0; k < candidates.length; k++) {
        var letter = candidates[k];
        var nextNode = T.child(node, letter);
        if (!nextNode) continue;
        var restRack = rack.slice();
        restRack.splice(i, 1);
        leftPart(
          board, checks, anchors, root, nextNode, partial + letter, restRack,
          used.concat([{ tile: tile, letter: letter }]),
          limit - 1, r, anchorCol, transposed, o, out, allowBlankLeft
        );
      }
    }
  }

  /* Walk rightwards from the anchor, consuming board letters where they exist
     and rack tiles where they do not. Every rack placement is checked against
     the trie's real children and the square's cross-check set, so dead branches
     die immediately — including a blank's. */
  function extendRight(
    board, checks, anchors, root, node, partial, rack, used,
    r, c, startCol, transposed, o, out
  ) {
    if (c >= SIZE || B.isEmpty(board, r, c)) {
      // A move must place at least one tile and must be a real word.
      if (T.isWord(node) && used.length && partial.length > 1) {
        record(board, partial, used, r, startCol, transposed, o, out);
      }
      if (c >= SIZE) return;

      for (var i = 0; i < rack.length; i++) {
        var tile = rack[i];
        var candidates = tile === BLANK ? T.letters(node) : [tile.toUpperCase()];
        for (var k = 0; k < candidates.length; k++) {
          var letter = candidates[k];
          var nextNode = T.child(node, letter);
          if (!nextNode) continue;
          if (!allows(checks, r, c, letter)) continue;
          var restRack = rack.slice();
          restRack.splice(i, 1);
          extendRight(
            board, checks, anchors, root, nextNode, partial + letter, restRack,
            used.concat([{ tile: tile, letter: letter, col: c }]),
            r, c + 1, startCol, transposed, o, out
          );
        }
      }
      return;
    }

    // Square already holds a tile: it is forced.
    var onBoard = B.letterAt(board, r, c);
    var forced = T.child(node, onBoard);
    if (!forced) return;
    extendRight(
      board, checks, anchors, root, forced, partial + onBoard, rack, used,
      r, c + 1, startCol, transposed, o, out
    );
  }

  /* Turn a found word into a move in the ORIGINAL board's coordinates, and
     score it with the same validator the UI uses — so a generated move and a
     hand-played one can never disagree about what something is worth. */
  function record(board, word, used, r, startCol, transposed, o, out) {
    var placements = [];
    var u = 0;
    for (var i = 0; i < word.length; i++) {
      var c = startCol + i;
      if (B.isEmpty(board, r, c)) {
        var entry = used[u++];
        if (!entry) return; // defensive: bookkeeping drifted, drop the move
        var tile = entry.tile === BLANK
          ? entry.letter.toLowerCase() // a blank is stored lowercase
          : entry.letter;
        placements.push(transposed ? { r: c, c: r, tile: tile } : { r: r, c: c, tile: tile });
      }
    }
    if (!placements.length) return;

    var verdict = B.validate(o.board, placements, o.isValidWord || null);
    if (!verdict.ok) return; // the validator is the final word, not this search

    out.push({
      row: transposed ? startCol : r,
      col: transposed ? r : startCol,
      direction: transposed ? "down" : "across",
      word: word,
      placements: placements,
      words: verdict.words,
      score: verdict.score,
      bingo: verdict.bingo
    });
  }

  /* The single best move, or null if the rack cannot play. */
  function best(board, rack, opts) {
    var moves = generate(board, rack, opts);
    return moves.length ? moves[0] : null;
  }

  WT.movegen = {
    generate: generate,
    best: best,
    crossChecks: crossChecks,
    anchorSet: anchorSet,
    freeLeft: freeLeft,
    BLANK: BLANK
  };
})(window.WT || (window.WT = {}));
