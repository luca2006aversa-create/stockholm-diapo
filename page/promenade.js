/* =====================================================================================
   La promenade dans Gamla Stan, sur la carte du site : un point avance le long d'un parcours d'environ 1 km, et on voit ce qui
   est visible depuis lui à hauteur d'yeux (champ de vision / isovist : des rayons partent du point et s'arrêtent sur le premier
   mur de bâtiment). Parcours : ../donnees/promenade.json (outils/preparer_promenade.js). Bâtiments : ville.objets.
   Dépend de carte.js et themes.js (THEMES_CARTE, voile).
   ===================================================================================== */
const PROMENADE = { p: null, longueur: 0, cum: null, segs: null, grille: null, charge: false, tour: 80, rayons: 360, portee: 300 };   // tour : secondes pour un tour complet
const COTE_GRILLE = 120;                                  // unités de la carte (mètres Mercator)

function chargerPromenade() {
  if (PROMENADE.charge || !ville) return; PROMENADE.charge = true;
  fetch("../donnees/promenade.json").then((r) => r.json()).then((j) => {
    const p = j.p, cum = [0];
    for (let i = 2; i < p.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
    PROMENADE.p = p; PROMENADE.cum = cum; PROMENADE.longueur = cum[cum.length - 1]; PROMENADE.metres = j.longueur_m;
    /* les murs : les côtés des bâtiments près du parcours, rangés dans une grille pour ne tester que les voisins */
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    const m = PROMENADE.portee * 2.1 + 30, segs = [], grille = new Map();
    const anneau = (a) => {
      const b = lie(a); if (b[2] < x0 - m || b[0] > x1 + m || b[3] < y0 - m || b[1] > y1 + m) return;
      for (let i = 0, n = a.length; i < n; i += 2) {
        const j2 = (i + 2) % n, s = [a[i], a[i + 1], a[j2], a[j2 + 1]]; if (s[0] === s[2] && s[1] === s[3]) continue;
        const k = segs.push(s) - 1, gx0 = Math.floor(Math.min(s[0], s[2]) / COTE_GRILLE), gx1 = Math.floor(Math.max(s[0], s[2]) / COTE_GRILLE), gy0 = Math.floor(Math.min(s[1], s[3]) / COTE_GRILLE), gy1 = Math.floor(Math.max(s[1], s[3]) / COTE_GRILLE);
        for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) { const c = gx + "," + gy; (grille.get(c) || grille.set(c, []).get(c)).push(k); }
      }
    };
    /* les bâtiments d'aujourd'hui (debout, datés ou non) */
    for (const o of ville.objets) if ((o.g === "bati" || o.g === "monument") && o.k === "poly" && o.fin == null) for (const a of o.f) anneau(a);
    PROMENADE.segs = segs; PROMENADE.grille = grille; sale = true; planifier();
  }).catch(() => {});
}
surveillerAccesTardif(chargerPromenade, (d) => d.carte?.theme === "promenade");

/* le point et sa direction à la distance d le long du parcours */
function pointSurParcours(d) {
  const { p, cum } = PROMENADE; let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
  const t = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), ax = p[2 * i - 2], ay = p[2 * i - 1], bx = p[2 * i], by = p[2 * i + 1];
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, cap: Math.atan2(by - ay, bx - ax), i };
}
/* le champ de vision : le polygone des points visibles depuis (x, y), rayon R */
function champDeVision(x, y, R) {
  const { segs, grille } = PROMENADE, voisins = new Set(), g0x = Math.floor((x - R) / COTE_GRILLE), g1x = Math.floor((x + R) / COTE_GRILLE), g0y = Math.floor((y - R) / COTE_GRILLE), g1y = Math.floor((y + R) / COTE_GRILLE);
  for (let gx = g0x; gx <= g1x; gx++) for (let gy = g0y; gy <= g1y; gy++) { const c = grille.get(gx + "," + gy); if (c) for (const k of c) voisins.add(k); }
  const S = [...voisins].map((k) => segs[k]), n = PROMENADE.rayons, pts = new Float64Array(2 * n);
  for (let r = 0; r < n; r++) {
    const a = r / n * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a); let t = R;
    for (const [ax, ay, bx, by] of S) {
      const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
      const tt = ((ax - x) * ey - (ay - y) * ex) / den, u = ((ax - x) * dy - (ay - y) * dx) / den;
      if (tt > 0.05 && tt < t && u >= 0 && u <= 1) t = tt;
    }
    pts[2 * r] = x + dx * t; pts[2 * r + 1] = y + dy * t;
  }
  return pts;
}
const aireChamp = (pts) => { let s = 0; const n = pts.length; for (let i = 0; i < n; i += 2) { const j = (i + 2) % n; s += pts[i] * pts[j + 1] - pts[j] * pts[i + 1]; } return Math.abs(s) / 2; };

