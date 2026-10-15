/* =====================================================================================
   Le fond de carte régional (hors de la zone détaillée du site) : eau salée / douce (JRC Global Surface Water) et occupation du sol
   (ESA WorldCover), rendus dans les couleurs de ../donnees/style_carte.json. Remplace Natural Earth, trop grossier, de l'échelle de la
   région à celle de la ville. Préparé par outils/preparer_fond.py (Earth Engine). Dépend de carte.js.
   ===================================================================================== */
let fondRegion = null, styleCarte = null;
const CLASSES_SOL = { 10: "foret", 20: "foret", 30: "prairie", 40: "culture", 50: "bati", 60: "solnu", 90: "humide", 95: "humide", 100: "solnu" };

function construireFondRegion() {
  if (!ville || !styleCarte || !fondRegion?.img || !fondRegion.eau) return;
  const st = styleCarte[sombre() ? "sombre" : "clair"], { meta, img, eau } = fondRegion;
  const W = meta.largeur, H = meta.hauteur, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H), src = d.data, out = new Uint32Array(src.length >> 2), rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const pack = (r) => (255 << 24) | (r[2] << 16) | (r[1] << 8) | r[0];          // petit-boutiste : ABGR
  const lut = new Uint32Array(256), terre = pack(rgb(st.terre)), mer = pack(rgb(st.eauSalee)); lut.fill(terre);
  for (const [k, nom] of Object.entries(CLASSES_SOL)) lut[k] = pack(rgb(st[nom]));
  lut[0] = lut[80] = mer;
  for (let i = 0, n = out.length; i < n; i++) out[i] = lut[src[i << 2]];
  g.putImageData(new ImageData(new Uint8ClampedArray(out.buffer), W, H), 0, 0);
  /* l'eau : les contours JRC, salée puis douce, par-dessus (bords nets, couleurs distinctes) */
  const [x0, y0, x1, y1] = meta.limites_merc, S = W / (x1 - x0), tr = (a) => { for (let i = 0; i < a.length; i += 2) { const X = (a[i] - x0) * S, Y = (y1 - a[i + 1]) * S; i ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.closePath(); };
  g.fillStyle = st.eauSalee; g.beginPath(); for (const a of eau.salee) tr(a); g.fill("evenodd");
  g.fillStyle = st.eauDouce; g.beginPath(); for (const a of eau.douce) tr(a); g.fill("evenodd");
  /* bords fondus : le fond précis s'efface sur ~8 % de sa largeur vers la carte de dessous (plus de rectangle visible) */
  g.globalCompositeOperation = "destination-in";
  const fe = Math.round(W * 0.08), fh = Math.round(H * 0.08);
  for (const [vertical, n] of [[false, fe], [true, fh]]) {
    const L = vertical ? H : W, gr = vertical ? g.createLinearGradient(0, 0, 0, H) : g.createLinearGradient(0, 0, W, 0), t = n / L;
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(t, "rgba(0,0,0,1)"); gr.addColorStop(1 - t, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  g.globalCompositeOperation = "source-over";
  fondRegion.c = c; fondRegion.theme = sombre();
  sale = true; planifier();
}
const bougeFond = () => typeof anime !== "undefined" && anime;
/* pose le fond régional (sous la zone détaillée) */
function dessinerFondRegion(alpha = 1) {
  if (!fondRegion?.c) return false;
  if (fondRegion.theme !== sombre()) construireFondRegion();
  if (alpha <= 0.004) return true;
  const [x0, y0, x1, y1] = fondRegion.meta.limites_merc, c = fondRegion.c;
  const dx = px(x0), dy = py(y1), dw = px(x1) - dx, dh = py(y0) - dy;
  /* seule la partie à l'écran est copiée (l'image fait 14,6 M de pixels : la copier en entier à chaque image coûtait 0,5 à 1,8 s) */
  const ix0 = Math.max(dx, 0), iy0 = Math.max(dy, 0), ix1 = Math.min(dx + dw, cv.width), iy1 = Math.min(dy + dh, cv.height);
  if (ix1 <= ix0 || iy1 <= iy0) return true;
  const kx = c.width / dw, ky = c.height / dh;
  cx.save(); cx.globalAlpha = alpha; cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = bougeFond() ? "low" : "high";
  cx.drawImage(c, (ix0 - dx) * kx, (iy0 - dy) * ky, (ix1 - ix0) * kx, (iy1 - iy0) * ky, ix0, iy0, ix1 - ix0, iy1 - iy0); cx.restore();
  return true;
}
(function attendre() {
  if (!ville) return setTimeout(attendre, 200);
  const img = new Image();
  Promise.all([
    fetch("../donnees/style_carte.json").then((r) => r.json()).catch(() => null),
    fetch("../donnees/fond/sol_region.json").then((r) => r.json()).catch(() => null),
    fetch("../donnees/fond/eau_region.json").then((r) => r.json()).catch(() => null),
    new Promise((ok) => { img.onload = () => ok(img); img.onerror = () => ok(null); img.src = "../donnees/fond/sol_region.png"; })
  ]).then(([st, meta, eau, im]) => {
    if (!st || !meta || !eau || !im) return;
    styleCarte = st; fondRegion = { meta, eau, img: im };
    setTimeout(construireFondRegion, 50);
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => setTimeout(construireFondRegion, 60));
})();

/* Le fond régional recouvre tout l'écran (hors du bord fondu) : la carte des pays dessous ne se voit plus, on ne la dessine pas
   (son flou plein écran coûtait plusieurs centaines de ms par image à l'échelle de la ville). */
function regionCouvre() {
  if (!fondRegion?.c || fondRegion.theme !== sombre() || cam.span > 600000) return false;
  const [x0, y0, x1, y1] = fondRegion.meta.limites_merc, mx = (x1 - x0) * 0.09, my = (y1 - y0) * 0.09, dx = cam.span / 2, dy = dx * cv.height / cv.width;
  return cam.x - dx > x0 + mx && cam.x + dx < x1 - mx && cam.y - dy > y0 + my && cam.y + dy < y1 - my;
}
