/* Banc de mesure : node bench.js [étiquette] [dpr]  → écrit résultats-<étiquette>.json
   Serveur statique intégré (racine du dépôt), Chromium via Playwright. */
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const racine = path.resolve(__dirname, "..", "..");
const etiquette = process.argv[2] || "avant", dprArg = +(process.argv[3] || 1);
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".f32": "application/octet-stream", ".css": "text/css", ".geojson": "application/json" };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(racine, p);
  if (!f.startsWith(racine) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
const stats = (a) => { if (!a.length) return {}; const s = [...a].sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: a.length, mediane: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1), sup50: a.filter((x) => x > 50).length, sup100: a.filter((x) => x > 100).length }; };
(async () => {
  await new Promise((ok) => srv.listen(0, ok));
  const url = `http://localhost:${srv.address().port}/page/index.html`;
  const nav = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dprArg });
  const page = await ctx.newPage();
  const erreurs = []; page.on("pageerror", (e) => erreurs.push(String(e))); page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
  await page.addInitScript(() => {
    window.__gl = 0;
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const m of ["drawElements", "drawArrays"]) { const o = C.prototype[m]; C.prototype[m] = function (...a) { window.__gl++; return o.apply(this, a); }; }
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => typeof ville !== "undefined" && ville && ville.objets && typeof fondGlobal !== "undefined" && fondGlobal, null, { timeout: 120000 });
  const demarrage = Date.now() - t0;
  const res = { etiquette, dpr: dprArg, demarrageMs: demarrage, erreurs };
  res.reseau = await page.evaluate(() => { const r = performance.getEntriesByType("resource"); return { requetes: r.length, octets: r.reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0) }; });
  res.memoire = await page.evaluate(() => {
    const t = []; for (const [n, c] of [["fondGlobal", typeof fondGlobal !== "undefined" && fondGlobal?.c], ["fondRegion.c", typeof fondRegion !== "undefined" && fondRegion?.c], ["fondRegion.img", typeof fondRegion !== "undefined" && fondRegion?.img], ["tampon", typeof tampon !== "undefined" && tampon], ["masque", typeof masque !== "undefined" && masque?.c], ["carte", cv]]) if (c && c.width) t.push({ n, w: c.width, h: c.height, Mo: +(c.width * c.height * 4 / 1048576).toFixed(1) });
    return { canvas: t, totalMo: +t.reduce((s, e) => s + e.Mo, 0).toFixed(1), objets: ville.objets.length };
  });
  /* coût d'une image rendre() par vue et par étape */
  res.etapes = await page.evaluate(async () => {
    const noms = ["dessinerPays", "dessinerFondRegion", "dessinerEau", "dessinerObjets", "copierToile", "masquerZone", "dessinerTheme", "dessinerTemps", "dessinerDensite", "dessinerFond", "poserFondGlobal"], cumul = {};
    for (const n of noms) if (typeof window[n] === "function") { const o = window[n]; window[n] = function (...a) { const t = performance.now(); const r = o.apply(this, a); cumul[n] = (cumul[n] || 0) + performance.now() - t; return r; }; }
    const sortie = {};
    for (const [vue, annee] of [["europe", 800], ["tout", 1950], ["centre", 1790], ["centre", 2026], ["gamla", 1500], ["norrmalm", 1968]]) {
      libre = true; cam = vueCam(vue); an = annee; for (const k in cumul) delete cumul[k];
      rendre(); await new Promise((r) => setTimeout(r, 200)); for (const k in cumul) delete cumul[k];
      const N = 6, t = performance.now(); for (let i = 0; i < N; i++) { an = annee + i * 0.01; rendre(); } const tot = (performance.now() - t) / N;
      sortie[`${vue}@${annee}`] = { rendreMs: +tot.toFixed(1), etapes: Object.fromEntries(Object.entries(cumul).map(([k, v]) => [k, +(v / N).toFixed(1)])) };
    }
    libre = false; return sortie;
  });
  /* défilement réel : durées d'image entre deux zones (id de diapo) */
  const zones = [["Europe→Suède", "titre", "nature"], ["Histoire 1250→1520", "frise", "vasa"], ["Histoire 1660→1925", "xvii", "xx-debut"], ["Cartes d'analyse", "carte-pop", "carte-trame"], ["Topo et 3D", "site-eau", "site-bassins"]];
  res.defilement = {};
  for (const [nom, de, a] of zones) {
    await page.evaluate(([de]) => { const i = DIAPOS.findIndex((d) => d.id === de); scrollTo(0, diapos[i].offsetTop); }, [de]);
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__gl = 0; });
    const r = await page.evaluate(async ([de, a]) => {
      const i0 = DIAPOS.findIndex((d) => d.id === de), i1 = DIAPOS.findIndex((d) => d.id === a), y0 = diapos[i0].offsetTop, y1 = diapos[i1].offsetTop, pas = 18;
      const dts = []; let y = y0, avant = performance.now();
      await new Promise((fini) => { const f = (t) => { dts.push(t - avant); avant = t; y += pas; scrollTo(0, y); if (y < y1 && dts.length < 900) requestAnimationFrame(f); else fini(); }; requestAnimationFrame(f); });
      return { dts, gl: window.__gl, px: y - y0 };
    }, [de, a]);
    res.defilement[nom] = { ...stats(r.dts.slice(2)), rendusWebGL: r.gl, pixels: r.px };
  }
  /* profil au démarrage : fonctions les plus lourdes (CDP) */
  res.erreurs = erreurs; fs.writeFileSync(path.join(__dirname, `resultats-${etiquette}-dpr${dprArg}.json`), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res, null, 1));
  await nav.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
