/* =====================================================================================
   Les cartes du site (partie I, après l'axonométrie) et la carte des routes anciennes, dessinées sur la carte en plein écran
   comme les cartes d'analyse (même encart, même légende). Ajoute des entrées à THEMES_CARTE (themes.js).
   Données : ../donnees/topo/ (étude Topo SiteScope de 10 km : relief FABDEM, pentes, formes, côte basse, bassins versants,
   grille d'écoulement) et ../donnees/routes_anciennes.json (tracés schématiques).
   ===================================================================================== */
Object.assign(LIEUX, {
  topo: { c: [18.136, 59.3355], span: 40000, nom: "Le site, 10 km autour du centre" },
  region: { c: [18.19, 59.45], span: 380000, nom: "Le Mälaren et la Baltique" }
});

const TOPO = "../donnees/topo/", topo = { img: {}, geo: {}, grille: null };
const chargerImage = (nom) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = TOPO + nom; });
const versLocal = ([lon, lat]) => { const [x, y] = merc(lon, lat); return [x - ville.origine[0], y - ville.origine[1]]; };
let routesAnciennes = null, limitesTopo = [17.9900701, 59.2883825, 18.1746343, 59.3826768];

/* une image de l'étude Topo, posée sur son rectangle (limites en degrés, image en Mercator) */
function poserImage(img, alpha = 1, mode = "source-over") {
  if (!img || !ville) return;
  const [w, s, e, n] = limitesTopo, [x0, y1] = versLocal([w, s]), [x1, y0] = versLocal([e, n]);
  cx.save(); cx.globalAlpha = alpha; cx.globalCompositeOperation = mode; cx.imageSmoothingEnabled = true;
  cx.drawImage(img, px(x0), py(y0), px(x1) - px(x0), py(y1) - py(y0)); cx.restore();
}
/* géométries GeoJSON → anneaux / lignes en coordonnées de la carte (une fois) */
function projeter(fc) {
  const ligne = (c) => { const r = []; for (const p of c) { const [x, y] = versLocal(p); r.push(x, y); } return r; };
  return fc.features.map((f) => {
    const g = f.geometry, a = g.type === "Polygon" ? g.coordinates.map(ligne) : g.type === "MultiPolygon" ? g.coordinates.flat().map(ligne)
      : g.type === "LineString" ? [ligne(g.coordinates)] : g.type === "MultiLineString" ? g.coordinates.map(ligne) : g.type === "Point" ? [ligne([g.coordinates])] : [];
    return { p: f.properties || {}, a };
  });
}
function eauDessus(P, couleur = "#7fb6dc") {     // l'eau d'aujourd'hui par-dessus les images du relief (le MNT la colorie comme une plaine)
  const E = ville.eauModerne; if (!E) return;
  cx.save(); cx.fillStyle = couleur; cx.beginPath(); for (const a of E.salee.concat(E.douce)) if (dansVue(lie(a), cam)) trace(cx, a, true, cam); cx.fill("evenodd"); cx.restore();
}
function cadreTopo() {     // le carré de l'étude, pour situer
  const [w, s, e, n] = limitesTopo, [x0, y1] = versLocal([w, s]), [x1, y0] = versLocal([e, n]);
  cx.save(); cx.strokeStyle = "rgba(29,28,26,.55)"; cx.setLineDash([6 * dpr, 5 * dpr]); cx.lineWidth = 1.2 * dpr;
  cx.strokeRect(px(x0), py(y0), px(x1) - px(x0), py(y1) - py(y0)); cx.restore();
}
function etiquette(t, X, Y, P, taille = 13, gras = 700) {
  cx.font = `${gras} ${Math.round(taille * dpr)}px "Segoe UI", system-ui, sans-serif`; cx.lineWidth = 4 * dpr; cx.strokeStyle = P.terre; cx.fillStyle = P.texte;
  cx.strokeText(t, X, Y); cx.fillText(t, X, Y);
}
function sommetsNommes(P) {
  const S = topo.geo.sommets; if (!S) return;
  cx.save(); cx.textAlign = "left"; cx.textBaseline = "middle";
  for (const s of S) {
    if (!s.p.nom) continue;
    const X = px(s.a[0][0]), Y = py(s.a[0][1]);
    cx.fillStyle = "#3b2a1a"; cx.beginPath(); cx.moveTo(X, Y - 6 * dpr); cx.lineTo(X + 5 * dpr, Y + 3 * dpr); cx.lineTo(X - 5 * dpr, Y + 3 * dpr); cx.fill();
    etiquette(`${s.p.nom} ${Math.round(s.p.altitude_mnt_m)} m`, X + 8 * dpr, Y, P, 11.5, 600);
  }
  cx.restore();
}

