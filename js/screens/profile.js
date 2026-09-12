/* Profile: your name, and everything the six modes have recorded about you.

   The stats themselves live in js/screens/stats.js, which already renders every
   figure the app stores. This screen puts an identity on top of it rather than
   duplicating any of it — two versions of "how am I doing" would drift apart,
   and the one that drifted would be the one somebody read.

   Exposes WT.screens.profile. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;

  function render(root) {
    clear(root);
    var p = WT.profile.get();
    var s = WT.profile.stats();

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("h1", { class: "tabtitle", text: "Profile" }),
        WT.shell.menuButton()
      ])
    );

    /* --- name ------------------------------------------------------------ */
    var input = el("input", {
      class: "nameinput", type: "text", value: p.name || "",
      maxlength: String(WT.profile.NAME_MAX),
      placeholder: "Your name",
      "aria-label": "Your name"
    });
    var saved = el("span", { class: "share-note" });

    function saveName() {
      WT.profile.setName(input.value);
      saved.textContent = "Saved.";
      var h = root.querySelector(".profile-hello");
      if (h) h.textContent = WT.profile.displayName();
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); saveName(); input.blur(); }
    });
    input.addEventListener("blur", saveName);

    root.appendChild(
      el("p", { class: "profile-hello", text: WT.profile.displayName() })
    );
    root.appendChild(
      el("div", { class: "result-block" }, [
        el("h3", { text: "Name" }),
        el("p", { class: "stat-note",
          text: "Only used to label your code when you compare with a friend. It " +
            "stays on this device." }),
        input,
        el("div", { class: "share-row" }, [
          el("button", { class: "btn", type: "button", text: "Save", onclick: saveName }),
          saved
        ])
      ])
    );

    /* --- the headline numbers -------------------------------------------- *
       Only once there is something to head. A fresh install showing "0 / 10
       levels, 0 day streak, 0 / 0 games won" is a wall of zeros pretending to
       be a dashboard — the same reason the stats screen below hides any section
       it has no data for.                                                     */
    var started = s.levels || s.daily.days || s.review.tracked ||
      s.games.played || s.strategy.seen;

    if (started) root.appendChild(
      el("div", { class: "result-block" }, [
        el("h3", { text: "Where you are" }),
        el("ul", { class: "stat-list" }, [
          [s.levels + " / " + s.levelTotal, "levels cleared"],
          [s.daily.streak, "day streak on the daily board"],
          [s.review.retired, "words learned and retired"],
          [s.games.won + " / " + s.games.played, "games won"]
        ].map(function (r) {
          return el("li", {}, [
            el("span", { class: "stat-value", text: String(r[0]) }),
            el("span", { class: "stat-label", text: r[1] })
          ]);
        }))
      ])
    );

    /* --- everything else, from the one place that renders it -------------- */
    var detail = el("div", { class: "profile-detail" });
    root.appendChild(detail);
    WT.screens.stats.render(detail, null, { embedded: true });
  }

  WT.screens = WT.screens || {};
  WT.screens.profile = { render: render };
})(window.WT || (window.WT = {}));
