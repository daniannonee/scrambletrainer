/* The strategy mode, in a browser. Run: node tools/strategy_check.js

   The claim this mode makes is that its numbers are computed, not asserted. So
   the test does not trust the shipped data either: it re-derives every puzzle's
   scores with the live board validator and the live move generator, and fails
   if the file disagrees with what the engine says right now. */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const ROOT = path.dirname(__dirname);
const OUT = path.join(__dirname, "shots");
const URL = "file://" + path.join(ROOT, "index.html");
const CARD = 5; // sixth mode

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

  /* Re-derive every puzzle from the engine, in the page. */
  const audit = await page.evaluate(() => {
    const WT = window.WT;
    const n = WT.strategy.poolSize();
    const bad = { scores: [], leaves: [], opens: [], boards: [], order: [] };
    for (let i = 0; i < n; i++) {
      const p = WT.strategy.get(i);
      if (!WT.board.audit(p.board).ok) { bad.boards.push(i); continue; }
      for (const key of ["greedy", "better"]) {
        const opt = p[key];
        const v = WT.board.validate(p.board, opt.placements);
        if (!v.ok || v.score !== opt.score) { bad.scores.push([i, key, opt.score, v.score]); continue; }
        if (!WT.board.audit(v.board).ok) { bad.boards.push(i); continue; }
        const left = WT.leave.after(p.rack, opt.placements).join("");
        if (left !== opt.leave.join("")) bad.leaves.push([i, key, left, opt.leave.join("")]);
        const reply = WT.movegen.best(v.board, p.theirRack);
        const got = reply ? reply.score : 0;
        if (got !== opt.opens) bad.opens.push([i, key, opt.opens, got]);
      }
      if (p.greedy.score <= p.better.score) bad.order.push(i);
    }
    return { n, bad };
  });

  check("the pool loaded", audit.n > 0, String(audit.n));
  check("every board in the pool passes a live audit", audit.bad.boards.length === 0,
    JSON.stringify(audit.bad.boards.slice(0, 3)));
  check("every stated score matches the live validator", audit.bad.scores.length === 0,
    JSON.stringify(audit.bad.scores.slice(0, 3)));
  check("every stated leave matches what the play actually spends", audit.bad.leaves.length === 0,
    JSON.stringify(audit.bad.leaves.slice(0, 3)));
  check("every stated reply matches the live move generator", audit.bad.opens.length === 0,
    JSON.stringify(audit.bad.opens.slice(0, 3)));
  check("the greedy play really is the higher-scoring one", audit.bad.order.length === 0,
    JSON.stringify(audit.bad.order.slice(0, 3)));

  // The screen itself.
  await page.$$eval(".mode-card", (n, i) => n[i].click(), CARD);
  await page.waitForSelector("h2");
  check("the intro explains both measures",
    /leave/i.test(await page.innerText(".app")) && /opens/i.test(await page.innerText(".app")));
  await page.screenshot({ path: `${OUT}/b0-intro.png`, fullPage: true });

  await page.click('button:text("Start")');
  await page.waitForSelector(".choice");

  const choices = await page.$$eval(".choice", (n) => n.length);
  check("two plays are offered", choices === 2, String(choices));
  check("the opponent's rack is disclosed", /They hold [A-Z_]{7}/.test(await page.innerText(".app")));
  check("nothing is revealed before answering",
    !(await page.$(".choice.is-right")) && !(await page.$(".choice-outcome h3")));

  // First tap previews on the board, second tap commits — so a mis-tap cannot
  // burn the position.
  await page.$$eval(".choice", (n) => n[0].click());
  const ghosts = await page.$$eval(".bsq.is-ghost", (n) => n.length);
  check("the first tap previews the play on the board", ghosts > 0, String(ghosts));
  check("previewing does not answer", !(await page.$(".choice-outcome h3")));
  await page.screenshot({ path: `${OUT}/b1-preview.png`, fullPage: true });

  await page.$$eval(".choice", (n) => n[0].click());
  await page.waitForSelector(".choice-outcome h3");
  const outcome = await page.innerText(".choice-outcome");
  check("the verdict names both plays and the cost",
    /scores \d+ more/.test(outcome), outcome.split("\n")[1] || "");
  check("both leaves are broken down with reasons",
    (await page.$$eval(".leave-block", (n) => n.length)) === 2);
  check("the reasons carry signed deltas",
    (await page.$$eval(".leave-delta", (n) => n.length)) > 0);
  check("the rubric is labelled as a rubric, not an engine",
    /not an engine's equity table/.test(await page.innerText(".app")));
  check("the answer was recorded",
    (await page.evaluate(() => window.WT.store.strategySeen())) === 1);
  await page.screenshot({ path: `${OUT}/b2-answered.png`, fullPage: true });

  // Next position must be a different one.
  await page.click('button:text("Next position")');
  await page.waitForSelector(".choice");
  const second = await page.textContent(".counter");
  check("the next position is a new one", second.trim() !== "#1", second.trim());

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("no horizontal overflow at 390px", !overflow);
  check("no console errors", errors.length === 0, errors.join(" | "));

  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : "\nStrategy mode verified.\n");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
