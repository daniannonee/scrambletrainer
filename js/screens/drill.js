/* The anagram drill: scrambled letters in, a word out.

   Three screens — pick a length, play a round, see the result. Answers are
   checked against the whole lexicon rather than the puzzle's own list, so
   finding a word we did not expect counts as right. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;
  var ROUND = 10;
  var SETTLE_MS = 1100;

  /* --- choosing a length ------------------------------------------- */

  function renderMenu(root, onStart, onHome) {
    clear(root);

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← Home", onclick: onHome })
      ])
    );

    root.appendChild(el("h2", { text: "Unscramble" }));
    root.appendChild(
      el("p", {
        class: "lede",
        text:
          "Letters come out of order; put them back. Ten puzzles a round. Every " +
          "puzzle is set from an ordinary English word, but any valid word using " +
          "all the letters counts."
      })
    );

    var list = el("div", { class: "mode-list", style: "margin-top:26px" });
    WT.anagrams.lengths().forEach(function (n) {
      var best = WT.store.drillBest("anagram", n);
      list.appendChild(
        el(
          "button",
          {
            class: "mode-card length-card",
            type: "button",
            onclick: function () {
              onStart(n);
            }
          },
          [
            WT.ui.tile(String(n), null, { class: "length-tile" }),
            el("span", { class: "length-body" }, [
              el("span", { class: "length-title", text: n + "-letter words" }),
              el("span", {
                class: "length-meta",
                text:
                  WT.anagrams.count(n).toLocaleString("en-US") +
                  " puzzles" +
                  (best.rounds
                    ? " · best " + best.best + " of " + ROUND +
                      " over " + best.rounds + (best.rounds === 1 ? " round" : " rounds")
                    : " · not played yet")
              })
            ])
          ]
        )
      );
    });
    root.appendChild(list);
  }

  /* --- playing ------------------------------------------------------ */

  function renderRound(root, length, onDone, onQuit) {
    clear(root);
    var puzzles = WT.anagrams.round({ length: length, size: ROUND });
    var index = 0;
    var results = [];
    var settled = false;

    var progressText = el("span", { text: "" });
    var fill = el("span", { class: "meter-fill", style: "width:0%" });

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← Leave drill", onclick: onQuit }),
        el("span", { class: "counter" }, [
          progressText,
          el("span", { class: "meter" }, [fill])
        ])
      ])
    );

    var slots = el("div", { class: "slot-row" });
    var tiles = el("div", { class: "tile-row" });
    var verdict = el("div", { class: "verdict", role: "status" });
    var hintNode = el("p", { class: "hint-line" });

    root.appendChild(el("div", { class: "drill-stage" }, [slots, tiles]));
    root.appendChild(verdict);
    root.appendChild(hintNode);

    var clearBtn = el("button", { class: "btn", type: "button", text: "Clear" });
    var hintBtn = el("button", { class: "btn", type: "button", text: "Hint" });
    var giveUp = el("button", { class: "btn", type: "button", text: "Show me" });
    root.appendChild(el("div", { class: "drill-buttons" }, [clearBtn, hintBtn, giveUp]));
    root.appendChild(
      el("p", {
        class: "quiz-hint",
        text: "Type the letters, or tap them. Backspace undoes, Enter submits."
      })
    );

    var picked = []; // indexes into the current puzzle's scrambled letters
    var usedHint = false;

    function current() {
      return puzzles[index];
    }

    function guess() {
      return picked
        .map(function (i) {
          return current().scrambled[i];
        })
        .join("");
    }

    function draw() {
      var p = current();
      progressText.textContent = index + 1 + " / " + puzzles.length;
      fill.style.width = (index / puzzles.length) * 100 + "%";

      clear(slots);
      for (var s = 0; s < p.alphagram.length; s++) {
        slots.appendChild(
          el("span", {
            class: "slot" + (picked.length > s ? " is-filled" : ""),
            text: picked.length > s ? p.scrambled[picked[s]] : ""
          })
        );
      }

      clear(tiles);
      p.scrambled.split("").forEach(function (ch, i) {
        var used = picked.indexOf(i) !== -1;
        tiles.appendChild(
          el("button", {
            class: "tile tile-face" + (used ? " is-used" : ""),
            type: "button",
            text: ch,
            "aria-label": "letter " + ch,
            disabled: used || settled,
            onclick: function () {
              place(i);
            }
          })
        );
      });
    }

    function place(i) {
      if (settled || picked.indexOf(i) !== -1) return;
      picked.push(i);
      draw();
      if (picked.length === current().alphagram.length) submit();
    }

    function undo() {
      if (settled || !picked.length) return;
      picked.pop();
      draw();
    }

    /* Typing places the first unused tile bearing that letter, so repeated
       letters behave the way a player expects. */
    function type(ch) {
      if (settled) return;
      var p = current();
      for (var i = 0; i < p.scrambled.length; i++) {
        if (p.scrambled[i] === ch && picked.indexOf(i) === -1) {
          place(i);
          return;
        }
      }
    }

    function settle(record) {
      settled = true;
      results.push(record);
      slots.className = "slot-row " + (record.correct ? "is-right" : "is-wrong");
      draw();

      var p = current();
      var others = p.answers.filter(function (w) {
        return w !== record.answer;
      });
      var def = record.answer ? WT.defs.get(record.answer) : null;

      clear(verdict).appendChild(
        el("span", {}, [
          el("b", { text: record.correct ? (usedHint ? "Right, with a hint. " : "Right. ") : "" }),
          record.correct
            ? document.createTextNode(record.answer + (def ? " — " + def.text : ""))
            : el("span", {}, [
                el("b", { text: "The word was " }),
                el("b", { class: "reveal", text: p.answers[0] }),
                document.createTextNode(def ? " — " + def.text : "")
              ]),
          others.length
            ? el("span", {
                class: "also",
                text: " Also: " + others.slice(0, 4).join(", ")
              })
            : null
        ])
      );

      window.setTimeout(function () {
        index++;
        if (index >= puzzles.length) {
          onDone(summarise());
          return;
        }
        picked = [];
        settled = false;
        usedHint = false;
        slots.className = "slot-row";
        clear(verdict);
        clear(hintNode);
        draw();
      }, SETTLE_MS);
    }

    function submit() {
      if (settled) return;
      var g = guess();
      if (WT.anagrams.check(current(), g)) {
        settle({ correct: true, answer: g, hinted: usedHint, puzzle: current() });
      } else {
        // A wrong guess is not a failure — clear it and let them keep trying.
        slots.className = "slot-row is-wrong";
        clear(verdict).appendChild(
          el("span", { text: '"' + g + '" is not a word. Try again.' })
        );
        window.setTimeout(function () {
          if (settled) return;
          picked = [];
          slots.className = "slot-row";
          clear(verdict);
          draw();
        }, 700);
      }
    }

    clearBtn.addEventListener("click", function () {
      if (settled) return;
      picked = [];
      draw();
    });

    hintBtn.addEventListener("click", function () {
      if (settled) return;
      usedHint = true;
      var p = current();
      var def = null;
      for (var i = 0; i < p.answers.length && !def; i++) def = WT.defs.get(p.answers[i]);
      clear(hintNode).appendChild(
        el("span", {
          text: def
            ? def.text
            : "No definition on file for this one — it starts with " +
              p.answers[0][0].toUpperCase() + "."
        })
      );
    });

    giveUp.addEventListener("click", function () {
      if (settled) return;
      settle({ correct: false, answer: null, hinted: usedHint, puzzle: current() });
    });

    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Backspace") {
        undo();
      } else if (e.key === "Enter") {
        if (picked.length === current().alphagram.length) submit();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        type(e.key.toLowerCase());
      } else {
        return;
      }
      e.preventDefault();
    }
    document.addEventListener("keydown", onKey);

    function summarise() {
      var correct = results.filter(function (r) {
        return r.correct;
      }).length;
      return {
        length: length,
        total: results.length,
        correct: correct,
        unaided: results.filter(function (r) {
          return r.correct && !r.hinted;
        }).length,
        missed: results.filter(function (r) {
          return !r.correct;
        }),
        results: results.slice()
      };
    }

    draw();
    return function () {
      document.removeEventListener("keydown", onKey);
    };
  }

  /* --- results ------------------------------------------------------ */

  function renderResults(root, summary, onAgain, onMenu) {
    clear(root);
    WT.store.recordDrill("anagram", summary.length, summary.correct);
    var best = WT.store.drillBest("anagram", summary.length);

    root.appendChild(
      el("p", { class: "label", text: summary.length + "-letter drill · result" })
    );
    root.appendChild(
      el("p", { class: "score", text: summary.correct + " / " + summary.total })
    );
    root.appendChild(
      el("p", {
        class: "muted",
        text:
          (summary.unaided === summary.correct
            ? "No hints used."
            : summary.unaided + " without a hint.") +
          (best.best > summary.correct ? " Your best is " + best.best + "." : "") +
          (best.best === summary.correct && best.rounds > 1 ? " That matches your best." : "")
      })
    );

    if (summary.missed.length) {
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "The ones that got away" }),
          el(
            "ul",
            { class: "miss-list" },
            summary.missed.map(function (m) {
              var word = m.puzzle.answers[0];
              var def = WT.defs.get(word);
              return el("li", {}, [
                el("span", { class: "chip is-missed", text: word }),
                el("span", { class: "miss-def", text: def ? def.text : "no definition on file" })
              ]);
            })
          )
        ])
      );
    } else {
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "All ten" }),
          el("p", { style: "margin:0", text: "Clean round. Try a longer word." })
        ])
      );
    }

    root.appendChild(
      el("div", { class: "result-actions" }, [
        el("button", {
          class: "btn btn-primary",
          type: "button",
          text: "Another round",
          onclick: onAgain
        }),
        el("button", { class: "btn", type: "button", text: "Change length", onclick: onMenu })
      ])
    );
  }

  WT.screens = WT.screens || {};
  WT.screens.drill = {
    renderMenu: renderMenu,
    renderRound: renderRound,
    renderResults: renderResults,
    ROUND: ROUND
  };
})(window.WT || (window.WT = {}));
