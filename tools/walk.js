/* Play the entire path in a real browser, start to finish.
   Answers every question correctly using the app's own lexicon, so a pass
   proves the ten levels are all completable and that nothing throws.
   Run: node tools/walk.js */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const ROOT = path.dirname(__dirname);
const OUT = path.join(__dirname, "shots");
const URL = "file://" + path.join(ROOT, "index.html");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(URL);
  await page.waitForSelector(".mode-card");
  await page.click(".mode-card");
  await page.waitForSelector(".level");

  const titles = await page.$$eval(".level-title", (n) => n.map((x) => x.textContent));

  for (let i = 0; i < titles.length; i++) {
    const t0 = Date.now();
    await page.waitForSelector(".level.is-current");
    await page.click(".level.is-current");

    // Study step, if this level has one.
    const studying = await page.$('button:text("Start the quiz")');
    let words = null;
    let pages = 1;
    if (studying) {
      words = await page.$$eval(".word-cell", (n) => n.length);
      const pg = await page.$(".pager-label");
      if (pg) {
        pages = Number((await page.textContent(".pager-label")).match(/of (\d+)/)[1]);
      }
      // open the first entry to prove the detail panel builds
      await page.click(".word-cell");
      await page.waitForSelector(".word-detail");
      await page.click(".word-cell");
      await page.click('button:text("Start the quiz")');
    }

    await page.waitForSelector(".quiz-word");
    const isStem = await page.$(".quiz-stem");
    let answered = 0;
    while (!(await page.$(".score"))) {
      if (isStem) {
        const stem = (await page.textContent(".quiz-stem")).trim();
        const letter = (await page.textContent(".quiz-letter")).trim();
        const ok = await page.evaluate(
          ([s, c]) => window.WT.stems.works(s, c),
          [stem, letter]
        );
        await page.click(ok ? 'button:text("Makes a seven")' : 'button:text("No seven")');
      } else {
        const w = (await page.textContent(".quiz-word")).trim();
        const valid = await page.evaluate((x) => window.WT.lex.has(x), w);
        await page.click(valid ? 'button:text("It\'s a word")' : 'button:text("Not a word")');
      }
      answered++;
      await page.waitForTimeout(isStem ? 960 : 800);
      if (answered > 80) throw new Error("quiz did not end on level " + (i + 1));
    }

    const score = (await page.textContent(".score")).trim();
    if (score !== "100%") throw new Error(`level ${i + 1} scored ${score} on perfect play`);
    if (i === 2 || i === 9) {
      await page.screenshot({ path: `${OUT}/level-${i + 1}-result.png`, fullPage: true });
    }
    await page.click('button:text("Back to the path")');
    await page.waitForSelector(".level");

    console.log(
      `  ${String(i + 1).padStart(2)}. ${titles[i].padEnd(30)} ` +
        `${studying ? String(words).padStart(4) + " shown" : "  quiz only"}` +
        `${pages > 1 ? ` (${pages} parts)` : "        "}  ` +
        `${answered} questions  ${score}  ${((Date.now() - t0) / 1000).toFixed(1)}s`
    );
  }

  const done = await page.textContent(".counter");
  await page.screenshot({ path: `${OUT}/path-complete.png`, fullPage: true });
  await page.click('button:text("Home")');
  await page.waitForSelector(".mode-card");
  const card = (await page.textContent(".mode-card")).replace(/\s+/g, " ").trim();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );

  console.log("\npath state :", done.trim());
  console.log("home card  :", card);
  console.log("overflow   :", overflow);
  console.log("errors     :", errors.length ? errors : "none");

  await browser.close();
})().catch((e) => {
  console.error("WALK FAILED:", e.message);
  process.exit(1);
});
