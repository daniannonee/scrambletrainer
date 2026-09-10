# Word trainer — v1 spine

A guided path through the word groups that decide word games. On-device only:
no backend, no accounts, no network calls at runtime.

**Status: six modes, wrapped for Android but not yet built.** The study path,
the anagram drill, the daily board, spaced-repetition review, a full game
against the engine, and a board-strategy trainer. A progress screen collects
what all six record. `node tools/walk.js` still plays the whole path start to
finish in a real browser at 100% on perfect play.

## Running it

Double-click `index.html`. That is the whole thing — plain scripts, no modules,
no build step, no server. It works the same from `file://`, from a static host,
and inside a Capacitor WebView (all three verified).

## Hosting it / putting it on a phone

Served by **GitHub Pages**, straight from this repo. No CI, no build on the
host, no third-party service.

```
node tools\build_www.js      # rebuilds docs/ — zero dependencies, plain Node
git add -A && git commit -m "..." && git push
```

Pages settings, set once: **Source: Deploy from a branch**, **Branch: main**,
**Folder: /docs**. That is the whole configuration.

**Why `docs/` and why it is committed.** Pages will serve a branch's root or
its `/docs` and nothing else, so the folder name is forced. Committing the
build rather than generating it on the host is deliberate: `package.json`
declares Capacitor, so anything that auto-installs would pull ~29MB of Android
tooling to serve a static site, and the bytes that go live are then the exact
ones `tools/pwa_check.js` verified rather than the output of a build
environment nobody has tested.

**Pages needs a public repo** on a free GitHub account; private repos need Pro.
That makes the repository name a public URL, so it must not be one this project
would not put on the app itself.

Once it is live it installs to a phone home screen: Safari → Share → **Add to
Home Screen**, or Chrome → **Install app**. That gives a real icon, a standalone
window with no browser chrome, and — because of `sw.js` — an app that opens with
no signal at all.

**Cache busting is automatic.** `build_www.js` stamps the worker's cache name
with a hash of everything it ships, so the name changes when — and only when —
the app actually changed. There is no version to remember to bump. A content
hash rather than a timestamp on purpose: rebuilding without editing anything
leaves the name alone, so installed copies do not re-download 2.8MB for nothing.
The `VERSION` line in the source `sw.js` is a placeholder; the shipped one in
`docs/` carries the real stamp.

`node tools/pwa_check.js` serves `docs/` over real http, registers the worker,
then **cuts the network and reloads** — the app has to boot with all six modes,
the full 80,387-word lexicon and both puzzle pools, offline.

For the Android app, see **ANDROID.md** — start with `tools\preflight.ps1`.

## Layout

