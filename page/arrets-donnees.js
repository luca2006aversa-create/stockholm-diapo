/* =====================================================================================
   Les « arrêts » de l'histoire : des diapos insérées à leur date dans la partie histoire. Le temps s'y arrête, la carte zoome sur le lieu.
   - ARRETS : incendies et grands événements (texte, date, lieu, zone surlignée = nom d'une zone de zones_evenements.json).
   - BATIMENTS : dessins d'architecture, une carte puis le dessin en grand ; GÉNÉRÉ par outils/preparer_batiments.js (ne pas éditer à la main).
   Chargé AVANT le script de la page : insererArrets(DIAPOS) est appelée juste après la liste des diapos.
   ===================================================================================== */
const RUBRIQUE_HISTOIRE = "II · Formation et histoire urbaine";
const ARRETS = [
  { id: "inc-1625", type: "incendie", an: 1625, date: "1er septembre 1625", titre: "Le grand incendie de Stadsholmen", lieu: "Sud-ouest de Stadsholmen, depuis Kåkbrinken",
    c: [18.0685, 59.3239], span: 1700, zone: "Grand incendie de 1625",
    texte: ["<p>Le feu part de Kåkbrinken et ravage le sud-ouest de l'île : les ruelles étroites et les maisons de bois partent en fumée.</p>", "<p>On reconstruit selon un plan régulier : des rues droites (Stora et Lilla Nygatan) remplacent le dédale médiéval. C'est l'une des premières « villes neuves » de Stockholm.</p>"] },
  { id: "inc-1642", type: "incendie", an: 1642, date: "1642", titre: "L'incendie du Brunkebergsåsen", lieu: "Norrmalm, sur la crête de Brunkeberg",
    c: [18.0700, 59.3335], span: 2000, approx: true,
    texte: ["<p>Un incendie ravage la crête de sable de Brunkeberg, au nord de la ville. Les autorités encouragent alors la construction en pierre.</p>", "<p>Emplacement approximatif : les sources donnent le quartier, pas le contour.</p>"] },
  { id: "inc-1697", type: "incendie", an: 1697, date: "7 mai 1697", titre: "Tre Kronor brûle", lieu: "Stadsholmen, le château royal",
    c: [18.0717, 59.3268], span: 1200, zone: "Château Tre Kronor",
    texte: ["<p>Le château Tre Kronor, tour de défense du XIIIe siècle devenue résidence des rois, est détruit par un incendie. Il en reste les fondations.</p>", "<p>Nicodemus Tessin le Jeune dessine le palais baroque qui prend sa place : l'actuel palais royal, sur les ruines.</p>"] },
  { id: "inc-1719", type: "incendie", an: 1719, date: "1719", titre: "L'incendie de Norrmalm", lieu: "Norrmalm — environ 200 maisons",
    c: [18.0640, 59.3340], span: 2300, approx: true,
    texte: ["<p>Environ deux cents maisons brûlent à Norrmalm, le faubourg nord, où le bois domine encore.</p>", "<p>Emplacement approximatif : seules les sources écrites le situent.</p>"] },
  { id: "inc-1723", type: "incendie", an: 1723, date: "1er mai 1723", titre: "L'incendie de Katarina", lieu: "Södermalm — environ 500 maisons",
    c: [18.0765, 59.3154], span: 3000, zone: "Incendie de Katarina (1723)",
    texte: ["<p>Autour de l'église Sainte-Catherine, environ cinq cents maisons de Södermalm sont détruites.</p>", "<p>La ville ne cesse de brûler : à chaque fois, la reconstruction est l'occasion de rues plus larges et de matériaux moins fragiles.</p>"] },
  { id: "inc-1751", type: "incendie", an: 1751, date: "1751", titre: "L'incendie de Klara", lieu: "Norrmalm, quartier de Klara — 221 maisons",
    c: [18.0602, 59.3325], span: 2300, zone: "Incendie de Klara (1751)",
    texte: ["<p>Le quartier de Klara brûle : 221 maisons sont détruites, et le feu gagne Södermalm.</p>", "<p>Zone approchée autour de l'église de Klara.</p>"] },
  { id: "inc-1759", type: "incendie", an: 1759, date: "19 juillet 1759", titre: "Mariabranden", lieu: "Södermalm, autour de l'église Maria Magdalena",
    c: [18.0630, 59.3183], span: 2900, zone: "Mariabranden (1759)",
    texte: ["<p>Environ trois cents maisons et vingt îlots partent en fumée ; deux mille personnes se retrouvent sans abri.</p>", "<p>Conséquence directe : on est désormais obligé de bâtir en brique et en pierre. C'est la fin de la ville de bois.</p>"] },
  { id: "dem-1960", type: "demolition", an: 1960, date: "1950 – 1970", titre: "La rénovation de Norrmalm", lieu: "Klara — Sergels torg, Hötorgscity",
    c: [18.0639, 59.3336], span: 2700, zone: "Rénovation de Norrmalm (Klara)",
    texte: ["<p>Décidée en 1945 (Norrmalmsregleringen), la rénovation rase les îlots de Klara entre les années 1950 et 1970 pour faire place à Sergels torg, Hötorgscity et au centre commercial.</p>", "<p>Les rues anciennes disparaissent d'un seul coup : c'est la plus grande table rase du centre depuis les incendies.</p>"] }
];
const BATIMENTS = [];     // rempli par batiments-dessins.js (généré, voir outils/preparer_batiments.js)

