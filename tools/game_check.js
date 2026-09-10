/* Play a real game in a real browser, to the end. Run: node tools/game_check.js

   The player's moves are chosen by asking the page's own move generator for a
   mid-ranked play and then dragging the tiles onto the board — so this is a
   test of the SCREEN, not of the rules (tools/test_game.js covers those). The
   invariants checked here are the ones only a browser can break: that the score
   line tracks the model, that the board is never left in a half-placed state,
   and that the opponent's turn does not deadlock. */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const ROOT = path.dirname(__dirname);
const OUT = path.join(__dirname, "shots");
const URL = "file://" + path.join(ROOT, "index.html");
const GAME_CARD = 4; // fifth mode

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(URL);
  await page.waitForSelector(".mode-card");
  await page.$$eval(".mode-card", (n, i) => n[i].click(), GAME_CARD);
  await page.waitForSelector(".mode-card");

  const levels = await page.$$eval(".mode-title", (n) => n.map((t) => t.textContent));
  check("three strengths are offered", levels.length === 3, levels.join(", "));

  await page.$$eval(".mode-card", (n) => n[0].click()); // Gentle
  await page.waitForSelector(".bgrid");
  await page.screenshot({ path: `${OUT}/g0-start.png`, fullPage: true });

  const opening = await page.textContent(".turn-note");
  check("the opening prompt mentions the centre", /centre/i.test(opening), opening.trim());
  const startScores = await page.$$eval(".score-value", (n) => n.map((v) => v.textContent));
  check("both scores start at zero", startScores.join(",") === "0,0", startScores.join(","));

  let turns = 0;
  let sawOpponentPlay = false;
  let sawBingo = false;
  let maxSeen = 0;

  while (turns < 40) {
    if (await page.$(".score")) break; // game-over screen

    // Ask the page for a playable move for the current rack, mid-ranked so the
    // game does not end in four turns.
    const move = await page.evaluate(() => {
      const g = window.WT.currentGame;
      if (!g) return null;
      const s = g.state();
      if (s.over || s.turn !== 0) return null;
      const moves = window.WT.movegen.generate(s.board, s.rack);
      if (!moves.length) return null;
      return moves[Math.min(moves.length - 1, Math.floor(moves.length * 0.25))].placements;
    });

    if (!move) {
      // No play available (or no handle on the game): pass and let it continue.
      const passBtn = await page.$('button:text("Pass")');
      if (!passBtn) break;
      page.once("dialog", (d) => d.accept());
      await passBtn.click();
      await page.waitForTimeout(400);
      turns++;
      continue;
    }

    // Place each tile by dragging it from the rack onto its square.
    let placedAll = true;
    for (const p of move) {
      const rackIdx = await page.evaluate((tile) => {
        const g = window.WT.currentGame;
        const rack = g.state().rack;
        const used = window.__used || (window.__used = []);
        const need = tile === tile.toLowerCase() && tile !== tile.toUpperCase()
          ? "_" : tile.toUpperCase();
        for (let i = 0; i < rack.length; i++) {
          if (rack[i] === need && used.indexOf(i) === -1) { used.push(i); return i; }
        }
        return -1;
      }, p.tile);
      if (rackIdx < 0) { placedAll = false; break; }

      const from = await page.$$eval(".rack-row .tile", (n, i) => {
        const b = n[i].getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }, rackIdx);
      const to = await page.$$eval(".bsq", (n, k) => {
        const b = n[k].getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }, p.r * 15 + p.c);

      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();

      // A blank opens the picker; choose the letter the move wanted.
      if (await page.$(".picker")) {
        await page.keyboard.press(p.tile.toUpperCase());
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(30);
    }
    await page.evaluate(() => { window.__used = []; });
    if (!placedAll) break;

    const playBtn = await page.$('button:text("Play")');
    const enabled = playBtn && !(await playBtn.isDisabled());
    if (!enabled) {
      check("a generated move was accepted by the live readout", false,
        (await page.textContent(".play-readout")).trim());
      break;
    }
    await playBtn.click();
    await page.waitForTimeout(120);

    // Opponent thinks, then plays.
    await page.waitForFunction(
      () => !/thinking/i.test(document.querySelector(".turn-note")?.textContent || ""),
      { timeout: 20000 }
    ).catch(() => {});
    const note = (await page.textContent(".turn-note").catch(() => "")) || "";
    if (/played/i.test(note)) sawOpponentPlay = true;
    if (/bingo/i.test(note)) sawBingo = true;

    // The model and the screen must agree on the score at every turn.
    const agree = await page.evaluate(() => {
      const g = window.WT.currentGame;
      if (!g) return true;
      const s = g.state();
      // Once the game ends the score line is replaced by the summary, which has
      // no .score-value at all — that is checked separately below.
      if (s.over) return true;
      const shown = [...document.querySelectorAll(".score-value")].map((n) => Number(n.textContent));
      return shown.length === 2 && shown[0] === s.scores[0] && shown[1] === s.scores[1];
    });
    if (!agree) { check("score line matches the model", false, "turn " + turns); break; }
    maxSeen = Math.max(maxSeen, await page.$$eval(".score-value", (n) => Number(n[0].textContent)).catch(() => 0));
    turns++;
  }

  check("the game ran for several turns", turns >= 4, String(turns));
  check("the opponent actually played", sawOpponentPlay);
  check("the player's score went up", maxSeen > 0, String(maxSeen));
  await page.screenshot({ path: `${OUT}/g1-midgame.png`, fullPage: true });

  // Force the end so the summary screen is exercised without playing 60 turns.
  await page.evaluate(() => {
    const g = window.WT.currentGame;
    for (let i = 0; i < 6 && !g.state().over; i++) g.pass();
  });
  const forced = await page.evaluate(() => window.WT.currentGame.state().over);
  if (forced) {
    await page.$$eval("button", (n) => {
      const b = n.find((x) => x.textContent.trim() === "Pass");
      if (b) b.click();
    });
  }
  await page.waitForTimeout(300);

  // The summary screen must exist and must agree with the model.
  const summary = await page.evaluate(() => {
    const s = window.WT.currentGame.state();
    const score = document.querySelector(".score");
    const shown = score ? score.textContent.trim() : null;
    return {
      shown,
      expected: s.scores[0] + " \u2013 " + s.scores[1],
      heading: (document.querySelector(".tier-name") || {}).textContent || "",
      reason: (document.querySelector(".label") || {}).textContent || "",
      boards: document.querySelectorAll(".bgrid").length,
      again: !!document.querySelector('button')
    };
  });
  check("the game-over screen appears", !!summary.shown, JSON.stringify(summary));
  check("the final score matches the model", summary.shown === summary.expected,
    `${summary.shown} vs ${summary.expected}`);
  check("it says who won", /win|draw/i.test(summary.heading), summary.heading);
  check("it says why the game ended", /played out|scoreless|resigned/i.test(summary.reason),
    summary.reason);
  check("the final board is shown", summary.boards === 1, String(summary.boards));

  // The result was recorded against the difficulty that was played.
  const record = await page.evaluate(() => window.WT.store.gameRecord("gentle"));
  check("the game was recorded", record.played === 1, JSON.stringify(record));
  check("the best score was kept", record.bestScore > 0, String(record.bestScore));

  await page.screenshot({ path: `${OUT}/g2-over.png`, fullPage: true });

  // Home should now show the game card with a record on it.
  await page.click('button:text("Back home")');
  await page.waitForSelector(".mode-card");
  /* Derived from the source, not hardcoded: adding a mode should not break an
     unrelated test — but a card silently failing to render should. */
  const cards = await page.$$eval(".mode-card", (n) => n.length);
  const declared = await page.evaluate(() => window.WT.screens.home.MODES.length);
  check("home renders a card for every declared mode", cards === declared,
    `${cards} cards, ${declared} declared`);
  const gameCard = await page.$$eval(".mode-card", (n, i) =>
    n[i].innerText.replace(/\s+/g, " "), GAME_CARD);
  check("the game card shows the record", /won of 1/.test(gameCard), gameCard.slice(-60));

  console.log("  errors         :", errors.length ? errors : "none");
  check("no console errors", errors.length === 0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("no horizontal overflow at 390px", !overflow);

  await browser.close();
  console.log(failures ? `\n${failures} GAME UI CHECK(S) FAILED\n` : "\nGame screen verified.\n");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("GAME CHECK FAILED:", e.message); process.exit(1); });