```
index.html            script tags, in dependency order
manifest.webmanifest  home-screen install: name, icons, standalone display
sw.js                 offline cache; build_www.js stamps its cache name
icons/                180 / 192 / 512 PNGs, generated from resources/icon.png
capacitor.config.json Capacitor settings — the only durable native config
resources/            source icon for the app and store listing
css/app.css           the whole visual system
fonts/fraunces.css    generated — Fraunces, subset and embedded as a data: URI
data/lexicon.js       generated — 80,387 words, packed by length
data/definitions.js   hand-authored: the twos, the supplement, Q without U
data/defs_auto.js     generated — WordNet first senses, ordinary words only
data/tiers.js         generated — SCOWL commonness tiers
data/lexicon_long.js  generated — the 9-15 letter words, for board play
data/daily.js         generated — 400 pre-solved daily puzzles
data/strategy.js      generated — 60 board-strategy choice positions
js/lexicon.js         word lookup, hooks
js/defs.js            definition lookup: hand-authored beats generated
js/stems.js           bingo stems, derived from the lexicon
js/anagrams.js        anagram puzzles, derived from the lexicon
js/trie.js            prefix trie, for the move generator
js/board.js           board, scoring, placement validation, board auditor
js/movegen.js         Appel & Jacobson move generator
js/daily.js           which puzzle today, grading, streaks
js/review.js          the spaced-repetition scheduler (Leitner boxes)
js/game.js            a full game: bag, racks, turns, exchanges, endgame
js/opponent.js        the engine opponent and its three strengths
js/leave.js           judging the tiles a play leaves behind
js/strategy.js        reading the board-strategy positions
js/groups.js          named slices of the lexicon (2-letter, Q-without-U, ...)
js/storage.js         localStorage progress, versioned
js/quiz.js            the valid/invalid engine, seeded and testable
js/levels.js          THE PATH — ten levels as data
js/ui.js              DOM helpers
js/screens/           home, path, teach, quiz, stems, drill, daily, review,
                      boardui (shared board + drag + blank picker), game,
                      strategy, stats
js/app.js             screen router
tools/build_data.py   rebuilds data/lexicon.js from enable1.txt + supplement.json
tools/build_derived.py rebuilds tiers.js + defs_auto.js from SCOWL and WordNet
tools/build_daily.js  rebuilds data/daily.js — node tools/build_daily.js [count]
tools/build_strategy.js rebuilds data/strategy.js — [count], ~3s per position
tools/build_www.js    assembles docs/ for Capacitor, with a guard against drift
tools/build_font.py   subsets and embeds the display face
tools/preflight.ps1   checks a Windows machine for the Android toolchain
tools/supplement.json 19 words valid in NWL2023 but missing from ENABLE, with sources
tools/test.js         133 headless checks — node tools/test.js
tools/test_board.js   54 checks over the board core — node tools/test_board.js
tools/walk.js         plays all ten levels in a browser — node tools/walk.js
tools/drill_check.js  plays a full anagram round in a browser
tools/daily_check.js  plays today's optimal move in a browser, both themes
tools/review_check.js fails a level, then clears the review queue it creates
tools/test_game.js    plays whole games engine-vs-engine, auditing every turn
tools/game_check.js   plays a real game in a browser by dragging tiles
tools/strategy_check.js re-derives every strategy position from the live engine
tools/stats_check.js  seeds one of everything, reads the progress screen back
tools/blank_check.js  the blank-tile picker and the daily share string
tools/css_check.js    asserts the premium-square fallbacks match color-mix()
tools/pwa_check.js    serves docs/ over http, then verifies it works offline
tools/shots.js        browser walkthrough + screenshots (needs playwright)
tools/check_qi.js     spot-check that the supplemented words behave in the UI
```

## Adding a mode

Home is deliberately plain — one card, built so a second one is cheap. Add an
entry to `MODES` in `js/screens/home.js` and a case in `openMode` in
`js/app.js`. Nothing else should need to change. The home screen gets a real
design pass once there is more than one thing on it.

## Adding a level

Edit `js/levels.js`. If the level needs a word group that does not exist yet,
add it to `DEFS` in `js/groups.js` as a pure function of the lexicon. No screen
code should need touching — that was the point of building level 1 first.

A level looks like:

```js
{
  id: "l6-high-value",
  title: "The heavy tiles",
  blurb: "...",
  group: "high-value-short",       // a key in js/groups.js, or null
  steps: ["teach", "quiz"],        // or just ["quiz"] for a recall level
  quiz: { size: 30, decoyShare: 0.5, passAccuracy: 0.85 },
  built: true
}
```

Levels with `built: false` show on the path but cannot be opened. A level with
`kind: "stems"` runs on `js/screens/stems.js` instead of the word screens —
that is the hook for any future question type that is not valid/invalid.

## Design notes

**One idea: the letter tile is the object this app is made of.** It is the node
on the path, the cell in a word list, and the thing you pick up in the drill.
`.tile-face` in `css/app.css` is the single definition; `WT.ui.tile()` builds
one. The ground is cool and slightly grey, tiles are warm — that contrast is
what makes a tile read as an object on a surface rather than a box drawn on one.

**Type is the hero — but only for words.** Fraunces (variable, OFL) carries
every word, heading and letter tile; the UI runs in the system sans. **Numerals
are always in the sans**, never Fraunces: its 3 has a flat top bar and at UI
sizes is not distinguishable from a 5, across every axis the font offers
(`tools/shots/wonk.png` shows the comparison). In an app about scoring, a tile
value that reads as the wrong number is a correctness bug, not a style one. The
brief's "type is the hero" was about the word set large; nothing is lost. `tools/build_font.py` subsets it from
352KB to 26KB and embeds it as a data: URI, because Chrome refuses cross-origin
font fetches from `file://` and the app has to survive being double-clicked.

**The path carries the boldness.** It is the one screen allowed to be loud: a
heavy rail winding between tiles, the walked part in green.

