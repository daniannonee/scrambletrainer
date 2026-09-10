/* The daily puzzle: which board today, and how did you do.

   Everyone gets the same puzzle on the same day with no server, because the
   day itself is the seed. The number of days since a fixed epoch indexes
   straight into the pre-generated pool in data/daily.js.

   The date is read from the LOCAL clock, not UTC. A daily that rolls over at
   some foreign midnight is a daily people miss. The cost is that someone can
   change their device clock to play ahead — which is a cheat that only harms
   the cheat, so it is not defended against.

   Exposes WT.daily. */
(function (WT) {
  "use strict";

  // Any fixed date works; this one is simply when the pool was first built.
  var EPOCH = { y: 2026, m: 9, d: 1 };
  var MS_PER_DAY = 86400000;

  /* Local midnight for a date, so day boundaries follow the player's clock. */
  function midnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function dayNumber(date) {
    var d = date || new Date();
    var epoch = new Date(EPOCH.y, EPOCH.m - 1, EPOCH.d).getTime();
    return Math.floor((midnight(d) - epoch) / MS_PER_DAY);
  }

  /* "2026-09-09" — the key a result is filed under, and what a player sees. */
  function dateKey(date) {
    var d = date || new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    return d.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" +
      (day.length < 2 ? "0" + day : day);
  }

  function poolSize() {
    return typeof WT_DAILY === "undefined" ? 0 : WT_DAILY.length;
  }

  /* Days before the pool starts repeating. Worth surfacing rather than
     discovering. */
  function repeatsAfter() {
    var n = poolSize();
    if (!n) return 0;
    return n - (((dayNumber() % n) + n) % n);
  }

  function decodeBoard(str) {
    var board = WT.board.create();
    for (var i = 0; i < str.length && i < board.cells.length; i++) {
      board.cells[i] = str[i] === "." ? null : str[i];
    }
    return board;
  }

  function decodePlay(str) {
    if (!str) return [];
    return str.split(";").map(function (part) {
      var bits = part.split(",");
      return { r: parseInt(bits[0], 10), c: parseInt(bits[1], 10), tile: bits[2] };
    });
  }

  /* The puzzle for a given day, or null if no pool shipped. */
  function forDate(date) {
    var n = poolSize();
    if (!n) return null;
    var day = dayNumber(date);
    var index = ((day % n) + n) % n; // stays positive before the epoch too
    var row = WT_DAILY[index];
    return {
      day: day,
      index: index,
      key: dateKey(date),
      board: decodeBoard(row[0]),
      rack: row[1].split(""),
      best: row[2],
      bestWord: row[3],
      bestPlay: decodePlay(row[4]),
      median: row[5],
      options: row[6]
    };
  }

  /* --- grading ------------------------------------------------------ *
     Scored as a share of the best play available. Anything that clears the
     board's median play is already better than half the legal moves, so the
     bands are set to reward finding a good play rather than only the perfect
     one.                                                                  */

  var TIERS = [
    { at: 1.0, name: "Found it", note: "The best play on the board." },
    { at: 0.8, name: "Very close", note: "Within a fifth of the best." },
    { at: 0.55, name: "Strong", note: "A good play." },
    { at: 0.3, name: "On the board", note: "There was more there." },
    { at: 0.0001, name: "Played", note: "Something is better than nothing." },
    { at: -1, name: "No play", note: "" }
  ];

  function grade(score, best) {
    var share = best > 0 ? score / best : 0;
    for (var i = 0; i < TIERS.length; i++) {
      if (share >= TIERS[i].at) {
        return {
          score: score,
          best: best,
          share: share,
          tier: TIERS[i].name,
          note: TIERS[i].note,
          perfect: share >= 1
        };
      }
    }
    return { score: score, best: best, share: 0, tier: "No play", note: "", perfect: false };
  }

  /* --- results ------------------------------------------------------ */

  function resultFor(date) {
    return WT.store.dailyResult(dateKey(date));
  }

  function played(date) {
    return !!resultFor(date);
  }

  function record(date, result) {
    return WT.store.recordDaily(dateKey(date), result);
  }

  /* Consecutive days ending today or yesterday. Yesterday still counts so the
     streak does not look broken to someone who has not played yet today. */
  function streak() {
    var all = WT.store.dailyAll();
    var today = new Date();
    var count = 0;
    var cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!all[dateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
    while (all[dateKey(cursor)]) {
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  /* A result someone can paste somewhere, built entirely on the device.

     Deliberately not a grid of coloured squares: the daily is one play graded
     against an optimum, not six guesses, so a Wordle-shaped picture would say
     nothing true about it. What matters is the score, the best available and
     which tier that landed in. The word itself is left out on purpose — the
     whole point is that everyone gets the same board that day. */
  function shareText(date) {
    var d = date || new Date();
    var result = resultFor(d);
    if (!result) return null;
    var g = grade(result.score, result.best);
    var run = streak();
    var bar = "";
    var filled = Math.max(0, Math.min(10, Math.round(g.share * 10)));
    for (var i = 0; i < 10; i++) bar += i < filled ? "\u2589" : "\u00b7";
    return (
      "Word trainer \u2014 " + dateKey(d) + "\n" +
      result.score + " / " + result.best + "  " + bar + "  " + g.tier +
      (run > 1 ? "\n" + run + " days in a row" : "")
    );
  }

  function history(limit) {
    var all = WT.store.dailyAll();
    return Object.keys(all)
      .sort()
      .reverse()
      .slice(0, limit || 30)
      .map(function (k) {
        return { key: k, result: all[k] };
      });
  }

  WT.daily = {
    EPOCH: EPOCH,
    TIERS: TIERS,
    dayNumber: dayNumber,
    dateKey: dateKey,
    poolSize: poolSize,
    repeatsAfter: repeatsAfter,
    forDate: forDate,
    grade: grade,
    shareText: shareText,
    resultFor: resultFor,
    played: played,
    record: record,
    streak: streak,
    history: history
  };
})(window.WT || (window.WT = {}));
