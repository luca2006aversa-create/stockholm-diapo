/* Capture de la page en défilement, à une diapo donnée : node vue-page.js <racine> <sortie.png> <id-diapo> [attente-ms] */
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const [racine, sortie, id, attente = 5000] = [path.resolve(process.argv[2]), process.argv[3], process.argv[4], +(process.argv[5] || 5000)];
const T = { ".json": "application/json", ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const s = http.createServer((q, r) => { const f = path.join(racine, decodeURIComponent(q.url.split("?")[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": T[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise((o) => s.listen(0, o));
  const nav = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await (await nav.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" })).newPage();
  page.on("pageerror", (e) => console.log("ERREUR", e.message));
  await page.goto(`http://localhost:${s.address().port}/page/index.html`);
  await page.waitForFunction(() => typeof fondGlobal !== "undefined" && fondGlobal && typeof fondRegion !== "undefined" && fondRegion?.c, null, { timeout: 120000 }); await page.waitForTimeout(2000);
  await page.evaluate(() => { majDefilement = function () {}; pasLisse = function () { anime = false; }; });
  await page.evaluate((id) => { const el = document.getElementById(id); const g = el.classList.contains("grand"); scrollTo(0, g ? el.offsetTop + innerHeight * 0.45 : el.offsetTop + el.offsetHeight / 2 - innerHeight / 2); }, id);
  await page.waitForTimeout(1500); await page.evaluate(() => { for (const q of scenes) q._y = undefined; const c = sceneDefilement(); libre = true; window.cibleVue = c; anime = false; an = c.an; cam = { ...c.cam }; arretActif = c.arret; fondCache = null; sale = true; rendre(); }); await page.waitForTimeout(attente); console.log(JSON.stringify(await page.evaluate(() => ({ cam, an, arret: arretActif && arretActif.id, sale, anime, lieu: elLieu.textContent, sy: scrollY, H: document.documentElement.scrollHeight })))); await page.screenshot({ path: sortie }); console.log("ok", id);
  await nav.close(); s.close();
})();