/* année de chaque diapo de la partie histoire (les mêmes que les scènes de carte.js) : sert à placer les arrêts dans l'ordre */
const ANNEES_HISTOIRE = { frise: 1250, fondateur: 1252, origines: 1300, hanse: 1400, vasa: 1520, chateau: 1600, xvii: 1660, xviii: 1790, xix: 1850, hygiene: 1885, "xx-debut": 1925, folkhemmet: 1955, norrmalm: 1968, million: 1975, aujourdhui: 2005 };

function arretsEnDiapos() {
  const liste = ARRETS.map((a) => ({
    an: a.an, ordre: 0,
    diapos: [{ id: "arret-" + a.id, arret: { ...a, nature: a.type }, rubrique: RUBRIQUE_HISTOIRE, annee: a.date, titre: a.titre, texte: [`<p class="arret-lieu">${a.lieu}</p>`, ...a.texte] }]
  }));
  BATIMENTS.forEach((b, i) => {
    const arret = { id: "bat-" + i, type: "batiment", nature: "batiment", an: b.an, c: b.c, span: b.span || 1000, nom: b.nom };
    const parts = (b.texte || "").split("</p><p>"), court = parts.length >= 3 ? parts[0] + "</p><p>" + parts[parts.length - 1] : b.texte || "";
    const carte = { id: "bat-" + i, arret, rubrique: RUBRIQUE_HISTOIRE, annee: String(b.an), titre: b.nom, texte: [`<p class="arret-lieu">${b.adresse || ""}</p>`, `<p>${b.texte || ""}</p>`, ...(b.dessin ? ["<p><i>Le dessin en grand, à la page suivante.</i></p>"] : [])] };
    liste.push({ an: b.an, ordre: 1, diapos: b.dessin ? [carte, { id: "bat-" + i + "-dessin", grand: true, fixe: true, rubrique: RUBRIQUE_HISTOIRE, titre: `${b.nom} — ${b.an}`, image: b.dessin, alt: `Dessin : ${b.nom}`, legende: court }] : [carte] });
  });
  return liste.sort((p, q) => p.an - q.an || p.ordre - q.ordre);
}
/* insère les arrêts dans la liste des diapos, à leur date, à l'intérieur de la partie histoire */
function insererArrets(diapos) {
  for (const g of arretsEnDiapos()) {
    const i0 = diapos.findIndex((d) => d.id === "frise"), i1 = diapos.findIndex((d) => d.id === "fin-histoire");
    if (i0 < 0 || i1 < 0) return;
    let pos = i0 + 1;
    for (let j = i0; j < i1; j++) {
      const d = diapos[j], a = d.arret ? d.arret.an : ANNEES_HISTOIRE[d.id];
      if (a !== undefined && a <= g.an) pos = j + 1;
      if (d.grand && d.id.endsWith("-dessin") && diapos[j - 1]?.arret && diapos[j - 1].arret.an <= g.an) pos = j + 1;
    }
    diapos.splice(pos, 0, ...g.diapos);
  }
}
