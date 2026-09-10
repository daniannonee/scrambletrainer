/* The teach step: read the word group, tap a word for its definition. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;

  var PAGE = 96; // words per page; below this a group is shown in one go

  function definitionOf(word) {
    return WT.defs.get(word);
  }

  function detailFor(word) {
    var def = definitionOf(word);
    var hooks = WT.lex.hooks(word);
    var kids = [
      el("p", { class: "big", text: word }),
      def ? el("p", { class: "pos", text: def.pos }) : null,
      def
        ? el("p", { class: "def", text: def.text })
        : el("p", {
            class: "def muted",
            text: "A valid word with no plain-English definition on file — one of the ones you simply learn."
          })
    ];

    var grows = [];
    hooks.front.forEach(function (c) {
      grows.push(c + word);
    });
    hooks.back.forEach(function (c) {
      grows.push(word + c);
    });

    if (grows.length) {
      kids.push(
        el("div", { class: "hooks" }, [
          el("div", {}, [
            el("strong", {
              text:
                "Grows into " + grows.length + (grows.length === 1 ? " word: " : " words: ")
            }),
            el("span", { class: "hook-list", text: grows.join("  ") })
          ])
        ])
      );
    }
    return el("div", { class: "word-detail" }, kids);
  }

  function render(root, level, onQuiz, onBack) {
    clear(root);
    var words = WT.levels.wordsFor(level);

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← The path", onclick: onBack }),
        el("span", { class: "counter", text: words.length + " words" })
      ])
    );

    root.appendChild(el("p", { class: "label", text: "Level " + (level.index + 1) + " · study" }));
    root.appendChild(el("h2", { text: level.title }));
    root.appendChild(el("p", { class: "lede", text: level.blurb }));
    root.appendChild(
      el("p", {
        class: "muted",
        style: "font-size:14px;margin-top:12px",
        text: "Tap any word to see what it means and what it grows into."
      })
    );

    var cov = WT.defs.coverage(words);
    if (cov.defined < cov.total) {
      root.appendChild(
        el("p", {
          class: "coverage-note",
          text:
            cov.defined +
            " of " +
            cov.total +
            " have a definition on file. The rest are game words with no plain-English gloss."
        })
      );
    }

    var grid = el("div", { class: "study-grid" });
    var openWord = null;
    var detailNode = null;

    // Big groups are paged rather than dumped. Seven hundred words in one
    // scroll is a wall, not a lesson.
    var pages = Math.max(1, Math.ceil(words.length / PAGE));
    var page = 0;
    var pager = pages > 1 ? el("div", { class: "pager" }) : null;

    function close() {
      if (detailNode && detailNode.parentNode) detailNode.parentNode.removeChild(detailNode);
      detailNode = null;
      var prev = grid.querySelector('[aria-expanded="true"]');
      if (prev) prev.setAttribute("aria-expanded", "false");
      openWord = null;
    }

    function pageWords() {
      return pages === 1 ? words : words.slice(page * PAGE, (page + 1) * PAGE);
    }

    function drawPage() {
      close();
      clear(grid);
      pageWords().forEach(addCell);
      if (pager) {
        clear(pager);
        var first = pageWords()[0];
        var last = pageWords()[pageWords().length - 1];
        pager.appendChild(
          el("button", {
            class: "btn",
            type: "button",
            text: "← Back",
            disabled: page === 0,
            onclick: function () {
              if (page > 0) {
                page--;
                drawPage();
              }
            }
          })
        );
        pager.appendChild(
          el("span", { class: "pager-label" }, [
            el("span", { text: "Part " + (page + 1) + " of " + pages }),
            el("span", { class: "pager-range", text: first + " – " + last })
          ])
        );
        pager.appendChild(
          el("button", {
            class: "btn",
            type: "button",
            text: "More →",
            disabled: page === pages - 1,
            onclick: function () {
              if (page < pages - 1) {
                page++;
                drawPage();
              }
            }
          })
        );
      }
    }

    function addCell(word) {
      var cell = el("button", {
        class: "word-cell tile-face",
        type: "button",
        "aria-expanded": "false",
        text: word,
        onclick: function () {
          if (openWord === word) {
            close();
            return;
          }
          close();
          openWord = word;
          cell.setAttribute("aria-expanded", "true");
          detailNode = detailFor(word);
          // Slot the panel after the end of the row the word sits in.
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
          var def = definitionOf(word);
          WT.ui.say(word + ". " + (def ? def.text : "no definition on file"));
        }
      });
      grid.appendChild(cell);
    }

    root.appendChild(grid);
    if (pager) root.appendChild(pager);
    drawPage();

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
          text:
            level.quiz.size +
            " questions · pass at " +
            WT.ui.pct(level.quiz.passAccuracy)
        })
      ])
    );
  }

  WT.screens = WT.screens || {};
  WT.screens.teach = { render: render };
})(window.WT || (window.WT = {}));