const COULEURS_BASSINS = ["#f4c27a", "#9fd3c7", "#d9a7d8", "#b8d98b", "#f2a07b", "#a9c1ee", "#e8d77a", "#c9b29b", "#9ad0a0"];

Object.assign(THEMES_CARTE, {
  "site-eau": {      // la carte de base montre déjà la mer qui se retire (modèle) puis l'eau d'aujourd'hui : on ne superpose rien, on laisse l'année défiler
    legende: () => [["#6ea8cf", "eau salée (la Baltique)"], ["#86bddb", "eau douce (le lac Mälaren, les lacs)"], ["#efe9db", "terre : elle sort de l'eau au fil des siècles"]],
    source: "Rivages anciens : modèle relief FABDEM + remontée des terres (SiteScope) ; eau d'aujourd'hui : satellite JRC (1984-2021) et lacs OpenStreetMap",
    dessiner() {}
  },
  "site-relief": {
    legende: () => [["#588c58", "–1 à 15 m"], ["#b9b46a", "15 à 30 m"], ["#d6b070", "30 à 50 m"], ["#e9dcc4", "50 à 90 m"], ["#7fb6dc", "eau"], ["#7a5a3a", "courbes tous les 10 m", "ligne"], ["#3b2a1a", "sommets nommés", "point"]],
    source: "Relief FABDEM V1-2 (sol nu estimé, maille 30 m), Hawker et al. 2022, CC BY-NC-SA 4.0 ; ombrage et courbes : étude Topo SiteScope",
    dessiner(P) {
      voile(P, 0.5);
      poserImage(topo.img.relief, 1); poserImage(topo.img.ombrage, 0.55, "multiply"); eauDessus(P);
      const C = topo.geo.courbes;
      if (C) { cx.save(); cx.strokeStyle = "rgba(90,60,30,.55)"; cx.lineWidth = 0.9 * dpr; cx.beginPath(); for (const c of C) if (c.p.p === 1) for (const a of c.a) trace(cx, a, false, cam); cx.stroke(); cx.restore(); }
      cadreTopo(); sommetsNommes(P);
    }
  },
  "site-formes": {
    legende: () => [["#2c6e9e", "fond de vallée, talweg"], ["#7fb3d5", "bas de versant"], ["#d9e8c4", "plaine, replat"], ["#c9b48a", "versant"], ["#b07d4f", "haut de versant"], ["#6b3f22", "crête, sommet"]],
    source: "Classement du relief (position dans la pente) calculé sur FABDEM 30 m : étude Topo SiteScope",
    dessiner(P) { voile(P, 0.5); poserImage(topo.img.formes, 0.95); poserImage(topo.img.ombrage, 0.4, "multiply"); eauDessus(P, "#9cc7e6"); cadreTopo(); sommetsNommes(P); }
  },
  "site-pentes": {
    legende: () => [["#f2f0e6", "plat (< 2 %) : 35 % du site"], ["#d8e6b8", "très faible (2 – 5 %) : 24 %"], ["#b5d17a", "faible (5 – 12 %) : 28 %"], ["#f2c75c", "moyenne (12 – 30 %) : 13 %"], ["#e8803a", "forte (30 – 60 %) : 1 %"], ["#c8432d", "très forte (> 60 %)"]],
    source: "Pentes calculées sur FABDEM 30 m (le sol nu : les pentes très courtes, falaises et quais, sont adoucies) : étude Topo SiteScope",
    dessiner(P) { voile(P, 0.5); poserImage(topo.img.pentes, 0.95); poserImage(topo.img.ombrage, 0.35, "multiply"); eauDessus(P); cadreTopo(); }
  },
  "site-bassins": {
    legende: () => COULEURS_BASSINS.slice(0, 5).map((c, i) => [c, i === 0 ? "un bassin versant par couleur (9 dans le carré)" : ""]).filter((l) => l[1])
      .concat([["#5b3a1e", "lignes de partage des eaux", "ligne"], ["#1f5fa8", "cours d'eau calculés (plus épais : plus d'eau)", "ligne"], ["#0b3d7a", "gouttes de pluie qui suivent la pente", "point"]]),
    source: "Écoulement calculé sur FABDEM 30 m (direction de plus grande pente, surface drainée) : étude Topo SiteScope. La vitesse des gouttes ne dit rien de la vitesse réelle de l'eau.",
    dessiner(P) {
      voile(P, 0.62);
      const B = topo.geo.bassins, L = topo.geo.partage, R = topo.geo.cours;
      cx.save();
      if (B) B.forEach((b, i) => { cx.globalAlpha = 0.55; cx.fillStyle = COULEURS_BASSINS[i % COULEURS_BASSINS.length]; cx.beginPath(); for (const a of b.a) trace(cx, a, true, cam); cx.fill("evenodd"); });
      cx.globalAlpha = 1; cx.lineJoin = cx.lineCap = "round";
      if (R) for (const r of R) { cx.strokeStyle = "#1f5fa8"; cx.lineWidth = (0.8 + 1.1 * (r.p.ordre || 1)) * dpr; cx.beginPath(); for (const a of r.a) trace(cx, a, false, cam); cx.stroke(); }
      if (L) { cx.strokeStyle = "#5b3a1e"; cx.lineWidth = 2.2 * dpr; cx.setLineDash([7 * dpr, 4 * dpr]); cx.beginPath(); for (const l of L) for (const a of l.a) trace(cx, a, false, cam); cx.stroke(); }
      cx.restore(); cadreTopo();
      lancerEcoulement();
    }
  },
  "site-cote": {
    legende: () => [["#54278f", "à moins de 1 m au-dessus de la mer"], ["#807dba", "1 à 2 m"], ["#bcbddc", "2 à 5 m"]],
    source: "Altitude au-dessus du niveau de la mer, FABDEM 30 m : étude Topo SiteScope. Indicatif : les quais et remblais récents sont mal vus à 30 m.",
    dessiner(P) {
      voile(P, 0.45);
      poserImage(topo.img.cote, 1); eauDessus(P, "#6ea8cf"); cadreTopo();
    }
  },
  "routes-anciennes": {
    loin: true,
    legende: () => [["#1f5fa8", "routes d'eau (lac et mer)", "ligne"], ["#a0461e", "routes de terre", "ligne"], ["#9a948a", "route abandonnée", "ligne"], ["#c8572a", "villes et ports (à leur date)", "point"]],
    source: "Tracés schématiques d'après les sources écrites (Wikipedia, Stockholmskällan, Riksantikvarieämbetet) ; dates approximatives. Fond : eau JRC et sol ESA WorldCover (Earth Engine).",
    dessiner(P) { dessinerRoutesAnciennes(P); }
  }
});

