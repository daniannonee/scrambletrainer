/* Board core: geometry, premium squares, tile values, scoring, placement
   validation, and a ground-truth auditor.

   Nothing here searches. The validator is a small direct function so the UI can
   score and check a play on every keystroke; the move generator (js/movegen.js)
   is a separate code path that shares only this file's primitives. Two code
   paths for two jobs, on purpose — see PROVENANCE.md.

   CELL CONVENTION, and it matters everywhere:
     null          empty square
     "A".."Z"      a real tile
     "a".."z"      a BLANK played as that letter

   So case is the only thing distinguishing a blank from a real tile. Read a
   cell through letterAt() when you want the letter for dictionary purposes
   (always uppercase) and through valueAt() when you want points (a blank is
   worth zero whatever it represents). Never compare a raw cell against an
   uppercase letter.

   Exposes WT.board. */
(function (WT) {
  "use strict";

  var SIZE = 15;
  var CENTER = 7;
  var RACK_SIZE = 7;
  var BINGO = 50;

  /* Premium layout, written out rather than computed so it can be read and
     checked against a board by eye. Symmetric in all four quadrants.
       3 triple word   2 double word   t triple letter   d double letter
       * centre (scores as a double word)                . plain            */
  var LAYOUT = [
    "3..d...3...d..3",
    ".2...t...t...2.",
    "..2...d.d...2..",
    "d..2...d...2..d",
    "....2.....2....",
    ".t...t...t...t.",
    "..d...d.d...d..",
    "3..d...*...d..3",
    "..d...d.d...d..",
    ".t...t...t...t.",
    "....2.....2....",
    "d..2...d...2..d",
    "..2...d.d...2..",
    ".2...t...t...2.",
    "3..d...3...d..3"
  ];

  var PREMIUM = { "3": "TW", "2": "DW", t: "TL", d: "DL", "*": "DW", ".": null };

  var VALUES = {
    A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1,
    M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8,
    Y: 4, Z: 10
  };

  /* The standard hundred-tile bag. "_" is a blank. */
  var DISTRIBUTION = {
    A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9, J: 1, K: 1, L: 4,
    M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1,
    Y: 2, Z: 1, _: 2
  };

  /* --- geometry ---------------------------------------------------- */

  function create() {
    var cells = new Array(SIZE * SIZE);
    for (var i = 0; i < cells.length; i++) cells[i] = null;
    return { size: SIZE, cells: cells };
  }

  function inside(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function at(board, r, c) {
    if (!inside(r, c)) return null;
    return board.cells[r * SIZE + c];
  }

  function put(board, r, c, cell) {
    if (!inside(r, c)) throw new Error("off board: " + r + "," + c);
    board.cells[r * SIZE + c] = cell;
    return board;
  }

  function isEmpty(board, r, c) {
    return inside(r, c) && board.cells[r * SIZE + c] == null;
  }

  function isBoardEmpty(board) {
    for (var i = 0; i < board.cells.length; i++) {
      if (board.cells[i] != null) return false;
    }
    return true;
  }

  function clone(board) {
    return { size: board.size, cells: board.cells.slice() };
  }

  /* The letter for dictionary purposes: always uppercase, blank or not. */
  function letterAt(board, r, c) {
    var cell = at(board, r, c);
    return cell == null ? null : cell.toUpperCase();
  }

  function isBlankAt(board, r, c) {
    var cell = at(board, r, c);
    return cell != null && cell !== cell.toUpperCase();
  }

  /* Points for the tile sitting here, before any premium. Blanks score zero
     however they are read. */
  function valueAt(board, r, c) {
    var cell = at(board, r, c);
    if (cell == null) return 0;
    if (cell !== cell.toUpperCase()) return 0; // blank
    return VALUES[cell] || 0;
  }

  function valueOfTile(tile) {
    if (tile == null) return 0;
    if (tile !== tile.toUpperCase()) return 0;
    return VALUES[tile] || 0;
  }

  function premiumAt(r, c) {
    if (!inside(r, c)) return null;
    return PREMIUM[LAYOUT[r][c]];
  }

  function isCenter(r, c) {
    return r === CENTER && c === CENTER;
  }

  /* Swap rows and columns. The move generator only ever searches horizontally;
     vertical moves come from searching a transposed copy and mapping the
     coordinates back. Everything downstream — cross-checks included — is then
     computed in whatever board it was handed, which is what stops the axis bug
     described in PROVENANCE.md. */
  function transpose(board) {
    var out = create();
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        out.cells[c * SIZE + r] = board.cells[r * SIZE + c];
      }
    }
    return out;
  }

  /* --- reading words off the board --------------------------------- */

  /* The run of tiles through (r,c) along a direction, as {word, cells}. */
  function runThrough(board, r, c, dr, dc) {
    var sr = r;
    var sc = c;
    while (!isEmpty(board, sr - dr, sc - dc) && at(board, sr - dr, sc - dc) != null) {
      sr -= dr;
      sc -= dc;
    }
    var word = "";
    var cells = [];
    var rr = sr;
    var cc = sc;
    while (at(board, rr, cc) != null) {
      word += letterAt(board, rr, cc);
      cells.push({ r: rr, c: cc });
      rr += dr;
      cc += dc;
    }
    return { word: word, cells: cells };
  }

  /* Every horizontal and vertical run of two or more tiles on the board. This
     is what the auditor checks, and it does not consult the move generator's
     bookkeeping at all — that is the whole point of it. */
  function allRuns(board) {
    var runs = [];
    var r, c, run;
    for (r = 0; r < SIZE; r++) {
      c = 0;
      while (c < SIZE) {
        if (at(board, r, c) != null) {
          run = runThrough(board, r, c, 0, 1);
          if (run.word.length > 1) runs.push({ dir: "across", run: run });
          c += run.word.length;
        } else {
          c++;
        }
      }
    }
    for (c = 0; c < SIZE; c++) {
      r = 0;
      while (r < SIZE) {
        if (at(board, r, c) != null) {
          run = runThrough(board, r, c, 1, 0);
          if (run.word.length > 1) runs.push({ dir: "down", run: run });
          r += run.word.length;
        } else {
          r++;
        }
      }
    }
    return runs;
  }

  /* Ground truth. Scans the finished board directly and checks every run
     against the dictionary. Never trusts what any generator reported. */
  function audit(board, isValidWord) {
    var check = isValidWord || defaultIsWord;
    var bad = [];
    allRuns(board).forEach(function (entry) {
      if (!check(entry.run.word)) {
        bad.push({
          word: entry.run.word,
          dir: entry.dir,
          at: entry.run.cells[0]
        });
      }
    });
    return { ok: bad.length === 0, invalid: bad, checked: allRuns(board).length };
  }

  function defaultIsWord(word) {
    return WT.lex.has(word);
  }

  /* --- validating a play ------------------------------------------- */

  /* placements: [{ r, c, tile }] where tile follows the cell convention —
     uppercase for a real tile, lowercase for a blank played as that letter.

     Returns { ok, reason?, words: [{word, cells, score}], score, bingo }.
     Deliberately not a search: it walks the placed tiles once. */
  function validate(board, placements, isValidWord) {
    var check = isValidWord || defaultIsWord;

    if (!placements || !placements.length) {
      return fail("No tiles placed.");
    }
    if (placements.length > RACK_SIZE) {
      return fail("Only " + RACK_SIZE + " tiles can be played in a turn.");
    }

    var i;
    var seen = {};
    for (i = 0; i < placements.length; i++) {
      var p = placements[i];
      if (!inside(p.r, p.c)) return fail("A tile is off the board.");
      if (!isEmpty(board, p.r, p.c)) return fail("A square is already occupied.");
      if (!/^[A-Za-z]$/.test(p.tile)) return fail("Not a letter: " + p.tile);
      var key = p.r + "," + p.c;
      if (seen[key]) return fail("Two tiles on the same square.");
      seen[key] = true;
    }

    var rows = placements.map(function (p) { return p.r; });
    var cols = placements.map(function (p) { return p.c; });
    var sameRow = rows.every(function (r) { return r === rows[0]; });
    var sameCol = cols.every(function (c) { return c === cols[0]; });
    if (!sameRow && !sameCol) return fail("Tiles must be in one row or column.");

    // A single tile has no direction of its own. Work out both, once, and hold
    // on to those two objects — recomputing them later and comparing the
    // results by identity is a bug that always reads false.
    var single = placements.length === 1;
    var acrossFirst = sameRow;

    var next = clone(board);
    placements.forEach(function (p) {
      put(next, p.r, p.c, p.tile);
    });

    // No gaps: between the outermost placed tiles, every square must now be
    // filled (by this play or by something already there).
    var dr = acrossFirst ? 0 : 1;
    var dc = acrossFirst ? 1 : 0;
    var lo = acrossFirst ? Math.min.apply(null, cols) : Math.min.apply(null, rows);
    var hi = acrossFirst ? Math.max.apply(null, cols) : Math.max.apply(null, rows);
    var fixed = acrossFirst ? rows[0] : cols[0];
    for (i = lo; i <= hi; i++) {
      var rr = acrossFirst ? fixed : i;
      var cc = acrossFirst ? i : fixed;
      if (at(next, rr, cc) == null) return fail("The tiles leave a gap.");
    }

    // Connection: first play must cover the centre; later plays must touch
    // something already on the board.
    if (isBoardEmpty(board)) {
      var coversCenter = placements.some(function (p) {
        return isCenter(p.r, p.c);
      });
      if (!coversCenter) return fail("The first word must cover the centre square.");
      if (placements.length < 2) return fail("The first word must be at least two letters.");
    } else {
      var touches = placements.some(function (p) {
        return (
          at(board, p.r - 1, p.c) != null ||
          at(board, p.r + 1, p.c) != null ||
          at(board, p.r, p.c - 1) != null ||
          at(board, p.r, p.c + 1) != null
        );
      });
      if (!touches) return fail("The word must connect to a tile already played.");
    }

    // Words formed. The main word runs along the play; each placed tile may
    // also form a cross word perpendicular to it.
    var mainRun = runThrough(next, placements[0].r, placements[0].c, dr, dc);
    var crossRun = single
      ? runThrough(next, placements[0].r, placements[0].c, dc, dr)
      : null;

    var words = [];
    if (mainRun.word.length > 1) words.push(mainRun);
    // For a lone tile, the perpendicular run is the other candidate word. Use
    // the object computed above, not a fresh call.
    if (single && crossRun && crossRun.word.length > 1) words.push(crossRun);

    if (!single) {
      placements.forEach(function (p) {
        var cross = runThrough(next, p.r, p.c, dc, dr);
        if (cross.word.length > 1) words.push(cross);
      });
    }

    if (!words.length) return fail("That does not make a word.");

    var invalid = words.filter(function (w) {
      return !check(w.word);
    });
    if (invalid.length) {
      return fail(
        invalid.length === 1
          ? '"' + invalid[0].word + '" is not a word.'
          : "Not words: " + invalid.map(function (w) { return w.word; }).join(", ")
      );
    }

    var scored = scoreWords(next, words, placements);
    return {
      ok: true,
      words: scored.words,
      score: scored.total,
      bingo: scored.bingo,
      board: next
    };
  }

  function fail(reason) {
    return { ok: false, reason: reason, words: [], score: 0, bingo: false };
  }

  /* --- scoring ------------------------------------------------------ */

  /* Premiums count only for squares covered THIS turn. A word running through
     an old double-word square does not double again. */
  function scoreWords(boardAfter, words, placements) {
    var fresh = {};
    placements.forEach(function (p) {
      fresh[p.r + "," + p.c] = true;
    });

    var total = 0;
    var out = words.map(function (w) {
      var sum = 0;
      var multiplier = 1;
      w.cells.forEach(function (cell) {
        var value = valueAt(boardAfter, cell.r, cell.c);
        var isNew = fresh[cell.r + "," + cell.c];
        var premium = isNew ? premiumAt(cell.r, cell.c) : null;
        if (premium === "DL") value *= 2;
        else if (premium === "TL") value *= 3;
        else if (premium === "DW") multiplier *= 2;
        else if (premium === "TW") multiplier *= 3;
        sum += value;
      });
      var score = sum * multiplier;
      total += score;
      return { word: w.word, cells: w.cells, score: score };
    });

    var bingo = placements.length === RACK_SIZE;
    if (bingo) total += BINGO;
    return { words: out, total: total, bingo: bingo };
  }

  /* --- the bag ------------------------------------------------------ */

  function newBag() {
    var tiles = [];
    Object.keys(DISTRIBUTION).forEach(function (t) {
      for (var i = 0; i < DISTRIBUTION[t]; i++) tiles.push(t);
    });
    return tiles;
  }

  function render(board) {
    var lines = [];
    for (var r = 0; r < SIZE; r++) {
      var row = "";
      for (var c = 0; c < SIZE; c++) {
        var cell = at(board, r, c);
        row += (cell == null ? "." : cell) + " ";
      }
      lines.push(row.trim());
    }
    return lines.join("\n");
  }

  WT.board = {
    SIZE: SIZE,
    CENTER: CENTER,
    RACK_SIZE: RACK_SIZE,
    BINGO: BINGO,
    LAYOUT: LAYOUT,
    VALUES: VALUES,
    DISTRIBUTION: DISTRIBUTION,

    create: create,
    clone: clone,
    inside: inside,
    at: at,
    put: put,
    isEmpty: isEmpty,
    isBoardEmpty: isBoardEmpty,
    letterAt: letterAt,
    isBlankAt: isBlankAt,
    valueAt: valueAt,
    valueOfTile: valueOfTile,
    premiumAt: premiumAt,
    isCenter: isCenter,
    transpose: transpose,

    runThrough: runThrough,
    allRuns: allRuns,
    audit: audit,

    validate: validate,
    scoreWords: scoreWords,
    newBag: newBag,
    render: render
  };
})(window.WT || (window.WT = {}));
