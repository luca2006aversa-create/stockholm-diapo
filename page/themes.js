/* =====================================================================================
   Les cartes d'analyse, dessinées SUR la carte (plus d'images) : en plein écran, avec un encart de texte et une légende lisible.
   Chaque diapo « carte » (DIAPOS[i].carte = { theme, vue, an: [début, fin] }) agrandit la carte à tout l'écran ;
   l'année défile avec le défilement (petite animation). Dépend de carte.js.
   Données : ../donnees/attributs_bati.json (population, type), ../donnees/analyses.json (isochrones, centralités).
   ===================================================================================== */
let themeActif = null, carteActive = null, analyses = null, minuterieRedim = 0;
const KM = 1 / Math.cos(59.33 * Math.PI / 180);          // 1 m au sol ≈ 1,96 m de carte (Mercator) à Stockholm
const attDe = (o) => o.att || ville.attParF?.get(o.f);
const debout = (o) => o.an <= an && !(o.fin != null && an > o.fin && (o.brule || o.g === "monument"));
function voile(P, a) { cx.save(); cx.globalAlpha = a; cx.fillStyle = P.terre; cx.fillRect(0, 0, cv.width, cv.height); cx.restore(); }
function batiDebout(cb) { for (const o of ville.batiListe || (ville.batiListe = ville.objets.filter((x) => (x.g === "bati" || x.g === "monument") && x.k === "poly" && x.f.length))) { if (o.an > an) break; if (debout(o)) cb(o); } }
const cacheGrilles = new Map();      // une grille par (taille, valeur) et par année : on ne recompte pas 25 000 bâtiments à chaque image
function grille(coteSol, valeur) {
  const cle = coteSol + "|" + valeur, a = Math.round(an), c = cacheGrilles.get(cle);
  if (c && c.a === a && c.src === ville.objets) return c.g;
  const g = grilleCalculee(coteSol, valeur); cacheGrilles.set(cle, { a, src: ville.objets, g }); return g;
}
function grilleCalculee(coteSol, valeur) {
  const cote = coteSol * KM, cellules = new Map();
  batiDebout((o) => { const b = lie(o.f[0]), x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2, k = Math.floor(x / cote) + "," + Math.floor(y / cote); cellules.set(k, (cellules.get(k) || 0) + valeur(o)); });
  return { cote, cellules };
}
function peindreGrille(g, couleur, alpha = 0.85) {
  const S = cv.width / cam.span, t = g.cote * S;
  cx.save(); cx.globalAlpha = alpha;
  for (const [k, v] of g.cellules) {
    const c = couleur(v); if (!c) continue;
    const [i, j] = k.split(",").map(Number), x0 = px(i * g.cote), y0 = py((j + 1) * g.cote);
    if (x0 > cv.width || y0 > cv.height || x0 + t < 0 || y0 + t < 0) continue;
    cx.fillStyle = c; cx.fillRect(x0, y0, t + 0.6, t + 0.6);
  }
  cx.restore();
}
const rampe = (bornes) => (v) => { if (v < bornes[0][0]) return null; let c = bornes[0][1]; for (const [s, col] of bornes) if (v >= s) c = col; return c; };
function traits(liste, couleur, largeur, tirets) {
  cx.save(); cx.lineJoin = cx.lineCap = "round"; cx.strokeStyle = couleur; cx.lineWidth = largeur; if (tirets) cx.setLineDash(tirets);
  cx.beginPath(); for (const o of liste) for (const a of o.f) trace(cx, a, false, cam); cx.stroke(); cx.restore();
}
const kEchelle = () => Math.max(0.6, Math.min(2.6, Math.sqrt(30000 / cam.span))) * dpr;

