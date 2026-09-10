/* Play a full game against the engine.

   The board, the dragging and the blank picker all come from
   js/screens/boardui.js — this screen is turn structure, the score line, and
   what the opponent just did.

   ONE THING WORTH KNOWING ABOUT THE OPPONENT'S TURN
   Generating every legal move is real work — up to a couple of thousand moves
   on an open board, and the trie has to be built the first time. On a phone
   that is a visible pause. So the opponent's turn is deliberately split: paint
   "thinking", yield to the browser so the paint actually happens, and only then
   search. Doing the search inline would freeze the screen mid-tap with no
   explanation, which reads as a crash rather than as thought.

   Exposes WT.screens.game. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;
  var B = WT.board;
  var UI = WT.boardui;

  /* --- choosing an opponent -------------------------------------------- */

  function renderMenu(root, onStart, onHome) {
    clear(root);
    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← Home", onclick: onHome })
      ])
    );
    root.appendChild(el("h2", { text: "Play a game" }));
    root.appendChild(
      el("p", {
        class: "lede",
        text:
          "A full game against the engine — the same move generator that solves " +
          "the daily. Pick how hard you want it."
      })
    );

    var list = el("div", { class: "mode-list" });
    WT.opponent.LEVELS.forEach(function (level) {
      var best = WT.store.gameRecord(level.id);
      list.appendChild(
        el("button", {
          class: "mode-card",
          type: "button",
          onclick: function () { onStart(level.id); }
        }, [
          WT.ui.tile(level.name.charAt(0), null, { class: "mode-tile" }),
          el("span", { class: "mode-body" }, [
            el("h3", { class: "mode-title", text: level.name }),
            el("p", { class: "mode-blurb", text: level.blurb }),
            el("div", { class: "mode-state" }, [
              el("span", {
                class: "muted",
                text: best.played
                  ? best.won + " won of " + best.played +
                    (best.bestScore ? " · best " + best.bestScore : "")
                  : "Not played"
              })
            ])
          ])
        ])
      );
    });
    root.appendChild(list);
  }

  /* --- the game --------------------------------------------------------- */

  function renderGame(root, game, levelId, onOver, onHome) {
    clear(root);
    var level = WT.opponent.levelById(levelId);

    var placed = [];
    var heldIndex = null;
    var swapping = null; // null, or an array of rack indices being exchanged
    var busy = false; // the opponent is thinking; the board is read-only

    var scoreLine = el("div", { class: "score-line" });
    var boardWrap = el("div", { class: "board-wrap" });
    var rackWrap = el("div", { class: "rack-row" });
    var readout = el("div", { class: "play-readout", role: "status" });
    var log = el("div", { class: "turn-log", role: "status" });
    var actions = el("div", { class: "daily-actions" });

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", {
          class: "btn-ghost", type: "button", text: "← Leave",
          onclick: function () {
            if (window.confirm("Leave this game? It will not be saved.")) onHome();
          }
        }),
        el("span", { class: "counter", text: level.name })
      ])
    );
    root.appendChild(scoreLine);
    root.appendChild(boardWrap);
    root.appendChild(log);
    root.appendChild(el("p", { class: "rack-label", text: "Your rack" }));
    root.appendChild(rackWrap);
    root.appendChild(readout);
    root.appendChild(actions);

    function workingBoard() {
      var b = B.clone(game.state().board);
      placed.forEach(function (p) { B.put(b, p.r, p.c, p.tile); });
      return b;
    }

    function placedAt(r, c) {
      for (var i = 0; i < placed.length; i++) {
        if (placed[i].r === r && placed[i].c === c) return i;
      }
      return -1;
    }

    function usedRackIndices() {
      return placed.map(function (p) { return p.from; });
    }

    function placeFromRack(index, r, c, done) {
      done = done || function () {};
      var s = game.state();
      if (index == null || busy || swapping) return done(false);
      if (B.at(s.board, r, c) != null) return done(false);
      if (placedAt(r, c) >= 0) return done(false);
      if (usedRackIndices().indexOf(index) !== -1) return done(false);

      var tile = s.rack[index];
      if (tile !== "_") {
        placed.push({ r: r, c: c, tile: tile, from: index });
        return done(true);
      }
      UI.pickLetter(function (letter) {
        if (!letter) return done(false);
        placed.push({ r: r, c: c, tile: letter.toLowerCase(), from: index });
        done(true);
      });
    }

    function onSquare(r, c) {
      if (busy || swapping) return;
      var existing = placedAt(r, c);
      if (existing >= 0) {
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

    var dragger = UI.makeDragger({
      onDrop: function (source, r, c) {
        if (busy || swapping) return;
        if (source.type === "rack") {
          placeFromRack(source.index, r, c, function (ok) {
            if (ok) heldIndex = null;
            draw();
          });
          return;
        }
        var i = placedAt(source.r, source.c);
        if (i < 0 || (source.r === r && source.c === c)) return draw();
        if (B.at(game.state().board, r, c) != null || placedAt(r, c) >= 0) return draw();
        placed[i].r = r;
        placed[i].c = c;
        draw();
      },
      onDropOutside: function (source) {
        if (source.type === "board") {
          var i = placedAt(source.r, source.c);
          if (i >= 0) placed.splice(i, 1);
        }
        heldIndex = null;
        draw();
      }
    });

    /* --- the opponent's turn -------------------------------------------- */

    function say(text, kind) {
      clear(log);
      log.appendChild(el("span", { class: "turn-note" + (kind ? " is-" + kind : ""), text: text }));
    }

    function opponentTurn() {
      busy = true;
      say(level.name + " is thinking…", "thinking");
      draw();
      // Yield so the "thinking" line actually paints before the search blocks.
      window.setTimeout(function () {
        var move = WT.opponent.takeTurn(game, level);
        busy = false;
        if (move.type === "play") {
          say(
            level.name + " played " + move.word + " for " + move.score +
              (move.bingo ? " — a bingo." : "."),
            "played"
          );
        } else if (move.type === "exchange") {
          say(level.name + " swapped " + move.count + " tiles.");
        } else {
          say(level.name + " passed.");
        }
        if (game.state().over) return finish();
        draw();
      }, 40);
    }

    function finish() {
      onOver(game, level);
    }

    /* --- drawing --------------------------------------------------------- */

    function drawScores() {
      var s = game.state();
      clear(scoreLine);
      scoreLine.appendChild(
        el("div", { class: "score-side" + (s.turn === 0 && !s.over ? " is-turn" : "") }, [
          el("span", { class: "score-name", text: "You" }),
          el("span", { class: "score-value", text: String(s.scores[0]) })
        ])
      );
      scoreLine.appendChild(
        el("span", { class: "score-bag", text: s.bag + " in the bag" })
      );
      scoreLine.appendChild(
        el("div", { class: "score-side" + (s.turn === 1 && !s.over ? " is-turn" : "") }, [
          el("span", { class: "score-name", text: level.name }),
          el("span", { class: "score-value", text: String(s.scores[1]) })
        ])
      );
    }

    function drawRack() {
      var s = game.state();
      var used = usedRackIndices();
      clear(rackWrap);
      s.rack.forEach(function (tile, i) {
        var isUsed = used.indexOf(i) !== -1;
        var isSwapping = swapping && swapping.indexOf(i) !== -1;
        var node = el("button", {
          class: "tile tile-face" + (isUsed ? " is-used" : "") +
            (heldIndex === i ? " is-held" : "") + (isSwapping ? " is-swapping" : ""),
          type: "button",
          disabled: isUsed || busy,
          "aria-pressed": heldIndex === i || isSwapping ? "true" : "false",
          "aria-label": tile === "_" ? "blank tile" : "tile " + tile,
          onclick: function () {
            if (busy) return;
            if (swapping) {
              var at = swapping.indexOf(i);
              if (at >= 0) swapping.splice(at, 1);
              else swapping.push(i);
            } else {
              heldIndex = heldIndex === i ? null : i;
            }
            draw();
          }
        }, [
          document.createTextNode(tile === "_" ? " " : tile),
          tile === "_" ? null : el("span", {
            class: "tile-value", text: String(B.valueOfTile(tile))
          })
        ]);
        if (!isUsed && !busy && !swapping) {
          node.addEventListener("pointerdown", function (ev) {
            dragger.start(ev, node, { type: "rack", index: i });
          });
        }
        rackWrap.appendChild(node);
      });
    }

    function drawReadout() {
      var s = game.state();
      clear(readout);
      if (swapping) {
        readout.appendChild(
          el("span", { class: "muted", text: swapping.length
            ? swapping.length + (swapping.length === 1 ? " tile" : " tiles") + " to swap"
            : "Tap the tiles you want to swap." })
        );
        return null;
      }
      if (busy) {
        readout.appendChild(el("span", { class: "muted", text: "…" }));
        return null;
      }
      if (!placed.length) {
        readout.appendChild(el("span", { class: "muted", text: "Nothing placed yet." }));
        return null;
      }
      var verdict = B.validate(s.board, placed.map(function (p) {
        return { r: p.r, c: p.c, tile: p.tile };
      }));
      if (!verdict.ok) {
        readout.appendChild(el("span", { class: "readout-bad", text: verdict.reason }));
        return null;
      }
      readout.appendChild(
        el("span", {}, [
          el("span", { class: "readout-words", text: verdict.words.map(function (w) {
            return w.word;
          }).join(" · ") }),
          el("span", { class: "readout-score",
            text: verdict.score + (verdict.bingo ? " + 50" : "") })
        ])
      );
      return verdict;
    }

    function drawActions(verdict) {
      clear(actions);
      if (busy) return;

      if (swapping) {
        actions.appendChild(el("button", {
          class: "btn btn-primary", type: "button",
          text: "Swap " + (swapping.length || ""),
          disabled: !swapping.length,
          onclick: function () {
            var result = game.exchange(swapping);
            swapping = null;
            if (!result.ok) {
              say(result.reason, "bad");
              draw();
              return;
            }
            say("You swapped " + result.count + " tiles.");
            if (game.state().over) return finish();
            opponentTurn();
          }
        }));
        actions.appendChild(el("button", {
          class: "btn", type: "button", text: "Cancel",
          onclick: function () { swapping = null; draw(); }
        }));
        return;
      }

      actions.appendChild(el("button", {
        class: "btn btn-primary", type: "button", text: "Play",
        disabled: !verdict,
        onclick: function () {
          var result = game.play(placed.map(function (p) {
            return { r: p.r, c: p.c, tile: p.tile };
          }));
          if (!result.ok) {
            say(result.reason, "bad");
            draw();
            return;
          }
          placed = [];
          heldIndex = null;
          say("You played " + result.words.map(function (w) { return w.word; }).join(", ") +
            " for " + result.score + (result.bingo ? " — a bingo!" : "."), "played");
          if (game.state().over) return finish();
          opponentTurn();
        }
      }));

      if (placed.length) {
        actions.appendChild(el("button", {
          class: "btn", type: "button", text: "Take back",
          onclick: function () { placed = []; heldIndex = null; draw(); }
        }));
        return;
      }

      actions.appendChild(el("button", {
        class: "btn", type: "button", text: "Swap tiles",
        disabled: !game.canExchange(),
        title: game.canExchange() ? null : "Too few tiles left in the bag",
        onclick: function () { swapping = []; heldIndex = null; draw(); }
      }));
      actions.appendChild(el("button", {
        class: "btn", type: "button", text: "Pass",
        onclick: function () {
          if (!window.confirm("Pass your turn?")) return;
          game.pass();
          say("You passed.");
          if (game.state().over) return finish();
          opponentTurn();
        }
      }));
    }

    function draw() {
      var fresh = {};
      placed.forEach(function (p) { fresh[p.r + "," + p.c] = true; });

      drawScores();
      clear(boardWrap);
      var grid = UI.boardGrid(workingBoard(), {
        onSquare: onSquare,
        freshAt: fresh,
        onSquareDragStart: function (ev, r, c) {
          if (placedAt(r, c) < 0) return;
          dragger.start(ev, ev.currentTarget, { type: "board", r: r, c: c });
        }
      });
      boardWrap.appendChild(grid);
      UI.fitGrid(grid, 460);
      drawRack();
      drawActions(drawReadout());
    }

    function onResize() {
      var g = boardWrap.querySelector(".bgrid");
      if (g) UI.fitGrid(g, 460);
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    say("Your move. The board is empty, so your first word goes through the centre.");
    draw();

    return function () {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }

  /* --- the end ---------------------------------------------------------- */

  function renderOver(root, game, level, onAgain, onHome) {
    clear(root);
    var s = game.state();
    var youWon = s.scores[0] > s.scores[1];
    var drawn = s.scores[0] === s.scores[1];

    WT.store.recordGame(level.id, {
      won: youWon,
      drawn: drawn,
      score: s.scores[0],
      against: s.scores[1]
    });

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← Home", onclick: onHome }),
        el("span", { class: "counter", text: level.name })
      ])
    );
    root.appendChild(el("p", { class: "label", text: "Game over · " + s.endReason }));
    root.appendChild(
      el("p", { class: "score" + (youWon ? " is-pass" : ""),
        text: s.scores[0] + " – " + s.scores[1] })
    );
    root.appendChild(
      el("h2", { class: "tier-name",
        text: drawn ? "A draw" : youWon ? "You win" : level.name + " wins" })
    );

    if (s.adjustments && (s.adjustments[0] || s.adjustments[1])) {
      root.appendChild(
        el("p", { class: "lede", text:
          s.wentOut === 0
            ? "You went out first, so their remaining tiles came to you: " +
              (s.adjustments[0] > 0 ? "+" : "") + s.adjustments[0] + " to you, " +
              s.adjustments[1] + " to them."
            : s.wentOut === 1
            ? "They went out first, so your remaining tiles went to them: " +
              s.adjustments[0] + " to you, +" + s.adjustments[1] + " to them."
            : "Nobody went out, so each side lost the value of its own rack."
        })
      );
    }

    var yourTurns = s.history.filter(function (h) { return h.who === 0 && h.type === "play"; });
    var theirTurns = s.history.filter(function (h) { return h.who === 1 && h.type === "play"; });
    var best = yourTurns.slice().sort(function (a, b) { return b.score - a.score; })[0];

    root.appendChild(
      el("div", { class: "result-block" }, [
        el("h3", { text: "How it went" }),
        el("ul", { class: "miss-list" }, [
          el("li", {}, [
            el("span", { class: "chip is-num", text: String(yourTurns.length) }),
            el("span", { class: "miss-def", text: "words you played" })
          ]),
          best ? el("li", {}, [
            el("span", { class: "chip is-pass is-num", text: String(best.score) }),
            el("span", { class: "miss-def", text: "your best play — " + best.words.join(", ") })
          ]) : null,
          el("li", {}, [
            el("span", { class: "chip is-num", text: String(theirTurns.length) }),
            el("span", { class: "miss-def", text: "words they played" })
          ])
        ])
      ])
    );

    var finalGrid = UI.boardGrid(s.board, { small: true });
    var finalWrap = el("div", { class: "board-wrap" }, [finalGrid]);
    root.appendChild(el("div", { class: "result-block" }, [
      el("h3", { text: "The final board" }),
      finalWrap
    ]));
    var stopFit = UI.autoFit(finalGrid, 340);

    root.appendChild(
      el("div", { class: "result-actions" }, [
        el("button", { class: "btn btn-primary", type: "button", text: "Play again",
          onclick: function () { onAgain(level.id); } }),
        el("button", { class: "btn", type: "button", text: "Back home", onclick: onHome })
      ])
    );

    return stopFit;
  }

  WT.screens = WT.screens || {};
  WT.screens.game = {
    renderMenu: renderMenu,
    renderGame: renderGame,
    renderOver: renderOver
  };
})(window.WT || (window.WT = {}));