Three things the brief said to avoid, and this build now avoids: all-caps
eyebrows (labels are small display-face italics), a kit of rounded cards (rules
and space instead — the tile is the only drawn object), and a default system
serif.

Dark mode, reduced motion and visible focus rings are handled in `css/app.css`;
the layout is phone-first with no horizontal overflow at 390px.

## Checks

```
node tools/test.js     # logic: lexicon, groups, defs, stems, quiz, state machine
node tools/test_board.js   # board, scoring, validation, move generator, auditor
node tools/walk.js     # plays all ten levels start to finish in a browser
node tools/drill_check.js  # plays an anagram round, both themes
node tools/daily_check.js  # plays today's optimal move, both themes
node tools/review_check.js # fails a level, then clears the review it earns
node tools/test_game.js    # game rules, played to the endgame
node tools/game_check.js   # a real game in a browser
node tools/strategy_check.js # strategy data re-derived from the engine
node tools/stats_check.js  # the progress screen
node tools/blank_check.js  # blank picker + share
node tools/pwa_check.js    # serves docs/, installs, then cuts the network
node tools/css_check.js    # premium-square colour fallbacks are exact
node tools/shots.js    # screenshots of one level, light and dark
```

Cold load to interactive is ~265ms with 2.5MB of bundled data. The stem index
(~230ms), the anagram indexes (~30ms) and the move-generator trie are built
lazily, only when something asks for them.

`tools/test.js` re-reads `tools/enable1.txt` independently and verifies the
packed lexicon round-trips every word, that no quiz item is ever mislabelled,
and that progress survives a simulated reload.

## The board core

`js/board.js`, `js/trie.js`, `js/movegen.js` and `data/lexicon_long.js` are a
complete 15×15 board engine: premium squares, tile values, blanks, scoring,
placement validation, an Appel & Jacobson move generator, and a ground-truth
board auditor. `node tools/test_board.js` runs 54 checks over it.

The daily puzzle loads it, so it is now in `index.html` — `data/lexicon_long.js`,
then `js/trie.js`, `js/board.js`, `js/movegen.js`, in that order. That is what
took cold load from ~210ms to ~265ms. The trie itself is still lazy: nothing
builds it unless a move search asks for it, and the daily never does on the
device, because the answers are pre-computed.

The API:

```js
var b = WT.board.create();
var play = WT.board.validate(b, [{ r: 7, c: 7, tile: "C" }, ...]);
//   -> { ok, reason?, words: [{word, cells, score}], score, bingo, board }
var move = WT.movegen.best(b, ["A","E","R","S","T","_","N"]);
//   -> highest-scoring legal play, or null
WT.board.audit(b);            // rescans every run against the dictionary
```

Cell convention, which matters everywhere: `null` is empty, `"A".."Z"` is a real
tile, `"a".."z"` is a **blank** played as that letter. Read a cell through
`letterAt()` for dictionary purposes and `valueAt()` for points.

Validation and generation are separate code paths on purpose — the validator is
a small direct function so the UI can score a play on every keystroke, and the
generator is a search. See `PROVENANCE.md` for the two known algorithmic bugs
and how they are guarded.

## The daily puzzle

One mid-game board, one rack, one play, graded against the best play that rack
could have made. Same board for everyone on the same day, no server: the number
of days since a fixed epoch indexes straight into a pre-generated pool.

- **`tools/build_daily.js` does all the work.** Self-play builds a board, the
  move generator finds the rack's optimum, the auditor verifies the board both
  before and after the best play, and the answer ships as data. The device never
  runs a search. 400 puzzles took 43s to generate and cost 113KB.
- **The pool repeats after 400 days.** The screen warns when fewer than 30 are
  left. `node tools/build_daily.js 800` makes more.
- **The date comes from the local clock**, so the day rolls over at the player's
  midnight rather than some foreign one. Changing the device clock to play ahead
  is possible and not defended against — it is a cheat that only harms the cheat.
- **One play, then locked**, filed in localStorage under `YYYY-MM-DD`. Grading
  is a share of the best available: 100% "Found it", 80% "Very close", 55%
  "Strong", 30% "On the board".

### Moving tiles

Two ways, both live at once: **drag** a tile onto a square, or **tap** a tile
then tap a square. A placed tile drags to another square, or off the board to
take it back. Drag is what a thumb expects; tap-tap is what a keyboard and a
screen reader can do, so neither is simulated on top of the other — both are
handled explicitly, on Pointer Events, which cover touch, mouse and stylus in
one code path.

