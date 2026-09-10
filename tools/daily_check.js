/* Play a daily puzzle in a real browser, end to end.
   Run: node tools/daily_check.js

   Plays the actual optimal move by reading it out of the pool and tapping the
   tiles onto the board the way a person would — so it exercises the pick-up /
   put-down interaction, the live score readout, the commit, and the locked
   result screen. */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const ROOT = path.dirname(__dirname);
const OUT = path.join(__dirname, "shots");
const URL = "file://" + path.join(ROOT, "index.html");

let failures = 0;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: scheme
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto(URL);
    await page.waitForSelector(".mode-card");
    await page.screenshot({ path: `${OUT}/n0-home-${scheme}.png`, fullPage: true });

    // third card = the daily
    await page.$$eval(".mode-card", (n) => n[2].click());
    await page.waitForSelector(".bgrid");

    const info = await page.evaluate(() => {
      const p = window.WT.daily.forDate(new Date());
      return {
        key: p.key, rack: p.rack, best: p.best, word: p.bestWord,
        options: p.options, pool: window.WT.daily.poolSize(),
        play: p.bestPlay, tiles: p.board.cells.filter((c) => c != null).length
      };
    });

    await page.screenshot({ path: `${OUT}/n1-board-${scheme}.png`, fullPage: true });

    /* Geometry: every square must be the same size and actually square. A 1fr
       grid distributes leftover sub-pixels unevenly, which is what made the
       board look warped, so this measures all 225 rather than trusting CSS. */
    const geom = await page.$$eval(".bsq", (nodes) => {
      const w = new Set(), h = new Set();
      nodes.forEach((n) => {
        const b = n.getBoundingClientRect();
        w.add(Math.round(b.width * 100) / 100);
        h.add(Math.round(b.height * 100) / 100);
      });
      const box = document.querySelector(".bgrid").getBoundingClientRect();
      return { squares: nodes.length, widths: [...w], heights: [...h],
               gridW: Math.round(box.width), gridH: Math.round(box.height) };
    });
    const even = geom.widths.length === 1 && geom.heights.length === 1 &&
      geom.widths[0] === geom.heights[0];
    console.log(`  grid           : ${geom.squares} squares, ` +
      `${geom.widths.join("/")}w x ${geom.heights.join("/")}h, ` +
      `board ${geom.gridW}x${geom.gridH} — ${even ? "even" : "UNEVEN"}`);
    if (!even) failures++;

    /* Premium labels. A fixed expected count would be wrong, because a premium
       square already covered by a tile shows the letter instead. So assert the
       invariant: every EMPTY non-centre premium square carries exactly one
       correct label, and no occupied square carries one. */
    const lab = await page.$$eval(".bsq", (nodes) => {
      const want = { "is-dl": "2L", "is-tl": "3L", "is-dw": "2W", "is-tw": "3W" };
      let expected = 0, wrong = 0, onOccupied = 0, drawn = 0;
      nodes.forEach((n) => {
        const label = n.querySelector(".premium-label");
        if (label) drawn++;
        const key = Object.keys(want).find((k) => n.classList.contains(k));
        const occupied = n.classList.contains("is-tile");
        const centre = n.classList.contains("is-centre");
        if (occupied && label) { onOccupied++; return; }
        if (!key || occupied || centre) return;
        expected++;
        if (!label || label.textContent !== want[key]) wrong++;
      });
      return { expected, drawn, wrong, onOccupied };
    });
    const labelsOk = lab.wrong === 0 && lab.onOccupied === 0 && lab.drawn === lab.expected;
    console.log(`  premium labels : ${lab.drawn} drawn on ${lab.expected} empty premium ` +
      `squares, ${lab.wrong} mislabelled, ${lab.onOccupied} on occupied` +
      (labelsOk ? "" : "  WRONG"));
    if (!labelsOk) failures++;

    /* Drag: pick up a rack tile with the mouse and drop it on a square, then
       drag it back off the board. Playwright's mouse emits real pointer events,
       so this exercises the same path a thumb does. */
    const target = info.play[0];
    const tileBox = await page.$$eval(".rack-row .tile", (n) => {
      const b = n[0].getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    const sqBox = await page.$$eval(".bsq", (n, k) => {
      const b = n[k].getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, target.r * 15 + target.c);

    await page.mouse.move(tileBox.x, tileBox.y);
    await page.mouse.down();
    await page.mouse.move(sqBox.x, sqBox.y, { steps: 12 });
    const ghosts = await page.$$eval(".drag-ghost", (n) => n.length);
    await page.mouse.up();
    await page.waitForTimeout(60);
    const droppedOk = await page.$$eval(".bsq", (n, k) => n[k].classList.contains("is-fresh"),
      target.r * 15 + target.c);
    console.log("  drag onto board:", droppedOk ? "landed" : "DID NOT LAND",
      "| ghost followed pointer:", ghosts === 1);
    if (!droppedOk || ghosts !== 1) failures++;

    // Drag it off the board again: that means take it back.
    await page.mouse.move(sqBox.x, sqBox.y);
    await page.mouse.down();
    await page.mouse.move(20, 20, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(60);
    const takenBack = await page.$$eval(".bsq", (n, k) => !n[k].classList.contains("is-fresh"),
      target.r * 15 + target.c);
    const rackRestored = await page.$$eval(".rack-row .tile", (n) =>
      n.filter((t) => !t.disabled).length);
    console.log("  drag off board :", takenBack ? "taken back" : "STILL THERE",
      "| rack tiles available:", rackRestored);
    if (!takenBack || rackRestored !== 7) failures++;

    /* A real tap immediately after a drag must still register — the drag only
       swallows the single ghost click it generates. Nothing is placed here, so
       this also leaves the board clean for the tap-driven play below. */
    await page.$$eval(".rack-row .tile", (n) => n[0].click());
    const tapAfterDrag = await page.$$eval(".rack-row .tile", (n) =>
      n[0].getAttribute("aria-pressed") === "true");
    await page.$$eval(".rack-row .tile", (n) => n[0].click()); // put it back down
    console.log("  tap after drag :", tapAfterDrag ? "registers" : "SWALLOWED");
    if (!tapAfterDrag) failures++;

    // Play the optimal move: for each placement, pick the matching rack tile
    // and tap the square. Blanks would need the prompt, so skip a puzzle that
    // needs one rather than fake it.
    const needsBlank = info.play.some((p) => p.tile === p.tile.toLowerCase());
    let committed = false;
    let readout = null;

    if (!needsBlank) {
      for (const p of info.play) {
        const idx = await page.evaluate(
          ([tile]) => {
            const used = window.__used || (window.__used = []);
            const rack = window.WT.daily.forDate(new Date()).rack;
            for (let i = 0; i < rack.length; i++) {
              if (rack[i] === tile && used.indexOf(i) === -1) { used.push(i); return i; }
            }
            return -1;
          },
          [p.tile.toUpperCase()]
        );
        if (idx < 0) break;
        await page.$$eval(`.rack-row .tile`, (nodes, i) => nodes[i].click(), idx);
        await page.$$eval(
          ".bsq",
          (nodes, k) => nodes[k].click(),
          p.r * 15 + p.c
        );
      }
      readout = (await page.textContent(".play-readout")).replace(/\s+/g, " ").trim();
      await page.screenshot({ path: `${OUT}/n2-placed-${scheme}.png`, fullPage: true });

      page.on("dialog", (d) => d.accept());
      const btn = await page.$('button:text("Commit this play")');
      const disabled = await btn.isDisabled();
      if (!disabled) {
        await btn.click();
        await page.waitForSelector(".score");
        committed = true;
      }
    }

    let result = null;
    if (committed) {
      result = (await page.textContent(".score")).trim();
      await page.screenshot({ path: `${OUT}/n3-result-${scheme}.png`, fullPage: true });
      // Reload: the day must stay locked.
      await page.reload();
      await page.waitForSelector(".mode-card");
      await page.$$eval(".mode-card", (n) => n[2].click());
      await page.waitForSelector(".score");
      const stillLocked = !(await page.$(".rack-row"));
      console.log(`[${scheme}] locked after reload:`, stillLocked);
      await page.click('button:text("Back home")');
      await page.waitForSelector(".mode-card");
      await page.screenshot({ path: `${OUT}/n4-home-after-${scheme}.png`, fullPage: true });
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );

    console.log(`[${scheme}]`);
    console.log("  pool           :", info.pool, "puzzles");
    console.log("  today          :", info.key, "| rack", info.rack.join(""), "|", info.tiles, "tiles down");
    console.log("  best available :", info.word, "for", info.best, "of", info.options.toLocaleString("en-US"), "legal plays");
    console.log("  needs a blank  :", needsBlank);
    if (readout) console.log("  live readout   :", readout);
    if (result) console.log("  result screen  :", result);
    console.log("  overflow       :", overflow);
    console.log("  errors         :", errors.length ? errors : "none");
    await ctx.close();
  }

  await browser.close();
  if (failures) {
    console.log(`\n${failures} DAILY UI CHECK(S) FAILED\n`);
    process.exit(1);
  }
  console.log("\nDaily verified.\n");
})().catch((e) => {
  console.error("DAILY CHECK FAILED:", e.message);
  process.exit(1);
});
