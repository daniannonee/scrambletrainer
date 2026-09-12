/* Friends: comparison by code, not by server.

   You copy a short string, send it however you already talk to people, and they
   paste it in. Both sets of numbers then sit side by side. Nothing leaves the
   device unless the player sends it themselves, and there is no account to
   make, no password to forget and no data of yours on anyone's machine.

   The honest limits, which the screen states rather than hides: a code is a
   snapshot, not a live feed — it says what they had when they sent it. And this
   compares you to people you know, not to "all players", because with a handful
   of players a global average would be a made-up number.

   Exposes WT.screens.friends. */
(function (WT) {
  "use strict";

  var el = WT.ui.el;
  var clear = WT.ui.clear;

  /* Each row of the comparison: a label, your number, theirs, and which way is
     better — so the screen can mark the leader without the caller repeating it. */
  function rows(mine, theirs) {
    return [
      ["Levels cleared", mine.levels, theirs.levels, "high"],
      ["Average best accuracy", mine.accuracy, theirs.accuracy, "high", "%"],
      ["Daily days played", mine.daily.days, theirs.daily.days, "high"],
      ["Daily streak", mine.daily.streak, theirs.daily.streak, "high"],
      ["Share of the best play", mine.daily.share, theirs.daily.share, "high", "%"],
      ["Best daily score", mine.daily.best, theirs.daily.best, "high"],
      ["Words learned and retired", mine.review.retired, theirs.review.retired, "high"],
      ["Games won", mine.games.won, theirs.games.won, "high"],
      ["Best game score", mine.games.best, theirs.games.best, "high"],
      ["Strategy calls right", mine.strategy.right, theirs.strategy.right, "high"]
    ];
  }

  function comparison(mine, theirs) {
    var table = el("div", { class: "vs" });
    table.appendChild(
      el("div", { class: "vs-head" }, [
        el("span", { class: "vs-label" }),
        el("span", { class: "vs-name", text: mine.name }),
        el("span", { class: "vs-name", text: theirs.name })
      ])
    );
    rows(mine, theirs).forEach(function (r) {
      var a = r[1] || 0, b = r[2] || 0, unit = r[4] || "";
      var lead = a === b ? null : a > b ? "mine" : "theirs";
      table.appendChild(
        el("div", { class: "vs-row" }, [
          el("span", { class: "vs-label", text: r[0] }),
          el("span", { class: "vs-num" + (lead === "mine" ? " is-lead" : ""), text: a + unit }),
          el("span", { class: "vs-num" + (lead === "theirs" ? " is-lead" : ""), text: b + unit })
        ])
      );
    });
    return table;
  }

  function render(root, onHome) {
    clear(root);
    var mine = WT.profile.stats();

    root.appendChild(
      el("div", { class: "topbar" }, [
        el("h1", { class: "tabtitle", text: "Friends" }),
        WT.shell.menuButton()
      ])
    );

    root.appendChild(
      el("p", { class: "lede",
        text: "Send someone your code and paste theirs back. No accounts, nothing " +
          "uploaded — the numbers travel in the message you send." })
    );

    /* --- your code ------------------------------------------------------ */
    var codeBox = el("code", { class: "sharecode", text: WT.profile.encode() });
    var copyNote = el("span", { class: "share-note" });

    root.appendChild(
      el("div", { class: "result-block" }, [
        el("h3", { text: "Your code" }),
        codeBox,
        el("div", { class: "share-row" }, [
          el("button", {
            class: "btn btn-primary", type: "button", text: "Copy",
            onclick: function () {
              var text = codeBox.textContent;
              var ok = function () { copyNote.textContent = "Copied — send it to them."; };
              var no = function () { copyNote.textContent = "Select the code above and copy it."; };
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(ok, no);
              } else { no(); }
            }
          }),
          copyNote
        ]),
        el("p", { class: "stat-note",
          text: WT.profile.get().name
            ? null
            : "Set a name on the Profile tab first, or they will just see “You”." })
      ])
    );

    /* --- add one -------------------------------------------------------- */
    var input = el("input", {
      class: "codeinput", type: "text", inputmode: "text",
      autocapitalize: "off", autocorrect: "off", spellcheck: "false",
      placeholder: "Paste a friend's code",
      "aria-label": "Paste a friend's code"
    });
    var addNote = el("p", { class: "share-note add-note" });

    function addFromInput() {
      var result = WT.profile.addFriend(input.value);
      if (!result.ok) {
        addNote.className = "share-note add-note is-bad";
        addNote.textContent = result.reason;
        return;
      }
      input.value = "";
      render(root, onHome);
    }

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); addFromInput(); }
    });

    root.appendChild(
      el("div", { class: "result-block" }, [
        el("h3", { text: "Add a friend" }),
        input,
        el("div", { class: "share-row" }, [
          el("button", { class: "btn", type: "button", text: "Add", onclick: addFromInput }),
          addNote
        ])
      ])
    );

    /* --- the comparisons ------------------------------------------------ */
    var friends = WT.profile.friends();
    var names = Object.keys(friends);

    if (!names.length) {
      root.appendChild(
        el("p", { class: "stat-note",
          text: "Nobody added yet. A code is a snapshot of how someone was doing when " +
            "they sent it — ask again later and paste the new one to see them move." })
      );
      return;
    }

    names.sort().forEach(function (name) {
      var rec = friends[name];
      root.appendChild(
        el("div", { class: "result-block" }, [
          el("div", { class: "sheet-head" }, [
            el("h3", { text: "You and " + name }),
            el("button", {
              class: "btn-ghost", type: "button", text: "Remove",
              onclick: function () {
                if (!window.confirm("Remove " + name + "?")) return;
                WT.profile.removeFriend(name);
                render(root, onHome);
              }
            })
          ]),
          comparison(mine, rec.stats),
          el("p", { class: "stat-note",
            text: "Their numbers as of the code you pasted" +
              (rec.at ? " on " + rec.at.slice(0, 10) : "") + "." })
        ])
      );
    });
  }

  WT.screens = WT.screens || {};
  WT.screens.friends = { render: render, comparison: comparison, rows: rows };
})(window.WT || (window.WT = {}));
