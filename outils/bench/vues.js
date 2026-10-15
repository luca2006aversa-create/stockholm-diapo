/* Prend des captures de la carte à l'arrêt, pour juger l'aspect : node vues.js <racine> <sortie> [vue:année ...]
   Exemple : node vues.js ../.. captures/apres tout:1826 centre:1790 tout:2026 */
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const racine = path.resolve(process.argv[2]), sortie = path.resolve(process.argv[3]); fs.mkdirSync(sortie, { recursive: true });
const vues = (process.argv.slice(4).length ? process.argv.slice(4) : ["tout:1826", "tout:2026", "centre:1790", "centre:2026", "gamla:1300", "region:1950"]).map((v) => { const [n, a, t] = v.split(":"); return [n, +a, t || null]; });
const TYPES = { ".json": "application/json", ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const serveur = () => new Promise((ok) => { const s = http.createServer((q, r) => { const f = path.join(racine, decodeURIComponent(q.url.split("?")[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }); s.listen(0, () => ok(s)); });
(async () => {
  const s = await serveur(), nav = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await (await nav.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: process.env.CLAIR ? "light" : "dark" })).newPage();
  page.on("pageerror", (e) => console.log("ERREUR", e.message));
  await page.goto(`http://localhost:${s.address().port}/page/index.html`);
  await page.waitForFunction(() => typeof fondGlobal !== "undefined" && fondGlobal && typeof fondRegion !== "undefined" && fondRegion?.c, null, { timeout: 120000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { chargerTopo(); }); await page.waitForFunction(() => topo.img.cote && topo.grille, null, { timeout: 60000 });
  for (const [vue, an, theme] of vues) {
    const url = await page.evaluate(async ([v, a, t]) => { themeActif = t; libre = true; cam = vueCam(v); window.an = a; an = a; fondCache = null; sale = true; rendre(); await new Promise((r) => setTimeout(r, 900)); rendre(); await new Promise((r) => setTimeout(r, 300)); return cv.toDataURL("image/png"); }, [vue, an, theme]);
    fs.writeFileSync(path.join(sortie, `${vue}-${an}${theme ? "-" + theme : ""}.png`), Buffer.from(url.split(",")[1], "base64")); console.log("ok", vue, an);
  }
  await nav.close(); s.close();
})();
