/* Ajoute à donnees/croissance.json la clé « axes » : les numéros des rues (index de ville.fond.rues) qui appartiennent aux axes principaux
   (rues de donnees/rues_historiques.json marquées « axe »). Ces rues se développent entières dès leur date ; toutes les autres
   n'apparaissent qu'à côté d'un bâtiment (voir elaguerRues dans page/carte.js).   node outils/axes_croissance.js */
const fs = require("fs"), path = require("path"), racine = path.join(__dirname, "..");
const f = path.join(racine, "donnees", "croissance.json"), c = JSON.parse(fs.readFileSync(f, "utf8"));
const h = JSON.parse(fs.readFileSync(path.join(racine, "donnees", "rues_historiques.json"), "utf8")), liste = Array.isArray(h) ? h : h.rues || h.historiques;
const axes = new Set();
for (const r of liste) if (r.axe && c.historiques[r.nom]) for (const i of c.historiques[r.nom].rues) axes.add(i);
c.axes = [...axes].sort((a, b) => a - b); fs.writeFileSync(f, JSON.stringify(c));
console.log(c.axes.length, "tronçons d'axes principaux (", liste.filter((r) => r.axe).map((r) => r.nom).join(", "), ")");
