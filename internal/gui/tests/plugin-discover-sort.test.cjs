// Run with Node's test runner and Playwright on the module path; see README.md.
// Discover's cards are drawn in the reader's pick (#4325), the control beside
// the page's search field as an installed list's is (#481): the market's own
// order at first, names A→Z, or npm's downloads last week with the most
// first and what npm said nothing of behind them. The pick is the page's own,
// kept through a reload and apart from the installed list's, and it says
// nothing on the tabs that have no market in them, and the kinds the GitHub
// section picks from still narrow it in the picked order. The repositories on
// GitHub are not asked of npm: its downloads answer turns a burst of them
// away, and magpie reads a refusal as none. The API is faked here and no
// request leaves the page. English, Chinese, Traditional Chinese, Japanese and
// German, 980px and 420px.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { test } = require("node:test");
const { chromium, webkit } = require("playwright");

const assets = path.resolve(__dirname, "../assets");
const HOME = "/Users/me";

// the market's own order, which is neither A→Z nor by downloads
const listings = [
  { package: "opencode-bravo", name: "Bravo Plan", community: true, summary: { en: "b" } },
  { package: "opencode-alpha", name: "Alpha Plan", community: true, summary: { en: "a" } },
  { package: "opencode-charlie", name: "Charlie Plan", community: true, summary: { en: "c" } },
  { package: "opencode-sensetime", name: "商汤小浣熊", community: true, summary: { en: "s" } },
];
const WEEKLY = { "opencode-bravo": 5, "opencode-alpha": 1200, "opencode-charlie": 300, "opencode-sensetime": 700 };
// seven, so the section has kinds to pick from: one publishes on npm, the rest
// don't, as most of them don't
const repo = (full, kind, stars, pkg) => ({
  spec: pkg || `github:${full}`, repo: full, url: `https://github.com/${full}`, owner: full.split("/")[0],
  description: "d", stars, pushed: "2026-10-20T00:00:00Z", package: pkg, version: "1.0.0", kind,
});
const repos = [
  repo("aa/magpie-zulu", "", 7, "magpie-zulu"),
  repo("bb/magpie-yankee", "middleware", 50),
  repo("cc/magpie-xray", "", 3),
  repo("dd/magpie-whiskey", "middleware", 12),
  repo("ee/magpie-victor", "", 1),
  repo("ff/magpie-uniform", "", 0),
  repo("gg/magpie-tango", "", 30),
];
const L = {
  en: { d: "Default", pop: "Popular" },
  zh: { d: "默认", pop: "热门" },
  "zh-TW": { d: "預設", pop: "熱門" },
  ja: { d: "デフォルト", pop: "人気" },
  de: { d: "Standard", pop: "Beliebt" },
};

function server(lang, asked) {
  return async (route) => {
    const url = new URL(route.request().url());
    const json = (data) => route.fulfill({ json: data });
    if (url.pathname === "/boot.js") return route.fulfill({ contentType: "text/javascript", body: `window.bootPrefs = {lang:"${lang}",theme:"light",web:true};` });
    if (url.pathname === "/wails/runtime.js") return route.fulfill({ contentType: "text/javascript", body: "export const Window = {};" });
    if (url.pathname === "/api/state") return json({ agents: [], profiles: [], settings: { lang, theme: "light" } });
    if (url.pathname === "/api/library") return json({ dir: `${HOME}/.magpie/library`, backups: `${HOME}/.magpie/backups`, home: HOME, agents: [], instructions: { agents: [], sets: [] }, servers: [], foundServers: [], projects: [], foundSkills: [], skills: [], problems: [] });
    if (url.pathname === "/api/plugins") return json({ bun: true, bunVersion: "1.3.0", plugins: [], picker: false });
    if (url.pathname === "/api/plugins/listings") return json({ listings });
    if (url.pathname === "/api/plugins/github") return json({ repos, topic: "magpie-plugin" });
    if (url.pathname === "/api/plugins/npm") {
      const names = (url.searchParams.get("names") || "").split(",").filter(Boolean);
      const npm = {};
      for (const n of names) {
        asked.push(n);
        npm[n] = { version: "1.0.0", weekly: WEEKLY[n] || 0, publisher: "p" };
      }
      return json({ npm });
    }
    if (url.pathname === "/api/plugins/git") return json({ heads: {} });
    if (url.pathname === "/api/plugins/search") return json({ hits: [] });
    if (url.pathname === "/api/providers") return json({ providers: [], presets: [], excluded: [], gateway: { running: true, window: true }, plugins: [] });
    if (url.pathname === "/api/groups") return json({ groups: [], pools: [] });
    if (url.pathname === "/api/usage/quotas") return json([]);
    if (url.pathname.startsWith("/api/")) return json({});
    if (url.host !== "magpie.test") return route.fulfill({ status: 404, body: "" });
    const file = path.join(assets, url.pathname === "/" ? "index.html" : url.pathname);
    const contentType = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" }[path.extname(file)];
    try { await route.fulfill({ body: await fs.readFile(file), contentType }); } catch { await route.fulfill({ status: 404, body: "" }); }
  };
}

