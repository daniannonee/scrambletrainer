/* The practice step: is this a valid word? */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;
  /* How long the verdict stays up.

     It used to be a flat 750ms, which was backwards: the longer the definition
     — the more there was to learn — the less chance you had of reading it. A
     tester hit exactly that. Two rules now:

       - Got it WRONG: the screen waits for you. That is the moment the
         definition matters most, and a forced pause is the point rather than
         an annoyance.
       - Got it RIGHT: it moves on by itself, but the delay scales with how much
         there is to read, so "Right, not a word." goes quickly and a real
         definition gets time.

     Either way a tap or any key skips ahead, so nobody is held up. */
  var FEEDBACK_MIN = 900;
  var FEEDBACK_PER_CHAR = 30;
  var FEEDBACK_MAX = 4200;

  function dwellFor(text, correct) {
    if (!correct) return null; // null means: wait for the player
    // Settings can make every answer wait, for anyone who finds the auto-advance
    // rushed — the same complaint that produced this function in the first place.
    if (WT.profile && WT.profile.setting("pace") === "wait") return null;
    return Math.min(FEEDBACK_MAX, FEEDBACK_MIN + String(text).length * FEEDBACK_PER_CHAR);
  }

  function definitionOf(word) {
    var d = WT.defs.get(word);
    return d ? d.text : null;
  }

  function render(root, level, onDone, onBack) {
    return run(root, {
      session: WT.quiz.create({
        words: WT.levels.wordsFor(level),
        size: level.quiz.size,
        decoyShare: level.quiz.decoyShare
      }),
      onDone: onDone,
      onBack: onBack,
      backLabel: "← Leave quiz"
    });
  }

  /* The valid/invalid interaction itself, independent of where the words came
     from. The path calls it through render(); review calls it directly with its
     own session. Keeping one copy is the point — this is the screen most likely
     to grow, and two of it would drift within a week. */
  function run(root, opts) {
    clear(root);

    var session = opts.session;
    var onDone = opts.onDone;
    var onBack = opts.onBack;

    var progressText = el("span", { text: "" });
    var fill = el("span", { class: "meter-fill", style: "width:0%" });

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", {
          class: "btn-ghost",
          type: "button",
          text: opts.backLabel || "← Leave quiz",
          onclick: onBack
        }),
        el("span", { class: "counter" }, [
          progressText,
          el("span", { class: "meter" }, [fill])
        ])
      ])
    );

    var wordNode = el("p", { class: "quiz-word", text: "" });
    var stage = el("div", { class: "quiz-stage" }, [wordNode]);
    var verdict = el("div", { class: "verdict", role: "status" });
    var yes = el("button", { class: "btn", type: "button", text: "It's a word" });
    var no = el("button", { class: "btn", type: "button", text: "Not a word" });

    root.appendChild(stage);
    root.appendChild(verdict);
    // Left/right order matches the arrow keys, so the hint below is literal.
    root.appendChild(el("div", { class: "quiz-buttons" }, [no, yes]));
    root.appendChild(
      el("p", { class: "quiz-hint", text: "Keyboard: ← not a word · → it's a word" })
    );

    var locked = false;
    var advanceTimer = null;
    var pendingAdvance = null;

    /* Move to the next question. Safe to call twice — the timer and a tap can
       both fire, and the second must be a no-op rather than skipping a word. */
    function advance() {
      if (!pendingAdvance) return;
      window.clearTimeout(advanceTimer);
      advanceTimer = null;
      var go = pendingAdvance;
      pendingAdvance = null;
      locked = false;
      clear(verdict);
      go();
    }

    function paint() {
      var item = session.current();
      if (!item) return;
      wordNode.textContent = item.text;
      progressText.textContent = session.position() + 1 + " / " + session.total;
      fill.style.width = (session.position() / session.total) * 100 + "%";
      stage.className = "quiz-stage";
    }

    /* The one funnel every valid/invalid quiz in the app passes through, which
       is why the review schedule is fed here and nowhere else: any future quiz
       that uses run() is scheduled automatically, and none can forget to be. */
    function finish() {
      var results = session.results();
      WT.store.recordAnswers(results.answers);
      results.schedule = WT.review.applyAnswers(results.answers);
      onDone(results, session);
    }

    function answer(said) {
      if (locked || session.done()) return;
      locked = true;
      var record = session.answer(said);
      stage.className = "quiz-stage " + (record.correct ? "is-right" : "is-wrong");

      var msg;
      if (record.isWord) {
        var def = definitionOf(record.text);
        msg = record.correct
          ? "Yes — " + record.text + (def ? ". " + def : "")
          : "It is a word. " + record.text + (def ? " — " + def : "");
      } else {
        msg = record.correct ? "Right, not a word." : "Not a word.";
      }
      clear(verdict).appendChild(
        el("span", {}, [record.correct ? el("b", { text: "Correct. " }) : el("b", { text: "Missed. " }), msg])
      );

      pendingAdvance = function () {
        if (session.done()) finish();
        else paint();
      };

      var ms = dwellFor(msg, record.correct);
      if (ms == null) {
        // Waiting on the player: say so, and give the tap a visible target.
        verdict.appendChild(
          el("button", {
            class: "btn verdict-next",
            type: "button",
            text: session.done() ? "See the result" : "Next word",
            onclick: advance
          })
        );
        verdict.querySelector(".verdict-next").focus();
      } else {
        advanceTimer = window.setTimeout(advance, ms);
      }
    }

    yes.addEventListener("click", function () {
      answer(true);
    });
    no.addEventListener("click", function () {
      answer(false);
    });

    function onKey(e) {
      // While a verdict is up, every key means "I have read it, go on".
      if (locked) {
        if (e.key === "Tab") return;
        e.preventDefault();
        advance();
        return;
      }
      if (e.key === "ArrowRight") answer(true);
      else if (e.key === "ArrowLeft") answer(false);
      else return;
      e.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    // Tapping the word area skips the wait too — on a phone there is no keyboard.
    stage.addEventListener("click", advance);
    /* Handed back so the router can detach it when the screen goes away. This
       is a local, not a property on the function: run() has two callers now,
       and a shared slot would let one screen's teardown overwrite another's. */
    var teardown = function () {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(advanceTimer);
    };

    paint();
    return teardown;
  }

  /* --- results ---------------------------------------------------- */

  function renderResults(root, level, results, onRetry, onContinue) {
    clear(root);
    var passed = results.accuracy >= level.quiz.passAccuracy;

    root.appendChild(el("p", { class: "label", text: "Level " + (level.index + 1) + " · result" }));
    root.appendChild(
      el("p", {
        class: "score" + (passed ? " is-pass" : ""),
        text: WT.ui.pct(results.accuracy)
      })
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

    if (results.missedWords.length) {
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "Words you didn’t know" }),
          el("p", { text: "Real words you turned down. These are the ones to study." }),
          el(
            "ul",
            { class: "miss-list" },
            results.missedWords.map(function (w) {
              var def = definitionOf(w);
              return el("li", {}, [
                el("span", { class: "chip is-missed", text: w }),
                el("span", { class: "miss-def", text: def || "definition not written yet" })
              ]);
            })
          )
        ])
      );
    }

    if (results.falseAccepts.length) {
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "Not words" }),
          el("p", { text: "You accepted these. They aren't in the list." }),
          el(
            "div",
            { class: "word-chips" },
            results.falseAccepts.map(function (w) {
              return el("span", { class: "chip is-false", text: w });
            })
          )
        ])
      );
    }

    if (!results.missedWords.length && !results.falseAccepts.length) {
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "Clean sheet" }),
          el("p", { style: "margin:0", text: "Every question right. Nothing left to review here." })
        ])
      );
    }

    root.appendChild(
      el("div", { class: "result-actions" }, [
        passed
          ? el("button", {
              class: "btn btn-primary",
              type: "button",
              text: "Back to the path",
              onclick: onContinue
            })
          : el("button", {
              class: "btn btn-primary",
              type: "button",
              text: "Try again",
              onclick: onRetry
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
  WT.screens.quiz = {
    render: render,
    run: run,
    renderResults: renderResults,
    definitionOf: definitionOf
  };
})(window.WT || (window.WT = {}));
