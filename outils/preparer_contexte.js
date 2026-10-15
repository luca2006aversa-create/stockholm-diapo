/* Bâtiments autour des bâtiments dessinés (même hors de la zone de la carte de base) → donnees/batiments_contexte.json.
   Source : OpenStreetMap, requête Overpass (way["building"](around:520,lat,lon)) pour chaque ligne de donnees/batiments_dessins.csv,
   sauvegardée dans un fichier brut passé en argument :   node outils/preparer_contexte.js <brut-overpass.json>
   Colonne « osm » du CSV : numéros de bâtiments OSM à mettre en valeur, séparés par « + » ;  « rayon:70 » = tous ceux à moins de 70 m ;
   « niveaux:15 » = tous ceux de 15 étages ou plus à moins de 260 m. Sans colonne : le plus proche du point. */
const fs = require("fs"), path = require("path");
const racine = path.join(__dirname, ".."), R = 6378137;
const brut = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).elements.filter((e) => e.geometry && e.geometry.length > 3);
const ville = JSON.parse(fs.readFileSync(path.join(racine, "donnees", "ville.json"), "utf8")), o = ville.origine;
const loc = (lon, lat) => [lon * Math.PI / 180 * R - o[0], R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) - o[1]];
const lignes = fs.readFileSync(path.join(racine, "donnees", "batiments_dessins.csv"), "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
const noms = lignes.shift().split(";").map((s) => s.trim().toLowerCase()), sortie = {};
for (const l of lignes) {
  const v = l.split(";"), r = Object.fromEntries(noms.map((n, i) => [n, (v[i] || "").trim()])), lon = parseFloat(r.lon), lat = parseFloat(r.lat);
  if (!r.nom || !lon || !lat) continue;
  const [cx, cy] = loc(lon, lat), echelle = 1 / Math.cos(lat * Math.PI / 180);       // mètres Mercator → mètres au sol
  const liste = [];
  for (const e of brut) {
    const pts = e.geometry.map((p) => loc(p.lon, p.lat)), mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const d = Math.hypot(mx - cx, my - cy) / echelle;
    if (d < 520) liste.push({ id: e.id, d, niv: parseInt(e.tags?.["building:levels"] || "0", 10), pts });
  }
  let cibles = [];
  const m = r.osm || "";
  if (m.startsWith("rayon:")) cibles = liste.filter((b) => b.d < +m.slice(6)).map((b) => b.id);
  else if (m.startsWith("niveaux:")) cibles = liste.filter((b) => b.d < 260 && b.niv >= +m.slice(8)).map((b) => b.id);
  else if (m) cibles = m.split("+").map(Number);
  if (!cibles.some((id) => liste.some((b) => b.id === id)) && liste.length) cibles = [liste.slice().sort((a, b) => a.d - b.d)[0].id];       // introuvable : le plus proche
  sortie[r.nom] = { c: [+cx.toFixed(1), +cy.toFixed(1)], b: liste.map((b) => ({ a: b.pts.slice(0, -1).flatMap((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]), t: cibles.includes(b.id) ? 1 : 0 })) };
  console.log(r.nom, liste.length, "bâtiments,", sortie[r.nom].b.filter((b) => b.t).length, "mis en valeur");
}
fs.writeFileSync(path.join(racine, "donnees", "batiments_contexte.json"), JSON.stringify(sortie));
console.log("écrit :", (fs.statSync(path.join(racine, "donnees", "batiments_contexte.json")).size / 1024) | 0, "Ko");