/* les rues et ponts datés par les sources (donnees/rues_historiques.json, rapprochés des rues d'OSM par preparer_donnees.py) */
function ruesHistoriques(P, k) {
  const H = ville.croissance?.historiques; if (!H) return;
  cx.save(); cx.lineJoin = cx.lineCap = "round"; cx.strokeStyle = "#6b0f1a"; cx.lineWidth = 2.6 * k;
  const noms = [];
  for (const [nom, h] of Object.entries(H)) {
    if (an < h.existe) continue;
    cx.beginPath(); let best = null, lg = 0;
    for (const i of h.rues) for (const a of ville.rues0[i].f) { trace(cx, a, false, cam); const b = lie(a), l = Math.hypot(b[2] - b[0], b[3] - b[1]); if (l > lg) { lg = l; best = b; } }
    cx.stroke(); if (best) noms.push([nom + " · " + h.existe, (best[0] + best[2]) / 2, (best[1] + best[3]) / 2]);
  }
  cx.textAlign = "center"; cx.textBaseline = "middle"; cx.font = `700 ${Math.round(12 * dpr)}px "Segoe UI", system-ui, sans-serif`; cx.lineWidth = 4 * dpr; cx.strokeStyle = P.terre; cx.fillStyle = "#6b0f1a";
  if (cam.span < 26000) for (const [t_, x, y] of noms) { cx.strokeText(t_, px(x), py(y)); cx.fillText(t_, px(x), py(y)); }
  cx.restore();
}
const THEMES_CARTE = {
  pop: {
    legende: () => [["#fde0c5", "5 – 25 habitants par hectare"], ["#f9a46b", "25 – 75"], ["#e8613a", "75 – 150"], ["#b8281d", "150 – 300"], ["#5e0b0b", "plus de 300 hab/ha"]],
    source: "GHS-POP 2025 (JRC) réparti par bâtiment selon la surface de plancher (SiteScope) ; carrés de 250 m",
    dessiner(P) {
      voile(P, 0.34);
      const g = grille(250, (o) => attDe(o)?.p || 0), ha = 250 * 250 / 10000;
      const f = rampe([[5 * ha, "#fde0c5"], [25 * ha, "#f9a46b"], [75 * ha, "#e8613a"], [150 * ha, "#b8281d"], [300 * ha, "#5e0b0b"]]);
      peindreGrille(g, f, 0.5);
    }
  },
  bati: {
    legende: () => [["#fbe7a1", "3 – 12 % du sol bâti"], ["#f6b25e", "12 – 25 %"], ["#e0572b", "25 – 40 %"], ["#a8251b", "40 – 60 %"], ["#5e0e0e", "plus de 60 %"]],
    source: "Emprises des bâtiments (OpenStreetMap) à l'année affichée ; carrés de 200 m",
    dessiner(P) {
      voile(P, 0.6);
      const g = grille(200, (o) => (o.aire ??= aireAnneau(o.f[0])) / KM / KM), a = 200 * 200;
      peindreGrille(g, rampe([[0.03 * a, "#fbe7a1"], [0.12 * a, "#f6b25e"], [0.25 * a, "#e0572b"], [0.4 * a, "#a8251b"], [0.6 * a, "#5e0e0e"]]), 0.88);
    }
  },
  routes: {
    legende: () => [["#c0392b", "grands axes", "ligne"], ["#e67e22", "rues principales", "ligne"], ["#e9c46a", "rues secondaires", "ligne"], ["#9e9a8e", "desserte", "ligne"], ["#1d1c1a", "ponts", "ligne"], ["#6b0f1a", "rues et ponts datés par les sources (nom, date)", "ligne"]],
    source: "OpenStreetMap ; hiérarchie des voies ; dates reconstituées (croissance le long des rues)",
    dessiner(P) {
      voile(P, 0.72);
      const k = kEchelle(), par = { 1: [], 2: [], 3: [], 4: [] }, ponts = [];
      for (const o of ville.objets) { if (o.an > an) break; if (o.k !== "ligne") continue; if (o.g === "ponts") ponts.push(o); else if (o.g === "voirie") par[Math.min(4, Math.max(1, Math.round(o.w || 1)))].push(o); }
      traits(par[1], "#9e9a8e", 0.6 * k); traits(par[2], "#e9c46a", 1.1 * k); traits(par[3], "#e67e22", 1.7 * k); traits(par[4], "#c0392b", 2.4 * k); traits(ponts, sombre() ? "#f4f1ea" : "#1d1c1a", 2.8 * k);
      ruesHistoriques(P, k);
    }
  },
  transports: {
    legende: () => [["#1a9850", "à 5 min à pied d'une station"], ["#91cf60", "à 10 min"], ["#2f6f8f", "lignes (couleur de chaque ligne)", "ligne"], ["#ffffff", "stations", "point"]],
    source: "OpenStreetMap (lignes, stations), Wikidata (dates d'ouverture) ; isochrones à pied calculées par SiteScope",
    dessiner(P) {
      voile(P, 0.66);
      if (analyses && an >= 1950) {
        cx.save();
        for (const iso of analyses.isochrones.slice().sort((a, b) => b.min - a.min)) {
          cx.globalAlpha = (iso.min <= 5 ? 0.42 : 0.3) * borne01((an - 1950) / 30); cx.fillStyle = iso.min <= 5 ? "#1a9850" : "#91cf60";
          cx.beginPath(); for (const a of iso.a) trace(cx, a, true, cam); cx.fill("evenodd");
        }
        cx.restore();
      }
      const k = kEchelle();
      for (const o of ville.objets) { if (o.an > an) break; if (o.g === "lignes" && o.k === "ligne") traits([o], o.couleur || "#2f6f8f", 2.6 * k); }
      cx.save(); cx.fillStyle = "#fff"; cx.strokeStyle = "#1d1c1a"; cx.lineWidth = 1.4 * dpr;
      for (const o of ville.objets) { if (o.an > an) break; if (o.g !== "stations" || !o.f.length) continue; cx.beginPath(); cx.arc(px(o.f[0][0]), py(o.f[0][1]), 3.4 * k, 0, 6.3); cx.fill(); cx.stroke(); }
      cx.restore();
    }
  },
  centres: {
    legende: () => (analyses?.centralite || []).slice().sort((a, b) => a.classe - b.classe).map((c) => [c.couleur, c.libelle]).concat([["#7a1408", "centre nommé (taille = intensité)", "point"]]),
    source: "SiteScope : commerces et services (Overture Maps, OSM) et stations ×10, lissés sur 300 m ; part du maximum",
    dessiner(P) {
      voile(P, 0.62);
      if (!analyses) return;
      cx.save();
      for (const c of analyses.centralite.slice().sort((a, b) => a.classe - b.classe)) { cx.globalAlpha = 0.75; cx.fillStyle = c.couleur; cx.beginPath(); for (const a of c.a) trace(cx, a, true, cam); cx.fill("evenodd"); }
      cx.globalAlpha = 1; cx.textAlign = "left"; cx.textBaseline = "middle";
      for (const c of analyses.centres) {
        const X = px(c.x), Y = py(c.y), r = (4 + c.pct / 9) * dpr;
        cx.fillStyle = "#7a1408"; cx.strokeStyle = "#fff"; cx.lineWidth = 2 * dpr; cx.beginPath(); cx.arc(X, Y, r, 0, 6.3); cx.fill(); cx.stroke();
        cx.font = `700 ${Math.round(13 * dpr)}px "Segoe UI", system-ui, sans-serif`; cx.lineWidth = 4 * dpr; cx.strokeStyle = P.terre; cx.fillStyle = P.texte;
        const t = `${c.nom} · ${c.pct} %`; cx.strokeText(t, X + r + 5 * dpr, Y); cx.fillText(t, X + r + 5 * dpr, Y);
      }
      cx.restore();
    }
  },
  types: {
    couleurs: { logement: "#e9c46a", activites: "#e76f51", equipements: "#2a9d8f", industrie: "#7b5ea7", autre: "#b8b2a7" },
    legende() { const c = this.couleurs; return [[c.logement, "logements"], [c.activites, "commerces, bureaux, hôtels"], [c.equipements, "équipements (écoles, santé, culte…)"], [c.industrie, "industrie, entrepôts"], [c.autre, "non renseigné"]]; },
    source: "OpenStreetMap (type de bâtiment), et l'occupation du sol autour quand il manque : carte indicative",
    dessiner(P) {
      voile(P, 0.7);
      const lots = {}; batiDebout((o) => { const t = attDe(o)?.t || "autre"; (lots[t] ||= []).push(o); });
      cx.save();
      for (const [t, liste] of Object.entries(lots)) { cx.fillStyle = this.couleurs[t] || this.couleurs.autre; cx.beginPath(); for (const o of liste) if (dansVue(lie(o.f[0]), cam)) for (const a of o.f) trace(cx, a, true, cam); cx.fill(); }
      cx.restore();
    }
  },
  trame: {
    legende: () => [["#2f7fbf", "eau salée (Baltique)"], ["#58a6dc", "eau douce (lac Mälaren, lacs)"], ["#3f9b4f", "parcs, forêts, espaces verts"], ["#d9d2c3", "bâti"]],
    source: "Eau : satellite JRC et lacs OpenStreetMap ; végétation : OpenStreetMap",
    dessiner(P) {
      voile(P, 0.78);
      const E = ville.eauModerne;
      cx.save();
      if (E) { cx.fillStyle = "#2f7fbf"; cx.beginPath(); for (const a of E.salee) trace(cx, a, true, cam); cx.fill("evenodd"); cx.fillStyle = "#58a6dc"; cx.beginPath(); for (const a of E.douce) trace(cx, a, true, cam); cx.fill("evenodd"); }
      cx.fillStyle = "#3f9b4f"; cx.beginPath();
      for (const v of ville.fond.vert) for (const a of v) if (dansVue(lie(a), cam)) trace(cx, a, true, cam);
      for (const o of ville.objets) if (o.g === "espaces" && o.k === "poly") for (const a of o.f) trace(cx, a, true, cam);
      cx.fill();
      cx.restore();
    }
  }
};
const aireAnneau2 = (r) => { let s = 0; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) s += (r[j] + r[i]) * (r[j + 1] - r[i + 1]); return Math.abs(s / 2); };
if (typeof aireAnneau === "undefined") window.aireAnneau = aireAnneau2;