/* ---- la carte régionale : fond Natural Earth, routes d'eau et de terre qui s'allument à leur date */
function dessinerRoutesAnciennes(P) {
  if (!routesAnciennes || !europe) return;
  cx.save();
  cx.fillStyle = sombre() ? "#22506e" : "#a9cbe2"; cx.fillRect(0, 0, cv.width, cv.height);
  if (!dessinerFondRegion(1)) {      // repli : Natural Earth
    cx.fillStyle = sombre() ? "#2a2d30" : "#efe9db"; cx.beginPath(); for (const p of europe.pays) for (const an_ of p.proj) for (const a of an_) trace(cx, a, true, cam); cx.fill("evenodd");
    cx.fillStyle = sombre() ? "#2b6a92" : "#bcdcef"; cx.beginPath(); for (const l of europe.lacsProj) for (const a of l) trace(cx, a, true, cam); cx.fill("evenodd");
  }
  cx.lineJoin = cx.lineCap = "round";
  for (const r of routesAnciennes.routes) {
    const v = borne01((an - r.de) / 40); if (v <= 0) continue;
    const fini = r.a != null && an > r.a, mer = r.type === "mer";
    cx.globalAlpha = fini ? 0.55 : v;
    cx.strokeStyle = fini ? "#9a948a" : mer ? "#1f5fa8" : "#a0461e"; cx.lineWidth = (mer ? 3.2 : 2.6) * dpr;
    cx.setLineDash(mer ? [] : [8 * dpr, 5 * dpr]); if (fini) cx.setLineDash([3 * dpr, 4 * dpr]);
    cx.beginPath(); trace(cx, r.f, false, cam); cx.stroke();
  }
  cx.setLineDash([]); cx.textAlign = "left"; cx.textBaseline = "middle";
  for (const l of routesAnciennes.lieux) {
    const v = borne01((an - l.de) / 30); if (v <= 0) continue;
    const fini = l.a != null && an > l.a, X = px(l.x), Y = py(l.y), r = (l.fort ? 7 : 4.5) * dpr;
    cx.globalAlpha = fini ? 0.5 : v; cx.fillStyle = fini ? "#9a948a" : "#c8572a"; cx.strokeStyle = "#fff"; cx.lineWidth = 2 * dpr;
    cx.beginPath(); cx.arc(X, Y, r, 0, 6.3); cx.fill(); cx.stroke();
    etiquette(l.nom + (fini ? " (abandonnée)" : ""), X + r + 5 * dpr, Y, P, l.fort ? 16 : 13);
  }
  cx.restore();
}
function dessinerThemeLoin(P) {
  if (!themeActif || enDiapo()) return;
  const T = THEMES_CARTE[themeActif]; if (T && T.loin) T.dessiner(P);
}

