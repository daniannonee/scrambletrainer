/* Screenshot walkthrough — proves the app actually runs in a browser.
   Run: node tools/shots.js   (outputs to tools/shots/) */
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
    await page.screenshot({ path: `${OUT}/0-home-${scheme}.png`, fullPage: true });
    await page.click(".mode-card");
    await page.waitForSelector(".level");
    await page.waitForTimeout(250);

    // 1. the path
    await page.screenshot({ path: `${OUT}/1-path-${scheme}.png`, fullPage: true });

    // no horizontal overflow at phone width
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );

    // 2. study, with a word open
    await page.click(".level.is-current");
    await page.waitForSelector(".word-cell");
    await page.click('.word-cell:text-is("aa")');
    await page.waitForSelector(".word-detail");
    await page.screenshot({ path: `${OUT}/2-study-${scheme}.png`, fullPage: false });
    const detail = await page.textContent(".word-detail");

    // 3. quiz
    await page.click('button:text("Start the quiz")');
    await page.waitForSelector(".quiz-word");
    await page.screenshot({ path: `${OUT}/3-quiz-${scheme}.png` });

    // Answer with real knowledge so we can also confirm a pass path.
    let answered = 0;
    while (await page.$(".quiz-word")) {
      const word = (await page.textContent(".quiz-word")).trim();
      if (!word) break;
      const valid = await page.evaluate((w) => window.WT.lex.has(w), word);
      // Deliberately miss two so the results screen has something to show.
      const say = answered < 2 ? !valid : valid;
      await page.click(say ? 'button:text("It\'s a word")' : 'button:text("Not a word")');
      answered++;
      await page.waitForTimeout(820);
      if (await page.$(".score")) break;
      if (answered > 60) break;
    }

    await page.waitForSelector(".score");
    await page.screenshot({ path: `${OUT}/4-result-${scheme}.png`, fullPage: true });
    const score = await page.textContent(".score");

    // 5. back to path, then reload, to prove progress persisted
    await page.click('button:text("Back to the path")');
    await page.waitForSelector(".level");
    await page.reload();
    await page.waitForSelector(".mode-card");
    await page.screenshot({ path: `${OUT}/6-home-after-${scheme}.png`, fullPage: true });
    await page.click(".mode-card");
    await page.waitForSelector(".level");
    await page.waitForTimeout(250);
    const firstState = await page.getAttribute(".level", "class");
    const secondState = await page.evaluate(
      () => document.querySelectorAll(".level")[1].className
    );
    await page.screenshot({ path: `${OUT}/5-path-after-${scheme}.png`, fullPage: true });

    console.log(`[${scheme}]`);
    console.log("  questions answered :", answered);
    console.log("  score              :", score);
    console.log("  detail panel text  :", detail.replace(/\s+/g, " ").slice(0, 90));
    console.log("  level 1 after reload:", firstState);
    console.log("  level 2 after reload:", secondState);
    console.log("  horizontal overflow:", overflow);
    console.log("  page errors        :", errors.length ? errors : "none");
    await ctx.close();
  }

  await browser.close();
})();