function dessinerTheme(P) {
  if (!themeActif) return;
  const T = THEMES_CARTE[themeActif]; if (T && !T.loin) T.dessiner(P);
}

/* Entrer dans une carte : plein écran (la carte prend toute la largeur), sortir : la carte revient à gauche. */
function choisirCarte(c) {
  const theme = c ? c.theme || null : null, plein = !!c;
  if (plein === document.body.classList.contains("plein-carte") && theme === themeActif) return;
  themeActif = theme; carteActive = c;
  if (plein !== document.body.classList.contains("plein-carte")) {
    document.body.classList.toggle("plein-carte", plein);
    const t0 = performance.now(); cancelAnimationFrame(minuterieRedim);
    const suivre = () => { dimensionner(); if (performance.now() - t0 < 700) minuterieRedim = requestAnimationFrame(suivre); };
    minuterieRedim = requestAnimationFrame(suivre);
  }
  sale = true; planifier();
}

/* légendes dans les encarts */
function remplirLegendes() {
  document.querySelectorAll(".encart-legende").forEach((el) => {
    const T = THEMES_CARTE[el.dataset.theme]; if (!T) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = T.legende().map(([c, t, forme]) => `<div><i class="${forme || "surface"}" style="--c:${c}"></i><span>${t}</span></div>`).join("") + `<p class="encart-source">${T.source}</p>`;
  });
}
let analysesDemandees = false;
function chargerAnalyses() {      // 1,3 Mo : seulement à l'approche des cartes d'analyse
  if (analysesDemandees) return; analysesDemandees = true;
  fetch("../donnees/analyses.json").then((r) => r.ok ? r.json() : null).then((a) => { analyses = a; remplirLegendes(); sale = true; planifier(); }).catch(() => remplirLegendes());
}
document.addEventListener("DOMContentLoaded", remplirLegendes);      // après site.js : les thèmes de la topo sont alors connus
surveillerAccesTardif(chargerAnalyses, (d) => !!d.carte);

/* la carte change de largeur en glissant : on redessine à la bonne taille à la fin du mouvement */
document.getElementById("carte-bloc").addEventListener("transitionend", (e) => { if (e.propertyName === "width") { dimensionner(); majDefilement(true); } });
