/* =====================================================================================
   Les arrêts de l'histoire (voir arrets-donnees.js) : une scène de carte par arrêt, et la zone ou le lieu surligné quand on y est.
   Dépend de carte.js (SCENES, LIEUX, cam, cx, px, py, merc, ville, an).
   ===================================================================================== */
for (const d of DIAPOS) {
  if (!d.arret) continue;
  const a = d.arret, vue = "arret:" + a.id;
  LIEUX[vue] = { c: a.c, span: a.span, nom: a.nom || a.titre };
  SCENES[d.id] = { an: a.an, vue, arret: a };
}
const COULEUR_ARRET = { incendie: "224,48,28", demolition: "150,70,40", batiment: "232,150,30" };
const versLocalArret = ([lo, la]) => { const [x, y] = merc(lo, la); return [x - ville.origine[0], y - ville.origine[1]]; };

function dessinerArret(P) {
  const A = arretActif; if (!A || !ville || cam.span > 9000) return;
  const [cx0, cy0] = versLocalArret(A.c), proche = Math.hypot(cx0 - cam.x, cy0 - cam.y) / cam.span;
  const al = borne01(1.5 - Math.abs(Math.log(cam.span / A.span))) * borne01(1 - proche / 0.9);
  if (al < 0.02) return;
  const col = COULEUR_ARRET[A.nature] || COULEUR_ARRET.incendie;
  cx.save(); cx.globalAlpha = al; cx.lineJoin = "round";
  const z = A.zone && (ville.zonesEv || []).find((q) => q.nom === A.zone);
  if (z) {
    const f = []; for (const p of z.zone) f.push(...versLocalArret(p));
    cx.beginPath(); trace(cx, f, true, cam);
    cx.fillStyle = `rgba(${col},.30)`; cx.fill(); cx.strokeStyle = `rgba(${col},.95)`; cx.lineWidth = 3 * dpr; cx.stroke();
  } else {                                      // pas de contour connu : un anneau tireté autour du lieu
    const r = cv.width / cam.span * A.span * (A.nature === "batiment" ? 0.12 : 0.22), X = px(cx0), Y = py(cy0);
    cx.beginPath(); cx.arc(X, Y, r, 0, 6.3); cx.fillStyle = `rgba(${col},.16)`; cx.fill();
    cx.setLineDash(A.nature === "batiment" ? [] : [10 * dpr, 7 * dpr]); cx.strokeStyle = `rgba(${col},.95)`; cx.lineWidth = 3 * dpr; cx.stroke();
    if (A.nature === "batiment") { cx.beginPath(); cx.arc(X, Y, 6 * dpr, 0, 6.3); cx.fillStyle = `rgb(${col})`; cx.fill(); cx.strokeStyle = "#fff"; cx.lineWidth = 2 * dpr; cx.stroke(); }
  }
  cx.restore();
}