for (const engine of (process.env.BROWSER ? [process.env.BROWSER] : ["chromium", "webkit"])) {
  test(engine + ": Discover's cards, sorted as picked", async (t) => {
    assert(["chromium", "webkit"].includes(engine), "BROWSER must be chromium or webkit");
    const browser = await (engine === "webkit" ? webkit.launch() : chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "chromium" }));
    t.after(() => browser.close());
    for (const lang of ["en", "zh", "zh-TW", "ja", "de"]) {
      await t.test(lang, async () => {
        const w = L[lang];
        const asked = [];
        const ctx = await browser.newContext({ viewport: { width: 980, height: 760 }, reducedMotion: "reduce" });
        const page = await ctx.newPage();
        page.setDefaultTimeout(5000);
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.route("**/*", server(lang, asked));

        const box = page.locator('.segs.sortby[data-sort="discover"]');
        const pick = async (i) => {
          await box.locator(".opt").nth(i).click();
          await page.waitForTimeout(150);
        };
        const names = (sel) => page.locator(sel).evaluateAll((ns) => ns.map((n) => n.textContent.trim()));
        // the market's own order at first, then by name, then by downloads
        const ours = () => names("#view-plugins .pm-sec:not(.pm-ghsec) .pm-card .pm-name b");
        const gh = () => names("#view-plugins .pm-ghsec .pm-card .pm-name b");
        const open = async () => {
          await page.goto("http://magpie.test/?view=plugins");
          await page.locator("#view-plugins .pm-ghsec .pm-card").first().waitFor();
        };

        await open();
        assert.deepEqual(await box.locator(".opt").allTextContents(), [w.d, "A→Z", w.pop]);
        assert.equal(await box.locator(".opt.on").textContent(), w.d);
        assert.deepEqual(await ours(), ["Bravo Plan", "Alpha Plan", "Charlie Plan", "商汤小浣熊"]);
        assert.deepEqual(await gh(), ["magpie-zulu", "magpie-yankee", "magpie-xray", "magpie-whiskey", "magpie-victor", "magpie-uniform", "magpie-tango"]);

        await pick(1);
        // the names with Chinese in them after the letters, by pinyin, on any
        // machine: the system's own collation would put them first (#4325)
        assert.deepEqual(await ours(), ["Alpha Plan", "Bravo Plan", "Charlie Plan", "商汤小浣熊"]);
        assert.deepEqual(await gh(), ["magpie-tango", "magpie-uniform", "magpie-victor", "magpie-whiskey", "magpie-xray", "magpie-yankee", "magpie-zulu"]);

        await pick(2);
        // plugins by npm's downloads of the week, repositories by GitHub's
        // stars: each card's own kind of what's popular
        assert.deepEqual(await ours(), ["Alpha Plan", "商汤小浣熊", "Charlie Plan", "Bravo Plan"]);
        assert.deepEqual(await gh(), ["magpie-yankee", "magpie-tango", "magpie-whiskey", "magpie-zulu", "magpie-xray", "magpie-victor", "magpie-uniform"]);
        // the repositories on GitHub are not asked of npm: its downloads
        // answer turns a burst of them away, and magpie reads a refusal as
        // none at all, so a card there keeps its stars (#4325)
        assert.ok(!asked.some((n) => n.startsWith("magpie-")), "the GitHub list is not asked of npm");

        // the kinds still pick, in the picked order: both middles have nothing
        // npm said of them, so they keep the order they came in
        await page.locator("#view-plugins .pm-ghkinds .opt").nth(2).click();
        assert.deepEqual(await gh(), ["magpie-yankee", "magpie-whiskey"]);

        // the page's pick, kept through a reload, and apart from the lists'
        await open();
        assert.equal(await box.locator(".opt.on").textContent(), w.pop);
        assert.deepEqual(await ours(), ["Alpha Plan", "商汤小浣熊", "Charlie Plan", "Bravo Plan"]);

        // no market on the other tabs: nothing to sort
        await page.locator("#view-plugins .lib-tabs .opt").nth(2).click();
        assert.equal(await box.isHidden(), true);
        await page.locator("#view-plugins .lib-tabs .opt").nth(1).click();
        assert.equal(await box.isVisible(), true);

        // 420px: the control stays in the page, and the page doesn't run off it
        await page.setViewportSize({ width: 420, height: 760 });
        await page.waitForTimeout(150);
        assert.equal(await box.isVisible(), true);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(wide <= 1, "the page is " + wide + "px wider than the window");

        assert.deepEqual(errors, []);
        await ctx.close();
      });
    }
  });
}
