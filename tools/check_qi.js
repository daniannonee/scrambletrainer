/* Spot-check that the supplemented words behave like any other word in the UI. */
const { chromium } = require("playwright");
const path = require("path");
const ROOT = path.dirname(__dirname);

(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));

  await p.goto("file://" + path.join(ROOT, "index.html"));
  await p.waitForSelector(".mode-card");
  console.log("home card    :", (await p.textContent(".mode-card")).replace(/\s+/g, " ").trim());
  await p.click(".mode-card");
  await p.waitForSelector(".level");
  console.log("level 1 meta :", (await p.textContent(".level.is-current .level-state")).trim());

  await p.click(".level.is-current");
  await p.waitForSelector(".word-cell");
  console.log("word cells   :", await p.$$eval(".word-cell", (n) => n.length));

  for (const w of ["qi", "za", "ok", "ki", "te"]) {
    await p.click(`.word-cell:text-is("${w}")`);
    await p.waitForSelector(".word-detail");
    const t = (await p.textContent(".word-detail")).replace(/\s+/g, " ").trim();
    console.log(`  ${w.padEnd(3)} -> ${t}`);
    await p.click(`.word-cell:text-is("${w}")`);
  }

  await p.click('.word-cell:text-is("qi")');
  await p.waitForSelector(".word-detail");
  await p.screenshot({ path: path.join(__dirname, "shots", "6-qi.png") });

  console.log("page errors  :", errs.length ? errs : "none");
  await b.close();
})();
