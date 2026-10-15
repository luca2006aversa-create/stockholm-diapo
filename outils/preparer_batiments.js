/* Fabrique page/batiments-dessins.js à partir du tableau des bâtiments dessinés (donnees/batiments_dessins.csv).
   Utilisation : node outils/preparer_batiments.js            (lit le CSV, écrit page/batiments-dessins.js)
   Colonnes (séparateur « ; », encodage UTF-8, première ligne = noms) :
     nom ; annee ; adresse ; lon ; lat ; texte ; dessin
   - annee : année de construction (le bâtiment apparaît à cette date dans l'histoire)
   - lon / lat : coordonnées WGS84 (ex. 18.0710 ; 59.3250). Si vides, la ligne est signalée « à localiser » (chercher l'adresse).
   - dessin : nom du fichier dans images/batiments/ (ex. storkyrkan.png)
   Les lignes sans année, sans coordonnées ou sans fichier de dessin existant sont ignorées et listées. */
const fs = require("fs"), path = require("path");
const racine = path.join(__dirname, ".."), csv = path.join(racine, "donnees", "batiments_dessins.csv"), sortie = path.join(racine, "page", "batiments-dessins.js");
const lignes = fs.readFileSync(csv, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
const noms = lignes.shift().split(";").map((s) => s.trim().toLowerCase());
const ok = [], ignores = [];
for (const l of lignes) {
  const v = l.split(";"), r = Object.fromEntries(noms.map((n, i) => [n, (v[i] || "").trim()]));
  const an = parseInt(r.annee, 10), lon = parseFloat(String(r.lon).replace(",", ".")), lat = parseFloat(String(r.lat).replace(",", "."));
  const fichier = path.join(racine, "images", "batiments", r.dessin || "?");
  const pb = [!r.nom && "nom", !an && "année", !(lon && lat) && "à localiser (lon/lat)", !(r.dessin && fs.existsSync(fichier)) && "dessin introuvable dans images/batiments/"].filter(Boolean);
  if (pb.length) { ignores.push(`${r.nom || "(sans nom)"} : ${pb.join(", ")}`); continue; }
  ok.push({ nom: r.nom, an, adresse: r.adresse, c: [lon, lat], texte: r.texte, dessin: "../images/batiments/" + r.dessin });
}
fs.writeFileSync(sortie, `/* GÉNÉRÉ par outils/preparer_batiments.js depuis donnees/batiments_dessins.csv : ne pas modifier à la main */\nBATIMENTS.push(...${JSON.stringify(ok, null, 1)});\n`);
console.log(`${ok.length} bâtiment(s) écrit(s) dans page/batiments-dessins.js`);
for (const m of ignores) console.log("  ignoré — " + m);
