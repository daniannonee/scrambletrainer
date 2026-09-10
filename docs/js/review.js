/* Spaced repetition: bring back the words you got wrong, at widening intervals.

   WHY LEITNER AND NOT SM-2
   SuperMemo's SM-2 needs a graded answer — the learner rates recall 0 to 5 —
   and derives an "ease factor" from it. This app's quiz is binary: you either
   said it was a word or you didn't. Feeding a binary signal into SM-2 means
   inventing the grades, and an ease factor computed from invented numbers is
   worse than no ease factor, because it looks principled. So this is a Leitner
   box system, which is what a binary signal actually supports: get it right,
   move up a box and wait longer; get it wrong, fall to the bottom.

   WHAT ENTERS THE SCHEDULE
   Only words you have got wrong. A word answered correctly the first time is
   never scheduled. This is a deliberate limit — it means review cannot catch a
   word you guessed right — and the reason is arithmetic: the path covers a few
   thousand words, and scheduling all of them would build a backlog no one could
   ever clear. A review queue people abandon teaches nothing.

   THE DAY AXIS
   Days since the Unix epoch, counted at LOCAL midnight, so "due tomorrow" means
   tomorrow where the player is. Same reasoning as the daily puzzle, and the same
   accepted cost: moving the device clock forward pulls work forward.

   Exposes WT.review. */
(function (WT) {
  "use strict";

  var MS_PER_DAY = 86400000;

  /* Box n is answered right -> wait INTERVALS[n] days before asking again.
     Doubling is the standard Leitner shape; the last box is a month, after
     which a word is treated as learned and leaves the queue. */
  var INTERVALS = [1, 2, 4, 8, 16, 32];
  var RETIRED = INTERVALS.length; // box 6: learned, no longer scheduled

  /* Most words a single sitting will ask for. A backlog of 300 should not
     become a 300-question quiz; it should become fifteen sessions. */
  var SESSION_MAX = 20;

  /* Share of a review session that is decoys. Lower than the path's 0.5: these
     are words you have already missed, so the session should be mostly them —
     but not all of them, or "say yes to everything" scores 100%. */
  var DECOY_SHARE = 0.35;

  function dayOf(date) {
    var d = date || new Date();
    var midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.floor(midnight / MS_PER_DAY);
  }

  function today() {
    return dayOf(new Date());
  }

  function fresh(word) {
    return { word: word, box: 0, due: today(), right: 0, wrong: 0, lastDay: null };
  }

  /* --- scheduling ---------------------------------------------------- */

  /* One answer's effect on one word's schedule. Pure: takes a record and a
     result, returns the next record. Nothing here reads the clock except
     through `day`, so the tests can drive it forwards. */
  function next(rec, correct, day) {
    var r = {
      word: rec.word,
      box: rec.box,
      due: rec.due,
      right: rec.right,
      wrong: rec.wrong,
      lastDay: day
    };
    if (correct) {
      r.right++;
      r.box = Math.min(rec.box + 1, RETIRED);
      // A retired word has no due date; anything else waits out its box.
      r.due = r.box >= RETIRED ? null : day + INTERVALS[r.box];
    } else {
      r.wrong++;
      r.box = 0;
      r.due = day + 1; // tomorrow, not today — same-day re-asking is recognition, not recall
    }
    return r;
  }

  /* Fold a finished quiz into the schedule. Called once per quiz from the
     screen, so every quiz in the app feeds review through one path.

     Decoys are skipped: they are generated fresh for each quiz and are not
     words, so there is nothing to schedule. A non-word you wrongly accepted is
     a real weakness, but it is a weakness about a word that does not exist —
     see PROVENANCE.md for why that is not tracked yet. */
  function applyAnswers(answers, day) {
    var d = day == null ? today() : day;
    var existing = WT.store.reviewAll();
    var updates = {};
    var added = [];
    var promoted = [];
    var graduated = [];
    var relapsed = [];

    (answers || []).forEach(function (a) {
      if (!a.isWord) return;
      var known = updates[a.text] || existing[a.text];
      if (!known) {
        // Entry rule: a word joins the schedule only by being missed.
        if (a.correct) return;
        var rec = next(fresh(a.text), false, d);
        updates[a.text] = rec;
        added.push(a.text);
        return;
      }
      var before = known.box;
      var after = next(known, a.correct, d);
      updates[a.text] = after;
      if (a.correct && after.box >= RETIRED) graduated.push(a.text);
      else if (a.correct && after.box > before) promoted.push(a.text);
      else if (!a.correct && before > 0) relapsed.push(a.text);
    });

    if (Object.keys(updates).length) WT.store.reviewSetMany(updates);
    return {
      added: added,
      promoted: promoted,
      graduated: graduated,
      relapsed: relapsed,
      updated: updates
    };
  }

  /* --- the queue ------------------------------------------------------ */

  function tracked() {
    var all = WT.store.reviewAll();
    return Object.keys(all).map(function (w) {
      return all[w];
    });
  }

  /* Words ready to be asked, most overdue first, then most-missed. */
  function due(limit, day) {
    var d = day == null ? today() : day;
    return tracked()
      .filter(function (r) {
        return r.box < RETIRED && r.due != null && r.due <= d;
      })
      .sort(function (a, b) {
        return a.due - b.due || b.wrong - a.wrong || a.word.localeCompare(b.word);
      })
      .slice(0, limit == null ? SESSION_MAX : limit)
      .map(function (r) {
        return r.word;
      });
  }

  function dueCount(day) {
    return due(Infinity, day).length;
  }

  /* The soonest day anything comes back, or null if nothing is scheduled. */
  function nextDueDay() {
    var days = tracked()
      .filter(function (r) {
        return r.box < RETIRED && r.due != null;
      })
      .map(function (r) {
        return r.due;
      });
    return days.length ? Math.min.apply(null, days) : null;
  }

  /* "tomorrow", "in 3 days" — for the home card, which should say when to come
     back rather than just that there is nothing to do. */
  function describeNext(day) {
    var n = nextDueDay();
    if (n == null) return null;
    var delta = n - (day == null ? today() : day);
    if (delta <= 0) return "now";
    if (delta === 1) return "tomorrow";
    return "in " + delta + " days";
  }

  function stats(day) {
    var all = tracked();
    return {
      tracked: all.length,
      due: dueCount(day),
      retired: all.filter(function (r) {
        return r.box >= RETIRED;
      }).length,
      learning: all.filter(function (r) {
        return r.box < RETIRED;
      }).length
    };
  }

  /* Session sizing: enough questions that every due word fits alongside its
     share of decoys. */
  function sessionSize(wordCount) {
    return Math.max(1, Math.ceil(wordCount / (1 - DECOY_SHARE)));
  }

  WT.review = {
    INTERVALS: INTERVALS,
    RETIRED: RETIRED,
    SESSION_MAX: SESSION_MAX,
    DECOY_SHARE: DECOY_SHARE,
    dayOf: dayOf,
    today: today,
    fresh: fresh,
    next: next,
    applyAnswers: applyAnswers,
    tracked: tracked,
    due: due,
    dueCount: dueCount,
    nextDueDay: nextDueDay,
    describeNext: describeNext,
    stats: stats,
    sessionSize: sessionSize
  };
})(window.WT || (window.WT = {}));
