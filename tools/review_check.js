/* Prove the review loop end to end in a real browser.
   Run: node tools/review_check.js

   The interesting property is that a word MISSED on the path comes BACK in
   review, and that clearing it empties the queue. So this deliberately answers
   a level's quiz badly, checks the home card notices, then time-travels the
   stored due dates forward and plays the review through. */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const ROOT = path.dirname(__dirname);
const OUT = path.join(__dirname, "shots");
const URL = "file://" + path.join(ROOT, "index.html");
const REVIEW_CARD = 3; // fourth mode

/* Answer every question wrong: whatever the buttons say, pick the opposite of
   the truth by asking the page whether the shown string is a word. */
async function playQuiz(page, mode) {
  let asked = 0;
  for (;;) {
    const word = await page.$eval(".quiz-word", (n) => n.textContent.trim()).catch(() => null);
    if (!word) break;
    const isWord = await page.evaluate((w) => window.WT.lex.has(w), word);
    const say = mode === "right" ? isWord : !isWord;
    await page.click(say ? 'button:text("It\'s a word")' : 'button:text("Not a word")');
    asked++;
    await afterAnswer(page, word);
    if (await page.$(".score")) break;
    if (asked > 80) throw new Error("quiz did not end");
  }
  return asked;
}


/* Advance past the verdict, the way an impatient player does.

   The quiz no longer moves on a fixed timer: a correct answer dwells in
   proportion to how much there is to read, and a missed one waits for a press.
   Sitting through every dwell would turn this suite from two minutes into ten,
   so it taps to skip — which is what a real player does and is therefore worth
   exercising anyway. Returns once the next question is up or the run ended. */
async function afterAnswer(page, prevWord) {
  // Wait for the verdict to actually appear, so the tap lands on something.
  await page.waitForFunction(() => {
    if (document.querySelector(".score")) return true;
    const v = document.querySelector(".verdict");
    return v && v.textContent.trim().length > 0;
  }, { timeout: 15000 });
  if (await page.$(".score")) return;

  const btn = await page.$(".verdict-next");
  if (btn) await btn.click();
  else await page.click(".quiz-stage").catch(() => {});

  await page.waitForFunction(
    (w) => {
      if (document.querySelector(".score")) return true;
      const n = document.querySelector(".quiz-word");
      return n && n.textContent.trim() !== w;
    },
    prevWord,
    { timeout: 15000 }
  );
}

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

  const before = await page.$$eval(".mode-card", (n, i) => n[i].innerText.replace(/\s+/g, " "), REVIEW_CARD);
  console.log("card, fresh install :", before);

  // Fail level 1 on purpose.
  await page.$$eval(".mode-card", (n) => n[0].click());
  await page.waitForSelector(".level-node, .path-node, button");
  await page.$$eval("button", (n) => {
    const b = n.find((x) => /two-letter|Level 1|The two-letter/i.test(x.innerText));
    (b || n[1]).click();
  });
  await page.waitForSelector('button:text("Start the quiz"), .quiz-word');
  if (await page.$('button:text("Start the quiz")')) {
    await page.click('button:text("Start the quiz")');
  }
  await page.waitForSelector(".quiz-word");
  const asked = await playQuiz(page, "wrong");
  await page.waitForSelector(".score");
  console.log("failed level 1       :", asked, "questions answered wrong");

  const scheduled = await page.evaluate(() => window.WT.review.stats());
  console.log("scheduled after fail :", JSON.stringify(scheduled));

  // Home should now advertise the backlog — but nothing is due until tomorrow.
  await page.click('button:text("Back to the path"), button:text("Try again")').catch(() => {});
  await page.goto(URL);
  await page.waitForSelector(".mode-card");
  const dueToday = await page.$$eval(".mode-card", (n, i) => n[i].innerText.replace(/\s+/g, " "), REVIEW_CARD);
  console.log("card, same day       :", dueToday);

  // Time-travel: pull every due date back to today, as if tomorrow arrived.
  const moved = await page.evaluate(() => {
    const all = window.WT.store.reviewAll();
    const today = window.WT.review.today();
    const patch = {};
    Object.keys(all).forEach((w) => {
      patch[w] = Object.assign({}, all[w], { due: today });
    });
    window.WT.store.reviewSetMany(patch);
    return window.WT.review.dueCount();
  });
  console.log("due after a day      :", moved);

  await page.reload();
  await page.waitForSelector(".mode-card");
  const dueTomorrow = await page.$$eval(".mode-card", (n, i) => n[i].innerText.replace(/\s+/g, " "), REVIEW_CARD);
  console.log("card, next day       :", dueTomorrow);
  await page.screenshot({ path: `${OUT}/r0-home.png`, fullPage: true });

  // Play the review perfectly.
  await page.$$eval(".mode-card", (n, i) => n[i].click(), REVIEW_CARD);
  await page.waitForSelector(".quiz-word");
  await page.screenshot({ path: `${OUT}/r1-session.png`, fullPage: true });
  const reviewed = await playQuiz(page, "right");
  await page.waitForSelector(".score");
  console.log("review answered      :", reviewed, "questions, all right");
  await page.screenshot({ path: `${OUT}/r2-result.png`, fullPage: true });

  const after = await page.evaluate(() => ({
    stats: window.WT.review.stats(),
    boxes: Object.values(window.WT.store.reviewAll()).map((r) => r.box)
  }));
  console.log("stats after review   :", JSON.stringify(after.stats));
  console.log("every box advanced   :", after.boxes.every((b) => b >= 1));

  // Nothing should be due now; the empty screen should say when to come back.
  await page.goto(URL);
  await page.waitForSelector(".mode-card");
  await page.$$eval(".mode-card", (n, i) => n[i].click(), REVIEW_CARD);
  await page.waitForSelector("h2");
  const emptyHeading = await page.textContent("h2");
  const emptyLede = await page.textContent(".lede");
  console.log("empty screen         :", emptyHeading.trim(), "|", emptyLede.trim());
  await page.screenshot({ path: `${OUT}/r3-empty.png`, fullPage: true });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log("overflow             :", overflow);
  console.log("errors               :", errors.length ? errors : "none");

  await browser.close();
  const bad = errors.length || overflow || !after.boxes.every((b) => b >= 1) || after.stats.due !== 0;
  console.log(bad ? "\nREVIEW CHECK FAILED\n" : "\nReview loop verified.\n");
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error("REVIEW CHECK FAILED:", e.message);
  process.exit(1);
});
