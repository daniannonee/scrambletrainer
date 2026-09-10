/* The engine opponent.

   HOW DIFFICULTY WORKS, AND WHY NOT THE OBVIOUS WAY
   The obvious knob is randomness: play the best move x% of the time, otherwise
   play a random legal one. That produces an opponent who is either flawless or
   plays JO for 9 when a bingo was sitting there — which is not "easier", it is
   incoherent, and it teaches a player nothing about what a good move looks like.

   Instead each level takes a BAND of the ranked move list. An easy opponent
   plays somewhere in the middle of what was available: a plausible, ordinary
   move that a human might make, just not the best one. A hard opponent takes
   the top. The result is an opponent whose play is always defensible, only
   sometimes optimal — which is what a real practice partner is.

   The move list is already sorted by score, so a band is a slice of it.

   Exposes WT.opponent. */
(function (WT) {
  "use strict";

  /* `band` is [lo, hi] as a fraction through the ranked list, 0 being the best
     move available. `exchangeBelow` is the score under which the opponent would
     rather swap tiles than play — a weak opponent does not know to do that. */
  var LEVELS = [
    {
      id: "gentle",
      name: "Gentle",
      blurb: "Plays an ordinary move, not the best one. Room to win while you learn.",
      band: [0.35, 0.75],
      exchangeBelow: 0
    },
    {
      id: "steady",
      name: "Steady",
      blurb: "Plays well without being ruthless. Roughly a decent club player.",
      band: [0.08, 0.3],
      exchangeBelow: 8
    },
    {
      id: "sharp",
      name: "Sharp",
      blurb: "Takes the highest-scoring play available every single turn.",
      band: [0, 0.02],
      exchangeBelow: 12
    }
  ];

  function levelById(id) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (LEVELS[i].id === id) return LEVELS[i];
    }
    return LEVELS[1];
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

  /* Pick from the ranked list. Exposed and pure so the tests can drive it with
     a fixed list and assert the band actually holds. */
  function pick(moves, level, rand) {
    if (!moves || !moves.length) return null;
    var lo = Math.floor(moves.length * level.band[0]);
    var hi = Math.ceil(moves.length * level.band[1]);
    if (hi <= lo) hi = lo + 1;
    if (hi > moves.length) hi = moves.length;
    if (lo >= moves.length) lo = moves.length - 1;
    var span = hi - lo;
    return moves[lo + Math.floor((rand ? rand() : Math.random()) * span)];
  }

  /* Decide a whole turn: play, exchange, or pass.

     Exchanging is chosen when the best move on offer is worth less than the
     level's threshold AND the bag still allows it. The tiles thrown back are
     the ones a player would throw back — duplicates and the awkward high
     consonants — rather than a random handful, because an opponent that swaps
     its own blank is not a harder opponent, it is a broken one. */
  var KEEP_ORDER = "AEIORSTNLUDGBCMPFHVWYKJXQZ"; // roughly most to least useful

  function chooseExchange(rack) {
    var scored = rack.map(function (tile, i) {
      var rank = tile === "_" ? -1 : KEEP_ORDER.indexOf(tile.toUpperCase());
      return { i: i, tile: tile, rank: rank < 0 ? -1 : rank };
    });
    // Never throw a blank; throw the least useful three otherwise.
    var throwable = scored.filter(function (t) { return t.tile !== "_"; });
    throwable.sort(function (a, b) { return b.rank - a.rank; });
    return throwable.slice(0, Math.min(3, throwable.length)).map(function (t) { return t.i; });
  }

  /* game  — a WT.game instance
     level — a level object or id
     rand  — optional seeded RNG, so a game replays identically */
  function takeTurn(game, level, rand) {
    var lv = typeof level === "string" ? levelById(level) : level || LEVELS[1];
    var state = game.state();
    var rack = game.rackOf(state.turn);
    var moves = game.moves(state.turn);

    if (!moves.length) {
      // Nothing playable at all: swap if allowed, otherwise pass.
      if (game.canExchange()) {
        var idx = chooseExchange(rack);
        if (idx.length) {
          game.exchange(idx);
          return { type: "exchange", count: idx.length };
        }
      }
      game.pass();
      return { type: "pass" };
    }

    var choice = pick(moves, lv, rand);
    if (choice.score < lv.exchangeBelow && game.canExchange()) {
      var swap = chooseExchange(rack);
      if (swap.length) {
        game.exchange(swap);
        return { type: "exchange", count: swap.length };
      }
    }

    var result = game.play(choice.placements);
    if (!result.ok) {
      /* The generator and the validator disagreeing would be a real bug, not a
         situation to paper over — but the opponent must not deadlock the game,
         so it passes and the mismatch is surfaced rather than swallowed. */
      if (window.console && window.console.error) {
        window.console.error("opponent produced an illegal move", choice, result.reason);
      }
      game.pass();
      return { type: "pass", error: result.reason };
    }
    return {
      type: "play",
      word: choice.word,
      score: result.score,
      bingo: result.bingo,
      placements: choice.placements,
      rank: moves.indexOf(choice),
      outOf: moves.length
    };
  }

  WT.opponent = {
    LEVELS: LEVELS,
    levelById: levelById,
    pick: pick,
    chooseExchange: chooseExchange,
    takeTurn: takeTurn,
    rng: rng
  };
})(window.WT || (window.WT = {}));
