/* Everything for drawing and manipulating a 15x15 board, shared by every mode
   that shows one. Extracted from the daily puzzle when the game mode arrived:
   two copies of a drag implementation would have drifted apart inside a week.

   Exposes WT.boardui. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var B = WT.board;

  /* --- shared bits --------------------------------------------------- */

  var PREMIUM_LABEL = { DL: "2L", TL: "3L", DW: "2W", TW: "3W" };

  /* Give every square the same whole number of pixels.

     A 15-column `1fr` grid inside a percentage-width box splits the leftover
     sub-pixels unevenly, so a handful of columns come out a pixel wider and the
     board looks warped. Measuring once and setting an integer track size makes
     that impossible. 16 = 2px of padding + 14 gaps of 1px. */
  function fitGrid(grid, maxWidth) {
    var wrap = grid.parentNode;
    var avail = Math.min((wrap && wrap.clientWidth) || maxWidth, maxWidth);
    var cell = Math.floor((avail - 16) / B.SIZE);
    grid.style.setProperty("--sq", Math.max(8, cell) + "px");
  }

  /* Re-fit on resize and orientation change; returns its own teardown so the
     router can drop the listener when the screen goes away. */
  function autoFit(grid, maxWidth) {
    var fit = function () {
      fitGrid(grid, maxWidth);
    };
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    return function () {
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
    };
  }

  function boardGrid(board, opts) {
    var o = opts || {};
    var grid = el("div", { class: "bgrid" + (o.small ? " is-small" : "") });
    for (var r = 0; r < B.SIZE; r++) {
      for (var c = 0; c < B.SIZE; c++) {
        (function (r, c) {
          var cell = B.at(board, r, c);
          var premium = B.premiumAt(r, c);
          var classes = ["bsq"];
          if (premium) classes.push("is-" + premium.toLowerCase());
          if (B.isCenter(r, c)) classes.push("is-centre");
          if (cell != null) classes.push("is-tile");
          if (o.freshAt && o.freshAt[r + "," + c]) classes.push("is-fresh");
          if (o.ghostAt && o.ghostAt[r + "," + c]) classes.push("is-ghost");

          var kids = [];
          if (cell != null) {
            kids.push(el("span", { class: "bletter", text: cell.toUpperCase() }));
            if (B.isBlankAt(board, r, c)) kids.push(el("span", { class: "bblank" }));
          } else if (o.ghostAt && o.ghostAt[r + "," + c]) {
            kids.push(el("span", { class: "bletter", text: o.ghostAt[r + "," + c].toUpperCase() }));
          } else if (premium && !B.isCenter(r, c)) {
            // The centre keeps its star instead; it would collide with a label.
            kids.push(el("span", { class: "premium-label", text: PREMIUM_LABEL[premium] }));
          }

          var node = o.onSquare
            ? el("button", {
                class: classes.join(" "),
                type: "button",
                "data-r": String(r),
                "data-c": String(c),
                "aria-label": squareLabel(r, c, cell, premium),
                onclick: function () { o.onSquare(r, c); }
              }, kids)
            : el("div", { class: classes.join(" "), "aria-hidden": "true" }, kids);
          if (o.onSquareDragStart) {
            node.addEventListener("pointerdown", function (ev) {
              o.onSquareDragStart(ev, r, c);
            });
          }
          grid.appendChild(node);
        })(r, c);
      }
    }
    return grid;
  }

  function squareLabel(r, c, cell, premium) {
    var where = "row " + (r + 1) + " column " + (c + 1);
    if (cell != null) return cell.toUpperCase() + " at " + where;
    var names = { TW: "triple word", DW: "double word", TL: "triple letter", DL: "double letter" };
    return (premium ? names[premium] + ", " : "") + "empty, " + where;
  }

  /* --- picking a tile up and putting it down --------------------------- *

     Two ways to move a tile, both live at once: tap the tile then tap a square,
     or drag it. Drag is what a thumb expects; tap-tap is what a keyboard and a
     screen reader can do, and it is the fallback if a pointer gesture is
     interrupted. Neither is a special case of the other, so both are handled
     explicitly rather than one being simulated on top of the other.

     Built on Pointer Events, which cover touch, mouse and stylus in one path —
     no separate touchstart/mousedown branches to disagree with each other. */

  var DRAG_THRESHOLD = 6; // px before a press counts as a drag rather than a tap

  function makeDragger(handlers) {
    var drag = null;

    function ghostFor(node) {
      var g = node.cloneNode(true);
      var box = node.getBoundingClientRect();
      g.className = node.className.replace(/\bis-dragging\b/, "") + " drag-ghost";
      g.style.width = box.width + "px";
      g.style.height = box.height + "px";
      g.removeAttribute("id");
      document.body.appendChild(g);
      return g;
    }

    function moveGhost(x, y) {
      drag.ghost.style.left = x + "px";
      drag.ghost.style.top = y + "px";
    }

    function squareUnder(x, y) {
      var node = document.elementFromPoint(x, y);
      // The ghost is pointer-events:none, so this finds what is really beneath.
      while (node && node !== document.body) {
        if (node.classList && node.classList.contains("bsq")) return node;
        node = node.parentNode;
      }
      return null;
    }

    function clearHighlight() {
      if (drag && drag.over) drag.over.classList.remove("is-drop-target");
      if (drag) drag.over = null;
    }

    function onMove(ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.x0;
      var dy = ev.clientY - drag.y0;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      if (!drag.moved) {
        drag.moved = true;
        drag.ghost = ghostFor(drag.node);
        drag.node.classList.add("is-dragging");
      }
      ev.preventDefault();
      moveGhost(ev.clientX, ev.clientY);
      var sq = squareUnder(ev.clientX, ev.clientY);
      if (sq !== drag.over) {
        clearHighlight();
        drag.over = sq;
        if (sq) sq.classList.add("is-drop-target");
      }
    }

    function finish(ev, cancelled) {
      if (!drag) return;
      var d = drag;
      clearHighlight();
      if (d.ghost) d.ghost.parentNode.removeChild(d.ghost);
      d.node.classList.remove("is-dragging");
      drag = null;

      if (!d.moved) return; // a tap: let the click handler deal with it

      /* No click-suppression is needed here, and adding some actively broke a
         genuine tap made straight after a drag. Every drop calls draw(), which
         rebuilds the rack and all 225 squares, so the node a stray click would
         target is detached before the click dispatches and the handler never
         runs. Verified by tools/daily_check.js, which drags, then taps, then
         checks the tap registered and nothing extra was placed. */
      if (cancelled) return;

      var sq = squareUnder(ev.clientX, ev.clientY);
      if (sq) {
        handlers.onDrop(d.source, Number(sq.getAttribute("data-r")), Number(sq.getAttribute("data-c")));
      } else {
        handlers.onDropOutside(d.source);
      }
    }

    return {
      /* `source` describes what is being dragged: a rack index or a square. */
      start: function (ev, node, source) {
        if (ev.pointerType === "mouse" && ev.button !== 0) return;
        if (!node) return;
        drag = {
          node: node,
          source: source,
          x0: ev.clientX,
          y0: ev.clientY,
          moved: false,
          ghost: null,
          over: null
        };
        try {
          node.setPointerCapture(ev.pointerId);
        } catch (e) {
          /* capture is an optimisation, not a requirement */
        }
        node.addEventListener("pointermove", onMove);
        node.addEventListener("pointerup", finish);
        node.addEventListener("pointercancel", function (e) {
          finish(e, true);
        });
      }
    };
  }

  /* --- choosing what a blank is played as ------------------------------ *

     Replaces window.prompt(), which on a phone opens a system text field and
     asks someone to type a single letter — the worst possible input for a
     twenty-six-way choice made with a thumb. This is a grid of the alphabet.

     Asynchronous by necessity: a caller cannot place the tile until the letter
     comes back, so placement is a callback everywhere rather than a return
     value that is sometimes a promise and sometimes not. */
  function pickLetter(onPick) {
    var previouslyFocused = document.activeElement;
    var scrim = el("div", { class: "picker-scrim" });
    var grid = el("div", { class: "picker-grid" });

    function close(letter) {
      document.removeEventListener("keydown", onKey, true);
      if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      onPick(letter || null);
    }

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close(null);
        return;
      }
      if (/^[A-Za-z]$/.test(e.key)) {
        e.preventDefault();
        close(e.key.toUpperCase());
        return;
      }
      // A modal must not let focus wander behind it.
      if (e.key === "Tab") {
        var focusable = scrim.querySelectorAll("button");
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(function (letter) {
      grid.appendChild(
        el("button", {
          class: "tile tile-face picker-letter",
          type: "button",
          text: letter,
          "aria-label": "play the blank as " + letter,
          onclick: function () { close(letter); }
        })
      );
    });

    var panel = el("div", {
      class: "picker",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Play the blank as which letter"
    }, [
      el("h3", { class: "picker-title", text: "Play the blank as" }),
      el("p", { class: "picker-note", text: "A blank scores nothing, whatever it becomes." }),
      grid,
      el("button", { class: "btn picker-cancel", type: "button", text: "Cancel",
        onclick: function () { close(null); } })
    ]);

    scrim.appendChild(panel);
    // Clicking the surround cancels; clicking inside the panel must not.
    scrim.addEventListener("click", function (e) {
      if (e.target === scrim) close(null);
    });
    document.body.appendChild(scrim);
    document.addEventListener("keydown", onKey, true);
    grid.firstChild.focus();
  }


  WT.boardui = {
    PREMIUM_LABEL: PREMIUM_LABEL,
    DRAG_THRESHOLD: DRAG_THRESHOLD,
    fitGrid: fitGrid,
    autoFit: autoFit,
    boardGrid: boardGrid,
    squareLabel: squareLabel,
    makeDragger: makeDragger,
    pickLetter: pickLetter
  };
})(window.WT || (window.WT = {}));
