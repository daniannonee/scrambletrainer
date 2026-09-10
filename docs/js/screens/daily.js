/* The daily puzzle screen: one board, one rack, one play.

   Interaction, two ways and both always live: drag a tile onto a square, or tap
   a tile and then tap a square. A placed tile can be dragged to another square,
   or off the board to take it back. The score preview updates on every change,
   using the same validator the rest of the app uses — so what it says the play
   is worth is what it will be worth.

   You commit once. After that the day is read-only and the best play is shown.

   Exposes WT.screens.daily. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;
  var B = WT.board;

  /* Board drawing and dragging live in js/screens/boardui.js — the game mode
     draws the same board and must not have its own copy. */
  var UI = WT.boardui;
  var boardGrid = UI.boardGrid;
  var fitGrid = UI.fitGrid;
  var autoFit = UI.autoFit;
  var makeDragger = UI.makeDragger;

  /* --- playing ------------------------------------------------------- */

  function renderPlay(root, puzzle, onDone, onHome) {
    clear(root);

    var placed = []; // [{ r, c, tile, from }] — from = rack index
    var heldIndex = null; // rack tile picked up
    var boardWrap = el("div", { class: "board-wrap" });
    var rackWrap = el("div", { class: "rack-row" });
    var readout = el("div", { class: "play-readout", role: "status" });
    var submitBtn = el("button", {
      class: "btn btn-primary", type: "button", text: "Commit this play", disabled: true
    });
    var clearBtn = el("button", { class: "btn", type: "button", text: "Take back" });

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← Home", onclick: onHome }),
        el("span", { class: "counter", text: puzzle.key })
      ])
    );
    root.appendChild(el("h2", { text: "Today's board" }));
    root.appendChild(
      el("p", {
        class: "lede",
        text:
          "Score as high as you can with this rack. One play, then it is locked " +
          "for the day and you will see the best that was available."
      })
    );

    root.appendChild(boardWrap);
    root.appendChild(el("p", { class: "rack-label", text: "Your rack" }));
    root.appendChild(rackWrap);
    root.appendChild(readout);
    root.appendChild(el("div", { class: "daily-actions" }, [submitBtn, clearBtn]));
    root.appendChild(
      el("p", {
        class: "quiz-hint",
        text:
          "Drag a tile onto the board, or tap a tile then tap a square. Drag a " +
          "placed tile to move it, or off the board to take it back."
      })
    );

    function workingBoard() {
      var b = B.clone(puzzle.board);
      placed.forEach(function (p) { B.put(b, p.r, p.c, p.tile); });
      return b;
    }

    function placedAt(r, c) {
      for (var i = 0; i < placed.length; i++) {
        if (placed[i].r === r && placed[i].c === c) return i;
      }
      return -1;
    }

    /* Put rack tile `index` onto (r, c). The single place a tile lands, so tap
       and drag cannot drift apart.

       Asynchronous because a blank has to ask which letter it is, and that is a
       grid the player picks from rather than a value this function can compute.
       `done(true)` means the tile went down. */
    function placeFromRack(index, r, c, done) {
      done = done || function () {};
      if (index == null) return done(false);
      if (B.at(puzzle.board, r, c) != null) return done(false); // the board owns it
      if (placedAt(r, c) >= 0) return done(false); // already holding one of ours

      var tile = puzzle.rack[index];
      if (tile !== "_") {
        placed.push({ r: r, c: c, tile: tile, from: index });
        return done(true);
      }
      UI.pickLetter(function (letter) {
        if (!letter) return done(false); // cancelled
        placed.push({ r: r, c: c, tile: letter.toLowerCase(), from: index }); // blanks are lowercase
        done(true);
      });
    }

    function onSquare(r, c) {
      var existing = placedAt(r, c);
      if (existing >= 0) { // take it back
        placed.splice(existing, 1);
        draw();
        return;
      }
      if (heldIndex == null) return;
      placeFromRack(heldIndex, r, c, function (ok) {
        if (ok) heldIndex = null;
        draw();
      });
    }

    var dragger = makeDragger({
      onDrop: function (source, r, c) {
        if (source.type === "rack") {
          placeFromRack(source.index, r, c, function (ok) {
            if (ok) heldIndex = null;
            draw();
          });
          return;
        } else {
          // Moving a tile already on the board to a different square.
          var i = placedAt(source.r, source.c);
          if (i < 0) return draw();
          if (source.r === r && source.c === c) return draw();
          if (B.at(puzzle.board, r, c) != null || placedAt(r, c) >= 0) return draw();
          placed[i].r = r;
          placed[i].c = c;
        }
        draw();
      },
      /* Dragged off the board entirely: that means take it back. */
      onDropOutside: function (source) {
        if (source.type === "board") {
          var i = placedAt(source.r, source.c);
          if (i >= 0) placed.splice(i, 1);
        }
        heldIndex = null;
        draw();
      }
    });

    function draw() {
      var fresh = {};
      placed.forEach(function (p) { fresh[p.r + "," + p.c] = true; });

      clear(boardWrap);
      var grid = boardGrid(workingBoard(), {
        onSquare: onSquare,
        freshAt: fresh,
        onSquareDragStart: function (ev, r, c) {
          // Only our own freshly-placed tiles can be picked back up.
          if (placedAt(r, c) < 0) return;
          dragger.start(ev, ev.currentTarget, { type: "board", r: r, c: c });
        }
      });
      boardWrap.appendChild(grid);
      fitGrid(grid, 460);

      clear(rackWrap);
      puzzle.rack.forEach(function (tile, i) {
        var used = placed.some(function (p) { return p.from === i; });
        var node = el("button", {
          class: "tile tile-face" + (used ? " is-used" : "") +
            (heldIndex === i ? " is-held" : ""),
          type: "button",
          disabled: used,
          "aria-pressed": heldIndex === i ? "true" : "false",
          "aria-label": tile === "_" ? "blank tile" : "tile " + tile,
          onclick: function () {
            heldIndex = heldIndex === i ? null : i;
            draw();
          }
        }, [
          document.createTextNode(tile === "_" ? " " : tile),
          tile === "_" ? null : el("span", {
            class: "tile-value", text: String(B.valueOfTile(tile))
          })
        ]);
        if (!used) {
          node.addEventListener("pointerdown", function (ev) {
            dragger.start(ev, node, { type: "rack", index: i });
          });
        }
        rackWrap.appendChild(node);
      });

      clear(readout);
      if (!placed.length) {
        readout.appendChild(el("span", { class: "muted", text: "Nothing placed yet." }));
        submitBtn.disabled = true;
        return;
      }
      var verdict = B.validate(puzzle.board, placed.map(function (p) {
        return { r: p.r, c: p.c, tile: p.tile };
      }));
      if (!verdict.ok) {
        readout.appendChild(el("span", { class: "readout-bad", text: verdict.reason }));
        submitBtn.disabled = true;
        return;
      }
      readout.appendChild(
        el("span", {}, [
          el("span", { class: "readout-words", text: verdict.words.map(function (w) {
            return w.word;
          }).join(" · ") }),
          el("span", { class: "readout-score", text: verdict.score + (verdict.bingo ? " + 50" : "") })
        ])
      );
      submitBtn.disabled = false;
    }

    clearBtn.addEventListener("click", function () {
      placed = [];
      heldIndex = null;
      draw();
    });

    submitBtn.addEventListener("click", function () {
      var tiles = placed.map(function (p) { return { r: p.r, c: p.c, tile: p.tile }; });
      var verdict = B.validate(puzzle.board, tiles);
      if (!verdict.ok) return;
      if (!window.confirm(
        "Commit " + verdict.words.map(function (w) { return w.word; }).join(", ") +
        " for " + verdict.score + "? You only get one play today."
      )) return;
      var graded = WT.daily.grade(verdict.score, puzzle.best);
      WT.daily.record(new Date(), {
        score: verdict.score,
        best: puzzle.best,
        word: verdict.words[0] ? verdict.words[0].word : null,
        tier: graded.tier
      });
      onDone();
    });

    /* draw() rebuilds the grid, so the listener refits whatever is there now
       rather than holding a reference to a node that has been replaced. */
    function onResize() {
      var g = boardWrap.querySelector(".bgrid");
      if (g) fitGrid(g, 460);
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    draw();

    return function () {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }

  /* --- the day, already played --------------------------------------- */

  function renderResult(root, puzzle, onHome) {
    clear(root);
    var result = WT.daily.resultFor(new Date());
    var graded = WT.daily.grade(result.score, result.best);

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← Home", onclick: onHome }),
        el("span", { class: "counter", text: puzzle.key })
      ])
    );

    root.appendChild(el("p", { class: "label", text: "Today · played" }));
    root.appendChild(el("p", { class: "score" + (graded.perfect ? " is-pass" : ""),
      text: result.score + " / " + result.best }));
    root.appendChild(el("h2", { class: "tier-name", text: graded.tier }));
    root.appendChild(el("p", { class: "lede", text: graded.note }));

    var streak = WT.daily.streak();
    root.appendChild(
      el("p", { class: "mode-next" }, [
        el("span", { class: "muted", text: "Played " + result.word + " for " + result.score + ". " }),
        el("b", { text: streak > 1 ? streak + " days in a row." : "" })
      ])
    );

    // The answer.
    var solved = B.clone(puzzle.board);
    puzzle.bestPlay.forEach(function (p) { B.put(solved, p.r, p.c, p.tile); });
    var fresh = {};
    puzzle.bestPlay.forEach(function (p) { fresh[p.r + "," + p.c] = true; });

    var solvedGrid = boardGrid(solved, { freshAt: fresh, small: true });
    var solvedWrap = el("div", { class: "board-wrap" }, [solvedGrid]);
    root.appendChild(
      el("div", { class: "result-block" }, [
        el("h3", { text: graded.perfect ? "You found it" : "The best play was" }),
        el("p", {}, [
          el("b", { text: puzzle.bestWord }),
          document.createTextNode(" for " + puzzle.best + " points, out of " +
            puzzle.options.toLocaleString("en-US") + " legal plays.")
        ]),
        solvedWrap
      ])
    );
    var stopFit = autoFit(solvedGrid, 340);

    /* Share. No network, no account: the text is built on the device and put on
       the clipboard. Clipboard access can be refused or absent (older WebKit,
       an insecure origin), so the fallback shows the text to copy by hand
       rather than failing silently. */
    var shareNote = el("p", { class: "share-note", text: "" });
    var shareBtn = el("button", {
      class: "btn", type: "button", text: "Copy result",
      onclick: function () {
        var text = WT.daily.shareText(new Date());
        if (!text) return;
        var ok = function () {
          shareNote.textContent = "Copied.";
          WT.ui.say("Result copied to the clipboard.");
        };
        var fallback = function () {
          shareNote.textContent = "";
          shareNote.appendChild(el("span", { text: "Copy this: " }));
          shareNote.appendChild(el("code", { class: "share-text", text: text.replace(/\n/g, "  ") }));
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(ok, fallback);
        } else {
          fallback();
        }
      }
    });

    root.appendChild(
      el("div", { class: "result-actions" }, [
        el("button", { class: "btn btn-primary", type: "button", text: "Back home", onclick: onHome }),
        shareBtn
      ])
    );
    root.appendChild(el("div", { class: "share-row" }, [shareNote]));

    var repeats = WT.daily.repeatsAfter();
    if (repeats < 30) {
      root.appendChild(
        el("p", { class: "coverage-note",
          text: "The puzzle pool runs out in " + repeats + " days and will start " +
            "repeating. Rebuild it with tools/build_daily.js." })
      );
    }

    return stopFit;
  }

  function render(root, onHome) {
    var puzzle = WT.daily.forDate(new Date());
    if (!puzzle) {
      clear(root);
      root.appendChild(
        el("div", { class: "topbar" }, [
          el("button", { class: "btn-ghost", type: "button", text: "← Home", onclick: onHome })
        ])
      );
      root.appendChild(el("h2", { text: "No puzzle today" }));
      root.appendChild(el("p", { class: "lede",
        text: "The daily pool did not load. Run tools/build_daily.js." }));
      return;
    }
    /* One screen replaces another in place here, so the teardown handed back to
       the router has to follow whichever is currently mounted. */
    var stop = null;
    function setStop(fn) {
      if (stop) stop();
      stop = fn || null;
    }

    if (WT.daily.played(new Date())) {
      setStop(renderResult(root, puzzle, onHome));
    } else {
      setStop(
        renderPlay(root, puzzle, function () {
          setStop(renderResult(root, puzzle, onHome));
        }, onHome)
      );
    }
    return function () {
      setStop(null);
    };
  }

  WT.screens = WT.screens || {};
  WT.screens.daily = { render: render, boardGrid: boardGrid };
})(window.WT || (window.WT = {}));
