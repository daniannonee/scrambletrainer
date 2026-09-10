/* Serve docs/ over http and check it is genuinely installable and offline-capable.
   Run: node tools/pwa_check.js

   file:// cannot register a service worker, so none of this is testable from
   the way the app is normally opened — which is exactly why it needs its own
   check. A real static server, a real registration, then the network is cut and
   the app must still boot. */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.dirname(__dirname);
const WWW = path.join(ROOT, "docs");
const PORT = 8123;

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".woff2": "font/woff2", ".md": "text/plain",
  ".webmanifest": "application/manifest+json", ".json": "application/json"
};

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const file = path.join(WWW, rel);
  if (!file.startsWith(WWW) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const base = `http://localhost:${PORT}/`;
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(base);
  await page.waitForSelector(".mode-card");
  check("the app boots over http", true);

  // The manifest a phone will actually read.
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    const r = await fetch(link.href);
    return r.ok ? r.json() : null;
  });
  check("the manifest is served and parses", !!manifest);
  if (manifest) {
    check("it declares standalone display", manifest.display === "standalone", manifest.display);
    check("it has a name and a start_url", !!manifest.name && !!manifest.start_url);
    check("it offers a 192 and a 512 icon",
      manifest.icons.some((i) => i.sizes === "192x192") &&
      manifest.icons.some((i) => i.sizes === "512x512"));
    check("it declares a maskable icon", manifest.icons.some((i) => i.purpose === "maskable"));
  }

  // iOS reads these, not the manifest.
  const apple = await page.evaluate(() => ({
    touchIcon: (document.querySelector('link[rel="apple-touch-icon"]') || {}).href || null,
    capable: (document.querySelector('meta[name="apple-mobile-web-app-capable"]') || {}).content,
    title: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content,
    themes: [...document.querySelectorAll('meta[name="theme-color"]')].length
  }));
  check("an apple-touch-icon is declared", !!apple.touchIcon);
  check("iOS standalone mode is requested", apple.capable === "yes", apple.capable);
  check("the home-screen name is set", apple.title === "Word trainer", apple.title);
  check("theme-colour is set for both schemes", apple.themes === 2, String(apple.themes));

  const iconOk = await page.evaluate(async (href) => {
    const r = await fetch(href);
    return r.ok && r.headers.get("content-type").includes("png");
  }, apple.touchIcon);
  check("the touch icon actually exists", iconOk);

  // The worker.
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, active: !!r.active };
  });
  check("a service worker registered and activated", reg.active, reg.scope);

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    if (!names.length) return 0;
    const c = await caches.open(names[0]);
    return (await c.keys()).length;
  });
  check("the whole app shell was cached", cached >= 40, String(cached) + " entries");

  /* The real test: cut the network entirely and reload. */
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector(".mode-card", { timeout: 15000 });
  const modesOffline = await page.$$eval(".mode-card", (n) => n.length);
  check("the app boots with the network cut", modesOffline === 6, String(modesOffline));

  // And that the heavy data is really there, not just the shell.
  const worksOffline = await page.evaluate(() => ({
    words: window.WT.lex.count(),
    daily: window.WT.daily.poolSize(),
    strategy: window.WT.strategy.poolSize()
  }));
  check("the word list is available offline", worksOffline.words > 80000, String(worksOffline.words));
  check("the daily pool is available offline", worksOffline.daily === 400, String(worksOffline.daily));
  check("the strategy pool is available offline", worksOffline.strategy === 60, String(worksOffline.strategy));

  await ctx.setOffline(false);
  check("no console errors", errors.length === 0, errors.join(" | "));

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : "\nInstallable and offline-capable.\n");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message); server.close(); process.exit(1); });
