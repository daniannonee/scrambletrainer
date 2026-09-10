/* Everything the app knows about you, in one place.

   This screen invents nothing. Every number here is already being stored by
   some mode; until now none of it was readable outside the mode that wrote it,
   which meant a player could not answer "am I actually getting better?" without
   opening five screens and remembering what they said.

   Reached from the home masthead rather than as a sixth mode card: it is not
   something you *do*, it is a look at what you have done.

   Exposes WT.screens.stats. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;

  /* A block of figures. `rows` are [value, label] pairs; a null row is skipped
     so a section can drop a line it has nothing to say about. */
  function figures(title, rows, note) {
    var kids = [el("h3", { text: title })];
    if (note) kids.push(el("p", { class: "stat-note", text: note }));
    kids.push(
      el("ul", { class: "stat-list" },
        rows.filter(Boolean).map(function (row) {
          return el("li", {}, [
            el("span", { class: "stat-value", text: String(row[0]) }),
            el("span", { class: "stat-label", text: row[1] })
          ]);
        })
      )
    );
    return el("div", { class: "result-block" }, kids);
  }

  function empty(text) {
    return el("p", { class: "stat-note", text: text });
  }

  /* A small bar chart of the last N daily results, as a share of the day's
     best. Drawn with divs — a chart library for fourteen bars would be absurd,
     and it has to work offline from a file:// page. */
  function dailyChart(history) {
    var wrap = el("div", { class: "spark" });
    history.slice().reverse().forEach(function (row) {
      var share = row.result.best ? row.result.score / row.result.best : 0;
      var pct = Math.max(4, Math.round(share * 100));
      wrap.appendChild(
        el("span", {
          class: "spark-bar" + (share >= 1 ? " is-best" : ""),
          style: "height:" + pct + "%",
          title: row.key + ": " + row.result.score + " of " + row.result.best
        })
      );
    });
    return wrap;
  }

  function render(root, onHome) {
    clear(root);

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← Home", onclick: onHome })
      ])
    );
    root.appendChild(el("h2", { text: "Your progress" }));

    var anything = false;

    /* --- the path ------------------------------------------------------- */
    var levels = WT.levels.all();
    var done = levels.filter(function (l) {
      return WT.store.levelState(l.id).status === "complete";
    });
    var attempts = levels.reduce(function (a, l) {
      return a + (WT.store.levelState(l.id).attempts || 0);
    }, 0);
    var accuracies = done.map(function (l) {
      return WT.store.levelState(l.id).bestAccuracy;
    });
    if (attempts) {
      anything = true;
      var avg = accuracies.length
        ? accuracies.reduce(function (a, b) { return a + b; }, 0) / accuracies.length
        : 0;
      root.appendChild(
        figures("The path", [
          [done.length + " / " + levels.length, "levels cleared"],
          [attempts, attempts === 1 ? "quiz taken" : "quizzes taken"],
          accuracies.length ? [WT.ui.pct(avg), "average best accuracy"] : null
        ])
      );
    }

    /* --- unscramble ------------------------------------------------------ */
    var lengths = WT.anagrams.lengths();
    var drills = lengths
      .map(function (n) { return { n: n, rec: WT.store.drillBest("anagram", n) }; })
      .filter(function (x) { return x.rec.rounds > 0; });
    if (drills.length) {
      anything = true;
      root.appendChild(
        figures(
          "Unscramble",
          drills.map(function (d) {
            return [d.rec.best + " / 10", "best at " + d.n + " letters (" + d.rec.rounds +
              (d.rec.rounds === 1 ? " round)" : " rounds)")];
          })
        )
      );
    }

    /* --- the daily ------------------------------------------------------- */
    var history = WT.daily.history(60);
    if (history.length) {
      anything = true;
      var scores = history.map(function (h) {
        return h.result.best ? h.result.score / h.result.best : 0;
      });
      var bestDay = history.slice().sort(function (a, b) {
        return b.result.score - a.result.score;
      })[0];
      var perfect = history.filter(function (h) {
        return h.result.score >= h.result.best;
      }).length;
      var block = figures("Today's board", [
        [history.length, history.length === 1 ? "day played" : "days played"],
        [WT.daily.streak(), "day streak"],
        [WT.ui.pct(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length),
          "average share of the best play"],
        [bestDay.result.score, "best score (" + bestDay.key + ")"],
        perfect ? [perfect, perfect === 1 ? "day you found the best play" : "days you found the best play"] : null
      ], history.length > 1 ? "Each bar is one day, as a share of the best play available." : null);
      if (history.length > 1) block.appendChild(dailyChart(history.slice(0, 21)));
      root.appendChild(block);
    }

    /* --- review ---------------------------------------------------------- */
    var rv = WT.review.stats();
    if (rv.tracked) {
      anything = true;
      var when = WT.review.describeNext();
      root.appendChild(
        figures("Review", [
          [rv.tracked, "words tracked"],
          [rv.retired, "learned and retired"],
          [rv.learning, "still in rotation"],
          [rv.due, "due today"]
        ], when && !rv.due ? "Next words back " + when + "." : null)
      );
    }

    /* --- games ------------------------------------------------------------ */
    var games = WT.store.gamesAll();
    var gameIds = Object.keys(games).filter(function (id) { return games[id].played; });
    if (gameIds.length) {
      anything = true;
      var rows = [];
      var totalPlayed = 0, totalWon = 0, best = 0;
      WT.opponent.LEVELS.forEach(function (lv) {
        var rec = games[lv.id];
        if (!rec || !rec.played) return;
        totalPlayed += rec.played;
        totalWon += rec.won;
        best = Math.max(best, rec.bestScore);
        rows.push([rec.won + " / " + rec.played, "won against " + lv.name +
          " (best " + rec.bestScore + ")"]);
      });
      rows.push([WT.ui.pct(totalPlayed ? totalWon / totalPlayed : 0), "win rate overall"]);
      rows.push([best, "highest game score"]);
      root.appendChild(figures("Games", rows));
    }

    /* --- the words you keep missing --------------------------------------- */
    var missed = WT.store.missedWords(12);
    if (missed.length) {
      anything = true;
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "Words you keep missing" }),
          el("p", { class: "stat-note",
            text: "Most often wrong first. These are the ones review is working on." }),
          el("div", { class: "word-chips" }, missed.map(function (w) {
            var stat = WT.store.wordStat(w);
            return el("span", {
              class: "chip is-missed",
              title: "wrong " + stat.wrong + " of " + stat.seen,
              text: w
            });
          }))
        ])
      );
    }

    if (!anything) {
      root.appendChild(
        el("p", { class: "lede",
          text: "Nothing to show yet. Play anything and it will start filling in." })
      );
    }

    root.appendChild(
      el("div", { class: "result-actions" }, [
        el("button", { class: "btn btn-primary", type: "button", text: "Back home", onclick: onHome })
      ])
    );
  }

  WT.screens = WT.screens || {};
  WT.screens.stats = { render: render };
})(window.WT || (window.WT = {}));
