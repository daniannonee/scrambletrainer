/* Progress storage. localStorage, one key, versioned so adding levels later
   never strands someone's saved progress. Exposes WT.store.

   Every read is defensive: a corrupt or absent record returns a fresh state
   rather than throwing, because a player losing progress is bad but a player
   staring at a blank screen is worse. */
(function (WT) {
  "use strict";

  var KEY = "wordtrainer.progress.v1";
  var VERSION = 1;

  function fresh() {
    return {
      version: VERSION,
      levels: {}, // levelId -> { status, bestAccuracy, attempts, completedAt }
      wordStats: {}, // word -> { seen, wrong }
      drills: {}, // "anagram:5" -> { best, rounds, lastScore }
      daily: {}, // "2026-09-09" -> { score, best, word, tier, at }
      reviews: {}, // word -> { box, due, right, wrong, lastDay } — see js/review.js
      games: {}, // "steady" -> { played, won, drawn, bestScore, lastScore }
      strategy: {}, // puzzle index -> { correct, at }
      profile: {}, // { name }
      settings: {}, // see js/profile.js SETTINGS
      friends: {}, // name -> { code, stats, at }
      updatedAt: null
    };
  }

  var state = null;

  function available() {
    try {
      var k = "__wt_probe__";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  var canPersist = available();

  function load() {
    if (state) return state;
    state = fresh();
    if (!canPersist) return state;
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === VERSION) {
          state = {
            version: VERSION,
            levels: parsed.levels || {},
            wordStats: parsed.wordStats || {},
            drills: parsed.drills || {},
            daily: parsed.daily || {},
            // Added after v1 shipped. Deliberately NOT a version bump: an older
            // record is missing this key, and `|| {}` reads it as "nothing
            // scheduled yet" rather than stranding every level already cleared.
            reviews: parsed.reviews || {},
            games: parsed.games || {},
            strategy: parsed.strategy || {},
            profile: parsed.profile || {},
            settings: parsed.settings || {},
            friends: parsed.friends || {},
            updatedAt: parsed.updatedAt || null
          };
        }
        // A record from a future/unknown version is left untouched on disk and
        // ignored here, rather than being overwritten with an empty one.
      }
    } catch (e) {
      state = fresh();
    }
    return state;
  }

  function save() {
    if (!canPersist) return false;
    try {
      state.updatedAt = new Date().toISOString();
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function levelState(id) {
    var s = load();
    return s.levels[id] || { status: "locked", bestAccuracy: 0, attempts: 0, completedAt: null };
  }

  function setLevelState(id, patch) {
    var s = load();
    s.levels[id] = Object.assign(levelState(id), patch);
    save();
    return s.levels[id];
  }

  /* Record a quiz's per-word outcomes so "what you missed" survives a reload. */
  function recordAnswers(answers) {
    var s = load();
    answers.forEach(function (a) {
      if (!a.isWord) return; // only track real words; decoys are generated fresh
      var stat = s.wordStats[a.text] || { seen: 0, wrong: 0 };
      stat.seen++;
      if (!a.correct) stat.wrong++;
      s.wordStats[a.text] = stat;
    });
    save();
  }

  function missedWords(limit) {
    var s = load();
    return Object.keys(s.wordStats)
      .filter(function (w) {
        return s.wordStats[w].wrong > 0;
      })
      .sort(function (a, b) {
        return s.wordStats[b].wrong - s.wordStats[a].wrong || a.localeCompare(b);
      })
      .slice(0, limit || 50);
  }

  function wordStat(word) {
    return load().wordStats[word] || { seen: 0, wrong: 0 };
  }

  /* Drills are practice, not progression: only a best score and a count, so a
     bad round never undoes anything. */
  function drillKey(kind, variant) {
    return kind + ":" + variant;
  }

  function drillBest(kind, variant) {
    var rec = load().drills[drillKey(kind, variant)];
    return rec || { best: 0, rounds: 0, lastScore: null };
  }

  function recordDrill(kind, variant, score) {
    var s = load();
    var key = drillKey(kind, variant);
    var rec = s.drills[key] || { best: 0, rounds: 0, lastScore: null };
    rec.best = Math.max(rec.best, score);
    rec.rounds++;
    rec.lastScore = score;
    s.drills[key] = rec;
    save();
    return rec;
  }

  /* The daily is one attempt per day, so a result is written once and never
     overwritten — a second call is ignored rather than allowed to improve a
     score after the fact. */
  function dailyResult(key) {
    return load().daily[key] || null;
  }

  function dailyAll() {
    return load().daily;
  }

  function recordDaily(key, result) {
    var s = load();
    if (s.daily[key]) return s.daily[key]; // already played today
    s.daily[key] = {
      score: result.score,
      best: result.best,
      word: result.word || null,
      tier: result.tier,
      at: new Date().toISOString()
    };
    save();
    return s.daily[key];
  }

  /* Review schedule. Storage only holds the records; js/review.js owns every
     decision about boxes, intervals and what is due. */
  function reviewAll() {
    return load().reviews;
  }

  function reviewGet(word) {
    return load().reviews[word] || null;
  }

  function reviewSet(word, rec) {
    var s = load();
    s.reviews[word] = rec;
    save();
    return rec;
  }

  /* One save for a whole quiz's worth of updates rather than one per word. */
  function reviewSetMany(map) {
    var s = load();
    Object.keys(map).forEach(function (w) {
      s.reviews[w] = map[w];
    });
    save();
    return s.reviews;
  }

  /* Game records, per difficulty. Practice, not progression: a loss costs
     nothing, so only counts and a best score are kept. */
  function gameRecord(levelId) {
    return load().games[levelId] || {
      played: 0, won: 0, drawn: 0, bestScore: 0, lastScore: null
    };
  }

  function gamesAll() {
    return load().games;
  }

  function recordGame(levelId, result) {
    var s = load();
    var rec = gameRecord(levelId);
    rec.played++;
    if (result.won) rec.won++;
    if (result.drawn) rec.drawn++;
    rec.bestScore = Math.max(rec.bestScore, result.score);
    rec.lastScore = result.score;
    rec.lastAgainst = result.against;
    s.games[levelId] = rec;
    save();
    return rec;
  }

  /* Strategy positions: which have been seen and whether the call was right.
     Study, not a test — a wrong call is kept so the position comes back. */
  function strategyAll() {
    return load().strategy;
  }

  function strategySeen() {
    return Object.keys(load().strategy).length;
  }

  function recordStrategy(index, correct) {
    var s = load();
    s.strategy[index] = { correct: !!correct, at: new Date().toISOString() };
    save();
    return s.strategy[index];
  }

  /* Profile, settings and saved friend codes. All local; nothing here is ever
     sent anywhere — a friend's stats arrive by the player pasting a string. */
  function profile() {
    return load().profile || {};
  }

  function setProfile(patch) {
    var s = load();
    s.profile = Object.assign(s.profile || {}, patch);
    save();
    return s.profile;
  }

  function settings() {
    return load().settings || {};
  }

  function setSetting(key, value) {
    var s = load();
    s.settings[key] = value;
    save();
    return s.settings;
  }

  function friendsAll() {
    return load().friends || {};
  }

  function saveFriend(name, record) {
    var s = load();
    s.friends[name] = Object.assign({ at: new Date().toISOString() }, record);
    save();
    return s.friends[name];
  }

  function removeFriend(name) {
    var s = load();
    delete s.friends[name];
    save();
    return s.friends;
  }

  function reset() {
    state = fresh();
    if (canPersist) {
      try {
        window.localStorage.removeItem(KEY);
      } catch (e) {
        /* nothing useful to do */
      }
    }
  }

  WT.store = {
    canPersist: canPersist,
    load: load,
    save: save,
    levelState: levelState,
    setLevelState: setLevelState,
    recordAnswers: recordAnswers,
    drillBest: drillBest,
    recordDrill: recordDrill,
    dailyResult: dailyResult,
    dailyAll: dailyAll,
    recordDaily: recordDaily,
    missedWords: missedWords,
    wordStat: wordStat,
    reviewAll: reviewAll,
    reviewGet: reviewGet,
    reviewSet: reviewSet,
    reviewSetMany: reviewSetMany,
    gameRecord: gameRecord,
    gamesAll: gamesAll,
    recordGame: recordGame,
    strategyAll: strategyAll,
    strategySeen: strategySeen,
    recordStrategy: recordStrategy,
    profile: profile,
    setProfile: setProfile,
    settings: settings,
    setSetting: setSetting,
    friendsAll: friendsAll,
    saveFriend: saveFriend,
    removeFriend: removeFriend,
    reset: reset
  };
})(window.WT || (window.WT = {}));
