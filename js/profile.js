/* Who you are, how you want the app to behave, and the code you send a friend.

   WHY A SHARE CODE AND NOT AN ACCOUNT
   Comparing yourself to other people normally means a server: accounts, a
   database, a privacy policy, deletion requests, moderation. This app has none
   of those and the whole design depends on not having them — it works offline,
   stores nothing about you anywhere but your own device, and can be opened by
   double-clicking a file.

   There is also a plain arithmetic problem with the alternative. "Better than
   60% of players" needs players. With a handful, that number is not a
   comparison, it is a fiction — and inventing authority is the one thing this
   project has consistently refused to do.

   So a comparison is a STRING. Your stats encode into something short enough to
   text; a friend pastes it in and sees both columns side by side. Real numbers,
   real people, no server, no accounts, no data leaving the device except by you
   deliberately sending it.

   Exposes WT.profile. */
(function (WT) {
  "use strict";

  var NAME_MAX = 16;
  var CODE_PREFIX = "WT1";

  /* --- the profile ----------------------------------------------------- */

  function get() {
    return WT.store.profile();
  }

  function setName(name) {
    var clean = String(name || "").replace(/[|]/g, "").trim().slice(0, NAME_MAX);
    return WT.store.setProfile({ name: clean });
  }

  function displayName() {
    var p = get();
    return p.name || "You";
  }

  /* --- settings -------------------------------------------------------- *
     Defaults match what the app did before any of this existed, so an
     untouched install behaves exactly as it always has.                   */

  var SETTINGS = [
    {
      key: "theme",
      label: "Theme",
      help: "Follows your device unless you pick one.",
      options: [
        { value: "system", label: "System" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" }
      ],
      def: "system"
    },
    {
      key: "pace",
      label: "After you answer",
      help:
        "A missed answer always waits for you — that is when the definition " +
        "matters. This is about the ones you get right.",
      options: [
        { value: "auto", label: "Move on by itself" },
        { value: "wait", label: "Wait for me every time" }
      ],
      def: "auto"
    },
    {
      key: "motion",
      label: "Animation",
      help: "Turn this off if movement on screen bothers you.",
      options: [
        { value: "system", label: "Follow device" },
        { value: "off", label: "Off" }
      ],
      def: "system"
    }
  ];

  function setting(key) {
    var s = WT.store.settings();
    var def = SETTINGS.filter(function (d) { return d.key === key; })[0];
    return s[key] != null ? s[key] : (def ? def.def : null);
  }

  function setSetting(key, value) {
    var out = WT.store.setSetting(key, value);
    applySettings();
    return out;
  }

  /* Push the settings onto the document so CSS can act on them. */
  function applySettings() {
    var root = document.documentElement;
    var theme = setting("theme");
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    root.setAttribute("data-motion", setting("motion"));
  }

  /* --- the share code --------------------------------------------------- *

     Shape (before encoding):
       WT1|name|levels,accuracy|d4,d5,d6,d7|days,streak,share,best|tracked,retired|played,won,best|seen,right

     Every field is a small integer, so the whole thing encodes to something
     short enough to send in a message. A checksum character is appended: a
     mangled paste should be REFUSED rather than quietly read as different
     numbers, which is the failure that would actually mislead someone.         */

  function b64url(str) {
    return window.btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function unb64url(str) {
    var s = String(str).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    return decodeURIComponent(escape(window.atob(s)));
  }

  function checksum(str) {
    var n = 0;
    for (var i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) % 1296;
    var out = n.toString(36);
    return out.length < 2 ? "0" + out : out;
  }

  /* Everything worth comparing, as plain numbers. Also what the profile screen
     renders, so the two can never disagree. */
  function stats() {
    var levels = WT.levels.all();
    var done = levels.filter(function (l) {
      return WT.store.levelState(l.id).status === "complete";
    });
    var accs = done.map(function (l) { return WT.store.levelState(l.id).bestAccuracy || 0; });
    var avgAcc = accs.length
      ? Math.round((accs.reduce(function (a, b) { return a + b; }, 0) / accs.length) * 100)
      : 0;

    var drills = WT.anagrams.lengths().map(function (n) {
      return WT.store.drillBest("anagram", n).best || 0;
    });

    var history = WT.daily.history(400);
    var shares = history.map(function (h) {
      return h.result.best ? h.result.score / h.result.best : 0;
    });
    var daily = {
      days: history.length,
      streak: WT.daily.streak(),
      share: shares.length
        ? Math.round((shares.reduce(function (a, b) { return a + b; }, 0) / shares.length) * 100)
        : 0,
      best: history.reduce(function (m, h) { return Math.max(m, h.result.score); }, 0)
    };

    var rv = WT.review.stats();

    var games = WT.store.gamesAll();
    var g = { played: 0, won: 0, best: 0 };
    Object.keys(games).forEach(function (id) {
      g.played += games[id].played;
      g.won += games[id].won;
      g.best = Math.max(g.best, games[id].bestScore);
    });

    var st = WT.strategy.stats();

    return {
      name: displayName(),
      levels: done.length,
      levelTotal: levels.length,
      accuracy: avgAcc,
      drills: drills,
      drillLengths: WT.anagrams.lengths(),
      daily: daily,
      review: { tracked: rv.tracked, retired: rv.retired },
      games: g,
      strategy: { seen: st.attempted, right: st.right, pool: st.pool }
    };
  }

  function encode() {
    var s = stats();
    var body = [
      CODE_PREFIX,
      s.name,
      [s.levels, s.accuracy].join(","),
      s.drills.join(","),
      [s.daily.days, s.daily.streak, s.daily.share, s.daily.best].join(","),
      [s.review.tracked, s.review.retired].join(","),
      [s.games.played, s.games.won, s.games.best].join(","),
      [s.strategy.seen, s.strategy.right].join(",")
    ].join("|");
    return b64url(body) + "." + checksum(body);
  }

  /* Returns the stats, or null with a reason. Never throws on bad input —
     someone pasting half a message is the expected case, not an exception. */
  function decode(code) {
    var raw = String(code || "").trim();
    if (!raw) return { ok: false, reason: "Nothing pasted." };
    var dot = raw.lastIndexOf(".");
    if (dot < 1) return { ok: false, reason: "That does not look like a code." };
    var body;
    try {
      body = unb64url(raw.slice(0, dot));
    } catch (e) {
      return { ok: false, reason: "That code is damaged — ask for it again." };
    }
    if (checksum(body) !== raw.slice(dot + 1)) {
      return { ok: false, reason: "That code is damaged — it may have been cut short." };
    }
    var parts = body.split("|");
    if (parts[0] !== CODE_PREFIX) {
      return { ok: false, reason: "That code is from a different version of the app." };
    }
    if (parts.length < 8) return { ok: false, reason: "That code is incomplete." };

    var nums = function (i) {
      return parts[i].split(",").map(function (n) {
        var v = parseInt(n, 10);
        return isNaN(v) ? 0 : v;
      });
    };
    var lv = nums(2), dr = nums(3), dy = nums(4), rv = nums(5), gm = nums(6), st = nums(7);
    return {
      ok: true,
      stats: {
        name: parts[1] || "Them",
        levels: lv[0], accuracy: lv[1],
        drills: dr,
        daily: { days: dy[0], streak: dy[1], share: dy[2], best: dy[3] },
        review: { tracked: rv[0], retired: rv[1] },
        games: { played: gm[0], won: gm[1], best: gm[2] },
        strategy: { seen: st[0], right: st[1] }
      }
    };
  }

  /* --- friends ---------------------------------------------------------- */

  function friends() {
    return WT.store.friendsAll();
  }

  function addFriend(code) {
    var result = decode(code);
    if (!result.ok) return result;
    WT.store.saveFriend(result.stats.name, { code: String(code).trim(), stats: result.stats });
    return result;
  }

  function removeFriend(name) {
    return WT.store.removeFriend(name);
  }

  WT.profile = {
    NAME_MAX: NAME_MAX,
    SETTINGS: SETTINGS,
    get: get,
    setName: setName,
    displayName: displayName,
    setting: setting,
    setSetting: setSetting,
    applySettings: applySettings,
    stats: stats,
    encode: encode,
    decode: decode,
    friends: friends,
    addFriend: addFriend,
    removeFriend: removeFriend
  };
})(window.WT || (window.WT = {}));
