/* Board strategy: two plays, one board, which is better and why.

   The screen deliberately shows the numbers before it shows a verdict, and it
   shows the leave's reasons rather than only its score — the whole point is
   that a player leaves able to make the judgement themselves, not able to
   recall which button was right.

   Exposes WT.screens.strategy. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;
  var B = WT.board;
  var UI = WT.boardui;

  /* --- the idea, once --------------------------------------------------- */

  function renderIntro(root, onStart, onHome) {
    clear(root);
    var s = WT.strategy.stats();

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← Home", onclick: onHome })
      ])
    );
    root.appendChild(el("h2", { text: "The best play" }));
    root.appendChild(
      el("p", { class: "lede",
        text: "The highest-scoring play is not always the best one. Each of these " +
          "is a real position where taking the points costs you more than it wins." })
    );

    root.appendChild(
      el("div", { class: "result-block" }, [
        el("h3", { text: "The two things that decide it" }),
        el("ul", { class: "miss-list" }, [
          el("li", {}, [
            el("span", { class: "chip", text: "leave" }),
            el("span", { class: "miss-def",
              text: "What stays on your rack. Seven tiles you cannot play is a " +
                "wasted turn next go, however good this one was." })
          ]),
          el("li", {}, [
            el("span", { class: "chip", text: "opens" }),
            el("span", { class: "miss-def",
              text: "What you hand them. Every play changes what the board allows " +
                "next, and a triple-word lane you opened is worth more to them " +
                "than the points were to you." })
          ])
        ])
      ])
    );

    root.appendChild(
      el("p", { class: "stat-note",
        text: "Every number in these puzzles was computed, not asserted: the scores " +
          "and the replies come from the same move generator that solves the daily, " +
          "and the opponent's rack is shown to you rather than assumed." })
    );

    if (s.attempted) {
      root.appendChild(
        el("p", { class: "mode-next" }, [
          el("span", { class: "muted", text: s.attempted + " of " + s.pool + " seen. " }),
          el("b", { text: s.right + " called right." })
        ])
      );
    }

    root.appendChild(
      el("div", { class: "result-actions" }, [
        el("button", { class: "btn btn-primary", type: "button",
          text: s.attempted ? "Next position" : "Start", onclick: onStart })
      ])
    );
  }

  /* --- one position ------------------------------------------------------ */

  function leaveBlock(option, label) {
    var evald = WT.leave.evaluate(option.leave);
    return el("div", { class: "leave-block" }, [
      el("p", { class: "leave-head" }, [
        el("b", { text: label }),
        document.createTextNode(" leaves "),
        el("b", { class: "leave-tiles", text: option.leave.join("") || "nothing" })
      ]),
      el("ul", { class: "leave-reasons" },
        evald.reasons.map(function (r) {
          return el("li", { class: r.delta > 0 ? "is-good" : r.delta < 0 ? "is-bad" : "" }, [
            el("span", { class: "leave-delta", text: r.delta > 0 ? "+" + r.delta : String(r.delta) }),
            el("span", { text: r.text })
          ]);
        })
      )
    ]);
  }

  function renderPuzzle(root, index, onAnswered, onHome) {
    clear(root);
    var puzzle = WT.strategy.get(index);
    if (!puzzle) {
      root.appendChild(el("h2", { text: "No positions loaded" }));
      root.appendChild(el("p", { class: "lede",
        text: "Run tools/build_strategy.js to generate them." }));
      root.appendChild(el("div", { class: "result-actions" }, [
        el("button", { class: "btn", type: "button", text: "Back home", onclick: onHome })
      ]));
      return function () {};
    }

    var options = WT.strategy.optionsFor(puzzle);
    var previewing = null;
    var answered = null;

    var boardWrap = el("div", { class: "board-wrap" });
    var choices = el("div", { class: "choice-list" });
    var outcome = el("div", { class: "choice-outcome" });

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← Home", onclick: onHome }),
        el("span", { class: "counter", text: "#" + (puzzle.index + 1) })
      ])
    );
    root.appendChild(el("h2", { text: "Which play is better?" }));
    root.appendChild(boardWrap);
    root.appendChild(
      el("p", { class: "rack-label", text: "Your rack" })
    );
    root.appendChild(
      el("div", { class: "rack-row rack-static" },
        puzzle.rack.map(function (t) {
          return WT.ui.tile(t === "_" ? " " : t, t === "_" ? null : B.valueOfTile(t));
        })
      )
    );
    root.appendChild(
      el("p", { class: "stat-note",
        text: "They hold " + puzzle.theirRack.join("") + " — shown so you can check " +
          "the reply numbers yourself." })
    );
    root.appendChild(choices);
    root.appendChild(outcome);

    function drawBoard() {
      var ghost = {};
      if (previewing) {
        previewing.placements.forEach(function (p) {
          ghost[p.r + "," + p.c] = p.tile;
        });
      }
      clear(boardWrap);
      var grid = UI.boardGrid(puzzle.board, { ghostAt: ghost });
      boardWrap.appendChild(grid);
      UI.fitGrid(grid, 420);
    }

    function drawChoices() {
      clear(choices);
      options.forEach(function (opt, i) {
        var chosen = answered === opt;
        var isRight = WT.strategy.isBetter(puzzle, opt);
        var classes = "choice";
        if (previewing === opt && !answered) classes += " is-previewing";
        if (answered) {
          classes += isRight ? " is-right" : " is-wrong";
          if (chosen) classes += " is-chosen";
        }
        choices.appendChild(
          el("button", {
            class: classes,
            type: "button",
            disabled: !!answered,
            onclick: function () {
              if (answered) return;
              if (previewing !== opt) {
                previewing = opt;
                drawBoard();
                drawChoices();
                return;
              }
              answered = opt;
              WT.strategy.record(puzzle.index, isRight);
              drawBoard();
              drawChoices();
              drawOutcome();
            }
          }, [
            el("span", { class: "choice-word", text: opt.word }),
            el("span", { class: "choice-score", text: String(opt.score) }),
            el("span", { class: "choice-hint",
              text: answered
                ? "leaves " + (opt.leave.join("") || "nothing") + " · they reply " + opt.opens
                : previewing === opt ? "Tap again to choose it" : "Tap to see it on the board" })
          ])
        );
      });
    }

    function drawOutcome() {
      clear(outcome);
      if (!answered) return;
      var right = WT.strategy.isBetter(puzzle, answered);
      outcome.appendChild(
        el("h3", { class: "tier-name", text: right ? "That's the better play" : "The other one was better" })
      );
      outcome.appendChild(el("p", { class: "lede", text: WT.strategy.verdict(puzzle) }));

      outcome.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "What each leaves you" }),
          leaveBlock(puzzle.greedy, puzzle.greedy.word),
          leaveBlock(puzzle.better, puzzle.better.word),
          el("p", { class: "stat-note",
            text: "This is a plain rubric, not an engine's equity table — the " +
              "reasons are the lesson, not the number." })
        ])
      );

      outcome.appendChild(
        el("div", { class: "result-actions" }, [
          el("button", { class: "btn btn-primary", type: "button", text: "Next position",
            onclick: function () { onAnswered(); } }),
          el("button", { class: "btn", type: "button", text: "Back home", onclick: onHome })
        ])
      );
      WT.ui.say(right ? "Correct." : "Not the better play.");
    }

    function onResize() {
      var g = boardWrap.querySelector(".bgrid");
      if (g) UI.fitGrid(g, 420);
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    drawBoard();
    drawChoices();

    return function () {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }

  WT.screens = WT.screens || {};
  WT.screens.strategy = { renderIntro: renderIntro, renderPuzzle: renderPuzzle };
})(window.WT || (window.WT = {}));