### Board geometry

Every square is an **explicit integer pixel size**, set by `fitGrid()` on render
and on resize — not a `1fr` share. A 15-column `1fr` grid inside a
percentage-width box hands the leftover sub-pixels out unevenly, so a few
columns come out a pixel wider and the board visibly warps. `daily_check.js`
measures all 225 squares and fails if they are not identical and square.

Premium squares are labelled `2L / 3L / 2W / 3W`, in the UI sans rather than the
display face: Fraunces' high-contrast 3 reads as a 5 at that size, and a player
misreading a triple-word square is worse than no label. The centre keeps its
star instead of a label.

`node tools/daily_check.js` plays today's actual optimal move in a real browser
by tapping tiles onto squares, then reloads to confirm the day stays locked. It
also drags a tile on and off the board, checks grid evenness and the premium
labels, and confirms a tap straight after a drag still registers.

## Review (spaced repetition)

Words you get wrong come back — tomorrow, then in 2, 4, 8, 16 and 32 days,
until they stick. Right answers move a word up a box; one wrong answer drops it
back to the bottom. After the last box a word is retired and stops being asked.

- **It is Leitner, not SM-2, and that is deliberate.** SM-2 needs a graded
  recall score (0-5) to compute an ease factor. This quiz is binary. Feeding a
  binary signal into SM-2 means inventing the grades, and an ease factor built
  from invented numbers is worse than none, because it looks principled.
- **Only missed words are scheduled.** A word you get right the first time never
  enters the queue. The limit is real — review cannot catch a word you guessed —
  and the reason is that scheduling all few-thousand path words would build a
  backlog nobody clears.
- **One funnel.** `WT.review.applyAnswers()` is called from `run()` in
  `js/screens/quiz.js`, the single place every valid/invalid quiz finishes. Any
  future quiz built on `run()` feeds review automatically and none can forget to.
- **Sessions are capped at 20 due words**, so a backlog becomes several sittings
  rather than one impossible quiz.

## Playing a game

A full two-player game against the move generator. Seven tiles each, exchanges
(only while the bag holds seven or more), passes, and both endgame conditions:
a player going out, or six consecutive scoreless turns. The player who goes out
gains the other's remaining tiles; otherwise each loses their own.

**Difficulty is a band of the ranked move list, not randomness.** Playing the
best move x% of the time and something random otherwise produces an opponent who
is either flawless or plays JO for 9 with a bingo on the rack — incoherent
rather than easy, and it teaches nothing. Gentle takes a move from the middle of
what was available; Sharp takes the top. Every move it plays is defensible.

The opponent's turn paints "thinking", yields to the browser, and only then
searches — a couple of thousand moves is a visible pause on a phone, and a
frozen screen reads as a crash rather than as thought.

`node tools/test_game.js` plays twelve whole games engine-vs-engine and, at
**every turn of every game**, checks that exactly 100 tiles still exist and
re-audits the entire board against the dictionary.

## The best play (board strategy)

Two candidate plays on one real board. One scores more. Which is better once you
count what it leaves you and what it hands the opponent?

Nothing here is asserted. Every number was computed by `tools/build_strategy.js`
using the same move generator and auditor as the rest of the app:

- **what you leave** — the tiles still on your rack, judged by `js/leave.js`
- **what you open** — the best score the opponent could actually make on the
  resulting board, using a rack drawn from the genuinely unseen tiles and
  **shown to the player**, because a disclosed assumption can be checked and a
  hidden model cannot

`js/leave.js` is a transparent additive rubric, not an equity table — this
project has no equity data and inventing numbers that look like equity would be
worse than having none. The screen prints the reasons, not just the score.

`node tools/strategy_check.js` re-derives every shipped position from the live
engine and fails if the data disagrees with what the code says today.

## Not built

AI analysis beyond the strategy positions, anything social beyond a copyable
result string, and the official tournament lexicons.

## Data

Word list is ENABLE (public domain), plus a 19-word supplement covering the
two-letter words NWL2023 has and ENABLE does not (QI, ZA and nine others) and
their plurals. Definitions are written for this app.

After editing `tools/supplement.json`, rerun `python3 tools/build_data.py`. See
`PROVENANCE.md` for where every added word was checked, and for what is still
divergent — the three-letter list, in particular, is still ENABLE's.
