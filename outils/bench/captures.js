/* Compare le rendu à l'arrêt de deux versions : node captures.js <racineA> <racineB> [sortie]
   Écrit les PNG et affiche, par vue, la part de pixels qui diffèrent (écart > 12 sur un canal). */
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const [A, B, sortie = path.join(__dirname, "captures")] = [path.resolve(process.argv[2]), path.resolve(process.argv[3]), process.argv[4]];
fs.mkdirSync(sortie, { recursive: true });
const serveur = (racine) => new Promise((ok) => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split("?")[0]); const f = path.join(racine, p); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": f.endsWith(".json") ? "application/json" : f.endsWith(".js") ? "text/javascript" : f.endsWith(".html") ? "text/html" : "application/octet-stream" }); fs.createReadStream(f).pipe(r); }); s.listen(0, () => ok(s)); });
const VUES = [["europe", 800], ["suede", 800], ["tout", 1950], ["tout", 2026], ["centre", 1520], ["centre", 1790], ["centre", 2026], ["gamla", 1300], ["gamla", 1500], ["norrmalm", 1968]];
async function prendre(racine, etiquette) {
  const s = await serveur(racine), nav = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await (await nav.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`http://localhost:${s.address().port}/page/index.html`);
  await page.waitForFunction(() => typeof fondGlobal !== "undefined" && fondGlobal, null, { timeout: 120000 }); await page.waitForTimeout(1500);
  const out = [];
  for (const [vue, an] of VUES) {
    out.push(await page.evaluate(async ([v, a]) => { libre = true; cam = vueCam(v); window.an = a; an = a; fondCache = null; sale = true; rendre(); await new Promise((r) => setTimeout(r, 900)); rendre(); await new Promise((r) => setTimeout(r, 300)); return cv.toDataURL("image/png"); }, [vue, an]));
  }
  await nav.close(); s.close(); return out;
}
(async () => {
  const [a, b] = [await prendre(A, "A"), await prendre(B, "B")];
  const nav = await chromium.launch(); const page = await nav.newPage();
  for (let i = 0; i < VUES.length; i++) {
    const nom = VUES[i].join("-"); fs.writeFileSync(path.join(sortie, `${nom}-A.png`), Buffer.from(a[i].split(",")[1], "base64")); fs.writeFileSync(path.join(sortie, `${nom}-B.png`), Buffer.from(b[i].split(",")[1], "base64"));
    const r = await page.evaluate(async ([x, y]) => { const ld = (u) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = u; }); const [p, q] = await Promise.all([ld(x), ld(y)]);
      const c = document.createElement("canvas"); c.width = p.width; c.height = p.height; const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(p, 0, 0); const d1 = g.getImageData(0, 0, c.width, c.height).data; g.clearRect(0, 0, c.width, c.height); g.drawImage(q, 0, 0); const d2 = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0, s = 0; for (let i = 0; i < d1.length; i += 4) { const m = Math.max(Math.abs(d1[i] - d2[i]), Math.abs(d1[i + 1] - d2[i + 1]), Math.abs(d1[i + 2] - d2[i + 2])); s += m; if (m > 12) n++; } return { pct: +(100 * n / (d1.length / 4)).toFixed(2), moy: +(s / (d1.length / 4)).toFixed(2) }; }, [a[i], b[i]]);
    console.log(nom.padEnd(18), `pixels différents : ${r.pct} %   écart moyen : ${r.moy}`);
  }
  await nav.close();
})();
