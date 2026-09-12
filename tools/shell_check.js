/* The tab shell, the stack menu, settings, and friend codes. In a browser.
   Run: node tools/shell_check.js

   The share code is the interesting part, so it is tested the way it will
   actually be used: two independent browser profiles, each with its own
   localStorage, exchanging a string. If the code only worked because both
   sides shared memory, this would catch it. */
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
  const errors = [];

  /* --- player one -------------------------------------------------------- */
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctxA.grantPermissions(["clipboard-read", "clipboard-write"]);
  const a = await ctxA.newPage();
  a.on("pageerror", (e) => errors.push("A: " + e));
  a.on("console", (m) => m.type() === "error" && errors.push("A: " + m.text()));

  await a.goto(URL);
  await a.waitForSelector(".tabbar");

  const tabs = await a.$$eval(".tabbtn .tablabel", (n) => n.map((t) => t.textContent));
  check("three tabs along the bottom", tabs.join(",") === "Play,Friends,Profile", tabs.join(","));
  check("the bar is fixed to the bottom",
    (await a.$eval(".tabbar", (n) => getComputedStyle(n).position)) === "fixed");
  check("play is the tab you land on",
    (await a.$eval(".tabbtn", (n) => n.classList.contains("is-on"))));
  check("the mode list is on the play tab",
    (await a.$$eval(".mode-card", (n) => n.length)) === 6);
  await a.screenshot({ path: `${OUT}/sh0-play.png`, fullPage: false });

  /* The bar must survive going into a mode. */
  await a.$$eval(".mode-card", (n) => n[2].click()); // daily
  await a.waitForSelector(".bgrid");
  check("the tab bar is still there inside a mode", !!(await a.$(".tabbar")));

  /* And a mode with something to lose must ask before a tab switch. */
  await a.$$eval(".tabbtn", (n) => n[0].click());
  await a.waitForSelector(".mode-card");
  await a.$$eval(".mode-card", (n) => n[4].click()); // play a game
  await a.waitForSelector(".mode-card");
  await a.$$eval(".mode-card", (n) => n[0].click()); // Gentle
  await a.waitForSelector(".bgrid");
  let asked = false;
  a.once("dialog", (d) => { asked = true; d.dismiss(); });
  await a.$$eval(".tabbtn", (n) => n[2].click());
  await a.waitForTimeout(250);
  check("switching tabs mid-game asks first", asked);
  check("dismissing the prompt keeps you in the game", !!(await a.$(".bgrid")));
  a.once("dialog", (d) => d.accept());
  await a.$$eval(".tabbtn", (n) => n[2].click());
  await a.waitForSelector(".profile-hello");
  check("accepting it leaves the game", !(await a.$(".bgrid")));

  /* --- the stack menu ---------------------------------------------------- */
  await a.click(".stackbtn");
  await a.waitForSelector(".sheet");
  const rows = await a.$$eval(".sheet-row-label", (n) => n.map((x) => x.textContent));
  check("the menu offers settings and help",
    rows.includes("Settings") && rows.includes("How this works"), rows.join(", "));
  await a.screenshot({ path: `${OUT}/sh1-menu.png`, fullPage: false });

  await a.$$eval(".sheet-row", (n) => n[0].click()); // Settings
  await a.waitForSelector(".seg");
  check("settings shows every option group",
    (await a.$$eval(".setting-label", (n) => n.length)) >= 4);

  // Forcing a theme must actually change the page, not just store a value.
  const bgBefore = await a.$eval("body", (n) => getComputedStyle(n).backgroundColor);
  await a.$$eval(".seg-btn", (n) => n.find((b) => b.textContent === "Dark").click());
  await a.waitForTimeout(120);
  const bgAfter = await a.$eval("body", (n) => getComputedStyle(n).backgroundColor);
  check("choosing Dark repaints the page", bgBefore !== bgAfter, `${bgBefore} -> ${bgAfter}`);
  check("the choice is stored",
    (await a.evaluate(() => window.WT.profile.setting("theme"))) === "dark");
  await a.screenshot({ path: `${OUT}/sh2-settings.png`, fullPage: false });
  await a.$$eval(".seg-btn", (n) => n.find((b) => b.textContent === "System").click());
  await a.click(".sheet-done");
  await a.waitForTimeout(120);

  /* --- a name and some progress ------------------------------------------ */
  await a.evaluate(() => {
    const WT = window.WT;
    WT.levels.complete(WT.levels.all()[0], 0.93);
    WT.levels.complete(WT.levels.all()[1], 0.87);
    WT.store.recordDrill("anagram", 5, 9);
    WT.store.recordGame("gentle", { won: true, drawn: false, score: 402, against: 300 });
    WT.store.recordDaily(WT.daily.dateKey(new Date()), { score: 30, best: 40, word: "X", tier: "Strong" });
  });
  await a.$$eval(".tabbtn", (n) => n[2].click());
  await a.waitForSelector(".nameinput");
  await a.fill(".nameinput", "Dan");
  await a.click('button:text("Save")');
  await a.waitForTimeout(120);
  check("the name is saved", (await a.evaluate(() => window.WT.profile.get().name)) === "Dan");
  check("the profile greets you by it",
    (await a.textContent(".profile-hello")).trim() === "Dan");
  check("the profile carries the full stats",
    (await a.$$eval(".stat-list", (n) => n.length)) >= 3);
  await a.screenshot({ path: `${OUT}/sh3-profile.png`, fullPage: true });

  await a.$$eval(".tabbtn", (n) => n[1].click());
  await a.waitForSelector(".sharecode");
  const code = (await a.textContent(".sharecode")).trim();
  console.log("  code length    :", code.length, "chars");
  check("a code is produced", code.length > 20);
  check("the code is short enough to send in a message", code.length < 200, String(code.length));

  /* --- player two, a separate browser profile ---------------------------- */
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const b = await ctxB.newPage();
  b.on("pageerror", (e) => errors.push("B: " + e));
  b.on("console", (m) => m.type() === "error" && errors.push("B: " + m.text()));
  await b.goto(URL);
  await b.waitForSelector(".tabbar");
  await b.evaluate(() => {
    window.WT.profile.setName("Owen");
    window.WT.levels.complete(window.WT.levels.all()[0], 0.8);
  });
  await b.$$eval(".tabbtn", (n) => n[1].click());
  await b.waitForSelector(".codeinput");

  check("player two starts with nobody added",
    (await b.$$eval(".vs", (n) => n.length)) === 0);

  // A damaged code must be refused rather than half-read.
  await b.fill(".codeinput", code.slice(0, code.length - 6) + "zzzz");
  await b.click('button:text("Add")');
  await b.waitForTimeout(150);
  const badNote = (await b.textContent(".add-note")).trim();
  check("a damaged code is refused", /damaged|not look|incomplete/i.test(badNote), badNote);
  check("and nothing was added", (await b.$$eval(".vs", (n) => n.length)) === 0);

  // The real one.
  await b.fill(".codeinput", code);
  await b.click('button:text("Add")');
  await b.waitForSelector(".vs");
  const text = await b.innerText(".app");
  check("the friend is named from their code", /You and Dan/.test(text));
  check("both columns are shown", /Owen/.test(text) && /Dan/.test(text));
  check("the numbers crossed the gap intact", /Levels cleared/.test(text));
  const dansLevels = await b.evaluate(() =>
    window.WT.profile.friends().Dan.stats.levels);
  check("player one's level count arrived", dansLevels === 2, String(dansLevels));
  const leads = await b.$$eval(".vs-num.is-lead", (n) => n.length);
  check("the leader is marked on rows that differ", leads > 0, String(leads));
  await b.screenshot({ path: `${OUT}/sh4-friends.png`, fullPage: true });

  // Survives a reload — it is stored, not just rendered.
  await b.reload();
  await b.waitForSelector(".tabbar");
  await b.$$eval(".tabbtn", (n) => n[1].click());
  await b.waitForSelector(".vs");
  check("the friend survives a reload", /You and Dan/.test(await b.innerText(".app")));

  const overflowA = await a.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const overflowB = await b.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("no horizontal overflow at 390px", !overflowA && !overflowB);
  check("no console errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : "\nShell, menu, settings and friend codes verified.\n");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
