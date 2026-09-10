/* Assert each premium-square fallback hex is exactly what color-mix() produces,
   in both themes. If these ever drift the comment in app.css is a lie. */
const { chromium } = require("playwright");
const path = require("path");
const ROOT = "/home/claude/wt";
const URL = "file://" + path.join(ROOT, "index.html");

const EXPECT = {
  light: { "is-dl": "#c5d0c4", "is-tl": "#a9bdad", "is-dw": "#d3ccb0", "is-tw": "#c7b483" },
  dark:  { "is-dl": "#26332a", "is-tl": "#314b3b", "is-dw": "#423a23", "is-tw": "#6b572b" }
};

/* Chromium reports a color-mix() result as "color(srgb 0.77 0.81 0.77)" and a
   plain colour as "rgb(197, 208, 196)". Handle both. */
const hex = (s) => {
  const srgb = s.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
  const parts = srgb
    ? [srgb[1], srgb[2], srgb[3]].map((v) => Math.round(parseFloat(v) * 255))
    : s.match(/[\d.]+/g).slice(0, 3).map((v) => Math.round(parseFloat(v)));
  return "#" + parts.map((v) => v.toString(16).padStart(2, "0")).join("");
};

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let fails = 0;
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForSelector(".mode-card");
    await page.$$eval(".mode-card", (n) => n[2].click());
    await page.waitForSelector(".bgrid");
    for (const cls of Object.keys(EXPECT[scheme])) {
      const got = await page.$eval("." + cls, (n) => getComputedStyle(n).backgroundColor);
      const want = EXPECT[scheme][cls];
      const ok = hex(got) === want;
      if (!ok) fails++;
      console.log(`  ${ok ? "ok  " : "FAIL"} ${scheme} .${cls}  color-mix=${hex(got)} fallback=${want}`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `\n${fails} fallback(s) drifted from color-mix().` : "\nAll premium fallbacks are exact.");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
