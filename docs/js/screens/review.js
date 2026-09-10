/* Review: the words you got wrong, coming back at widening intervals.

   The interaction is the path's quiz, unchanged — same question, same buttons,
   same keys — because review should feel like the thing it is reinforcing, not
   like a separate app. What differs is the framing around it: there is no pass
   mark, because review is not something you can fail. The result screen reports
   what moved instead.

   Exposes WT.screens.review. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;

  function topbar(onHome, label) {
    return el("div", { class: "topbar" }, [
      el("button", { class: "btn-ghost", type: "button", text: "← Home", onclick: onHome }),
      label ? el("span", { class: "counter", text: label }) : null
    ]);
  }

  /* --- nothing due ---------------------------------------------------- */

  function renderEmpty(root, onHome) {
    clear(root);
    var s = WT.review.stats();
    root.appendChild(topbar(onHome));
    root.appendChild(el("h2", { text: s.tracked ? "Nothing due today" : "Nothing to review yet" }));

    if (!s.tracked) {
      root.appendChild(
        el("p", {
          class: "lede",
          text:
            "Words arrive here by being missed. Play a level on the path and " +
            "anything you turn down that was real will come back tomorrow, then " +
            "at widening gaps until it sticks."
        })
      );
    } else {
      var when = WT.review.describeNext();
      root.appendChild(
        el("p", {
          class: "lede",
          text:
            "You are clear. " +
            (when ? "The next words are back " + when + "." : "Every word tracked is learned.")
        })
      );
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "Where things stand" }),
          el("ul", { class: "miss-list" }, [
            el("li", {}, [
              el("span", { class: "chip is-num", text: String(s.learning) }),
              el("span", { class: "miss-def", text: "still in rotation" })
            ]),
            el("li", {}, [
              el("span", { class: "chip is-num", text: String(s.retired) }),
              el("span", { class: "miss-def", text: "learned and retired" })
            ])
          ])
        ])
      );
    }

    root.appendChild(
      el("div", { class: "result-actions" }, [
        el("button", { class: "btn btn-primary", type: "button", text: "Back home", onclick: onHome })
      ])
    );
  }

  /* --- the session ---------------------------------------------------- */

  function renderSession(root, onDone, onHome) {
    var words = WT.review.due();
    var session = WT.quiz.create({
      words: words,
      size: WT.review.sessionSize(words.length),
      decoyShare: WT.review.DECOY_SHARE
    });
    return WT.screens.quiz.run(root, {
      session: session,
      backLabel: "← Leave review",
      onBack: onHome,
      onDone: function (results) {
        onDone(results, words.length);
      }
    });
  }

  /* --- what moved ------------------------------------------------------ */

  function renderResults(root, results, asked, onAgain, onHome) {
    clear(root);
    var sched = results.schedule || { graduated: [], promoted: [], relapsed: [], added: [] };
    var stats = WT.review.stats();

    root.appendChild(topbar(onHome, "Review"));
    root.appendChild(el("p", { class: "label", text: "Review · done" }));
    root.appendChild(
      el("p", { class: "score", text: results.correct + " / " + results.total })
    );
    root.appendChild(
      el("p", {
        class: "muted",
        text:
          asked +
          (asked === 1 ? " word was due" : " words were due") +
          ". There is no pass mark here — what matters is what moved."
      })
    );

    if (sched.graduated.length) {
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "Learned" }),
          el("p", { text: "Right often enough, at long enough gaps. These leave the queue." }),
          el(
            "div",
            { class: "word-chips" },
            sched.graduated.map(function (w) {
              return el("span", { class: "chip is-pass", text: w });
            })
          )
        ])
      );
    }

    /* The ordinary good outcome, and so the one the screen must not leave
       blank: right answers that pushed a word to a longer interval. */
    if ((sched.promoted || []).length) {
      var when = WT.review.INTERVALS;
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "Moved up" }),
          el("p", {
            text:
              sched.promoted.length +
              (sched.promoted.length === 1 ? " word goes" : " words go") +
              " to a longer gap before you see them again."
          }),
          el(
            "div",
            { class: "word-chips" },
            sched.promoted.map(function (w) {
              var rec = WT.store.reviewGet(w);
              return el("span", {
                class: "chip",
                title: rec ? "back in " + when[rec.box] + " days" : null,
                text: w
              });
            })
          )
        ])
      );
    }

    if (sched.relapsed.length) {
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "Back to the start" }),
          el("p", { text: "You had these moving. They are due again tomorrow." }),
          el(
            "ul",
            { class: "miss-list" },
            sched.relapsed.map(function (w) {
              var def = WT.screens.quiz.definitionOf(w);
              return el("li", {}, [
                el("span", { class: "chip is-missed", text: w }),
                el("span", { class: "miss-def", text: def || "definition not written yet" })
              ]);
            })
          )
        ])
      );
    }

    if (sched.added.length) {
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("h3", { text: "Newly tracked" }),
          el("p", { text: "Decoy words you accepted are not tracked; these are real ones you turned down." }),
          el(
            "div",
            { class: "word-chips" },
            sched.added.map(function (w) {
              return el("span", { class: "chip is-missed", text: w });
            })
          )
        ])
      );
    }

    var remaining = stats.due;
    root.appendChild(
      el("p", { class: "mode-next" }, [
        el("span", { class: "muted", text: "In rotation: " + stats.learning + " · learned: " + stats.retired + ". " }),
        el("b", {
          text: remaining
            ? remaining + " still due today."
            : "Next up " + (WT.review.describeNext() || "— nothing scheduled") + "."
        })
      ])
    );

    root.appendChild(
      el("div", { class: "result-actions" }, [
        remaining
          ? el("button", { class: "btn btn-primary", type: "button", text: "Keep going", onclick: onAgain })
          : el("button", { class: "btn btn-primary", type: "button", text: "Back home", onclick: onHome }),
        remaining
          ? el("button", { class: "btn", type: "button", text: "Back home", onclick: onHome })
          : null
      ])
    );
  }

  WT.screens = WT.screens || {};
  WT.screens.review = {
    renderEmpty: renderEmpty,
    renderSession: renderSession,
    renderResults: renderResults
  };
})(window.WT || (window.WT = {}));