let promenadeBoucle = false;
THEMES_CARTE.promenade = {
  legende: () => [["#e4572e", "ce qu'on voit depuis le point (champ de vision)"], ["#ffffff", "le promeneur", "point"], ["#8a837a", "parcours, environ 1 km", "ligne"]],
  source: "Bâtiments : OpenStreetMap. Champ de vision calculé à chaque instant : des rayons partent de l'œil et s'arrêtent sur le premier mur (sans arbres ni relief).",
  dessiner(P) {
    chargerPromenade();
    voile(P, 0.4);
    if (!PROMENADE.p || !PROMENADE.grille) return;
    const p = PROMENADE.p;
    cx.save(); cx.lineJoin = cx.lineCap = "round";
    cx.beginPath(); trace(cx, p, false, cam); cx.setLineDash([7 * dpr, 6 * dpr]); cx.strokeStyle = "#8a837a"; cx.lineWidth = 2.6 * dpr; cx.stroke(); cx.setLineDash([]);
    const d = ((performance.now() / 1000) % PROMENADE.tour) / PROMENADE.tour * PROMENADE.longueur, q = pointSurParcours(d);
    /* la caméra suit le promeneur (la carte se déplace avec lui, de près pour voir les ruelles) */
    if (cible && !libre) { cible.cam = { x: q.x, y: q.y, span: 1000 }; if (!anime) { anime = true; tAvant = performance.now(); requestAnimationFrame(pasLisse); } }
    const R = PROMENADE.portee * 1.96, pts = champDeVision(q.x, q.y, R);
    cx.beginPath(); for (let i = 0; i < pts.length; i += 2) { const X = px(pts[i]), Y = py(pts[i + 1]); i ? cx.lineTo(X, Y) : cx.moveTo(X, Y); } cx.closePath();
    cx.fillStyle = "rgba(228,87,46,.42)"; cx.fill(); cx.strokeStyle = "#d1431c"; cx.lineWidth = 2 * dpr; cx.stroke();
    /* la partie déjà parcourue, en trait plein */
    cx.beginPath(); cx.moveTo(px(p[0]), py(p[1])); for (let i = 1; i < q.i; i++) cx.lineTo(px(p[2 * i]), py(p[2 * i + 1])); cx.lineTo(px(q.x), py(q.y)); cx.strokeStyle = "#1d1c1a"; cx.lineWidth = 3 * dpr; cx.stroke();
    /* le promeneur : un point, et un trait dans sa direction */
    const X = px(q.x), Y = py(q.y);
    cx.beginPath(); cx.moveTo(X, Y); cx.lineTo(X + Math.cos(q.cap) * 20 * dpr, Y - Math.sin(q.cap) * 20 * dpr); cx.strokeStyle = "#1d1c1a"; cx.lineWidth = 3 * dpr; cx.stroke();
    cx.beginPath(); cx.arc(X, Y, 7.5 * dpr, 0, 6.3); cx.fillStyle = "#fff"; cx.fill(); cx.strokeStyle = "#1d1c1a"; cx.lineWidth = 3 * dpr; cx.stroke();
    /* la mesure : surface vue (m² au sol) et distance parcourue */
    const k = 1 / (1.96 * 1.96), surface = Math.round(aireChamp(pts) * k / 100) * 100, dist = Math.round(d / 1.96 / 10) * 10;
    cx.font = `700 ${Math.round(15 * dpr)}px "Segoe UI", system-ui, sans-serif`; cx.textAlign = "left"; cx.textBaseline = "top";
    const txt = `Surface vue : ${surface.toLocaleString("fr-FR")} m²   ·   ${dist} m parcourus`, X0 = 24 * dpr, Y0 = 56 * dpr, w = cx.measureText(txt).width;
    cx.fillStyle = "rgba(18,20,22,.82)"; cx.fillRect(X0 - 10 * dpr, Y0 - 8 * dpr, w + 20 * dpr, 32 * dpr); cx.fillStyle = "#fff"; cx.fillText(txt, X0, Y0);
    cx.restore();
    if (!promenadeBoucle) { promenadeBoucle = true; requestAnimationFrame(() => { promenadeBoucle = false; if (themeActif === "promenade") { sale = true; planifier(); } }); }   // l'animation tourne tant que la diapo est affichée
  }
};
