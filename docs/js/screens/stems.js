/* Level 10: bingo stems. A different question from the rest of the path —
   not "is this a word?" but "does this stem plus this letter make a seven?" —
   so it gets its own study and quiz screens. Everything it asserts is computed
   from the lexicon (see js/stems.js), so it cannot disagree with the other
   levels. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;
  var ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");
  var FEEDBACK_MS = 900;

  function stemsFor(level) {
    return WT.stems.top(level.stemCount || 20);
  }

  /* --- study ------------------------------------------------------- */

  function detailFor(stem) {
    var kids = [
      el("p", { class: "big stem-big", text: stem.alphagram }),
      stem.familiar
        ? el("p", {
            class: "pos",
            text:
              "spells " +
              stem.names
                .slice(0, 3)
                .map(function (w) {
                  return w.toUpperCase();
                })
                .join(", ")
          })
        : el("p", { class: "pos", text: "no everyday word spells this one" }),
      el("p", {
        class: "def",
        text:
          stem.score +
          " of the 26 letters turn this into a seven-letter word — a fifty-point bonus if you play all seven tiles."
      })
    ];

    var yes = el("div", { class: "letter-row" });
    ALPHABET.forEach(function (c) {
      var works = stem.letters.indexOf(c) !== -1;
      yes.appendChild(
        el("span", {
          class: "letter-chip" + (works ? " is-yes" : " is-no"),
          text: c,
          title: works ? WT.stems.wordsFor(stem, c).slice(0, 4).join(", ") : "no seven"
        })
      );
    });

    kids.push(
      el("div", { class: "hooks" }, [
        el("div", {}, [el("strong", { text: "Letters that work" })]),
        yes
      ])
    );

    // A couple of worked examples beat a wall of them.
    var sample = stem.letters.slice(0, 3).map(function (c) {
      return el("li", {}, [
        el("span", { class: "chip", text: c }),
        el("span", {
          class: "miss-def stem-words",
          text: WT.stems.wordsFor(stem, c).slice(0, 5).join(", ")
        })
      ]);
    });
    kids.push(
      el("div", { class: "hooks" }, [
        el("div", {}, [el("strong", { text: "For example" })]),
        el("ul", { class: "miss-list" }, sample)
      ])
    );

    return el("div", { class: "word-detail" }, kids);
  }

  function renderTeach(root, level, onQuiz, onBack) {
    clear(root);
    var stems = stemsFor(level);

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← The path", onclick: onBack }),
        el("span", { class: "counter", text: stems.length + " stems" })
      ])
    );

    root.appendChild(el("p", { class: "label", text: "Level " + (level.index + 1) + " · study" }));
    root.appendChild(el("h2", { text: level.title }));
    root.appendChild(el("p", { class: "lede", text: level.blurb }));
    root.appendChild(
      el("p", {
        class: "muted",
        style: "font-size:14px;margin-top:12px",
        text:
          "Each of these is six letters, written in alphabetical order — that is how you " +
          "hold them in your head. Tap one to see which letters finish it."
      })
    );

    var grid = el("div", { class: "study-grid stem-grid" });
    var open = null;
    var detailNode = null;

    function close() {
      if (detailNode && detailNode.parentNode) detailNode.parentNode.removeChild(detailNode);
      detailNode = null;
      var prev = grid.querySelector('[aria-expanded="true"]');
      if (prev) prev.setAttribute("aria-expanded", "false");
      open = null;
    }

    stems.forEach(function (stem) {
      var cell = el(
        "button",
        {
          class: "word-cell stem-cell tile-face",
          type: "button",
          "aria-expanded": "false",
          onclick: function () {
            if (open === stem.alphagram) {
              close();
              return;
            }
            close();
            open = stem.alphagram;
            cell.setAttribute("aria-expanded", "true");
            detailNode = detailFor(stem);
            var cells = Array.prototype.slice.call(grid.querySelectorAll(".word-cell"));
            var idx = cells.indexOf(cell);
            var top = cell.offsetTop;
            var next = null;
            for (var i = idx + 1; i < cells.length; i++) {
              if (cells[i].offsetTop > top) {
                next = cells[i];
                break;
              }
            }
            grid.insertBefore(detailNode, next);
            WT.ui.say(stem.alphagram + ", " + stem.score + " letters work");
          }
        },
        [
          el("span", { class: "stem-letters", text: stem.alphagram }),
          el("span", { class: "stem-score", text: stem.score })
        ]
      );
      grid.appendChild(cell);
    });

    root.appendChild(grid);

    root.appendChild(
      el("div", { class: "study-actions" }, [
        el("button", {
          class: "btn btn-primary",
          type: "button",
          text: "Start the quiz",
          onclick: onQuiz
        }),
        el("span", {
          class: "muted",
          style: "font-size:13px",
          text: level.quiz.size + " questions · pass at " + WT.ui.pct(level.quiz.passAccuracy)
        })
      ])
    );
  }

  /* --- quiz -------------------------------------------------------- */

  function buildQuestions(level) {
    var stems = stemsFor(level);
    var items = [];
    stems.forEach(function (stem) {
      ALPHABET.forEach(function (c) {
        items.push({ stem: stem, letter: c, works: stem.letters.indexOf(c) !== -1 });
      });
    });

    // Half working, half not — otherwise "yes" is the winning strategy, since
    // a good stem takes most letters.
    var yes = items.filter(function (i) {
      return i.works;
    });
    var no = items.filter(function (i) {
      return !i.works;
    });
    function pick(arr, n) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i];
        a[i] = a[j];
        a[j] = t;
      }
      return a.slice(0, n);
    }
    var half = Math.floor(level.quiz.size / 2);
    var out = pick(yes, half).concat(pick(no, level.quiz.size - half));
    return pick(out, out.length);
  }

  function renderQuiz(root, level, onDone, onBack) {
    clear(root);
    var items = buildQuestions(level);
    var index = 0;
    var answers = [];
    var locked = false;

    var progressText = el("span", { text: "" });
    var fill = el("span", { class: "meter-fill", style: "width:0%" });

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← Leave quiz", onclick: onBack }),
        el("span", { class: "counter" }, [
          progressText,
          el("span", { class: "meter" }, [fill])
        ])
      ])
    );

    var stemNode = el("span", { class: "quiz-stem", text: "" });
    var letterNode = el("span", { class: "quiz-letter", text: "" });
    var stage = el("div", { class: "quiz-stage" }, [
      el("p", { class: "quiz-word stem-question" }, [
        stemNode,
        el("span", { class: "quiz-plus", text: "+" }),
        letterNode
      ])
    ]);
    var verdict = el("div", { class: "verdict", role: "status" });
    var yes = el("button", { class: "btn", type: "button", text: "Makes a seven" });
    var no = el("button", { class: "btn", type: "button", text: "No seven" });

    root.appendChild(stage);
    root.appendChild(verdict);
    root.appendChild(el("div", { class: "quiz-buttons" }, [no, yes]));
    root.appendChild(
      el("p", { class: "quiz-hint", text: "Keyboard: ← no seven · → makes a seven" })
    );

    function paint() {
      var item = items[index];
      if (!item) return;
      stemNode.textContent = item.stem.alphagram;
      letterNode.textContent = item.letter;
      progressText.textContent = index + 1 + " / " + items.length;
      fill.style.width = (index / items.length) * 100 + "%";
      stage.className = "quiz-stage";
    }

    function answer(said) {
      if (locked || index >= items.length) return;
      locked = true;
      var item = items[index];
      var correct = said === item.works;
      answers.push({ stem: item.stem, letter: item.letter, works: item.works, correct: correct });
      stage.className = "quiz-stage " + (correct ? "is-right" : "is-wrong");

      var words = item.works ? WT.stems.wordsFor(item.stem, item.letter) : [];
      clear(verdict).appendChild(
        el("span", {}, [
          el("b", { text: correct ? "Correct. " : "Missed. " }),
          item.works
            ? document.createTextNode(
                words.slice(0, 3).join(", ") +
                  (words.length > 3 ? " (+" + (words.length - 3) + " more)" : "")
              )
            : document.createTextNode("No seven-letter word uses those letters.")
        ])
      );

      index++;
      window.setTimeout(function () {
        locked = false;
        clear(verdict);
        if (index >= items.length) onDone(results());
        else paint();
      }, FEEDBACK_MS);
    }

    function results() {
      var correct = answers.filter(function (a) {
        return a.correct;
      }).length;
      return {
        total: answers.length,
        correct: correct,
        accuracy: answers.length ? correct / answers.length : 0,
        missed: answers.filter(function (a) {
          return !a.correct;
        }),
        answers: answers.slice()
      };
    }

    yes.addEventListener("click", function () {
      answer(true);
    });
    no.addEventListener("click", function () {
      answer(false);
    });

    function onKey(e) {
      if (e.key === "ArrowRight") answer(true);
      else if (e.key === "ArrowLeft") answer(false);
      else return;
      e.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    var teardown = function () {
      document.removeEventListener("keydown", onKey);
    };

    paint();
    return teardown;
  }

  /* --- results ----------------------------------------------------- */

  function renderResults(root, level, results, onRetry, onContinue) {
    clear(root);
    var passed = results.accuracy >= level.quiz.passAccuracy;

    root.appendChild(el("p", { class: "label", text: "Level " + (level.index + 1) + " · result" }));
    root.appendChild(
      el("p", { class: "score" + (passed ? " is-pass" : ""), text: WT.ui.pct(results.accuracy) })
    );
    root.appendChild(
      el("p", {
        class: "muted",
        text:
          results.correct +
          " of " +
          results.total +
          " right. " +
          (passed
            ? "That clears the level."
            : "You need " + WT.ui.pct(level.quiz.passAccuracy) + " to clear it.")
      })
    );

    if (results.missed.length) {
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "What you missed" }),
          el("p", { text: "The combinations to go back over." }),
          el(
            "ul",
            { class: "miss-list" },
            results.missed.map(function (m) {
              var words = m.works ? WT.stems.wordsFor(m.stem, m.letter) : [];
              return el("li", {}, [
                el("span", {
                  class: "chip " + (m.works ? "is-missed" : "is-false"),
                  text: m.stem.alphagram + "+" + m.letter
                }),
                el("span", {
                  class: "miss-def stem-words",
                  text: m.works ? words.slice(0, 4).join(", ") : "makes nothing"
                })
              ]);
            })
          )
        ])
      );
    } else {
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "Clean sheet" }),
          el("p", { style: "margin:0", text: "Every combination right." })
        ])
      );
    }

    root.appendChild(
      el("div", { class: "result-actions" }, [
        el("button", {
          class: "btn btn-primary",
          type: "button",
          text: passed ? "Back to the path" : "Try again",
          onclick: passed ? onContinue : onRetry
        }),
        el("button", {
          class: "btn",
          type: "button",
          text: passed ? "Run it again" : "Back to the path",
          onclick: passed ? onRetry : onContinue
        })
      ])
    );
  }

  WT.screens = WT.screens || {};
  WT.screens.stems = {
    renderTeach: renderTeach,
    renderQuiz: renderQuiz,
    renderResults: renderResults
  };
})(window.WT || (window.WT = {}));
