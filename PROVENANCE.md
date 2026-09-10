# Data provenance and open questions

Everything the app ships is recorded here, with the parts that are still
uncertain marked as uncertain rather than smoothed over.

## The word list

**ENABLE** (Enhanced North American Benchmark LExicon), assembled by Alan Beale
and others explicitly as an independent alternative to the copyrighted official
Scrabble dictionaries, and placed by its creators in the public domain.

| | |
|---|---|
| File used | `tools/enable1.txt` |
| SHA-256 | `3f16130220645692ed49c7134e24a18504c2ca55b3c012f7290e3e77c63b1a89` |
| Total words | 172,823 — matches the count widely cited for `enable1.txt` |
| Shipped | 80,387 words, lengths 1–8 (80,368 from ENABLE + 19 supplement; there are no valid 1-letter words) |
| Retrieved from | `raw.githubusercontent.com/dolph/dictionary/master/enable1.txt` |

The public-domain statement was confirmed against a second independent
description of the list (BartMassey/wordlists: *"This list was placed in the
Public Domain by its creators"*, and *"constructed as a high-quality alternative
to copyrighted official Scrabble dictionaries by Alan Beale and others"*).

**Still to do before release:** the copy above came from a GitHub mirror. Diff it
against a second independent mirror and confirm they are byte-identical, so the
provenance chain does not rest on one repository. `tools/build_data.py` fails
loudly if the hash or word count ever changes.

## The supplement — closing the two-letter gap

ENABLE is close to, but not the same as, the current North American tournament
list (NWL2023). **ENABLE has 96 two-letter words; NWL2023 has 107.** The eleven
it lacks include QI and ZA, two of the most-taught short words anywhere.

Those eleven, plus their plurals, are now added to the lexicon by
`tools/supplement.json`, which `tools/build_data.py` merges at build time. The
output records exactly what was added in `WT_LEX_ADDED`, so the shipped lexicon
is never quietly something other than ENABLE.

**Added (19 words):**

| | |
|---|---|
| Twos (11) | `da ew fe gi ki oi ok po qi te za` |
| Threes (8) | `das fes gis kis pos qis tes zas` |

**How each was checked:**

- The eleven twos came from Mike Wolfberg's
  [NWL2023 two-letter list with definitions](https://wolfberg.net/scrabble/wordlists/NWL2023/twos/),
  which states 107 words. Diffing that page against ENABLE's 96 gives exactly
  these eleven — the count and the diff agree, which is a decent cross-check.
- The eight plurals were each looked up in the
  [NWL23 Cheat Sheet](https://www.cross-tables.com/download/CHEAT_NWL23.pdf)
  (Mike Baron & Seth Lipkin) and found in its three-letter list.
- **`OIS`, `OKS` and `EWS` were looked for in the same sheet and are not there,
  so they were not added.** They go in the `AMBIGUOUS` set instead.

**Why this is a patch and not a lexicon change.** Eleven two-letter words and
their plurals is a small set of facts, published in every beginner guide, and
verifiable in a minute. Importing NWL wholesale is a different act with a real
licensing question attached, and the spec puts that out of v1. The line held
here is: fix the words a learner will immediately notice are missing, and change
nothing else.

### What is still divergent

- **The three-letter list is still ENABLE's**, apart from the eight plurals
  above. ENABLE has 972 threes (980 now). How many NWL threes it is missing is
  **not known** — no source found so far states the NWL three-letter count, and
  extracting the full list to diff it would be the wholesale import this patch
  deliberately avoids. Levels 3 and 4 are built on the threes, so this needs an
  answer before they ship.
- **Lengths 4–8 have not been compared at all.**
- The Collins-only entries still in `AMBIGUOUS` (`ch ea ee io ny ob oo st ug ur
  zo`) were written from memory and never checked against a primary Collins
  source. They are kept deliberately wide: the only cost of a wrong entry there
  is one fewer decoy candidate.

### The AMBIGUOUS mechanism

`js/quiz.js` keeps a set of strings that may be valid somewhere but are not in
our lexicon, and never shows them as decoys. So the app will never tell a player
that a word they know is real "is not a word." It also does not teach them. That
asymmetry is the honest cost of not owning a tournament licence, and it is now
much smaller than it was.

## Definitions — first pass

> **Superseded.** This section records the original finding, which still holds.
> See "Definitions, second pass" below for what is actually shipping: the
> failure turned out to have a clean boundary, so most definitions are now
> generated after all.

Two freely-redistributable dictionary datasets were tested against the level 1
word set:

| Source | License | Covers 2-letter | Covers 3-letter |
|---|---|---|---|
| WordNet 3.0 (Princeton) | Permissive, OSI-approved; requires the copyright notice on all copies | 67 / 96 | 688 / 972 |
| Webster's Unabridged 1913 | Public domain (US, pre-1929) | 66 / 96 | 689 / 972 |
| Both combined | — | 85 / 96 | 808 / 972 |

(Those coverage figures are against ENABLE's original 96 and 972; the nineteen
supplement words are defined from the NWL2023 sources cited above instead.)

Coverage was not the problem. **Sense selection was.** For short game words,
both datasets rank the wrong meaning first, because the meaning that makes the
word playable is the obscure one:

- `AA` → WordNet's first gloss is *"an associate degree in arts"*. The word-game
  sense is rough volcanic lava.
- `AB` → *"the blood group whose red cells carry both the A and B antigens"*.
- `AL` → *"a state in the southeastern United States"*.
- `AG`, `AM`, `AR`, `AS`, `AT`, `BA`, `ER`, `ES`, `HO`, `IN`, `MO`, `NA`, `NE`,
  `NO` → all resolve to chemical symbols, US state abbreviations, or degrees.

An automated extract would have shipped a screenful of confidently wrong
definitions. So the 96 level 1 definitions in `data/definitions.js` are written
from scratch in plain language, using WordNet and Webster's 1913 only as factual
references. No licensing obligation attaches to them, and the voice is
consistent.

**This does not scale** — which is what forced the second pass below.

**Entries are flagged for a second opinion** in
`WT_DEFS_UNVERIFIED`: `al et ne od oe on si un ut`, plus the Q-without-U
currency and title words `buqsha qaid qindar qindarka qintar sheqalim`. These
are the ones where the sense is real but unusual enough — several are
transliterations with variant spellings — to be worth confirming against a
current dictionary before release.

## Open questions — resolved

All ten levels are now built and none carries an `openQuestion`. For the record:

- **Level 3, "Common three-letter words."** Resolved with SCOWL — see below.
- **Level 5, "Q without U."** Resolved by the supplement; QI and QIS are in.
- **Level 10, "Bingo stems."** Resolved by deriving stems from the lexicon and
  adding a second quiz format.

What remains open is the three-letter divergence from NWL described above, which
levels 3 and 4 both sit on.

---

## Commonness tiers, and level 3

Level 3 is "common three-letter words", and ENABLE carries no frequency data.

**What was rejected.** Peter Norvig's word-count files are true frequency data,
but his page grants an MIT licence over the *code* and says nothing about the
*data*, which comes from a Google corpus distributed by the Linguistic Data
Consortium. No clear permission to redistribute, so it is not used.

**What is used: SCOWL**, Kevin Atkinson's word lists graded into size classes by
how many of twelve dictionaries carry a word, seeded from frequency lists. It is
explicitly licensed for redistribution and commercial use provided the copyright
notice travels with it — see `LICENSES.md`, and the notice is also on the home
screen.

**Be precise about what this is.** SCOWL size 35 is not "the most frequent
words". It is roughly "words nearly every dictionary agrees are ordinary
English". For separating *ace, act, add, ado* from *aal, brr, cwm* that is
exactly the right signal, and arguably better than raw frequency, which would
rank function words above useful ones. But it is not a frequency ranking and the
level should not claim to be one.

| Tier | Threes covered (of 980) |
|---|---|
| SCOWL ≤ 10 | 158 |
| SCOWL ≤ 20 | 275 |
| **SCOWL ≤ 35 (used)** | **475** |
| SCOWL ≤ 50 | 574 |
| SCOWL ≤ 70 | 743 |

## Definitions, second pass

The original finding stands — automatic extraction ranks the wrong sense first
for short game words — but it turned out to have a clean boundary. **The failure
is specific to game-only vocabulary.** For a word ordinary enough to sit in
SCOWL tier 60 or below, WordNet's first sense is the sense a player wants.

So `tools/build_derived.py` generates `data/defs_auto.js` under one rule: take
WordNet's first gloss **only if the word is in SCOWL tier ≤ 60**. AA, AB, AL, XU
and their kind are not in those tiers, so they are skipped and hand-authored
instead. `data/definitions.js` overrides the generated file everywhere they
overlap, and a test asserts that precedence.

Coverage now:

| Level group | Words | With a definition |
|---|---|---|
| Two-letter | 107 | 107 (all hand-authored) |
| Common threes | 475 | 436 |
| Q without U | 31 | 31 (all hand-authored) |
| Three-from-two | 771 | ~440 |
| Heavy tiles | 349 | ~150 |
| Vowel-heavy | 264 | ~113 |

**The remaining limitation, stated plainly.** The tier rule prevents
catastrophically wrong senses. It does not guarantee the *most-used* sense:
WordNet's first gloss for ACE is the tennis serve rather than the playing card,
and for IDEA it is the "estimate" sense. These are not wrong, only not first
choice. Words with no definition show as such rather than getting a guess.

## Bingo stems (level 10)

Nothing was sourced. A stem's whole definition — six letters that combine with
many of the other twenty-six to make a seven — is a countable property of the
word list, so `js/stems.js` computes it: every seven-letter word, letters
sorted, drop each letter in turn, and count how many distinct letters complete
each six-letter alphagram. Change the lexicon and the stems change with it, so
this level can never disagree with the others.

The top stem is AEINST at 23 of 26 letters, which matches what published stem
lists say. Tests assert that a stem's claimed letters are exactly the ones that
produce a real word, and that every example word is a genuine anagram of the
stem plus its letter.

Stems are shown as alphagrams, which is how players actually hold them. SCOWL
supplies the recognisable anagrams listed alongside — AEINST spells TINEAS and
TISANE. Where several are equally common there is no signal to choose between
them, so all are shown rather than one being picked arbitrarily.

## The anagram drill

Nothing sourced. A puzzle is an alphagram plus every word in the lexicon that
spells it, both computed at runtime from the word list.

Two different word sets are in play, on purpose:

- **Puzzles are set only from `WT_COMMON`** — the SCOWL-graded ordinary English
  words. Scrambling a word nobody has heard of is a trick, not a puzzle.
- **Answers are checked against the whole lexicon.** If a player finds a valid
  word we did not seed the puzzle from, they are right and the app says so.

Puzzle counts: 1,522 at four letters, 2,824 at five, 4,558 at six, 5,974 at
seven (distinct alphagrams, so a puzzle with several answers counts once).

### Definitions for inflected forms

Both dictionaries define base words, not inflections — SPUR is in WordNet, SPURS
is not. That left about a third of five-letter drill puzzles with no definition
to offer as a hint. `js/defs.js` now falls back to a plausible base word and
labels it: *"a form of spur — a railway line connected to a trunk line"*.

The relationship is deliberately left vague. Deciding from spelling alone whether
a word is a plural, a past tense or a comparative is unreliable, so the app says
"a form of" rather than asserting grammar it has not checked. The fallback only
fires when the candidate base is itself a word in the lexicon and has a real
definition; otherwise the word simply has none.

Uncovered puzzles after the fallback, per 200: 9 at four letters, 6 at five, 6 at
six, 15 at seven.

---

## The board core

`js/board.js`, `js/movegen.js`, `js/trie.js` and `data/lexicon_long.js` implement
a 15×15 board, scoring, placement validation and an Appel & Jacobson move
generator. They were built ahead of any mode that needed them and sat unloaded
for exactly that reason; **the daily puzzle now loads them**, which is what took
cold start from ~210ms to ~265ms. The 933KB of long-word lexicon is the bulk of
that cost and it is now paid on every session, including sessions that only open
the study path. If that becomes a problem, the fix is to load the board core on
demand when the daily is opened rather than in `index.html`.

### Two corrections to the spec this was built from

**QIN is not valid, and was not added.** The spec's patch list was
`QI QIS QIN ZA ZAS GI GIS EW OI OK`. QIN appears in neither Mike Wolfberg's
NWL2023 two-letter list nor the NWL23 cheat sheet's three-letter list, whose Q
section reads in full: `QAT QIS QUA`. Adding it would have taught players a
non-word. A test asserts it stays out.

**The patch list was also missing five words.** `DA FE KI PO TE` are valid
two-letter words in NWL2023 and absent from ENABLE, as are their plurals
`DAS FES KIS POS TES`. All ten were already in `tools/supplement.json` from the
earlier lexicon work, verified against the same sources. The board engine uses
that supplement rather than the spec's list, so it patches nineteen words rather
than ten.

### Structures

A node trie was measured before committing to it: 168,551 words build in ~270ms
and cost ~23MB of heap in V8. Cheap enough to build on the device, so the trie
is built lazily on first use rather than shipped as a packed structure.

Words longer than fifteen letters are dropped from the board lexicon — 4,272 of
them — because they cannot fit on the board.

### How the two known bugs are guarded

Both bugs the spec warned about produce boards carrying genuinely invalid words
while the generator's own bookkeeping reports success. So neither is tested by
asking the generator whether it is happy.

**Cross-check axis.** `js/movegen.js` searches horizontally and computes
cross-checks vertically, always, in whatever board it is handed. Vertical moves
come from searching a transposed copy and mapping coordinates back. There is no
`"H"`/`"V"` flag anywhere in the search, so there is nothing to get backwards.

**Anchor boundary.** `freeLeft()` stops at the board edge, at a filled square,
*and* at another anchor square.

**The test.** `tools/test_board.js` generates every move on three fixture boards,
applies each one to a copy of the board, and reruns the full auditor over the
result — 1,312 + 1,312 + 518 moves, each independently re-scanned. It also
asserts the auditor can fail, by jamming a junk letter onto a clean board and
requiring it to be caught. An auditor that cannot fail proves nothing.

**Blanks.** Every placement in the right-extension phase is checked against the
trie's real children, so a blank only branches into letters that continue a
word. Left extension cannot be pruned that way, so blanks are excluded from that
phase by default (`allowBlanksInLeftPart`). Measured: two blanks plus five tiles
on a mid-game board generates 20,232 moves in 695ms.

### Trademark — worth reading before this ships

The project has been careful not to brand as Scrabble. The board core does not
change that, but it does raise the stakes, so here is the position as precisely
as it can be put by someone who is not a lawyer:

- **Rules, scoring, tile values and move generation are mechanics**, and game
  mechanics are not protected by copyright — the doctrine goes back to
  *Baker v. Selden* (1879), which excludes any "idea, procedure, process,
  system, method of operation."
- **The name is the real exposure.** When Hasbro pursued Scrabulous, the Delhi
  High Court held that the game itself was not copyrightable but that the
  *name* infringed the SCRABBLE trademark. Hasbro dropped its US suit in
  December 2008. The product rebranded to Lexulous and survived.
- **The board's visual presentation is the grey area.** The arrangement of
  premium squares is arguably functional; the look of the board — colours,
  the star, the tile styling — is where trade dress arguments live. This app has
  its own visual language already, and should render a board in that language
  rather than reproducing the familiar pink-and-blue one.

Nothing user-facing in the codebase contains the word "Scrabble"; the single
occurrence is a code comment in `js/ui.js`. Keep it that way.

Sources: [Baker v. Selden and game mechanics](https://www.researchhouse.ca/new-blog/2024/10/8/not-playing-around-board-games-and-intellectual-property-law),
[Hasbro drops the Scrabulous suit](https://www.bloomberg.com/news/articles/2008-12-16/hasbro-drops-lawsuit-over-scrabble-like-scrabulous).

---

## The daily puzzle

Nothing sourced. A daily puzzle is a board this app generated by playing itself,
plus a rack, plus the answer — all computed by `tools/build_daily.js` from the
lexicon already in the project.

### Why it is a build step

Generating one puzzle means several turns of self-play with the move generator,
then a full search of the final rack for its optimum: roughly two seconds, on
top of a ~270ms trie build. Doing that on the device would mean a spinner before
a puzzle appeared. Doing it here makes the daily plain data, and means the phone
never runs a move search at all.

400 puzzles took 43.1s to generate and ship as 113KB. Measured over the shipped
pool: best play 20 / 33 / 162 (min / median / max), 9–32 tiles already down,
31–6,070 legal plays per position, 24 racks containing a blank.

### What is guaranteed about a puzzle

**Every board is audited, twice.** The auditor — which rescans the whole grid
against the dictionary and trusts no generator bookkeeping — runs on the
position before it is kept, and again after the recorded best play is applied.
51 candidates were rejected during the build rather than patched. A board
carrying an invalid word cannot be fixed once it has shipped, so the only safe
policy is to throw it away.

**The generator is deterministic.** A seeded RNG drives the self-play, so
rebuilding the pool with the same count reproduces it exactly. Self-play does
not always take the top move, because a board built entirely from optimal plays
is unrepresentative of the boards people actually face.

**"Best" means best for that rack on that board**, found by the same move
generator `tools/test_board.js` exercises, not by a heuristic. So the grade a
player gets is against a real optimum, not an estimate.

### Same puzzle for everyone, with no server

The number of days since a fixed epoch (2026-09-01, chosen only because it is
when the pool was first built) indexes into the pool. No network call, no
account, no shared state — the day itself is the seed.

**The date is read from the local clock, not UTC.** A daily that rolls over at
a foreign midnight is a daily people miss. The cost is that changing the device
clock lets someone play ahead. This is not defended against: it is a cheat whose
only victim is the cheat, and defending it would need a server, which the whole
app is built to avoid.

**The pool runs out.** After 400 days it starts repeating, and the result screen
says how many days are left once it is under 30. That is a real limit, surfaced
rather than hidden; `node tools/build_daily.js 800` pushes it out.

### Grading

Score as a share of the best play available: 1.0 "Found it", 0.8 "Very close",
0.55 "Strong", 0.3 "On the board", anything above zero "Played". The bands are
set to reward finding a good play rather than only the perfect one — the median
legal play on these boards is well under half the optimum, so a player at 55% is
already beating most of what was on the board.

One play per day, filed in localStorage under a `YYYY-MM-DD` key. There is no
undo, which is the point: the grade means nothing if you can retry.

### Board presentation

The trade-dress note above applies directly here, since this is the first mode
that draws a board. The premium squares are rendered in this app's own palette —
the same greens and warm tiles as the rest of the app — rather than the familiar
pink-and-blue arrangement. The premium *layout* is functional and standard; the
*look* is not borrowed.

---

## Review — the spaced-repetition scheduler

Nothing sourced; this is a scheduling policy, not data. What follows is the
reasoning, because the choices are the kind that look arbitrary later.

### Leitner, not SM-2

The obvious reference implementation is SuperMemo's SM-2, and it was rejected
for a specific reason. SM-2 derives an *ease factor* per item from a graded
recall score — the learner rates their recall 0 to 5 — and that factor is what
makes the intervals adaptive.

This app's quiz is binary. The player pressed "It's a word" or "Not a word";
there is no fifth of a grade anywhere in the signal. Implementing SM-2 would
mean synthesising the 0-5 grades from a right/wrong bit, and an ease factor
computed from synthesised inputs is *worse* than no ease factor, because the
arithmetic makes it look principled. So the scheduler is a Leitner box system,
which is exactly what a binary signal supports.

Boxes and the wait after a correct answer: **1, 2, 4, 8, 16, 32 days.** Doubling
is the standard Leitner shape. Clear the last box and the word retires. One
wrong answer sends a word to box 0 regardless of how high it had climbed.

A missed word is scheduled for **tomorrow, not today**. Re-asking within the
same session tests recognition, not recall, and would let a player clear a
backlog by grinding rather than by knowing.

### What enters the queue, and the limit that creates

**Only words the player has got wrong.** A word answered correctly the first
time is never scheduled.

This is a real limitation and worth stating rather than discovering: **review
cannot catch a word you guessed right.** On a binary question a coin-flip is
correct half the time, so some words will pass through unlearned.

The alternative — schedule everything the path teaches — was rejected on
arithmetic. The ten levels cover a few thousand words. Scheduling all of them
would produce a backlog of hundreds of due items within a week, and a review
queue that can never be cleared is one people stop opening. A scheduler nobody
uses teaches less than a leaky one they do.

Sessions are capped at **20 due words**, for the same reason: a backlog should
become several sittings, not one impossible quiz.

### False accepts are not tracked

The quiz has two failure modes and keeps them apart: real words you turned down,
and non-words you accepted. Only the first is scheduled.

The reason is mechanical. Decoys are generated fresh for every quiz by changing
one letter of a real word, so the non-word you accepted last Tuesday will
probably never appear again. There is no stable item to schedule. Fixing this
means a persistent decoy pool, which is a different design; for now the result
screen reports false accepts and the scheduler ignores them.

### One funnel

`WT.review.applyAnswers()` is called from exactly one place: `run()` in
`js/screens/quiz.js`, where every valid/invalid quiz in the app finishes. This
is deliberate. Any future quiz built on `run()` feeds the schedule automatically,
and no future quiz can forget to. The anagram drill and the daily puzzle do not
feed it — they are not valid/invalid questions and have no per-word right/wrong
signal to contribute.

### Storage compatibility

The `reviews` key was added to the saved record **without a version bump.**
`js/storage.js` ignores any record whose version it does not recognise, so
bumping to v2 would have silently discarded every level already cleared on an
existing install. Reading `parsed.reviews || {}` treats an older record as
"nothing scheduled yet", which is both true and harmless. A test loads a
hand-built pre-review record and asserts its levels survive.

### The day axis

Days since the Unix epoch, counted at **local** midnight — same rule as the
daily puzzle, and the same accepted cost: moving the device clock forward pulls
review work forward. It is not defended against, for the same reason.

### Board rendering — two bugs worth recording

**The warped board.** `.bgrid` was `grid-template-columns: repeat(15, 1fr)`
inside a `width: 100%` box. The available width is almost never divisible by 15,
and the browser distributes the leftover sub-pixels across some columns and not
others, so squares differed by a pixel and the grid looked bent. Fixed by
measuring the container once and setting an explicit integer track size
(`--sq`), which cannot round unevenly. `tools/daily_check.js` now measures all
225 squares and fails unless every width and height is identical.

**Click suppression that was never needed.** The drag implementation originally
ignored clicks for 350ms after a drag, to stop the stray click a drag leaves
behind from also firing the tap handler. That guard broke a genuine tap made
straight after a drag — and when a drag ended somewhere that fires no click at
all, the guard stayed armed and ate the next real tap. Removing it entirely is
correct: every drop calls `draw()`, which rebuilds the rack and all 225 squares,
so the node a stray click would target is detached before the click dispatches.
The test drags, then taps, and asserts the tap registered.

---

## Playing a game

Nothing sourced. `js/game.js` implements the rules; `js/opponent.js` chooses
moves from the generator that was already there.

### The rules, and the two that people argue about

Seven tiles each, refill after every play or exchange while the bag lasts.

**Exchanging requires seven or more tiles left in the bag.** This is the
standard restriction and it is load-bearing: without it the endgame becomes an
infinite shuffle, since a player with nothing to play can swap forever.

**Six consecutive scoreless turns ends the game** — passes, exchanges, or a play
worth nothing, three each. Without a cut-off, two players who both pass sit
there for ever. The alternative end is a player using their last tile with the
bag empty.

**Final adjustment:** the player who goes out gains the sum of the other's
remaining tiles and the other loses the same amount. If nobody went out, each
simply loses their own rack. This is the ordinary convention.

### Difficulty is a band, not a dice roll

The obvious way to make an opponent easier is randomness: play the best move
some fraction of the time and something random otherwise. That was rejected. It
produces an opponent who is either flawless or plays a two-letter word for 9
with a bingo sitting on the rack — which is not *easier*, it is incoherent, and
a practice partner whose mistakes are nonsense teaches nothing about what a good
move looks like.

Instead each level takes a slice of the ranked move list: Gentle plays from the
middle of what was available, Steady near the top, Sharp takes the best. Every
move the opponent makes is one a person could defend. The bands are in
`js/opponent.js` and a test asserts Gentle's pick is *always* worse than
Sharp's over 200 seeded draws.

The opponent never exchanges away a blank. An opponent that throws its own blank
back is not a harder opponent, it is a broken one.

### How the endgame is actually tested

The endgame is the part nobody exercises by hand, so `tools/test_game.js` plays
twelve whole seeded games engine-vs-engine and checks two invariants **at every
turn of every game**:

- **exactly 100 tiles exist** across bag, both racks and board. A bag that
  quietly gains or loses a tile is the kind of bug that surfaces in someone's
  fortieth game and never before.
- **the whole board re-audits clean** against the dictionary. Asking the
  generator whether it is happy proves nothing; the auditor rescans from
  scratch.

Measured across those twelve games: all finished, ten or more by a player going
out rather than by stalling, bingos occur, and final scores average in the range
a real game produces.

## The best play — board strategy

### The claim, and why none of it is asserted

The mode teaches one thing: the highest-scoring play is not always the best. That
is easy to state and easy to state *wrongly*, so every number in every position
is computed by `tools/build_strategy.js` from the same move generator and board
auditor as everything else, and `tools/strategy_check.js` re-derives all of it
from the live engine and fails if the shipped data disagrees.

A position keeps only pairs where the cheaper play is clearly better on one of
two measures — a marginal difference teaches nothing:

- **what you leave**: the tiles still on your rack, scored by `js/leave.js`
- **what you open**: the best score the opponent could make on the resulting
  board

Measured over the shipped 60: 33 turn on the leave, 27 on what gets opened;
1–14 points given up; up to 62 points of opponent reply removed.

### The opponent's rack is disclosed, on purpose

"What you open" depends on what the opponent holds, which is unknowable. Rather
than model it, the build draws **one** rack from the tiles genuinely still
unseen, records it in the position, and the screen names it: *"They hold
IAOWLTO — shown so you can check the reply numbers yourself."*

A disclosed assumption the player can verify is worth more than a hidden model
they cannot, and it is the honest version of a claim this project cannot make
rigorously.

### js/leave.js is a rubric, and says so

Serious engines judge a leave with an **equity table**: a number per rack
derived from millions of simulated games. This project has no such data.
Generating numbers that *look* like equity would be the worst outcome —
authoritative-looking and unfounded.

So `js/leave.js` is a small additive rubric built only from principles that are
uncontested in every beginner guide: vowel/consonant balance, holding the S and
the blank, avoiding duplicates, Q without U, and V (which makes no two-letter
word at all). The scale is unitless and nothing converts it to points.

**The screen prints the reasons, not the number alone**, and labels it as a
rubric rather than an engine. A player who disagrees with a term can still learn
what the terms are, which is the actual lesson.

## Numerals are not set in Fraunces

Found while building the progress screen, and it was app-wide.

**Fraunces' 3 has a flat top bar** and at UI sizes is genuinely not
distinguishable from a 5. This was checked across every axis the variable font
exposes — `WONK` 0 and 1, every optical size from 9 to 144, and the `ss01`
stylistic set. It never changes; the flat-top 3 is the design.

It was affecting scores, quiz counters, the premium-square labels, the progress
figures — and **tile point values**, where a 3-point tile was teaching itself as
a 5-point tile. In an app whose subject is scoring, that is a correctness bug
wearing a typographic hat.

Every numeral in the app is now set in the UI sans with tabular figures; words,
headings and letter tiles keep Fraunces. The brief's "type is the hero" was
about the word set large, so nothing was given up. `tools/shots/wonk.png` is the
comparison.

The general lesson, worth keeping: **a passing assertion on `textContent` says
nothing about what the glyph looks like.** The premium-label test asserted the
string was "3W" and passed while the board displayed "5W".

---

## Hosting, and the offline worker

The app makes no network requests at runtime — it never did — so "offline
support" here means only one thing: making sure the files themselves are
available when there is no signal. `sw.js` caches the whole shell on install and
serves cache-first.

**Two decisions worth recording.**

`cache.addAll()` is used rather than caching files one at a time as they are
requested. addAll fails the entire install if any single file 404s, and that is
the behaviour wanted: an app that half-caches, works until the user goes
offline, and then breaks is worse than an install that fails immediately and
visibly.

**The worker is registered only on https, never on `file:`.** Service workers
require a secure context, so registration from a double-clicked file would throw
an unhandled rejection into the console of the app's most common way of being
opened. The guard keeps `file://` working exactly as before, which is still how
the whole test suite runs.

**The cache name must be bumped on every deploy.** A cache-first worker with an
unchanged version serves the previous build forever. This is written in the
worker's own header and in the README because the failure mode is
indistinguishable, from the outside, from a broken deploy.

### iOS specifics

Safari reads `apple-touch-icon` and the `apple-mobile-web-app-*` meta tags
rather than the manifest for most of the install, so both are declared. The
manifest is still there for Android and desktop Chrome.

Persistence on iOS is covered by the WebKit exemption recorded earlier: a
home-screen web app's first-party domain is skipped by ITP's 7-day cap on
script-writable storage, so localStorage progress survives. That exemption
covers the timer only — a user clearing Safari data, or iOS reclaiming space
under pressure, still wipes it. Progress is not backed up anywhere, because
there is no backend, and that is a stated consequence of the architecture rather
than an oversight.
