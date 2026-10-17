/* Captures de la carte pour la présentation courte : node captures-deck.js <racine> <sortie>  (JPEG dans <sortie>) */
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const racine = path.resolve(process.argv[2]), sortie = path.resolve(process.argv[3]); fs.mkdirSync(sortie, { recursive: true });
const T = { ".json": "application/json", ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
const s = http.createServer((q, r) => { const f = path.join(racine, decodeURIComponent(q.url.split("?")[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": T[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); });
const L = [
  ["suede", "suede", 800], ["relief", "topo", 2026, "site-relief"], ["formes", "topo", 2026, "site-formes"], ["bassins", "topo", 2026, "site-bassins"],
  ["eau-1250", "tout", 1250], ["routes-anciennes", "region", 1300, "routes-anciennes"], ["hanse", "baltique", 1400, "routes-hanse"],
  ["gamla-1300", "gamla", 1300], ["centre-1667", "centre", 1667], ["centre-1850", "centre", 1850], ["centre-1905", "centre", 1905], ["tout-1960", "tout", 1960], ["tout-2026", "tout", 2026],
  ["pop", "tout", 2026, "pop"], ["routes-2026", "tout", 2026, "routes"], ["transports", "tout", 2026, "transports"], ["centres", "tout", 2026, "centres"], ["trame", "tout", 2026, "trame"],
  ["promenade", "promenade", 2026, "promenade"], ["cas-gamla", "gamla", 2026], ["cas-hammarby", "hammarby", 2026],
  ["inc-1625", "arret:inc-1625", 1625, null, "inc-1625"], ["inc-1697", "arret:inc-1697", 1697, null, "inc-1697"], ["inc-1759", "arret:inc-1759", 1759, null, "inc-1759"], ["norrmalm-1960", "arret:dem-1960", 1960, null, "dem-1960"]
];
(async () => { await new Promise((o) => s.listen(0, o)); const nav = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await (await nav.newContext({ viewport: { width: 1800, height: 1000 }, colorScheme: "light" })).newPage();
  page.on("pageerror", (e) => console.log("ERREUR", e.message));
  await page.goto(`http://localhost:${s.address().port}/page/index.html`);
  await page.waitForFunction(() => typeof fondGlobal !== "undefined" && fondGlobal && typeof fondRegion !== "undefined" && fondRegion?.c, null, { timeout: 120000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => { chargerTopo(); chargerContexte(); chargerPromenade(); }); await page.waitForFunction(() => topo.img.cote && topo.grille && routesAnciennes, null, { timeout: 90000 });
  for (const [nom, vue, an, theme, arret] of L) {
    const url = await page.evaluate(async ([v, a, t, ar]) => { if (window.__sombre === undefined) window.__sombre = 1; libre = true; themeActif = t || null; cam = vueCam(v); window.an = a; an = a; arretActif = ar ? SCENES["arret-" + ar].arret : null; fondCache = null; coucheObjets = null; sale = true; rendre(); await new Promise((r) => setTimeout(r, 1500)); rendre(); await new Promise((r) => setTimeout(r, 500)); rendre(); return cv.toDataURL("image/jpeg", 0.86); }, [vue, an, theme, arret]);
    fs.writeFileSync(path.join(sortie, nom + ".jpg"), Buffer.from(url.split(",")[1], "base64")); console.log("ok", nom);
  }
  await nav.close(); s.close(); })();