/* ---- l'écoulement : des gouttes qui suivent la pente sur la grille de l'étude Topo (calque au-dessus de la carte) */
let toileEau = null, cxEau = null, gouttes = [], boucleEau = 0, camEau = null;
function lancerEcoulement() {
  if (!topo.grille || boucleEau) return;
  if (!toileEau) {
    toileEau = document.createElement("canvas"); toileEau.id = "ecoulement";
    Object.assign(toileEau.style, { position: "absolute", pointerEvents: "none", zIndex: 2 });
    cv.parentElement.appendChild(toileEau); cxEau = toileEau.getContext("2d");
  }
  const g = topo.grille;
  gouttes = Array.from({ length: 3200 }, () => ({ x: Math.random() * g.largeur, y: Math.random() * g.hauteur, vie: Math.random() * 120 }));
  const pas = () => {
    if (themeActif !== "site-bassins" || enDiapo()) { boucleEau = 0; toileEau.style.display = "none"; cxEau.clearRect(0, 0, toileEau.width, toileEau.height); return; }
    boucleEau = requestAnimationFrame(pas); imageEcoulement();
  };
  toileEau.style.display = "block"; boucleEau = requestAnimationFrame(pas);
}
function imageEcoulement() {
  const g = topo.grille;
  if (toileEau.width !== cv.width || toileEau.height !== cv.height) { toileEau.width = cv.width; toileEau.height = cv.height; }
  Object.assign(toileEau.style, { left: cv.offsetLeft + "px", top: cv.offsetTop + "px", width: cv.clientWidth + "px", height: cv.clientHeight + "px" });
  if (!camEau || !meme(camEau, cam)) { cxEau.clearRect(0, 0, toileEau.width, toileEau.height); camEau = { ...cam }; }
  const X0 = px(g.x0), Y0 = py(g.y0), sx = (px(g.x1) - X0) / g.largeur, sy = (py(g.y1) - Y0) / g.hauteur;
  cxEau.globalCompositeOperation = "destination-in"; cxEau.fillStyle = "rgba(0,0,0,0.92)"; cxEau.fillRect(0, 0, toileEau.width, toileEau.height);
  cxEau.globalCompositeOperation = "source-over"; cxEau.lineWidth = 1.9 * dpr; cxEau.strokeStyle = "rgba(11,61,122,0.9)"; cxEau.beginPath();
  for (let k = 0; k < gouttes.length; k++) {
    const d = gouttes[k], i = d.y | 0, j = d.x | 0;
    if (i < 0 || j < 0 || i >= g.hauteur || j >= g.largeur || d.vie <= 0) { gouttes[k] = { x: Math.random() * g.largeur, y: Math.random() * g.hauteur, vie: 120 }; continue; }
    const q = (i * g.largeur + j) * 2, u = g.flux[q] / 127, v = g.flux[q + 1] / 127;
    if (u === 0 && v === 0) { d.vie = 0; continue; }
    const f = 0.35 * (0.6 + 1.6 * g.acc[i * g.largeur + j] / 255), nx = d.x + u * f, ny = d.y - v * f;
    cxEau.moveTo(X0 + d.x * sx, Y0 + d.y * sy); cxEau.lineTo(X0 + nx * sx, Y0 + ny * sy);
    d.x = nx; d.y = ny; d.vie -= 1;
  }
  cxEau.stroke();
}

