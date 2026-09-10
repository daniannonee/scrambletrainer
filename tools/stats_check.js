/* The progress screen, with real data behind it. Run: node tools/stats_check.js

   Seeds one of everything through the app's own APIs — never by writing
   localStorage directly, because then the test would be checking a shape the
   app might not actually produce — then reads the screen back. */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const ROOT = path.dirname(__dirname);
const OUT = path.join(__dirname, "shots");
const URL = "file://" + path.join(ROOT, "index.html");

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

  // Empty state first.
  await page.click('button:text("Your progress →")');
  await page.waitForSelector("h2");
  const emptyLede = await page.textContent(".lede");
  check("a fresh install says there is nothing yet", /Nothing to show yet/.test(emptyLede), emptyLede.trim());
  check("no figures are invented on an empty install",
    (await page.$$eval(".stat-list", (n) => n.length)) === 0);

  // Seed one of everything, through the real APIs.
  await page.goto(URL);
  await page.waitForSelector(".mode-card");
  const seeded = await page.evaluate(() => {
    const WT = window.WT;
    const levels = WT.levels.all();
    WT.levels.complete(levels[0], 0.93);
    WT.levels.complete(levels[1], 0.88);
    WT.levels.recordAttempt(levels[2], 0.5);
    WT.store.recordDrill("anagram", 5, 8);
    WT.store.recordDrill("anagram", 5, 6);
    WT.store.recordDrill("anagram", 7, 4);
    WT.store.recordGame("gentle", { won: true, drawn: false, score: 310, against: 240 });
    WT.store.recordGame("sharp", { won: false, drawn: false, score: 280, against: 401 });
    // Five days of daily results, one of them perfect.
    const day = new Date();
    for (let i = 0; i < 5; i++) {
      const d = new Date(day);
      d.setDate(d.getDate() - i);
      const best = 40 + i * 3;
      WT.store.recordDaily(WT.daily.dateKey(d), {
        score: i === 1 ? best : Math.round(best * (0.4 + i * 0.1)),
        best, word: "TEST", tier: "Strong"
      });
    }
    WT.review.applyAnswers([
      { text: "qi", isWord: true, correct: false },
      { text: "za", isWord: true, correct: false },
      { text: "xu", isWord: true, correct: false }
    ]);
    WT.store.recordAnswers([
      { text: "qi", isWord: true, correct: false },
      { text: "qi", isWord: true, correct: false },
      { text: "za", isWord: true, correct: false }
    ]);
    return { levels: levels.length };
  });

  await page.reload();
  await page.waitForSelector(".mode-card");
  await page.click('button:text("Your progress →")');
  await page.waitForSelector(".stat-list");

  const sections = await page.$$eval(".result-block h3", (n) => n.map((h) => h.textContent));
  check("every section with data appears",
    ["The path", "Unscramble", "Today's board", "Review", "Games", "Words you keep missing"]
      .every((t) => sections.includes(t)), sections.join(" | "));

  const text = await page.innerText(".app");
  check("the path shows levels cleared", /2 \/ 10\s+levels cleared/.test(text));
  check("quizzes taken counts every attempt", /3\s+quizzes taken/.test(text));
  check("the drill shows the best per length", /8 \/ 10\s+best at 5 letters \(2 rounds\)/.test(text));
  check("the daily shows days played", /5\s+days played/.test(text));
  check("a perfect day is counted", /1\s+day you found the best play/.test(text));
  check("review counts what is tracked", /3\s+words tracked/.test(text));
  check("games show the record per opponent", /1 \/ 1\s+won against Gentle/.test(text));
  check("the overall win rate is shown", /50%\s+win rate overall/.test(text));
  check("the highest game score is shown", /310\s+highest game score/.test(text));
  check("the most-missed word is first", /qi/.test(text));

  const bars = await page.$$eval(".spark-bar", (n) => n.length);
  check("the daily chart drew a bar per day", bars === 5, String(bars));
  const gold = await page.$$eval(".spark-bar.is-best", (n) => n.length);
  check("the perfect day is marked on the chart", gold === 1, String(gold));

  await page.screenshot({ path: `${OUT}/s0-stats.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("no horizontal overflow at 390px", !overflow);
  check("no console errors", errors.length === 0, errors.join(" | "));

  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : "\nProgress screen verified.\n");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
