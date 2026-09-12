/* The app shell: three tabs along the bottom, and the stack menu.

   THE TAB BAR STAYS PUT, INCLUDING MID-GAME
   The obvious implementation hides the bar inside a quiz or a game, because a
   stray tap there could throw away a turn. That was rejected: a bar that
   disappears is not a bar, it is a screen that sometimes has one, and you can
   never be sure where you are.

   Instead it is always visible, and screens with something to lose register a
   GUARD — the same confirmation their own back button already uses. Tapping a
   tab mid-game asks "Leave this game?" exactly as "← Leave" does. The
   navigation is uniform and nothing is lost by accident.

   Exposes WT.shell. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;

  var TABS = [
    { id: "play", label: "Play", tile: "P" },
    { id: "friends", label: "Friends", tile: "F" },
    { id: "profile", label: "Profile", tile: "Y" }
  ];

  var current = "play";
  var bar = null;
  var handlers = {}; // tab id -> render function, set by app.js
  var guard = null; // () => true if it is OK to leave the current screen

  /* A screen with unsaved state calls this; the router clears it on every
     ordinary navigation, so a stale guard can never block the app. */
  function setGuard(fn) {
    guard = fn || null;
  }

  function clearGuard() {
    guard = null;
  }

  function mayLeave() {
    if (!guard) return true;
    return guard() !== false;
  }

  /* Tapping a tab ALWAYS returns to that tab's root screen, including the tab
     you are already on. That is what every tab bar does, and it is the only
     behaviour that makes sense here: you enter the daily from Play, so Play is
     still the current tab while you are deep inside it, and tapping Play has to
     bring you back out rather than do nothing. */
  function go(tab) {
    if (!mayLeave()) return;
    guard = null;
    current = tab;
    render();
  }

  function render() {
    var fn = handlers[current];
    if (fn) fn();
    paintBar();
  }

  function paintBar() {
    if (!bar) return;
    clear(bar);
    TABS.forEach(function (tab) {
      var on = tab.id === current;
      bar.appendChild(
        el("button", {
          class: "tabbtn" + (on ? " is-on" : ""),
          type: "button",
          "aria-current": on ? "page" : null,
          onclick: function () { go(tab.id); }
        }, [
          WT.ui.tile(tab.tile, null, { class: "tabtile" }),
          el("span", { class: "tablabel", text: tab.label })
        ])
      );
    });
  }

  function mount(opts) {
    handlers = opts.handlers;
    bar = el("nav", { class: "tabbar", "aria-label": "Sections" });
    document.body.appendChild(bar);
    WT.profile.applySettings();
    render();
  }

  /* --- the stack menu ---------------------------------------------------- */

  /* The button that opens it. Screens put this in their top bar. */
  function menuButton() {
    return el("button", {
      class: "stackbtn",
      type: "button",
      "aria-label": "Menu",
      "aria-haspopup": "dialog",
      onclick: openMenu
    }, [
      el("span", { class: "stackbar" }),
      el("span", { class: "stackbar" }),
      el("span", { class: "stackbar" })
    ]);
  }

  function sheet(title, build) {
    var previouslyFocused = document.activeElement;
    var scrim = el("div", { class: "picker-scrim" });

    function close() {
      document.removeEventListener("keydown", onKey, true);
      if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
    }

    var body = el("div", { class: "sheet-body" });
    var panel = el("div", {
      class: "picker sheet", role: "dialog", "aria-modal": "true", "aria-label": title
    }, [
      el("div", { class: "sheet-head" }, [
        el("h3", { class: "picker-title", text: title }),
        el("button", { class: "btn-ghost", type: "button", text: "Close", onclick: close })
      ]),
      body,
      el("button", { class: "btn sheet-done", type: "button", text: "Done", onclick: close })
    ]);

    build(body, close);
    scrim.appendChild(panel);
    scrim.addEventListener("click", function (e) { if (e.target === scrim) close(); });
    document.body.appendChild(scrim);
    document.addEventListener("keydown", onKey, true);
    var first = panel.querySelector("button, input");
    if (first) first.focus();
    return close;
  }

  function openMenu() {
    sheet("Menu", function (body, close) {
      [
        { label: "Settings", note: "Theme, pace, animation", open: openSettings },
        { label: "How this works", note: "What each mode is for", open: openHelp },
        { label: "About the word list", note: "Where the words come from, and what is missing", open: openAbout }
      ].forEach(function (item) {
        body.appendChild(
          el("button", {
            class: "sheet-row", type: "button",
            onclick: function () { close(); item.open(); }
          }, [
            el("span", { class: "sheet-row-label", text: item.label }),
            el("span", { class: "sheet-row-note", text: item.note })
          ])
        );
      });
    });
  }

  function openSettings() {
    sheet("Settings", function (body) {
      WT.profile.SETTINGS.forEach(function (def) {
        var group = el("div", { class: "setting" });
        group.appendChild(el("p", { class: "setting-label", text: def.label }));
        if (def.help) group.appendChild(el("p", { class: "setting-help", text: def.help }));
        var row = el("div", { class: "seg" });
        def.options.forEach(function (opt) {
          row.appendChild(
            el("button", {
              class: "seg-btn" + (WT.profile.setting(def.key) === opt.value ? " is-on" : ""),
              type: "button",
              text: opt.label,
              onclick: function () {
                WT.profile.setSetting(def.key, opt.value);
                row.querySelectorAll(".seg-btn").forEach(function (b) {
                  b.classList.remove("is-on");
                });
                this.classList.add("is-on");
              }
            })
          );
        });
        group.appendChild(row);
        body.appendChild(group);
      });

      body.appendChild(
        el("div", { class: "setting" }, [
          el("p", { class: "setting-label", text: "Everything you have done" }),
          el("p", { class: "setting-help",
            text: "Progress lives on this device only — it is not backed up anywhere " +
              "and clearing your browser data will erase it." }),
          el("button", {
            class: "btn setting-danger", type: "button", text: "Reset all progress",
            onclick: function () {
              if (!window.confirm("Erase every level, score and streak on this device? This cannot be undone.")) return;
              WT.store.reset();
              window.location.reload();
            }
          })
        ])
      );
    });
  }

  function openHelp() {
    sheet("How this works", function (body) {
      [
        ["Learn the words", "Ten levels in the order worth learning them. Each one teaches a group, then quizzes you. Get a word wrong and it goes into Review."],
        ["Unscramble", "Letters out of order, put them back. Practice, not progression — a bad round costs nothing."],
        ["Today's board", "One board, one rack, one play, graded against the best play that was actually available. Same board for everyone; one attempt a day."],
        ["Review", "The words you got wrong, coming back tomorrow, then in 2, 4, 8, 16 and 32 days until they stick. No pass mark."],
        ["Play a game", "A full game against the engine. Three strengths — Gentle plays an ordinary move, Sharp always takes the best one available."],
        ["The best play", "Two plays on one board. The higher score is not always the better move once you count what it leaves you and what it hands your opponent."]
      ].forEach(function (pair) {
        body.appendChild(
          el("div", { class: "help-item" }, [
            el("h4", { text: pair[0] }),
            el("p", { text: pair[1] })
          ])
        );
      });
      body.appendChild(
        el("div", { class: "help-item" }, [
          el("h4", { text: "Keyboard" }),
          el("p", { text: "In a quiz: ← is “not a word”, → is “it’s a word”, any key moves past a verdict. Escape closes anything that opened over the page." })
        ])
      );
    });
  }

  function openAbout() {
    sheet("About the word list", function (body) {
      body.appendChild(el("p", { class: "sheet-text",
        text: "Words come from ENABLE, a public-domain list built as an independent " +
          "alternative to the copyrighted tournament dictionaries, plus 19 two- and " +
          "three-letter words it lacks that current North American play accepts — " +
          "QI and ZA among them." }));
      body.appendChild(el("p", { class: "sheet-text",
        text: "Being straight about the limits: the three-letter list is still " +
          "ENABLE's, and how far it diverges from the current tournament list has " +
          "not been measured. Words valid elsewhere but missing here are never shown " +
          "as wrong answers — the app stays quiet about them rather than telling you " +
          "a real word is not a word." }));
      body.appendChild(el("p", { class: "sheet-text",
        text: "Commonness tiers from SCOWL, Copyright 2000–2018 Kevin Atkinson. Some " +
          "definitions from WordNet 3.0, Copyright 2006 Princeton University; the " +
          "rest written for this app. Set in Fraunces, SIL Open Font License 1.1. " +
          "Not affiliated with, or endorsed by, any commercial word game." }));
    });
  }

  WT.shell = {
    TABS: TABS,
    mount: mount,
    go: go,
    render: render,
    current: function () { return current; },
    setGuard: setGuard,
    clearGuard: clearGuard,
    mayLeave: mayLeave,
    menuButton: menuButton,
    openMenu: openMenu,
    openSettings: openSettings,
    openHelp: openHelp
  };
})(window.WT || (window.WT = {}));
