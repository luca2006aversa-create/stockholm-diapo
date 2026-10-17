/* Captures au format téléphone : node mobile.js <racine> <sortie> id1 id2 ... (ajouter "diapo:id" pour le diaporama) */
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const racine = path.resolve(process.argv[2]), sortie = path.resolve(process.argv[3]), ids = process.argv.slice(4); fs.mkdirSync(sortie, { recursive: true });
const T = { ".json": "application/json", ".js": "text/javascript", ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".css": "text/css" };
const s = http.createServer((q, r) => { const f = path.join(racine, decodeURIComponent(q.url.split("?")[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": T[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); });
(async () => { await new Promise((o) => s.listen(0, o)); const nav = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" }); const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("ERR", e.message));
  await page.goto(`http://localhost:${s.address().port}/page/index.html`); await page.waitForFunction(() => typeof fondGlobal !== "undefined" && fondGlobal && scenes.length, null, { timeout: 120000 }); await page.waitForTimeout(2500);
  console.log(await page.evaluate(() => JSON.stringify({ w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, cv: [cv.width, cv.height], bloc: document.getElementById("carte-bloc").getBoundingClientRect().height })));
  for (const spec of ids) {
    const diapo = spec.startsWith("diapo:"), id = diapo ? spec.slice(6) : spec;
    if (diapo) await page.evaluate((id) => { if (!enDiapo()) modeDiaporama(true); afficher(DIAPOS.findIndex((d) => d.id === id)); }, id);
    else await page.evaluate((id) => { if (enDiapo()) modeDiaporama(false); const sc = SCENES[id]; const el = document.getElementById(id); el.classList.add("vue"); window.scrollTo(0, el.offsetTop + (el.classList.contains("grand") || el.classList.contains("axo") ? innerHeight * 0.4 : 0)); }, id);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(sortie, spec.replace(":", "-") + ".png"), timeout: 120000 }); console.log("ok", spec);
  }
  await nav.close(); s.close(); })();
