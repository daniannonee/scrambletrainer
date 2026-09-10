/* The blank-tile picker and the share string, in a browser.
   Run: node tools/blank_check.js

   The daily pool only has a blank in some racks, so this does not wait for one
   to come round: it finds a puzzle in the pool that HAS a blank, forces the
   clock to that day, and plays it. */
const { chromium } = require("playwright");
const path = require("path");
const ROOT = path.dirname(__dirname);
const URL = "file://" + path.join(ROOT, "index.html");

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(URL);
  await page.waitForSelector(".mode-card");

  // Find a day whose rack contains a blank, and pin the clock to it.
  const day = await page.evaluate(() => {
    const n = window.WT.daily.poolSize();
    const today = window.WT.daily.today ? null : null;
    for (let i = 0; i < n; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const p = window.WT.daily.forDate(d);
      if (p.rack.indexOf("_") !== -1) return { offset: i, rack: p.rack.join(""), key: p.key };
    }
    return null;
  });
  check("the pool contains a rack with a blank", !!day, day ? day.rack : "none found");
  if (!day) { await browser.close(); process.exit(1); }

  await page.addInitScript((offset) => {
    const Real = Date;
    const shift = offset * 86400000;
    // eslint-disable-next-line no-global-assign
    Date = class extends Real {
      constructor(...args) {
        if (args.length === 0) super(Real.now() + shift);
        else super(...args);
      }
      static now() { return Real.now() + shift; }
    };
  }, day.offset);
  await page.goto(URL);
  await page.waitForSelector(".mode-card");
  await page.$$eval(".mode-card", (n) => n[2].click());
  await page.waitForSelector(".bgrid");

  const rack = await page.$$eval(".rack-row .tile", (n) =>
    n.map((t) => t.getAttribute("aria-label")));
  const blankIndex = rack.findIndex((l) => l === "blank tile");
  check("the blank is on the rack", blankIndex >= 0, rack.join(","));

  // No picker until a blank is actually placed.
  check("no picker on screen to start", !(await page.$(".picker")));

  /* An empty square adjacent to an existing tile, so the placement is one the
     board would actually accept. (7,7) is occupied on most mid-game boards. */
  const emptyIdx = await page.$$eval(".bsq", (n) =>
    n.findIndex((s) => !s.classList.contains("is-tile")));
  check("found an empty square to aim at", emptyIdx >= 0, String(emptyIdx));

  await page.$$eval(".rack-row .tile", (n, i) => n[i].click(), blankIndex);
  await page.$$eval(".bsq", (n, k) => n[k].click(), emptyIdx);
  const opened = await page.$(".picker");
  check("placing a blank opens the picker", !!opened);
  if (opened) {
    const letters = await page.$$eval(".picker-letter", (n) => n.length);
    check("the picker offers all 26 letters", letters === 26, String(letters));
    const focused = await page.evaluate(() => document.activeElement.textContent);
    check("focus lands inside the picker", focused === "A", focused);

    // Escape cancels without placing.
    await page.keyboard.press("Escape");
    check("escape closes the picker", !(await page.$(".picker")));
    const placedAfterCancel = await page.$$eval(".bsq", (n) =>
      n.filter((s) => s.classList.contains("is-fresh")).length);
    check("cancelling places nothing", placedAfterCancel === 0, String(placedAfterCancel));

    /* Cancelling should leave the tile still in hand — you did not put it back,
       you declined to choose a letter — so the square alone re-opens the picker. */
    const stillHeld = await page.$$eval(".rack-row .tile", (n, i) =>
      n[i].getAttribute("aria-pressed") === "true", blankIndex);
    check("cancelling leaves the blank still held", stillHeld);

    await page.$$eval(".bsq", (n, k) => n[k].click(), emptyIdx);
    await page.waitForSelector(".picker");
    await page.keyboard.press("e");
    await page.waitForTimeout(80);
    check("typing a letter closes the picker", !(await page.$(".picker")));
    const onBoard = await page.$$eval(".bsq", (n) => {
      const s = n.filter((x) => x.classList.contains("is-fresh"));
      return s.map((x) => ({ letter: x.textContent.trim(), blank: !!x.querySelector(".bblank") }));
    });
    check("the blank went down as the chosen letter", onBoard.length === 1 && onBoard[0].letter === "E",
      JSON.stringify(onBoard));
    check("it is still marked as a blank on the board", onBoard.length === 1 && onBoard[0].blank);
  }

  // Share: play the day out, then copy.
  await page.evaluate(() => {
    const p = window.WT.daily.forDate(new Date());
    window.WT.daily.record(new Date(), { score: 12, best: p.best, word: "TEST", tier: "Played" });
  });
  await page.goto(URL);
  await page.waitForSelector(".mode-card");
  await page.$$eval(".mode-card", (n) => n[2].click());
  await page.waitForSelector(".score");
  await page.click('button:text("Copy result")');
  await page.waitForTimeout(120);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  console.log("  share text     :", JSON.stringify(copied));
  check("share text names the app and the date", /Word trainer/.test(copied) && /\d{4}-\d{2}-\d{2}/.test(copied));
  check("share text has the score against the best", /12 \/ \d+/.test(copied));
  check("share text does not leak the answer word", !/TEST/i.test(copied));

  check("no console errors", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : "\nBlank picker and share verified.\n");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
