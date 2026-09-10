/* Offline support.

   The whole app is static files that only change when it is rebuilt, so the
   strategy is the simple one that suits that: cache everything on install,
   then serve from cache and fall back to the network.

   The VERSION below is a PLACEHOLDER. tools/build_www.js overwrites it in the
   shipped copy with a hash of every file in the build, so the cache name
   changes exactly when the app does — no human step to forget. That matters
   because a cache-first worker with a stale name serves last week's app for
   ever, and the symptom, "I deployed and nothing changed", looks like a broken
   deploy rather than a stale cache. The old cache is deleted on activate.

   Nothing here talks to the network at runtime beyond fetching these files;
   the app itself makes no requests at all once it has loaded. */
var VERSION = "wordtrainer-9ad61c51ce41";

var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./fonts/fraunces.css",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./data/lexicon.js",
  "./data/definitions.js",
  "./data/defs_auto.js",
  "./data/tiers.js",
  "./data/lexicon_long.js",
  "./data/daily.js",
  "./data/strategy.js",
  "./js/lexicon.js",
  "./js/defs.js",
  "./js/trie.js",
  "./js/board.js",
  "./js/movegen.js",
  "./js/daily.js",
  "./js/review.js",
  "./js/game.js",
  "./js/opponent.js",
  "./js/leave.js",
  "./js/strategy.js",
  "./js/stems.js",
  "./js/anagrams.js",
  "./js/groups.js",
  "./js/storage.js",
  "./js/quiz.js",
  "./js/levels.js",
  "./js/ui.js",
  "./js/screens/home.js",
  "./js/screens/path.js",
  "./js/screens/teach.js",
  "./js/screens/quiz.js",
  "./js/screens/stems.js",
  "./js/screens/drill.js",
  "./js/screens/boardui.js",
  "./js/screens/daily.js",
  "./js/screens/review.js",
  "./js/screens/game.js",
  "./js/screens/stats.js",
  "./js/screens/strategy.js",
  "./js/app.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      /* addAll fails the whole install if any one file 404s, which is the
         behaviour we want: a half-cached app that works until you go offline
         and then breaks is worse than an install that fails loudly. */
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === VERSION ? null : caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request);
    })
  );
});
