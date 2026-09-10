/* Home. Deliberately plain: one entry, built so a second one is a second
   MODES entry and nothing else. The real home screen gets designed once there
   is more than one thing to put on it. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;

  /* Everything the app can send you into. `status` returns the line of state
     shown on the card; `open` is the handler key the router provides. */
  var MODES = [
    {
      id: "path",
      tile: "P",
      title: "Learn the words",
      blurb:
        "A guided route through the word groups that decide games, in the order " +
        "worth learning them.",
      status: function () {
        var p = WT.levels.overallProgress();
        var next = WT.levels.all().filter(function (l) {
          return WT.levels.statusOf(l) === "current";
        })[0];
        return {
          done: p.done,
          total: p.total,
          line:
            p.done === 0
              ? "Not started"
              : p.done === p.total
              ? "All ten levels complete"
              : p.done + " of " + p.total + " levels",
          next: next ? next.title : null
        };
      }
    },
    {
      id: "drill",
      tile: "U",
      title: "Unscramble",
      blurb:
        "Letters out of order, put them back. Pick a word length and take ten. " +
        "Practice, not progression — a bad round costs you nothing.",
      status: function () {
        var lengths = WT.anagrams.lengths();
        var played = lengths
          .map(function (n) {
            return { n: n, rec: WT.store.drillBest("anagram", n) };
          })
          .filter(function (x) {
            return x.rec.rounds > 0;
          });
        if (!played.length) {
          return { line: "Not played", next: lengths.length + " word lengths" };
        }
        var rounds = played.reduce(function (a, x) {
          return a + x.rec.rounds;
        }, 0);
        var top = played.slice().sort(function (a, b) {
          return b.rec.best - a.rec.best || b.n - a.n;
        })[0];
        return {
          line: rounds + (rounds === 1 ? " round played" : " rounds played"),
          next: "best " + top.rec.best + " of 10 at " + top.n + " letters"
        };
      }
    },
    {
      id: "daily",
      tile: "D",
      title: "Today's board",
      blurb:
        "One mid-game board, one rack, one play. Score as high as you can, then " +
        "see the best that was there. Same board for everyone, new one tomorrow.",
      status: function () {
        if (typeof WT.daily === "undefined" || !WT.daily.poolSize()) {
          return { line: "No puzzle pool loaded" };
        }
        var today = WT.daily.resultFor(new Date());
        var streak = WT.daily.streak();
        var streakLine = streak > 1 ? streak + " days in a row" : null;
        if (today) {
          return {
            line: "Played today — " + today.score + " of " + today.best,
            next: streakLine || today.tier
          };
        }
        return { line: "Not played today", next: streakLine || "One play, then locked" };
      }
    },
    {
      id: "review",
      tile: "R",
      title: "Review",
      blurb:
        "The words you got wrong, coming back tomorrow, then in two days, then " +
        "four, until they stick. No pass mark — you cannot fail a review.",
      status: function () {
        var s = WT.review.stats();
        if (!s.tracked) {
          return { line: "Nothing tracked yet", next: "Miss a word and it lands here" };
        }
        if (s.due) {
          return {
            line: s.due + (s.due === 1 ? " word due today" : " words due today"),
            next: s.retired ? s.retired + " learned so far" : s.learning + " in rotation"
          };
        }
        var when = WT.review.describeNext();
        return {
          line: "Nothing due today",
          next: when ? "Next words back " + when : "Everything tracked is learned"
        };
      }
    },
    {
      id: "game",
      tile: "G",
      title: "Play a game",
      blurb:
        "A full game against the engine — bag, racks, turns, the lot. Three " +
        "strengths, from beatable to it-always-finds-the-best-play.",
      status: function () {
        var all = WT.store.gamesAll();
        var ids = Object.keys(all);
        if (!ids.length) {
          return { line: "Not played", next: WT.opponent.LEVELS.length + " strengths" };
        }
        var played = 0, won = 0, best = 0;
        ids.forEach(function (id) {
          played += all[id].played;
          won += all[id].won;
          best = Math.max(best, all[id].bestScore);
        });
        return {
          line: won + " won of " + played,
          next: best ? "best score " + best : null
        };
      }
    },
    {
      id: "strategy",
      tile: "B",
      title: "The best play",
      blurb:
        "Two plays on one board. One scores more. Work out which is actually " +
        "better once you count what it leaves you and what it hands them.",
      status: function () {
        var s = WT.strategy.stats();
        if (!s.pool) return { line: "No positions loaded" };
        if (!s.attempted) {
          return { line: "Not started", next: s.pool + " positions" };
        }
        return {
          done: s.attempted,
          total: s.pool,
          line: s.attempted + " of " + s.pool + " seen",
          next: s.right + " called right"
        };
      }
    }
    // Next mode goes here. Nothing below this file should need to change.
  ];

  function render(root, open, onStats) {
    clear(root);

    root.appendChild(
      el("header", { class: "masthead home-masthead" }, [
        el("h1", { text: "Word trainer" }),
        el("p", { text: "Get better at word games, one group at a time." }),
        onStats
          ? el("p", { class: "masthead-link" }, [
              el("button", {
                class: "btn-ghost", type: "button", text: "Your progress →", onclick: onStats
              })
            ])
          : null
      ])
    );

    if (!WT.store.canPersist) {
      root.appendChild(
        el("div", {
          class: "warn",
          text:
            "This browser is not letting the app save anything, so progress will " +
            "not survive a reload. Private-browsing mode is the usual cause."
        })
      );
    }

    var list = el("div", { class: "mode-list" });

    MODES.forEach(function (mode) {
      var s = mode.status();
      var kids = [
        el("h2", { class: "mode-title", text: mode.title }),
        el("p", { class: "mode-blurb", text: mode.blurb })
      ];

      if (s.total && s.done) {
        kids.push(
          el("div", { class: "mode-state" }, [
            el("span", { class: "muted", text: s.line }),
            el("span", { class: "meter" }, [
              el("span", {
                class: "meter-fill",
                style: "width:" + (s.done / s.total) * 100 + "%"
              })
            ])
          ])
        );
      } else if (s.line) {
        kids.push(
          el("div", { class: "mode-state" }, [el("span", { class: "muted", text: s.line })])
        );
      }
      if (s.next) {
        kids.push(
          el("p", { class: "mode-next" }, [
            s.total
              ? el("span", { text: s.done ? "Next up — " : "Starts with — " })
              : null,
            el("b", { text: s.next })
          ])
        );
      }

      list.appendChild(
        el(
          "button",
          {
            class: "mode-card",
            type: "button",
            onclick: function () {
              open(mode.id);
            }
          },
          [
            WT.ui.tile(mode.tile, null, { class: "mode-tile" }),
            el("span", { class: "mode-body" }, kids)
          ]
        )
      );
    });

    root.appendChild(list);

    root.appendChild(
      el("footer", { class: "colophon" }, [
        el("p", {
          text:
            "Word list: ENABLE (public domain) plus 19 words it lacks, " +
            WT.lex.count().toLocaleString("en-US") +
            " in total, 1–8 letters. Commonness tiers from SCOWL, " +
            "Copyright 2000–2018 Kevin Atkinson. Some definitions from " +
            "WordNet 3.0, Copyright 2006 Princeton University; the rest written " +
            "for this app. Set in Fraunces, Copyright 2018 The Fraunces Project " +
            "Authors, SIL Open Font License 1.1. Full notices in LICENSES.md. " +
            "Not affiliated with, or endorsed by, any commercial word game."
        }),
        el("p", { style: "margin-left:-10px" }, [
          el("button", {
            class: "btn-ghost",
            type: "button",
            text: "Reset all progress",
            onclick: function () {
              if (window.confirm("Erase all progress and start the path again?")) {
                WT.store.reset();
                render(root, open, onStats);
              }
            }
          })
        ])
      ])
    );
  }

  WT.screens = WT.screens || {};
  WT.screens.home = { render: render, MODES: MODES };
})(window.WT || (window.WT = {}));
