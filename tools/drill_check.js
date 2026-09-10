/* Play a full anagram round in a real browser, solving each puzzle from the
   app's own data, plus the give-up and wrong-guess paths.
   Run: node tools/drill_check.js */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const ROOT = path.dirname(__dirname);
const OUT = path.join(__dirname, "shots");
const URL = "file://" + path.join(ROOT, "index.html");

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
    await page.screenshot({ path: `${OUT}/d0-home-${scheme}.png`, fullPage: true });

    // second card = the drill
    await page.$$eval(".mode-card", (n) => n[1].click());
    await page.waitForSelector(".length-card");
    const lengths = await page.$$eval(".length-title", (n) => n.map((x) => x.textContent));
    await page.screenshot({ path: `${OUT}/d1-menu-${scheme}.png`, fullPage: true });

    await page.$$eval(".length-card", (n) => n[1].click()); // 5-letter
    await page.waitForSelector(".tile");

    let solved = 0;
    let gaveUp = 0;
    let typedWrongOnce = false;

    for (let q = 0; q < 10; q++) {
      await page.waitForSelector(".tile:not(.is-used)");
      const scrambled = await page.$$eval(".tile", (n) =>
        n.map((x) => x.textContent).join("")
      );
      const answer = await page.evaluate((s) => {
        const alpha = s.split("").sort().join("");
        return window.WT.lex
          .ofLength(s.length)
          .filter((w) => w.split("").sort().join("") === alpha)[0];
      }, scrambled);

      if (q === 0) {
        // deliberately wrong guess first, to exercise the retry path
        const wrong = scrambled;
        const isWord = await page.evaluate((w) => window.WT.lex.has(w), wrong);
        if (!isWord) {
          for (const ch of wrong) await page.keyboard.press(ch);
          await page.waitForTimeout(900);
          typedWrongOnce = true;
        }
      }

      if (q === 4) {
        await page.click('button:text("Hint")');
        await page.waitForTimeout(120);
        await page.screenshot({ path: `${OUT}/d2-playing-${scheme}.png` });
      }

      if (q === 7) {
        await page.click('button:text("Show me")');
        gaveUp++;
        await page.waitForTimeout(1300);
        continue;
      }

      for (const ch of answer) await page.keyboard.press(ch);
      solved++;
      await page.waitForTimeout(1300);
    }

    await page.waitForSelector(".score");
    const score = (await page.textContent(".score")).trim();
    await page.screenshot({ path: `${OUT}/d3-result-${scheme}.png`, fullPage: true });

    await page.click('button:text("Change length")');
    await page.waitForSelector(".length-card");
    const meta = await page.$$eval(".length-meta", (n) => n[1].textContent);

    await page.click('button:text("Home")');
    await page.waitForSelector(".mode-card");
    const card = (await page.$$eval(".mode-card", (n) => n[1].textContent))
      .replace(/\s+/g, " ")
      .trim();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );

    console.log(`[${scheme}]`);
    console.log("  lengths offered :", lengths.join(", "));
    console.log("  wrong guess path:", typedWrongOnce ? "exercised" : "skipped");
    console.log("  solved / gave up:", solved, "/", gaveUp);
    console.log("  score shown     :", score);
    console.log("  menu after round:", meta.trim());
    console.log("  home card       :", card);
    console.log("  overflow        :", overflow);
    console.log("  errors          :", errors.length ? errors : "none");
    await ctx.close();
  }

  await browser.close();
})().catch((e) => {
  console.error("DRILL CHECK FAILED:", e.message);
  process.exit(1);
});
