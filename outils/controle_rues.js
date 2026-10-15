/* Contrôle : à chaque année, combien de rues, de bâtiments, et quelle part des rues n'a aucun bâtiment à moins de 40 m ? (node controle_rues.js [croissance.json]) */
const fs = require("fs"), ville = JSON.parse(fs.readFileSync("donnees/ville.json")), C = JSON.parse(fs.readFileSync(process.argv[2] || "donnees/croissance.json"));
const K = 1 / Math.cos(59.33 * Math.PI / 180), R = 40 * K, G = R * 2;
const rues = ville.fond.rues, bati = ville.fond.bati;
const cle = (x, y) => Math.floor(x / G) + "," + Math.floor(y / G);
const grille = new Map();
bati.forEach((f, i) => { const a = f[0]; let sx = 0, sy = 0; for (let k = 0; k < a.length; k += 2) { sx += a[k]; sy += a[k + 1]; } const x = sx / (a.length / 2), y = sy / (a.length / 2); const k = cle(x, y); (grille.get(k) || grille.set(k, []).get(k)).push([x, y, C.bati[i]]); });
const voisins = (x, y) => { const out = [], gx = Math.floor(x / G), gy = Math.floor(y / G); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grille.get((gx + i) + "," + (gy + j)); if (l) out.push(...l); } return out; };
const premier = rues.map((r) => { let best = Infinity; for (const f of r.f) for (let k = 0; k < f.length; k += 2) for (const [x, y, an] of voisins(f[k], f[k + 1])) if (Math.hypot(x - f[k], y - f[k + 1]) < R && an < best) best = an; return best; });
const hist = new Set(); for (const h of Object.values(C.historiques)) for (const i of h.rues) hist.add(i);
console.log("année   rues  bâtiments  rues sans maison (hors rues datées par les sources)");
for (const Y of [1260, 1300, 1350, 1400, 1500, 1600, 1650, 1700, 1790, 1850, 1900, 1950, 2000]) {
  let n = 0, sans = 0; rues.forEach((r, i) => { if (C.rues[i] > Y) return; n++; if (!(premier[i] <= Y) && !hist.has(i)) sans++; });
  console.log(String(Y).padEnd(7), String(n).padStart(5), String(C.bati.filter((a) => a <= Y).length).padStart(9), `  ${sans} (${(100 * sans / Math.max(1, n)).toFixed(0)} %)`);
}
