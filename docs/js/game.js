/* A full two-player game: bag, racks, turns, exchanges, passes, endgame.

   Pure rules. It knows nothing about the DOM and nothing about how the
   opponent chooses a move — js/opponent.js decides that, and the screen wires
   the two together. Everything is driven by a seeded RNG, so a game can be
   replayed exactly, which is the only way to test an endgame.

   THE RULES IMPLEMENTED, stated plainly because half of them are the sort
   people argue about:

   - Seven tiles each to start; refill to seven after every play or exchange,
     while the bag lasts.
   - An exchange is only allowed while the bag holds at least seven tiles. This
     is the standard restriction and it matters: without it the endgame becomes
     an infinite shuffle.
   - The game ends when a player uses their last tile and the bag is empty, or
     after six consecutive scoreless turns (pass, exchange, or a play worth
     nothing). Six is the usual tournament cut-off — three each — and without it
     two players who both pass would sit there forever.
   - Final adjustment: a player who goes out gains the sum of the other's
     remaining tiles; everyone else loses the sum of their own. If nobody went
     out, both simply lose their own rack.

   Exposes WT.game. */
(function (WT) {
  "use strict";

  var B = WT.board;
  var RACK_SIZE = 7;
  var SCORELESS_LIMIT = 6;
  var EXCHANGE_MINIMUM = 7; // tiles that must remain in the bag

  /* mulberry32 again — same generator as the quiz and the daily builder, so
     there is one source of determinism in the project rather than three. */
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

  function rackValue(rack) {
    return rack.reduce(function (sum, tile) {
      return sum + B.valueOfTile(tile);
    }, 0);
  }

  /* Which rack tile pays for a placement. A lowercase placement is a blank
     played as that letter, so it costs a "_" and not the letter itself — get
     this backwards and a player can spend tiles they do not hold. */
  function costOf(placement) {
    var t = placement.tile;
    return t === t.toLowerCase() && t !== t.toUpperCase() ? "_" : t.toUpperCase();
  }

  function create(opts) {
    var o = opts || {};
    var rand = rng(o.seed == null ? (Date.now() & 0x7fffffff) : o.seed);
    var bag = shuffle(B.newBag(), rand);

    var state = {
      board: B.create(),
      racks: [[], []],
      scores: [0, 0],
      turn: 0, // 0 = the player, 1 = the opponent
      scoreless: 0,
      over: false,
      wentOut: null,
      history: [],
      adjustments: null
    };

    function draw(who) {
      while (state.racks[who].length < RACK_SIZE && bag.length) {
        state.racks[who].push(bag.pop());
      }
    }

    draw(0);
    draw(1);

    function bagCount() {
      return bag.length;
    }

    /* Remove the tiles a play costs from a rack. Returns false and changes
       nothing if the rack cannot pay — checked before the board is touched. */
    function spend(who, placements) {
      var rack = state.racks[who].slice();
      for (var i = 0; i < placements.length; i++) {
        var need = costOf(placements[i]);
        var at = rack.indexOf(need);
        if (at === -1) return false;
        rack.splice(at, 1);
      }
      state.racks[who] = rack;
      return true;
    }

    function endIfDone() {
      if (state.over) return;

      var out = null;
      if (!bag.length) {
        if (!state.racks[0].length) out = 0;
        else if (!state.racks[1].length) out = 1;
      }
      if (out === null && state.scoreless < SCORELESS_LIMIT) return;

      state.over = true;
      state.wentOut = out;
      var adj = [0, 0];
      if (out === null) {
        // Nobody went out: each loses their own rack, nothing changes hands.
        adj[0] = -rackValue(state.racks[0]);
        adj[1] = -rackValue(state.racks[1]);
      } else {
        var other = out === 0 ? 1 : 0;
        adj[out] = rackValue(state.racks[other]);
        adj[other] = -rackValue(state.racks[other]);
      }
      state.adjustments = adj;
      state.scores[0] += adj[0];
      state.scores[1] += adj[1];
      state.endReason = out === null ? "six scoreless turns" : "played out";
    }

    function nextTurn() {
      state.turn = state.turn === 0 ? 1 : 0;
    }

    function record(entry) {
      state.history.push(entry);
      if (!entry.score) state.scoreless++;
      else state.scoreless = 0;
    }

    /* --- the three things a turn can be --------------------------------- */

    function play(placements) {
      if (state.over) return { ok: false, reason: "The game is over." };
      var who = state.turn;
      if (!placements || !placements.length) {
        return { ok: false, reason: "Nothing placed." };
      }
      var verdict = B.validate(state.board, placements);
      if (!verdict.ok) return verdict;

      // Only spend once the play is known to be legal.
      if (!spend(who, placements)) {
        return { ok: false, reason: "Those tiles are not on your rack." };
      }
      state.board = verdict.board;
      state.scores[who] += verdict.score;
      draw(who);
      record({
        who: who,
        type: "play",
        words: verdict.words.map(function (w) { return w.word; }),
        score: verdict.score,
        bingo: verdict.bingo,
        placements: placements.slice()
      });
      endIfDone();
      if (!state.over) nextTurn();
      return { ok: true, score: verdict.score, words: verdict.words, bingo: verdict.bingo };
    }

    function exchange(indices) {
      if (state.over) return { ok: false, reason: "The game is over." };
      if (bag.length < EXCHANGE_MINIMUM) {
        return { ok: false, reason: "Not enough tiles left in the bag to exchange." };
      }
      if (!indices || !indices.length) return { ok: false, reason: "Pick tiles to swap." };
      var who = state.turn;
      var rack = state.racks[who];
      var sorted = indices.slice().sort(function (a, b) { return b - a; });
      var out = [];
      for (var i = 0; i < sorted.length; i++) {
        var idx = sorted[i];
        if (idx < 0 || idx >= rack.length) return { ok: false, reason: "No such tile." };
        out.push(rack[idx]);
        rack.splice(idx, 1);
      }
      draw(who);
      // Returned tiles go back before the reshuffle, so they can come round again.
      bag = shuffle(bag.concat(out), rand);
      record({ who: who, type: "exchange", count: out.length, score: 0 });
      endIfDone();
      if (!state.over) nextTurn();
      return { ok: true, count: out.length };
    }

    function pass() {
      if (state.over) return { ok: false, reason: "The game is over." };
      record({ who: state.turn, type: "pass", score: 0 });
      endIfDone();
      if (!state.over) nextTurn();
      return { ok: true };
    }

    /* --- reading the game ----------------------------------------------- */

    function snapshot() {
      return {
        board: state.board,
        rack: state.racks[0].slice(),
        opponentTiles: state.racks[1].length,
        scores: state.scores.slice(),
        turn: state.turn,
        bag: bagCount(),
        over: state.over,
        wentOut: state.wentOut,
        endReason: state.endReason || null,
        adjustments: state.adjustments ? state.adjustments.slice() : null,
        scoreless: state.scoreless,
        history: state.history.slice()
      };
    }

    function rackOf(who) {
      return state.racks[who].slice();
    }

    /* Every legal move for whoever is on turn. The opponent picks from this;
       the analysis screen shows what the player could have had. */
    function moves(who) {
      var w = who == null ? state.turn : who;
      return WT.movegen.generate(state.board, state.racks[w]);
    }

    /* A forfeit: the player quits, the opponent is credited nothing extra. */
    function resign() {
      if (state.over) return;
      state.over = true;
      state.wentOut = null;
      state.adjustments = [0, 0];
      state.endReason = "resigned";
    }

    return {
      state: snapshot,
      rackOf: rackOf,
      play: play,
      exchange: exchange,
      pass: pass,
      moves: moves,
      resign: resign,
      canExchange: function () { return bag.length >= EXCHANGE_MINIMUM; }
    };
  }

  WT.game = {
    create: create,
    RACK_SIZE: RACK_SIZE,
    SCORELESS_LIMIT: SCORELESS_LIMIT,
    EXCHANGE_MINIMUM: EXCHANGE_MINIMUM,
    rackValue: rackValue,
    costOf: costOf
  };
})(window.WT || (window.WT = {}));