/* ---- chargement (après ville.json : il faut l'origine de la carte) */
(function attendre() {
  if (!ville) return setTimeout(attendre, 200);
  const geo = (f) => fetch(TOPO + f).then((r) => r.ok ? r.json() : null).catch(() => null);
  Promise.all([chargerImage("relief_mnt.png"), chargerImage("ombrage.png"), chargerImage("pentes.png"), chargerImage("formes_relief.png"), chargerImage("cote_basse.png"),
    geo("bassins_versants.geojson"), geo("lignes_partage_eaux.geojson"), geo("cours_eau_calcules.geojson"), geo("courbes_niveau.geojson"), geo("sommets.geojson"),
    fetch(TOPO + "grille.json").then((r) => r.json()).catch(() => null),
    fetch(TOPO + "grille_flux.i8").then((r) => r.arrayBuffer()).catch(() => null), fetch(TOPO + "grille_acc.u8").then((r) => r.arrayBuffer()).catch(() => null),
    fetch("../donnees/routes_anciennes.json").then((r) => r.json()).catch(() => null)
  ]).then(([relief, ombrage, pentes, formes, cote, bassins, partage, cours, courbes, sommets, gm, flux, acc, ra]) => {
    Object.assign(topo.img, { relief, ombrage, pentes, formes, cote });
    for (const [k, v] of Object.entries({ bassins, partage, cours, courbes, sommets })) if (v) topo.geo[k] = projeter(v);
    if (gm && flux && acc) {
      limitesTopo = gm.limites;
      const [x0, y1] = versLocal([gm.limites[0], gm.limites[1]]), [x1, y0] = versLocal([gm.limites[2], gm.limites[3]]);
      topo.grille = { ...gm, flux: new Int8Array(flux), acc: new Uint8Array(acc), x0, y0, x1, y1 };
    }
    if (ra) {
      routesAnciennes = ra;
      for (const r of ra.routes) r.f = r.p.flatMap(versLocal);
      for (const l of ra.lieux) [l.x, l.y] = versLocal(l.p);
    }
    remplirLegendes(); sale = true; planifier();
  });
})();

/* ---- sur la carte de l'histoire : routes maritimes en pointillé bleu clair, ports qui apparaissent à leur date */
function dessinerMer(P) {
  if (!routesAnciennes || themeActif || edition || cam.span < 3500 || cam.span > 500000) return;
  const fondu = 1 - borne01((cam.span - 300000) / 200000), pas = [2.2 * dpr, 6 * dpr];
  cx.save(); cx.lineJoin = cx.lineCap = "round"; cx.setLineDash(pas); cx.lineWidth = 2.1 * dpr * Math.min(1.6, Math.max(0.8, Math.sqrt(40000 / cam.span)));
  for (const r of routesAnciennes.routes) {
    if (r.type !== "mer") continue;
    const v = borne01((an - r.de) / 40) * fondu; if (v <= 0.01) continue;
    const fini = r.a != null && an > r.a;
    cx.globalAlpha = (fini ? 0.35 : 0.9) * v; cx.strokeStyle = sombre() ? "#8fc6ee" : "#5aa7dc";
    cx.beginPath(); trace(cx, r.f, false, cam); cx.stroke();
  }
  cx.setLineDash([]); cx.textBaseline = "middle"; cx.textAlign = "left";
  const police = Math.round(12.5 * dpr);
  for (const l of routesAnciennes.lieux) {
    if (!l.port) continue;
    if (l.petit && cam.span > 40000) continue;
    const v = borne01((an - l.de) / 25) * (l.petit ? 1 : fondu); if (v <= 0.01) continue;
    const fini = l.a != null && an > l.a, X = px(l.x), Y = py(l.y), r = (l.petit ? 3.4 : l.fort ? 6 : 4.4) * dpr;
    cx.globalAlpha = (fini ? 0.4 : 1) * v; cx.fillStyle = "#fff"; cx.strokeStyle = fini ? "#8a8a80" : "#1f6fb0"; cx.lineWidth = 2 * dpr;
    cx.beginPath(); cx.arc(X, Y, r, 0, 6.3); cx.fill(); cx.stroke();
    if (cam.span < (l.petit ? 25000 : 260000)) {
      cx.font = `600 ${police}px "Segoe UI", system-ui, sans-serif`; cx.lineWidth = 4 * dpr; cx.strokeStyle = P.terre; cx.fillStyle = P.texte; const t = l.nom + (fini ? " (abandonné)" : "");
      cx.strokeText(t, X + r + 5 * dpr, Y); cx.fillText(t, X + r + 5 * dpr, Y);
    }
  }
  cx.restore();
}
