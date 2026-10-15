/* Parcours de la promenade dans Gamla Stan (diapo « Une promenade ») → donnees/promenade.json.
   Le parcours suit les rues de la carte : plus court chemin entre des points de passage (longitude, latitude), dans l'ordre.
   Modifier POINTS puis : node outils/preparer_promenade.js */
const fs = require("fs"), path = require("path");
const racine = path.join(__dirname, ".."), R = 6378137;
const POINTS = [[18.0712, 59.3268], [18.0709, 59.3250], [18.0697, 59.3236], [18.0735, 59.3240], [18.0715, 59.3262]];   // Slottsbacken → Stortorget → Järntorget → Österlånggatan → retour
const ville = JSON.parse(fs.readFileSync(path.join(racine, "donnees", "ville.json"), "utf8")), o = ville.origine;
const loc = (lon, lat) => [lon * Math.PI / 180 * R - o[0], R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) - o[1]];
const cle = (x, y) => Math.round(x / 2) + "," + Math.round(y / 2);              // nœuds fusionnés à 2 m près
const noeuds = new Map(), liste = [];
const nid = (x, y) => { const k = cle(x, y); let i = noeuds.get(k); if (i === undefined) { i = liste.length; noeuds.set(k, i); liste.push({ x, y, v: [] }); } return i; };
for (const r of ville.fond.rues) {
  if ((r.w || 1) > 3) continue;                                               // pas d'autoroute ni de grand axe
  for (const f of r.f) for (let i = 2; i < f.length; i += 2) {
    const a = nid(f[i - 2], f[i - 1]), b = nid(f[i], f[i + 1]), d = Math.hypot(f[i] - f[i - 2], f[i + 1] - f[i - 1]);
    liste[a].v.push([b, d]); liste[b].v.push([a, d]);
  }
}
const proche = (x, y) => { let m = 1e18, k = -1; liste.forEach((n, i) => { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < m) { m = d; k = i; } }); return k; };
const chemin = (s, t) => {
  const D = new Float64Array(liste.length).fill(1e18), P = new Int32Array(liste.length).fill(-1), vu = new Uint8Array(liste.length); D[s] = 0;
  for (;;) { let u = -1, m = 1e18; for (let i = 0; i < D.length; i++) if (!vu[i] && D[i] < m) { m = D[i]; u = i; } if (u < 0 || u === t) break; vu[u] = 1;
    for (const [v, d] of liste[u].v) if (D[u] + d < D[v]) { D[v] = D[u] + d; P[v] = u; } }
  const c = []; for (let u = t; u >= 0; u = P[u]) c.push(u); return c.reverse();
};
const idx = POINTS.map((p) => proche(...loc(...p))); let total = [];
for (let i = 1; i < idx.length; i++) { const c = chemin(idx[i - 1], idx[i]); total = total.concat(i > 1 ? c.slice(1) : c); }
const p = total.flatMap((i) => [+liste[i].x.toFixed(1), +liste[i].y.toFixed(1)]);
let L = 0; for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
const lat = 59.325, echelle = 1 / Math.cos(lat * Math.PI / 180);
fs.writeFileSync(path.join(racine, "donnees", "promenade.json"), JSON.stringify({ p, longueur_m: Math.round(L / echelle) }));
console.log(total.length, "points,", Math.round(L / echelle), "m au sol");
