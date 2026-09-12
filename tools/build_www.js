/* Assemble docs/ — the directory that gets served, and that Capacitor packages.
   Run: node tools/build_www.js

   The folder is called docs/ because GitHub Pages will only serve a branch's
   root or its /docs — those are the only two choices it offers — and serving
   the folder directly is what keeps the deploy free of a build step.

   Why this exists: the web app lives at the repo root so index.html stays
   double-clickable with no build step. Capacitor needs a webDir containing
   ONLY the app, and pointing it at the root would sweep node_modules, the
   android project and the tools folder into the APK. So the shipped file list
   is written out explicitly here — if a new file is added to index.html and not
   to this list, the check at the bottom fails loudly rather than shipping a
   broken app. */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, "docs");

const FILES = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "LICENSES.md",
  "css/app.css",
  "fonts/fraunces.css",
  "fonts/OFL.txt",
  "data/lexicon.js",
  "data/definitions.js",
  "data/defs_auto.js",
  "data/tiers.js",
  // The board core, now live: the daily puzzle uses it.
  "data/lexicon_long.js",
  "data/daily.js",
  "data/strategy.js",
  "js/trie.js",
  "js/board.js",
  "js/movegen.js",
  "js/daily.js",
  "js/review.js",
  "js/game.js",
  "js/opponent.js",
  "js/leave.js",
  "js/strategy.js",
  "js/profile.js",
  "js/lexicon.js",
  "js/defs.js",
  "js/stems.js",
  "js/anagrams.js",
  "js/groups.js",
  "js/storage.js",
  "js/quiz.js",
  "js/levels.js",
  "js/ui.js",
  "js/app.js",
  "js/screens/shell.js",
  "js/screens/home.js",
  "js/screens/path.js",
  "js/screens/teach.js",
  "js/screens/quiz.js",
  "js/screens/stems.js",
  "js/screens/drill.js",
  "js/screens/boardui.js",
  "js/screens/daily.js",
  "js/screens/review.js",
  "js/screens/game.js",
  "js/screens/stats.js",
  "js/screens/friends.js",
  "js/screens/profile.js",
  "js/screens/strategy.js"
];

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

rmrf(OUT);
let bytes = 0;
const digest = crypto.createHash("sha256");
for (const rel of FILES) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) {
    console.error(`MISSING: ${rel}`);
    process.exit(1);
  }
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  const body = fs.readFileSync(src);
  // sw.js is stamped below, so its own bytes must not feed the hash it carries.
  if (rel !== "sw.js") digest.update(rel).update(body);
  bytes += body.length;
}

/* Stamp the service worker's cache name with a hash of everything shipped.

   This used to be a line in the README telling a human to bump VERSION before
   deploying. That is exactly the kind of step that gets forgotten, and its
   failure mode is nasty: a cache-first worker with an unchanged name serves the
   previous build for ever, and the symptom — "I deployed and nothing changed" —
   looks like a broken deploy rather than a stale cache.

   A content hash removes the step and is strictly better than a timestamp: the
   name changes when, and only when, the app actually changed, so rebuilding
   without editing anything does not force every installed copy to re-download
   2.8MB. */
const STAMP = digest.digest("hex").slice(0, 12);
const swPath = path.join(OUT, "sw.js");
const sw = fs.readFileSync(swPath, "utf8");
const stamped = sw.replace(
  /var VERSION = "[^"]*";/,
  `var VERSION = "wordtrainer-${STAMP}";`
);
if (stamped === sw) {
  console.error("MISSING: sw.js has no `var VERSION = \"...\";` line to stamp.");
  process.exit(1);
}
fs.writeFileSync(swPath, stamped);

// Every script and stylesheet index.html asks for must be in the list above.
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:)?\/\//.test(u) && !/^(data|blob|mailto):/.test(u));
// The font is embedded in fonts/fraunces.css as a data: URI, so there is no
// separate file to chase — but assert it really is embedded, because a plain
// url() there would break the app from file://.
const fontCss = fs.readFileSync(path.join(ROOT, "fonts/fraunces.css"), "utf8");
if (!/url\("data:font\/woff2;base64,/.test(fontCss)) {
  console.error("fonts/fraunces.css does not embed the font — run tools/build_font.py");
  process.exit(1);
}
const missing = refs.filter((r) => !FILES.includes(r));
if (missing.length) {
  console.error("index.html references files that build_www.js does not copy:");
  missing.forEach((m) => console.error("  " + m));
  console.error("Add them to FILES.");
  process.exit(1);
}

console.log(`docs/ built: ${FILES.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB, cache ${STAMP}`);
console.log(`all ${refs.length} local references in index.html are accounted for`);
