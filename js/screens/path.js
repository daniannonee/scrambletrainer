/* The Path home screen: the level sequence and where you are on it. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;

  var TILE = 68; // tile size, matches .level-tile in CSS
  var GAP = 34; // .level padding-bottom, matches CSS

  function render(root, onOpen, onHome) {
    clear(root);

    var progress = WT.levels.overallProgress();

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("button", { class: "btn-ghost", type: "button", text: "← Home", onclick: onHome }),
        el("span", { class: "counter" }, [
          el("span", { text: progress.done + " of " + progress.total }),
          progress.done
            ? el("span", { class: "meter" }, [
                el("span", {
                  class: "meter-fill",
                  style: "width:" + (progress.done / progress.total) * 100 + "%"
                })
              ])
            : null
        ])
      ])
    );

    root.appendChild(
      el("header", { class: "masthead" }, [
        el("h1", { text: "Learn the words." }),
        el("p", {
          text:
            "The groups that actually decide games, in the order worth learning " +
            "them. Ten levels. Start at the top."
        })
      ])
    );

    var path = el("div", { class: "path" });
    var trail = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    trail.setAttribute("class", "path-rail");
    trail.setAttribute("aria-hidden", "true");
    trail.setAttribute("preserveAspectRatio", "none");
    path.appendChild(trail);

    var levels = WT.levels.all();
    var lastComplete = -1;

    levels.forEach(function (level, i) {
      var status = WT.levels.statusOf(level);
      if (status === "complete") lastComplete = i;

      var saved = WT.store.levelState(level.id);
      var classes = ["level", "is-" + status];
      if (!level.built) classes.push("is-unbuilt");

      var meta;
      if (status === "complete") {
        meta = "Cleared at " + WT.ui.pct(saved.bestAccuracy || 0);
      } else if (!level.built) {
        meta = "Not built yet";
      } else if (status === "current") {
        meta = saved.attempts ? "In progress" : "Start here";
      } else {
        meta = "Locked";
      }

      var count = level.group
        ? WT.groups.get(level.group).length + " words"
        : level.kind === "stems"
        ? (level.stemCount || 20) + " stems"
        : null;

      var body = [
        el("h2", { class: "level-title", text: level.title }),
        el("p", { class: "level-blurb", text: level.blurb }),
        el("div", {
          class: "level-state",
          text: meta + (count ? " · " + count : "")
        })
      ];
      if (level.openQuestion) {
        body.push(el("div", { class: "note", text: "Open question — " + level.openQuestion }));
      }

      var interactive = status !== "locked" && level.built;

      var item = el(
        interactive ? "button" : "div",
        {
          class: classes.join(" "),
          type: interactive ? "button" : null,
          "aria-disabled": interactive ? null : "true",
          onclick: interactive
            ? function () {
                onOpen(level);
              }
            : null
        },
        [
          WT.ui.tile(status === "complete" ? "\u2713" : level.tile, i + 1, {
            class: "level-tile"
          }),
          el("span", { class: "level-body" }, body)
        ]
      );
      path.appendChild(item);
    });

    root.appendChild(path);
    drawTrail(trail, path, levels.length, lastComplete);

    // Credits and the reset control live on home now, not on every screen.
  }

  /* The trail is drawn after layout so it always matches the real node
     positions, whatever the text wrapped to. */
  function drawTrail(svg, path, count, lastComplete) {
    requestAnimationFrame(function () {
      var items = path.querySelectorAll(".level");
      if (!items.length) return;
      var box = path.getBoundingClientRect();
      var pts = [];
      for (var i = 0; i < items.length; i++) {
        var n = items[i].querySelector(".level-tile").getBoundingClientRect();
        pts.push({
          x: n.left - box.left + n.width / 2,
          y: n.top - box.top + n.height / 2
        });
      }
      svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
      svg.setAttribute("width", box.width);
      svg.setAttribute("height", box.height);
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      function segment(from, to) {
        var a = pts[from];
        var b = pts[to];
        // Both control points on the same side, so each segment bows out and
        // the rail reads as a route rather than a ruler.
        var bow = (to % 2 ? 1 : -1) * 22;
        return (
          "M" + a.x + " " + (a.y + TILE / 2 - 2) +
          " C" + (a.x + bow) + " " + (a.y + TILE / 2 + GAP * 0.6) +
          " " + (b.x + bow) + " " + (b.y - TILE / 2 - GAP * 0.6) +
          " " + b.x + " " + (b.y - TILE / 2 + 2)
        );
      }

      for (var j = 0; j < pts.length - 1; j++) {
        var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", segment(j, j + 1));
        // A segment counts as walked once the level above it is complete.
        if (j <= lastComplete) p.setAttribute("class", "rail-done");
        svg.appendChild(p);
      }
    });
  }

  WT.screens = WT.screens || {};
  WT.screens.path = { render: render };
})(window.WT || (window.WT = {}));
