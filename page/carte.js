/* =====================================================================================
   La carte qui se développe au fil du défilement (mode défilement).
   Dépend de index.html : DIAPOS, diapos, enDiapo(), modeDiaporama().
   Données : ../donnees/ville.json (SiteScope, onglet Animation), ../donnees/europe.json (Natural Earth 50 m, domaine public),
   ../donnees/quartiers.json (zones et bâtiments dessinés ici, à la main).
   Coordonnées de la ville en mètres Mercator autour d'une origine, y vers le haut.
   ===================================================================================== */
const M = 20037508.342789244 / 180;
const merc = (lon, lat) => [lon * M, Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * M];
const demerc = (x, y) => [x / M, (2 * Math.atan(Math.exp(y / M * Math.PI / 180)) - Math.PI / 2) * 180 / Math.PI];
const LIEUX = {   /* vues : centre (lon, lat) et largeur montrée en mètres */
  europe: { c: [14, 58.5], span: 6200000, nom: "Europe" },
  suede: { c: [16.5, 62.3], span: 3300000, nom: "Suède" },
  tout: { c: null, span: 23000, nom: "Grand Stockholm" },
  centre: { c: [18.0700, 59.3290], span: 7600, nom: "Le centre" },
  gamla: { c: [18.0710, 59.3250], span: 3000, nom: "Gamla Stan · Stadsholmen" },
  norrmalm: { c: [18.0650, 59.3330], span: 3700, nom: "Norrmalm" },
  hammarby: { c: [18.1050, 59.3040], span: 4900, nom: "Hammarby Sjöstad" },
  promenade: { c: [18.0716, 59.3250], span: 2300, nom: "Gamla Stan · promenade" },
  baltique: { c: [19.2, 57.7], span: 3500000, nom: "La Baltique et la Hanse" }
};
/* Pour chaque diapo : l'année montrée, la vue, et le thème (ce qui est mis en avant). */
const SCENES = {
  titre: { an: 800, vue: "europe" }, situation: { an: 800, vue: "suede" }, nature: { an: 1100, vue: "tout", th: "eau" },
  frise: { an: 1250, vue: "gamla" }, fondateur: { an: 1252, vue: "gamla" }, origines: { an: 1300, vue: "gamla" },
  chateau: { an: 1600, vue: "gamla" }, hanse: { an: 1400, vue: "gamla" }, hygiene: { an: 1885, vue: "centre" },
  vasa: { an: 1520, vue: "gamla" }, xvii: { an: 1660, vue: "centre" }, xviii: { an: 1790, vue: "centre" }, xix: { an: 1850, vue: "centre" },
  "xx-debut": { an: 1925, vue: "centre" }, folkhemmet: { an: 1955, vue: "tout", th: "transports" },
  transports: { an: 2026, vue: "tout", th: "transports" }, norrmalm: { an: 1968, vue: "norrmalm" }, million: { an: 1975, vue: "tout" },
  aujourdhui: { an: 2005, vue: "hammarby" }, limites: { an: 2026, vue: "tout" }, animation: { an: 2026, vue: "tout" }
};
const GROUPES = {   /* [couleur ancienne, couleur neuve] */
  bati: ["#8a6a58", "#e0572b"], voirie: ["#8a8372", "#c8572a"], ponts: ["#3a3631", "#e0572b"], lignes: ["#2f6f8f", "#e0572b"],
  stations: ["#2f6f8f", "#e0572b"], espaces: ["#6c9a5b", "#8fc06f"], culte: ["#a0522d", "#e0572b"], eau: ["#2f6f8f", "#4aa3cf"], ajouts: ["#c0392b", "#e0572b"],
  monument: ["#7a3f7a", "#d1357a"]
};
const GROUPES_SOMBRE = { bati: ["#b99a86", "#ff7a4a"], voirie: ["#a29b88", "#ff7a4a"], ponts: ["#d8d2c6", "#ff7a4a"], lignes: ["#6fb0d0", "#ff7a4a"],
  stations: ["#6fb0d0", "#ff7a4a"], espaces: ["#7fae6a", "#a8d68a"], culte: ["#d08a5e", "#ff7a4a"], eau: ["#5fa9cc", "#7cc4e8"], ajouts: ["#e07060", "#ff7a4a"],
  monument: ["#c58ac5", "#ff5fa8"] };
const THEMES_VISIBLES = { eau: ["eau", "ponts"], transports: ["lignes", "stations", "ponts"] };
const ANNEE_MIN = 800, ANNEE_MAX = 2026;

const cv = document.getElementById("carte"), cx = cv.getContext("2d");
const elAn = document.getElementById("an-affiche"), elLieu = document.getElementById("an-lieu"), elCurseur = document.getElementById("an-curseur");
const elLecture = document.getElementById("an-lecture"), elNote = document.getElementById("an-note");
let ville = null, europe = null, fondCache = null, sale = true, an = ANNEE_MIN, cam = { x: 0, y: 0, span: 6200000 }, libre = false, lecture = false, dpr = 1;
let dprMax = 2, lentes = 0;       // résolution maximale : baisse d'un cran si les images sont trop longues à dessiner (tablette, vieux portable)
let quartiers = { zones: [], batiments: [], dates: [], tout: null }, edition = false;
const mqSombre = matchMedia("(prefers-color-scheme: dark)"), sombre = () => mqSombre.matches;     // l'objet est créé une fois
const lisse = (t) => t * t * (3 - 2 * t);
const borne01 = (t) => Math.max(0, Math.min(1, t));
const bornes = (f) => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (let i = 0; i < f.length; i += 2) { if (f[i] < a) a = f[i]; if (f[i] > c) c = f[i]; if (f[i + 1] < b) b = f[i + 1]; if (f[i + 1] > d) d = f[i + 1]; } return [a, b, c, d]; };
const lie = (a) => (a.bb ||= bornes(a));

/* ---- lissage des contours : la mer d'autrefois sort d'une grille de pixels (marches d'escalier) ---- */
function lisserAnneau(a, moyennes = 3, coupes = 2) {
  let p = Array.from(a); const n = p.length / 2;
  if (n < 5) return p;
  for (let r = 0; r < moyennes; r++) {                 // moyenne mobile sur 5 sommets (anneau fermé)
    const q = new Array(p.length), m = p.length / 2;
    for (let i = 0; i < m; i++) {
      let sx = 0, sy = 0;
      for (let d = -2; d <= 2; d++) { const j = (i + d + m) % m; sx += p[2 * j]; sy += p[2 * j + 1]; }
      q[2 * i] = sx / 5; q[2 * i + 1] = sy / 5;
    }
    p = q;
  }
  for (let r = 0; r < coupes; r++) {                   // Chaikin : coins coupés
    const m = p.length / 2, q = [];
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m, x0 = p[2 * i], y0 = p[2 * i + 1], x1 = p[2 * j], y1 = p[2 * j + 1];
      q.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1, 0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
    }
    p = q;
  }
  return p;
}

/* la plus grande largeur qui tient encore DANS le rectangle des données (la zone) à la forme de l'écran : plus de bords de carré visibles */
let zoneTaille = null;
function spanDansZone() {
  if (!zoneTaille) { let b = [1e12, 1e12, -1e12, -1e12]; for (const a of ville.zone) { const z = lie(a); b = [Math.min(b[0], z[0]), Math.min(b[1], z[1]), Math.max(b[2], z[2]), Math.max(b[3], z[3])]; } zoneTaille = [b[2] - b[0], b[3] - b[1]]; }
  const forme = cv.height / Math.max(1, cv.width);
  return 0.94 * Math.min(zoneTaille[0], zoneTaille[1] / forme);
}
function vueCam(nom) {
  const v = LIEUX[nom] || LIEUX.tout;
  if (!v.c) return { x: ville.camera.x, y: ville.camera.y, span: Math.min(v.span, spanDansZone()), nom: v.nom };
  const [x, y] = merc(v.c[0], v.c[1]);
  return { x: x - ville.origine[0], y: y - ville.origine[1], span: v.span, nom: v.nom };
}

/* Chargements différés : « declencher » part quand une diapo choisie (ids) approche à 2 écrans, ou en diaporama. */
function surveillerAccesTardif(declencher, ids) {
  const lancer = () => { if (!ville) return setTimeout(lancer, 300); declencher(); };
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); lancer(); } }, { rootMargin: "180% 0px 180% 0px" });
  diapos.forEach((s, i) => { if (ids(DIAPOS[i], i)) io.observe(s); });
  new MutationObserver(() => { if (enDiapo()) { io.disconnect(); lancer(); } }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  if (enDiapo()) lancer();
}

/* ---- scène courante d'après le défilement : l'année et la vue se fondent d'une diapo à la suivante ---- */
/* D'une vue à l'autre : l'échelle varie en logarithme et le point visé glisse en proportion de l'écran, pas du terrain —
   en zoomant sur Stockholm depuis l'Europe, la ville reste sous les yeux au lieu de dériver (puis d'arriver d'un coup). */
function zoomAncre(ca, cb, e) {
  const span = Math.exp(Math.log(ca.span) + (Math.log(cb.span) - Math.log(ca.span)) * e);
  if (cb.span <= ca.span) {                          // on entre : le centre d'arrivée, vu dans l'écran de départ, rejoint le milieu
    const fx = (cb.x - ca.x) / ca.span, fy = (cb.y - ca.y) / ca.span;
    return { x: cb.x - fx * (1 - e) * span, y: cb.y - fy * (1 - e) * span, span };
  }
  const gx = (ca.x - cb.x) / cb.span, gy = (ca.y - cb.y) / cb.span;   // on sort : le centre de départ s'éloigne du milieu
  return { x: ca.x - gx * e * span, y: ca.y - gy * e * span, span };
}
let scenes = [];
function preparerScenes() {
  let dernier = SCENES.titre;
  scenes = [];
  const iH0 = DIAPOS.findIndex((d) => d.id === "frise"), iH1 = DIAPOS.findIndex((d) => d.id === "fin-histoire");   // la partie histoire : mouvement lent et lisible, ailleurs rapide
  diapos.forEach((s, i) => {
    const d = DIAPOS[i];
    if (d.carte) {                                       // une carte en plein écran : deux repères, l'entrée (an0) et la sortie (an1)
      const base = { vue: d.carte.vue, carte: d.carte, el: s };
      scenes.push({ ...base, an: d.carte.an[0], ancre: () => s.offsetTop + innerHeight * 0.25, entree: true });
      scenes.push({ ...base, an: d.carte.an[1], ancre: () => s.offsetTop + s.offsetHeight - innerHeight * 0.75, sortie: true });
      dernier = { an: d.carte.an[1], vue: d.carte.vue };
      return;
    }
    const sc = SCENES[d.id] || dernier; dernier = sc;
    if (s.classList.contains("grand") || s.classList.contains("axo")) return;   // elles couvrent la carte : elles ne comptent pas
    scenes.push({ ...sc, el: s, ancre: () => s.offsetTop + s.offsetHeight / 2, hist: i >= iH0 && i < iH1 });
  });
}
/* positions des scènes : lues une fois (la mise en page est relue seulement quand la page change de taille) */
const Y = (s) => (s._y ??= s.ancre());
new ResizeObserver(() => { for (const s of scenes) s._y = undefined; }).observe(document.body);
function sceneDefilement() {
  const milieu = scrollY + innerHeight * 0.5;
  /* dans une carte plein écran : l'année défile avec le défilement (la petite animation de la carte) */
  for (let k = 0; k < scenes.length - 1; k++) {
    const a = scenes[k], b = scenes[k + 1];
    if (a.entree && b.sortie && a.el === b.el && milieu >= Y(a) && milieu <= Y(b)) {
      const p = borne01((milieu - Y(a)) / Math.max(1, Y(b) - Y(a))), c = vueCam(a.vue);
      return { an: a.an + (b.an - a.an) * lisse(borne01(p / 0.8)), th: null, cam: { x: c.x, y: c.y, span: c.span }, nom: c.nom, carte: a.carte };
    }
  }
  const nor = scenes;
  const ys = nor.map(Y);
  let i = ys.findIndex((y) => y > milieu) - 1;
  if (i < 0) i = ys[0] > milieu ? 0 : nor.length - 1;
  const j = Math.min(nor.length - 1, i + 1);
  const t = i === j ? 0 : borne01((milieu - ys[i]) / (ys[j] - ys[i]));
  const a = nor[i], b = nor[j], ca = vueCam(a.vue), cb = vueCam(b.vue), hist = !!(a.hist && b.hist);
  const e = hist ? lisse(borne01((t - 0.3) / 0.4)) : lisse(borne01((t - 0.42) / 0.16));   // palier au milieu de la diapo ; hors histoire le changement est bref
  return { an: a.an + (b.an - a.an) * e, th: e < 0.5 ? a.th : b.th, cam: zoomAncre(ca, cb, e), nom: (e < 0.5 ? ca : cb).nom, hist, arret: (e < 0.5 ? a : b).arret || null };
}
/* En diaporama : la scène de la diapo affichée (la carte reste à gauche, comme en défilement). Une carte d'analyse : l'année avance doucement de l'entrée à la sortie. */
let rampeAn = 0;
function sceneDiapo() {
  clearInterval(rampeAn);
  const sc = scenes.filter((s) => s.el === diapos[courante]); if (!sc.length) return null;
  const a = sc[0], v = vueCam(a.vue), r = { an: a.an, th: a.th || null, cam: { x: v.x, y: v.y, span: v.span }, nom: v.nom, hist: !!a.hist, arret: a.arret || null, carte: a.carte };
  const fin = sc.find((s) => s.sortie);
  if (fin && fin.an !== a.an) {
    const t0 = performance.now(), duree = Math.min(9000, 700 + Math.abs(fin.an - a.an) * 9);
    rampeAn = setInterval(() => { if (!enDiapo() || !cible) return clearInterval(rampeAn); const p = borne01((performance.now() - t0) / duree); cible.an = a.an + (fin.an - a.an) * lisse(p); if (!anime) { anime = true; tAvant = performance.now(); requestAnimationFrame(pasLisse); } if (p >= 1) clearInterval(rampeAn); }, 80);
  }
  return r;
}
function majDiapo() { libre = false; dimensionner(); majDefilement(); }
let themeCourant = null, cible = null, anime = false, tAvant = 0, arretActif = null;      // arretActif : l'arrêt de l'histoire en cours (arrets.js)
/* Le défilement fixe une CIBLE (année, vue) ; la carte la rejoint en douceur, image après image, quelle que soit la vitesse du doigt ou de la molette. */
function majDefilement(net = false) {
  if (!ville || libre || lecture || edition) return;
  const s = enDiapo() ? sceneDiapo() : sceneDefilement();
  if (!s) return;                                      // diapo sans carte propre (image, 3D) : la carte reste comme elle est
  cible = s; themeCourant = s.th || null; elLieu.textContent = s.nom;
  if (arretActif !== s.arret) { arretActif = s.arret; sale = true; planifier(); }
  if (typeof choisirCarte === "function") choisirCarte(s.carte || null);
  if (net) { an = s.an; cam = { ...s.cam }; majTemps(); sale = true; planifier(); return; }
  if (!anime) { anime = true; tAvant = performance.now(); requestAnimationFrame(pasLisse); }
}
function pasLisse(t) {
  if (!cible || libre || lecture || edition) { anime = false; return; }
  const dt = Math.min(0.25, (t - tAvant) / 1000); tAvant = t;
  const k = 1 - Math.exp(-dt / (cible.hist ? 0.22 : 0.1));                          // lissage exponentiel, indépendant du nombre d'images par seconde
  const c = cible.cam, ls = Math.log(cam.span);
  an += (cible.an - an) * k;
  const span = Math.exp(ls + (Math.log(c.span) - ls) * k), fx = (c.x - cam.x) / cam.span * (1 - k), fy = (c.y - cam.y) / cam.span * (1 - k);
  cam = { x: c.x - fx * span, y: c.y - fy * span, span };
  const fini = Math.abs(cible.an - an) < 0.4 && Math.abs(Math.log(c.span / cam.span)) < 0.004 && Math.hypot(c.x - cam.x, c.y - cam.y) < cam.span * 0.0006;
  if (fini) { an = cible.an; cam = { ...c }; }
  majTemps(); sale = true; planifier();
  if (fini) anime = false; else requestAnimationFrame(pasLisse);
}
function majTemps() { elCurseur.value = Math.round(an); }          // la tête de la frise est déplacée par rendre()

/* ---- dessin ---- */
function trace(c, f, ferme, cm) {
  const s = c.canvas.width / cm.span, w = c.canvas.width / 2, h = c.canvas.height / 2;
  c.moveTo(w + (f[0] - cm.x) * s, h - (f[1] - cm.y) * s);
  for (let i = 2; i < f.length; i += 2) c.lineTo(w + (f[i] - cm.x) * s, h - (f[i + 1] - cm.y) * s);
  if (ferme) c.closePath();
}
const px = (x) => cv.width / 2 + (x - cam.x) * cv.width / cam.span, py = (y) => cv.height / 2 - (y - cam.y) * cv.width / cam.span;
const dansVue = (b, cm, t = cv) => { const dx = cm.span / 2, dy = dx * t.height / t.width; return !(b[2] < cm.x - dx || b[0] > cm.x + dx || b[3] < cm.y - dy || b[1] > cm.y + dy); };
const palette = () => sombre()
  ? { terre: "#1b1e20", mer: "#2b6a92", eau: "#2d6f94", eauSalee: "#2b6a92", eauDouce: "#3a7ea6", fantomeRue: "#4a4d50", fantomeBati: "#34383b", vert: "#2a3a2c", pays: "#2a2d30", suede: "#5c5242", frontiere: "#3d4144", texte: "#f1ece0" }
  : { terre: "#efe9db", mer: "#6ea8cf", eau: "#7fb2d0", eauSalee: "#6ea8cf", eauDouce: "#86bddb", fantomeRue: "#bdb5a2", fantomeBati: "#d4ccba", vert: "#d3dec0", pays: "#e3ddcf", suede: "#a99478", frontiere: "#c4bba6", texte: "#1d1c1a" };

/* Le fond actuel (rues, bâti, vert) est lourd : dessiné une fois par vue puis déplacé pendant le mouvement. */
function dessinerFond(cm, c = null, k = null) {
  if (!c) { c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height; }
  const g = c.getContext("2d"), P = palette(), S = c.width / cm.span;
  k ??= Math.max(0.5, Math.min(2.4, Math.sqrt(30000 / cm.span))) * dpr;
  g.fillStyle = P.vert; g.beginPath();
  for (const v of ville.fond.vert) for (const a of v) if (dansVue(lie(a), cm, c)) trace(g, a, true, cm);
  g.fill();
  g.fillStyle = P.fantomeBati; g.beginPath();
  for (const f of ville.fond.bati) for (const a of f) { const b = lie(a); if (dansVue(b, cm, c) && (b[2] - b[0]) * S > 0.6) trace(g, a, true, cm); }
  g.fill();
  g.strokeStyle = P.fantomeRue; g.lineJoin = g.lineCap = "round";
  for (const w of [1, 2, 3, 4]) {
    g.lineWidth = w * 0.55 * k; g.beginPath();
    for (const r of ville.fond.rues) if (Math.min(4, Math.max(1, Math.round(r.w))) === w) for (const a of r.f) if (dansVue(lie(a), cm, c)) trace(g, a, false, cm);
    g.stroke();
  }
  return { c, cm: { ...cm } };
}
/* Le fond de TOUTE la zone, dessiné une fois (≈ 1 à 3 s, pendant l'ouverture) dans une grande image : aux échelles larges on
   ne fait plus que la poser, au lieu de redessiner 45 000 rues à chaque arrêt du défilement (c'était la saccade). */
let fondGlobal = null;
function preparerFondGlobal() {
  if (!ville?.zone?.length) return;
  let b = [1e12, 1e12, -1e12, -1e12];
  for (const a of ville.zone) { const z = lie(a); b = [Math.min(b[0], z[0]), Math.min(b[1], z[1]), Math.max(b[2], z[2]), Math.max(b[3], z[3])]; }
  const W = 4096, larg = b[2] - b[0], H = Math.round(W * (b[3] - b[1]) / larg), c = document.createElement("canvas"); c.width = W; c.height = H;
  const cm = { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, span: larg };
  /* largeur des traits : celle qu'ils auraient sur l'écran à la vue « tout », ramenée à l'échelle de l'image */
  const ref = LIEUX.tout.span, k = Math.max(0.5, Math.min(2.4, Math.sqrt(30000 / ref))) * dpr * (W / larg) / (innerWidth * dpr / ref);
  fondGlobal = dessinerFond(cm, c, Math.max(0.35, k));
  sale = true; planifier();
}
function poserFondGlobal(alpha) {
  const f = fondGlobal, S = cv.width / cam.span, X = px(f.cm.x - f.cm.span / 2), Y = py(f.cm.y + f.cm.span / 2 * f.c.height / f.c.width);
  cx.globalAlpha = alpha; cx.drawImage(f.c, X, Y, f.cm.span * S, f.cm.span * S * f.c.height / f.c.width);
}
const meme = (a, b) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.span / b.span - 1) < 0.002;
let reglageFond = 0;

/* L'Europe et la Suède : visibles de loin, elles s'effacent quand on entre dans la ville. */
function dessinerPays(P, alphaPays) {
  if (!europe || alphaPays <= 0.01) return;
  if (typeof regionCouvre === "function" && regionCouvre()) return;      // le fond régional précis recouvre tout l'écran
  const o = ville.origine;
  cx.save(); cx.globalAlpha = alphaPays; cx.lineJoin = "round";
  /* de près, le trait de côte de Natural Earth (1:50 m) est trop grossier : on le floute, comme une mise au point sur la ville */
  const flou = Math.min(28, Math.max(0, Math.log(500000 / cam.span) * 7)) * dpr;
  if (flou > 0.5) cx.filter = `blur(${flou.toFixed(1)}px)`;
  for (const pass of ["autres", "suede"]) {
    for (const p of europe.pays) {
      const suede = p.iso === "SWE"; if ((pass === "suede") !== suede) continue;
      cx.beginPath();
      for (const anneaux of p.proj) for (const a of anneaux) trace(cx, a, true, cam);
      cx.fillStyle = suede ? mixer(P.suede, (typeof styleCarte !== "undefined" && styleCarte ? styleCarte[sombre() ? "sombre" : "clair"].prairie : P.terre), Math.round(borne01((Math.log(2200000) - Math.log(cam.span)) / (Math.log(2200000) - Math.log(900000))) * 16) / 16) : P.pays; cx.fill("evenodd");
      cx.strokeStyle = suede ? (sombre() ? "#8a7a60" : "#7d6a50") : P.frontiere; cx.lineWidth = (suede ? 1.6 : 0.8) * dpr; cx.stroke();
    }
  }
  cx.fillStyle = P.mer; cx.beginPath();
  for (const l of europe.lacsProj) for (const a of l) trace(cx, a, true, cam);
  cx.fill("evenodd");
  cx.filter = "none";
  /* noms : Suède, Stockholm */
  cx.fillStyle = P.texte; cx.textAlign = "center"; cx.textBaseline = "middle";
  const s = (cam.span > 1500000);
  if (s) {
    const [sx, sy] = merc(15.6, 62.4); cx.font = `700 ${Math.round(Math.min(26, cv.width / 24) * dpr)}px "Segoe UI", system-ui, sans-serif`;
    cx.globalAlpha = alphaPays * borne01((cam.span - 1500000) / 800000) * 0.9; cx.fillText("SUÈDE", px(sx - o[0]), py(sy - o[1]));
  }
  const [stx, sty] = merc(18.07, 59.33), X = px(stx - o[0]), Y = py(sty - o[1]);
  cx.globalAlpha = alphaPays * borne01((cam.span - 150000) / 200000); cx.fillStyle = "#c8572a"; cx.beginPath(); cx.arc(X, Y, 5 * dpr, 0, 6.3); cx.fill();
  cx.strokeStyle = "#c8572a"; cx.lineWidth = 1.4 * dpr; cx.beginPath(); cx.arc(X, Y, 11 * dpr, 0, 6.3); cx.stroke();
  cx.fillStyle = P.texte; cx.textAlign = "left"; cx.font = `700 ${Math.round(14 * dpr)}px "Segoe UI", system-ui, sans-serif`; cx.fillText("Stockholm", X + 16 * dpr, Y);
  cx.restore();
}

function rendre() {
  sale = false; if (!ville) return;
  const t0 = performance.now();
  rendreImage();
  if (anime) {                                           // en mouvement seulement : trop lent trop longtemps → on baisse la résolution
    lentes = performance.now() - t0 > 30 ? lentes + 1 : Math.max(0, lentes - 1);
    if (lentes >= 15 && dprMax > 1.25 && devicePixelRatio > 1.25) { dprMax = Math.max(1.25, dprMax - 0.5); lentes = 0; dimensionner(); }
  }
}
function rendreImage() {
  if (!ville) return;
  const P = palette(), dim = themeCourant ? new Set(THEMES_VISIBLES[themeCourant]) : null;
  /* fond : la mer de loin, la terre quand on est dans la ville */
  const loin = 1;      // la carte des pays reste dessous à toutes les échelles : la ville (masquée, bord progressif) s'y fond
  cx.fillStyle = loin >= 1 ? P.mer : P.terre; cx.fillRect(0, 0, cv.width, cv.height);
  if (loin > 0 && loin < 1) { cx.globalAlpha = loin; cx.fillStyle = P.mer; cx.fillRect(0, 0, cv.width, cv.height); cx.globalAlpha = 1; }
  dessinerPays(P, loin);
  if (typeof dessinerFondRegion === "function") dessinerFondRegion(1 - borne01((Math.log(cam.span) - Math.log(900000)) / (Math.log(2200000) - Math.log(900000))));   // le fond précis (eau, sol), sous la zone détaillée
  const ville_visible = cam.span < 150000, villeA = 1 - borne01((cam.span - 45000) / 95000);
  if (ville_visible) {
    const dessous = copierToile();                       // ce qu'il y a sous la ville (carte des pays, mer) : remis autour après le masque
    cx.save(); cx.globalAlpha = villeA;
    /* hors de la zone étudiée : une terre unie (le trait de côte de Natural Earth est trop grossier à cette échelle et mettait
       la mer au mauvais endroit) ; la zone s'y fond par un bord progressif — un projecteur sur Stockholm */
    cx.globalAlpha = villeA; cx.fillStyle = (typeof styleCarte !== "undefined" && styleCarte ? styleCarte[sombre() ? "sombre" : "clair"].terre : P.terre); cx.fillRect(0, 0, cv.width, cv.height);
    /* eau actuelle, puis mer d'autrefois avant 1900 */
    dessinerEau(P, villeA);
    /* fond actuel : en filigrane avant 1900, plein ensuite */
    const alpha = (0.16 * lisse(borne01((an - 1450) / 250)) + 0.84 * lisse(borne01((an - 1880) / 140))) * villeA;   // le fond actuel en filigrane n'apparaît qu'après le Moyen Âge : avant, seules les rues datées
    if (fondGlobal && cam.span / cv.width >= 0.75 * fondGlobal.cm.span / fondGlobal.c.width) { poserFondGlobal(alpha); cx.globalAlpha = villeA; }
    else if (!fondCache || !meme(fondCache.cm, cam)) {
      if (fondCache) {                                   // pendant le mouvement : l'ancienne image, déplacée
        const f = fondCache, S = cv.width / cam.span, k = f.cm.span / cam.span, sx = (f.cm.x - cam.x) * S, sy = -(f.cm.y - cam.y) * S;
        cx.globalAlpha = alpha; cx.save(); cx.translate(cv.width / 2 + sx, cv.height / 2 + sy); cx.scale(k, k);
        cx.drawImage(f.c, -cv.width / 2, -cv.height / 2); cx.restore(); cx.globalAlpha = villeA;
      }
      clearTimeout(reglageFond); reglageFond = setTimeout(() => { fondCache = dessinerFond(cam); sale = true; planifier(); }, 140);
    } else { cx.globalAlpha = alpha; cx.drawImage(fondCache.c, 0, 0); cx.globalAlpha = villeA; }
    if (typeof dessinerCartesAnciennes === "function") dessinerCartesAnciennes(P);
    dessinerObjets(P, dim);
    if (typeof dessinerTheme === "function") dessinerTheme(P);
    cx.restore();
    masquerZone(dessous);
  }
  if (typeof dessinerMer === "function") dessinerMer(P);                // routes maritimes et ports (histoire)
  if (typeof dessinerThemeLoin === "function") dessinerThemeLoin(P);      // cartes à grande échelle (routes anciennes)
  if (typeof dessinerDensite === "function") dessinerDensite(P);
  if (typeof dessinerArret === "function") dessinerArret(P);
  if (typeof dessinerTemps === "function") dessinerTemps();
  if (edition) dessinerEdition(P);
  elAn.textContent = cam.span > 150000 && !(typeof themeActif !== "undefined" && THEMES_CARTE[themeActif]?.loin) ? "" : an < 1000 ? "dès l'an " + Math.round(an) : Math.round(an);
}

/* La ville (données du site) n'existe que dans la zone étudiée : on la découpe avec un masque au bord progressif, et ce qui
   était dessous (carte des pays, mer, terre) reparaît autour — ni cadre ni rivage décalé, la ville se fond dans la carte. */
let tampon = null, masque = null;
function copierToile() {
  if (!tampon || tampon.width !== cv.width || tampon.height !== cv.height) { tampon = document.createElement("canvas"); tampon.width = cv.width; tampon.height = cv.height; }
  const t = tampon.getContext("2d"); t.clearRect(0, 0, tampon.width, tampon.height); t.drawImage(cv, 0, 0); return tampon;
}
function preparerMasque() {
  let b = [1e12, 1e12, -1e12, -1e12];
  for (const a of ville.zone) { const z = lie(a); b = [Math.min(b[0], z[0]), Math.min(b[1], z[1]), Math.max(b[2], z[2]), Math.max(b[3], z[3])]; }
  const larg = (b[2] - b[0]) * 1.1, W = 1024, H = Math.round(W * (b[3] - b[1]) * 1.1 / larg), c = document.createElement("canvas"); c.width = W; c.height = H;
  const cm = { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, span: larg }, g = c.getContext("2d");
  g.filter = `blur(${Math.round(W * 0.01)}px)`; g.fillStyle = "#fff"; g.beginPath();
  /* le polygone est rétréci d'un trait épais avant le flou : le fondu reste à l'intérieur de la zone */
  for (const a of ville.zone) trace(g, a, true, cm); g.fill("evenodd");
  g.globalCompositeOperation = "destination-out"; g.strokeStyle = "#000"; g.lineWidth = W * 0.026; g.lineJoin = "round"; g.beginPath(); for (const a of ville.zone) trace(g, a, true, cm); g.stroke();
  masque = { c, cm };
}
function masquerZone(dessous) {
  if (!ville.zone?.length) return;
  if (!masque) preparerMasque();
  const m = masque, S = cv.width / cam.span, w = m.cm.span * S, h = w * m.c.height / m.c.width;
  cx.save();
  cx.globalCompositeOperation = "destination-in"; cx.drawImage(m.c, px(m.cm.x) - w / 2, py(m.cm.y) - h / 2, w, h);
  cx.globalCompositeOperation = "destination-over"; cx.drawImage(dessous, 0, 0);
  cx.restore();
}

/* L'eau : celle d'aujourd'hui MESURÉE (satellite + lacs OSM), salée et douce dans deux bleus voisins.
   La mer d'autrefois (modèle : relief + remontée des terres) n'est montrée qu'avant la ville : elle se retire entre 1100 et
   1400, ensuite les rives ne bougent plus que par les quais, les remblais et les ponts (dessinés à la main si besoin). */
function dessinerEau(P, villeA) {
  const E = ville.eauModerne;
  if (E) {
    cx.fillStyle = P.eauSalee; cx.beginPath(); for (const a of E.salee) if (dansVue(lie(a), cam)) trace(cx, a, true, cam); cx.fill("evenodd");
    cx.fillStyle = P.eauDouce; cx.beginPath(); for (const a of E.douce) if (dansVue(lie(a), cam)) trace(cx, a, true, cam); cx.fill("evenodd");
  } else {
    cx.fillStyle = P.eau; cx.beginPath(); for (const f of ville.fond.eau) for (const a of f) if (dansVue(lie(a), cam)) trace(cx, a, true, cam); cx.fill();
  }
  const h = 1 - lisse(borne01((an - 1100) / 300));
  if (h > 0.01 && ville.mer.length) {
    const avant = ville.mer.filter((m) => m.an <= an), apres = ville.mer.find((m) => m.an > an), prev = avant[avant.length - 1] || apres;
    const t = apres && prev !== apres ? borne01((an - prev.an) / (apres.an - prev.an)) : 0;
    cx.fillStyle = P.eauSalee;
    if (apres) { cx.globalAlpha = villeA * h; cx.beginPath(); for (const a of apres.f) trace(cx, a, true, cam); cx.fill("evenodd"); }
    cx.globalAlpha = villeA * h * (1 - t); cx.beginPath(); for (const a of prev.f) trace(cx, a, true, cam); cx.fill("evenodd");
    cx.globalAlpha = villeA;
  }
}

/* Objets datés : regroupés par couleur et par largeur (quelques traits au lieu de dizaines de milliers).
   Les objets « mûrs » (bâtis depuis plus de 28 ans : leur couleur ne change plus) sont dessinés une fois dans une COUCHE hors écran,
   complétée au fil des années (on n'ajoute que les nouveaux) ; seuls les jeunes et les destructions sont redessinés à chaque image.
   Pendant un mouvement de caméra, la couche (déplacée) sert d'image provisoire, puis elle est refaite nette 140 ms après l'arrêt. */
const AGE_MUR = 28.2;                                  // au-delà : t = 1 dans le fondu de couleur (voir empiler)
let coucheObjets = null, reglageObjets = 0;
const compter = (tri, x) => { let a = 0, b = tri.length; while (a < b) { const m = (a + b) >> 1; if (tri[m] <= x) a = m + 1; else b = m; } return a; };   // éléments ≤ x d'un tableau trié
function aireM2(o) {
  if (o.m2 !== undefined) return o.m2;
  const a = o.f[0]; let s = 0; for (let i = 0, n = a.length; i < n; i += 2) { const j = (i + 2) % n; s += a[i] * a[j + 1] - a[j] * a[i + 1]; }
  return (o.m2 = Math.abs(s) / 2 / (KM * KM));      // KM : voir themes.js
}
/* prépare les listes d'objets à dessiner (appelé quand ville.objets change) */
function preparerObjets() {
  const stables = [], speciaux = [];
  for (const o of ville.objets) {
    if (o.k === "point") continue;                      // pas de points : seulement des surfaces et des lignes
    (o.g === "monument" || (o.fin != null && !(o.g === "bati" && !o.brule)) ? speciaux : stables).push(o);
  }
  ville.batiListe = null; ville.stables = stables; ville.speciaux = speciaux; ville.stablesAn = Float64Array.from(stables, (o) => o.an);
  coucheObjets = null;
}
/* range l'objet dans son lot (couleur, opacité, largeur) ; renvoie son âge et sa destruction, ou null s'il n'est pas dessiné */
function empiler(lots, o, pal, k, dim, span) {
  if (o.g === "voirie" && span > 9000 && (o.w || 1) < 1.9) return null;   // de loin : seulement les grandes rues
  if (o.g === "bati" && o.k === "poly") { const a = aireM2(o); if (a < 15 || (span > 2500 && a < 40)) return null; }   // kiosques, abris, entrées de métro : pas des bâtiments
  let brule = -1;                                       // années depuis la destruction (incendie, démolition) ; -1 = debout
  if (o.fin != null && an > o.fin + 0.001) {
    const apres = an - o.fin;
    if (o.g === "bati" && !o.brule) { /* un bâtiment démoli d'après OSM reste : on ne sait pas le remplacer */ }
    else if ((o.brule || o.g === "monument") && apres < 20) brule = apres;
    else return null;
  }
  const age = an - o.an, t = Math.min(1, Math.round(age / 30 * 8) / 8), coul = o.couleur || (pal[o.g] || pal.bati);
  let col = typeof coul === "string" ? coul : t < 1 ? mixer(coul[1], coul[0], t) : coul[0];
  if (brule >= 0) col = mixer(o.demoli ? "#b9a48c" : "#e0301c", sombre() ? "#4a3a36" : "#6b5a52", Math.round(Math.min(1, brule / 20) * 8) / 8);
  const al = (dim && !dim.has(o.g) ? 0.22 : 1) * (brule >= 0 ? Math.max(0.15, 1 - brule / 22) : 1), lw = o.k === "ligne" ? Math.max(0.6 * dpr, (o.w || 1) * 0.55 * k * (o.g === "lignes" ? 1.3 : 1)) : 0;
  const cle = `${o.k}|${col}|${al}|${lw.toFixed(1)}|${o.tunnel ? 1 : 0}`;
  let l = lots.get(cle); if (!l) lots.set(cle, l = { k: o.k, col, al, lw, tunnel: !!o.tunnel, liste: [] });
  l.liste.push(o);
  return { age, brule };
}
/* dessine les lots sur g (la toile principale ou la couche) avec la caméra cm */
function tracerLots(g, cm, lots) {
  const S = g.canvas.width / cm.span, W2 = g.canvas.width / 2, H2 = g.canvas.height / 2, petit = 7 * dpr;
  g.lineJoin = g.lineCap = "round";
  for (const l of lots.values()) {
    g.globalAlpha = l.al; g.beginPath();
    for (const o of l.liste) {
      const b = lie(o.f[0]);
      if (!dansVue(b, cm, g.canvas)) continue;
      const w = (b[2] - b[0]) * S, h = (b[3] - b[1]) * S;
      if (l.k === "poly" && w < petit && h < petit) {      // de loin : un rectangle à la taille réelle (fondu aux bords) — plus de carrés gonflés à 1-2 pixels qui se chevauchent
        g.rect(W2 + (b[0] - cm.x) * S, H2 - (b[3] - cm.y) * S, Math.max(0.55 * dpr, w), Math.max(0.55 * dpr, h)); continue;
      }
      if (l.k === "ligne" && w < 1.5 && h < 1.5) continue;
      for (const a of o.f) trace(g, a, l.k === "poly", cm);
    }
    if (l.k === "poly") { g.fillStyle = l.col; g.fill(); }
    else { g.strokeStyle = l.col; g.lineWidth = l.lw; g.setLineDash(l.tunnel ? [4 * dpr, 4 * dpr] : []); g.stroke(); g.setLineDash([]); }
  }
  g.globalAlpha = 1;
}
/* la couche des objets mûrs : de l'indice a (inclus) à b (exclu) de ville.stables */
function remplirCouche(L, a, b, pal, k, dim) {
  const lots = new Map(), S = ville.stables;
  for (let i = a; i < b; i++) if (S[i].an <= an - AGE_MUR) empiler(lots, S[i], pal, k, dim, L.cm.span);
  tracerLots(L.g, L.cm, lots); L.vers = b;
}
function nouvelleCouche(pal, k, dim, cle) {
  const c = document.createElement("canvas"); c.width = cv.width; c.height = cv.height;
  const L = { c, g: c.getContext("2d"), cm: { ...cam }, vers: 0, cle };
  remplirCouche(L, 0, compter(ville.stablesAn, an - AGE_MUR), pal, k, dim); return L;
}
function dessinerObjets(P, dim) {
  if (!ville.stables) preparerObjets();
  const pal = sombre() ? GROUPES_SOMBRE : GROUPES, k = Math.max(0.55, Math.min(2.4, Math.sqrt(30000 / cam.span))) * dpr;
  const mur = compter(ville.stablesAn, an - AGE_MUR), tout = compter(ville.stablesAn, an);
  const cle = `${sombre() ? 1 : 0}|${dpr}|${cv.width}|${cv.height}|${dim ? themeCourant : ""}`;
  let L = coucheObjets;
  if (!L || L.cle !== cle || mur < L.vers || L.c.width !== cv.width || L.c.height !== cv.height) L = coucheObjets = nouvelleCouche(pal, k, dim, cle);
  else if (meme(L.cm, cam)) { if (mur > L.vers) remplirCouche(L, L.vers, mur, pal, k, dim); }
  else if (mur - L.vers > 4000) L = coucheObjets = nouvelleCouche(pal, k, dim, cle);
  else { clearTimeout(reglageObjets); reglageObjets = setTimeout(() => { if (coucheObjets && !meme(coucheObjets.cm, cam)) { coucheObjets = null; sale = true; planifier(); } }, 140); }
  /* la couche : à sa place, ou déplacée et mise à l'échelle pendant le mouvement */
  const f = L.cm, S = cv.width / cam.span, ech = f.span / cam.span;
  cx.save(); cx.globalAlpha = 1;
  if (meme(f, cam)) cx.drawImage(L.c, 0, 0);
  else { cx.translate(cv.width / 2 + (f.x - cam.x) * S, cv.height / 2 - (f.y - cam.y) * S); cx.scale(ech, ech); cx.drawImage(L.c, -cv.width / 2, -cv.height / 2); }
  cx.restore();
  /* les objets pas encore dans la couche (jeunes, destructions) : dessinés en direct */
  const lots = new Map(), noms = [], S2 = ville.stables;
  const note = (o, r) => {
    if (!r) return; const { age, brule } = r;
    if (o.nom && age >= 0 && age < 18 && o.k === "ligne" && o.g === "ponts") noms.push([o, age]);
    if (o.nom && o.g === "monument" && age >= 0 && (age < 25 || brule >= 0 || edition)) noms.push([o, brule >= 0 ? 0 : Math.min(age, 17)]);
  };
  for (let i = L.vers; i < tout; i++) note(S2[i], empiler(lots, S2[i], pal, k, dim, cam.span));
  for (const o of ville.speciaux) { if (o.an > an) break; note(o, empiler(lots, o, pal, k, dim, cam.span)); }
  tracerLots(cx, cam, lots);
  cx.globalAlpha = 1;
  for (const z of ville.zonesM || []) {
    const finEclair = z.detruitFin ?? z.detruit + 14;
    if (z.detruit == null || an < z.detruit || an > finEclair || !dansVue(z.b, cam)) continue;
    const ap = (an - z.detruit) / (finEclair - z.detruit) * 14;
    cx.globalAlpha = 0.28 * (1 - ap / 14); cx.fillStyle = "#e0301c"; cx.beginPath(); trace(cx, z.r, true, cam); cx.fill();
    cx.globalAlpha = Math.min(1, (14 - ap) / 5); cx.font = `700 ${Math.round(15 * dpr)}px "Segoe UI", system-ui, sans-serif`; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.lineWidth = 4 * dpr; cx.strokeStyle = P.terre; cx.fillStyle = "#e0301c";
    const txt = `${z.cause || "Incendie"} · ${z.detruit}`; cx.strokeText(txt, px(z.c[0]), py(z.c[1])); cx.fillText(txt, px(z.c[0]), py(z.c[1]));
  }
  cx.globalAlpha = 1;
  cx.font = `600 ${Math.round(12 * dpr)}px "Segoe UI", system-ui, sans-serif`; cx.textBaseline = "middle"; cx.textAlign = "left";
  noms.sort((p, q) => p[1] - q[1]).slice(0, 8).forEach(([o, age]) => {
    const f = o.f[0], m = o.k === "poly" ? 0 : (f.length >> 2) << 1, x = px(f[m]), y = py(f[m + 1]);
    cx.globalAlpha = Math.max(0, 1 - age / 18) * (cx.globalAlpha || 1); cx.lineWidth = 3 * dpr; cx.strokeStyle = P.terre; cx.fillStyle = P.texte;
    cx.strokeText(o.nom, x + 6 * dpr, y); cx.fillText(o.nom, x + 6 * dpr, y); cx.globalAlpha = 1;
  });
}
const memoMix = new Map();
function mixer(a, b, t) {
  const cle = a + b + t, m = memoMix.get(cle); if (m) return m;
  const v = mixer0(a, b, t); memoMix.set(cle, v); return v;
}
function mixer0(a, b, t) {
  const h = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)), A = h(a), B = h(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
let planifie = false;
function planifier() { if (planifie) return; planifie = true; requestAnimationFrame(() => { planifie = false; if (sale) rendre(); }); }
function dimensionner() {
  dpr = Math.min(dprMax, devicePixelRatio || 1);
  const r = cv.getBoundingClientRect(); cv.width = Math.max(2, Math.round(r.width * dpr)); cv.height = Math.max(2, Math.round(r.height * dpr));
  fondCache = null; coucheObjets = null; sale = true; planifier();
}
addEventListener("resize", () => { dimensionner(); if (enDiapo()) majDefilement(); else { majDefilement(); majGrands(); } });
addEventListener("scroll", () => { if (!enDiapo()) { if (libre && !lecture && !edition) { libre = false; elNote.textContent = "défiler ou jouer"; } majDefilement(); majGrands(); } }, { passive: true });

/* ---- le lecteur : année par année, indépendamment du défilement ---- */
function lire(on) {
  lecture = on; elLecture.textContent = on ? "❚❚" : "▶";
  if (!on) return;
  libre = true; elNote.textContent = "lecture — défiler reprend le récit";
  if (cam.span > 150000) { cam = vueCam("tout"); }
  if (an >= ANNEE_MAX - 1) an = ANNEE_MIN;
  let t0 = performance.now();
  const pas = (t) => {
    if (!lecture) return;
    const dt = Math.min(0.1, (t - t0) / 1000); t0 = t;
    an = Math.min(ANNEE_MAX, an + dt * (an < 1500 ? 90 : an < 1800 ? 45 : 22));
    elCurseur.value = Math.round(an); sale = true; rendre();
    if (an >= ANNEE_MAX) return lire(false);
    requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}
elLecture.onclick = () => lire(!lecture);
elCurseur.addEventListener("input", () => { lecture = false; elLecture.textContent = "▶"; libre = true; elNote.textContent = "année choisie — défilez pour reprendre le récit"; an = +elCurseur.value; sale = true; rendre(); });
addEventListener("wheel", () => { if (lecture) lire(false); }, { passive: true });

/* =====================================================================================
   Grandes images : une diapo « grand » est une longue piste ; l'image reste à l'écran et glisse vers la gauche pendant
   qu'on descend (la caméra va vers la droite). En diaporama : l'image entière, sur une page.
   ===================================================================================== */
/* Le travelling : l'image ENTRE par la droite de l'écran, passe devant la ville (qui s'efface derrière un voile), traverse l'écran
   de droite à gauche en se laissant lire, puis SORT par la gauche ; le site (la carte) revient alors. Un seul geste, vers le bas. */
function majGrands() {
  if (enDiapo()) return;
  const vw = innerWidth, vh = innerHeight - 48;
  for (const g of document.querySelectorAll(".diapo.grand")) {
    const img = g.querySelector("img"); if (!img || !img.naturalWidth) continue;
    const cadre = g.querySelector(".grand-cadre");
    if (g.classList.contains("fixe")) {                // page fixe : l'image reste à sa place ; seul le voile (la ville s'efface) suit le défilement
      const longueur = vh * 0.9; g.style.height = (vh + longueur) + "px";
      const p = borne01((scrollY - g.offsetTop) / longueur), voile = Math.sin(Math.PI * p) ** 0.45;
      cadre.style.setProperty("--voile", Math.max(voile, p > 0 && p < 1 ? Math.min(1, p / 0.12, (1 - p) / 0.12) : 0).toFixed(3));
      continue;
    }
    const h = vh * 0.78, w = h * img.naturalWidth / img.naturalHeight;
    img.style.height = h + "px"; img.style.width = w + "px";
    const trajet = vw + w, longueur = Math.max(trajet * 0.75, vh * 1.6);              // distance de défilement vertical pour tout le travelling
    g.style.height = (vh + longueur) + "px";
    const p = borne01((scrollY - g.offsetTop) / longueur);
    /* de la droite vers la gauche : entrée (0-12 %), traversée lente, sortie (88-100 %) ; une image qui tient dans l'écran s'y arrête */
    let x;
    if (w <= vw * 0.92) { const rest = (vw - w) / 2; x = p < 0.3 ? vw + (rest - vw) * lisse(p / 0.3) : p < 0.7 ? rest : rest + (-w - rest) * lisse((p - 0.7) / 0.3); }
    else x = vw - p * trajet;
    img.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
    const voile = Math.sin(Math.PI * Math.min(1, Math.max(0, p))) ** 0.6;           // 0 → 1 → 0 : la ville s'efface puis revient
    cadre.style.setProperty("--voile", (voile * 0.93).toFixed(3));
    cadre.style.setProperty("--p", p.toFixed(3));
    const lg = g.querySelector(".grand-legende"); if (lg) lg.style.opacity = (borne01((voile - 0.35) / 0.4)).toFixed(2);
  }
}
document.addEventListener("load", (e) => { if (e.target.closest?.(".grand")) majGrands(); }, true);

/* =====================================================================================
   Quartiers et bâtiments dessinés à la main : une zone + deux dates = les bâtiments de la zone qui ne sont pas encore datés
   apparaissent peu à peu entre ces dates (sans être précis, bâtiment par bâtiment). Un bâtiment dessiné à la main a sa date.
   ===================================================================================== */
const hachage = (x, y) => { let h = Math.imul(Math.round(x * 3) | 0, 374761393) ^ Math.imul(Math.round(y * 3) | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
function dansAnneau(x, y, r) { let d = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { if ((r[i + 1] > y) !== (r[j + 1] > y) && x < (r[j] - r[i]) * (y - r[i + 1]) / (r[j + 1] - r[i + 1]) + r[i]) d = !d; } return d; }
const versM = (lonlat) => { const o = ville.origine, r = []; for (const [lo, la] of lonlat) { const [x, y] = merc(lo, la); r.push(x - o[0], y - o[1]); } return r; };
const centreBoite = (f) => { const b = lie(f[0]); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };

/* ---- la terre sèche : à partir de quelle année chaque endroit n'est plus sous l'eau ----
   Les contours de la mer sont calculés tous les 100 ans ; un bâtiment ne peut pas naître avant que sa terre émerge
   (sinon on voit des maisons sur l'eau). Le calcul se fait une fois, sur une grille. */
let seche = null;
function calculerSeche() {
  const ms = ville.mer.filter((m) => m.an <= 1300).sort((p, q) => p.an - q.an); if (!ms.length) { seche = null; return; }   // après 1300 l'eau ne bouge plus (voir dessinerEau)
  let a = 1e12, b = 1e12, c = -1e12, d = -1e12;
  for (const m of ms) for (const r of m.f) { const bb = bornes(r); a = Math.min(a, bb[0]); b = Math.min(b, bb[1]); c = Math.max(c, bb[2]); d = Math.max(d, bb[3]); }
  const W = 1100, H = Math.max(200, Math.min(1500, Math.round(W * (d - b) / (c - a)))), k = W / (c - a);
  const cv2 = document.createElement("canvas"); cv2.width = W; cv2.height = H; const g = cv2.getContext("2d", { willReadFrequently: true });
  const an0 = new Uint16Array(W * H);
  for (const m of ms) {
    g.clearRect(0, 0, W, H); g.fillStyle = "#000"; g.beginPath();
    for (const r of m.f) { g.moveTo((r[0] - a) * k, (d - r[1]) * k); for (let i = 2; i < r.length; i += 2) g.lineTo((r[i] - a) * k, (d - r[i + 1]) * k); g.closePath(); }
    g.fill("evenodd");
    const px4 = g.getImageData(0, 0, W, H).data;
    for (let i = 0; i < an0.length; i++) if (px4[4 * i + 3] < 128 && an0[i] === 0) an0[i] = m.an;
  }
  seche = { an0, a, d, k, W, H };
}
function delaiTerre(x, y) {
  if (!seche) return 0;
  const i = Math.floor((x - seche.a) * seche.k), j = Math.floor((seche.d - y) * seche.k);
  if (i < 0 || j < 0 || i >= seche.W || j >= seche.H) return 0;
  return seche.an0[j * seche.W + i];
}

/* ---- trouver le bâtiment sous un point (en mètres) ---- */
function batimentSous(x, y) {
  for (const f of ville.bati0) { const b = lie(f[0]); if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && dansAnneau(x, y, f[0])) return { f, ghost: true }; }
  for (const o of ville.objets0) { if (o.g !== "bati" || !o.f.length) continue; const b = lie(o.f[0]); if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && dansAnneau(x, y, o.f[0])) return { o, ghost: false }; }
  return null;
}

function appliquerQuartiers() {
  if (!ville) return;
  const Q = quartiers, nouveaux = [];
  let objets = ville.objets0.slice();
  const zones = Q.zones.filter((z) => z.zone?.length >= 3 && z.de != null && z.a != null).map((z) => {
    const r = versM(z.zone), b = bornes(r); let sx = 0, sy = 0; for (let i = 0; i < r.length; i += 2) { sx += r[i]; sy += r[i + 1]; }
    return { ...z, r, b, c: [sx / (r.length / 2), sy / (r.length / 2)], rayon: Math.max(b[2] - b[0], b[3] - b[1]) / 2 || 1 };
  });
  const tout = Q.tout && Q.tout.actif && Q.tout.de != null && Q.tout.a != null
    ? { nom: "Reste de la ville", de: Q.tout.de, a: Q.tout.a, ordre: Q.tout.ordre || "centre", tout: true, b: [-1e12, -1e12, 1e12, 1e12], c: [ville.camera.x, ville.camera.y], rayon: 11000 } : null;
  const zoneDe = (x, y) => zones.find((q) => x > q.b[0] && x < q.b[2] && y > q.b[1] && y < q.b[3] && dansAnneau(x, y, q.r)) || tout;
  const date = (z, x, y, de, a, graine) => {
    const alea = graine ? hachage(y, x) : hachage(x, y); let u = alea;
    if (z.ordre === "centre") u = borne01(Math.hypot(x - z.c[0], y - z.c[1]) / z.rayon * 0.8 + alea * 0.25);
    else if (z.ordre === "bord") u = borne01(1 - Math.hypot(x - z.c[0], y - z.c[1]) / z.rayon * 0.8 - alea * 0.25 + 0.25);
    else if (z.ordre === "nord-sud") u = borne01((z.b[3] - y) / (z.b[3] - z.b[1] || 1) * 0.8 + alea * 0.25);
    else if (z.ordre === "ouest-est") u = borne01((x - z.b[0]) / (z.b[2] - z.b[0] || 1) * 0.8 + alea * 0.25);
    return Math.round(de + (a - de) * u);
  };
  /* dates données bâtiment par bâtiment (clic sur la carte) */
  const forces = new Map();
  for (const d of Q.dates || []) {
    const [x, y] = versM([d.p]), cible = batimentSous(x, y); if (!cible) continue;
    if (cible.ghost) forces.set(cible.f, d);
    else { const i = objets.indexOf(cible.o); if (i >= 0) objets[i] = { ...cible.o, an: d.an, fin: d.fin ?? undefined, brule: d.fin != null }; }
  }
  const resteB = [], resteR = [];
  const naissance = (z, x, y, f) => {                    // un bâtiment de la zone : sa naissance, sa destruction éventuelle, sa reconstruction
    const an1 = date(z, x, y, z.de, z.a), det = z.detruit != null && z.detruit > an1 ? z.detruit : null;
    nouveaux.push({ g: "bati", k: "poly", an: an1, fin: det ?? undefined, brule: det != null, f });
    if (det != null && z.re_de != null && z.re_a != null) nouveaux.push({ g: "bati", k: "poly", an: date(z, x, y, z.re_de, z.re_a, true), f });
  };
  /* sans zone ni date donnée à la main : la date de la croissance reconstituée (outils/preparer_donnees.py :
     propagation le long des rues depuis Stadsholmen et les objets datés, bornée par la croissance satellitaire) */
  const C = ville.croissance;
  ville.bati0.forEach((f, i) => {
    const [x, y] = centreBoite(f), fo = forces.get(f);
    if (fo) { nouveaux.push({ g: "bati", k: "poly", an: fo.an, fin: fo.fin ?? undefined, brule: fo.fin != null, f }); return; }
    const z = zoneDe(x, y);
    if (z && !z.tout) naissance(z, x, y, f);
    else if (C?.bati?.[i] != null) nouveaux.push({ g: "bati", k: "poly", an: C.bati[i], f });
    else if (z) naissance(z, x, y, f); else resteB.push(f);
  });
  ville.rues0.forEach((r, i) => {
    const [x, y] = centreBoite(r.f), z = zoneDe(x, y);
    if (z && !z.tout) nouveaux.push({ g: "voirie", k: "ligne", an: date(z, x, y, z.de, z.a), w: r.w, f: r.f });
    else if (C?.rues?.[i] != null) nouveaux.push({ g: "voirie", k: "ligne", an: C.rues[i], w: r.w, f: r.f });
    else if (z) nouveaux.push({ g: "voirie", k: "ligne", an: date(z, x, y, z.de, z.a), w: r.w, f: r.f }); else resteR.push(r);
  });
  /* bâtiments et monuments dessinés à la main */
  for (const b of Q.batiments) {
    if (!(b.f?.length >= 3) || b.an == null) continue;
    nouveaux.push({ g: b.monument ? "monument" : "bati", k: "poly", an: b.an, fin: b.fin ?? undefined, brule: b.fin != null, nom: b.nom || undefined, f: [versM(b.f)], main: true });
  }
  /* la terre doit être sèche : aucun bâtiment ni aucune rue avant l'émergence de leur terrain */
  const tous = objets.concat(nouveaux);
  for (let i = 0; i < tous.length; i++) {
    const o = tous[i]; if (o.main || (o.g !== "bati" && o.g !== "voirie") || !o.f.length) continue;
    const [x, y] = centreBoite(o.f), s = delaiTerre(x, y);
    if (s > o.an) tous[i] = { ...o, an: s };
  }
  /* incendies et démolitions d'après les sources (donnees/zones_evenements.json) : les bâtiments de la zone qui existent à
     ce moment brûlent (ou sont démolis peu à peu) puis renaissent ; le château Tre Kronor est dessiné et disparaît en 1697 */
  const eclairs = [];
  for (const z of (ville.zonesEv || []).slice().sort((a, b) => (a.an ?? a.de) - (b.an ?? b.de))) {
    const r = versM(z.zone), b = bornes(r); let sx = 0, sy = 0; for (let i = 0; i < r.length; i += 2) { sx += r[i]; sy += r[i + 1]; }
    const c = [sx / (r.length / 2), sy / (r.length / 2)];
    if (z.type === "monument" && z.emprise_osm) {            // l'emprise du palais actuel, réduite : plus ressemblant qu'un carré
      const [mx, my] = merc(z.emprise_osm[0], z.emprise_osm[1]), bs = batimentSous(mx - ville.origine[0], my - ville.origine[1]), src = bs && (bs.f || bs.o?.f);
      if (src) { const a = src[0], n = a.length / 2; let ax = 0, ay = 0; for (let i = 0; i < a.length; i += 2) { ax += a[i]; ay += a[i + 1]; }
        ax /= n; ay /= n; const k = z.echelle || 0.86, forme = a.map((v, i) => i % 2 ? ay + (v - ay) * k : ax + (v - ax) * k);
        tous.push({ g: "monument", k: "poly", an: z.an, fin: z.fin, brule: true, nom: z.nom, f: [forme], main: true }); continue; }
    }
    if (z.type === "monument") { tous.push({ g: "monument", k: "poly", an: z.an, fin: z.fin, brule: true, nom: z.nom, f: [r], main: true }); continue; }
    const t0 = z.an ?? z.de, t1 = z.a ?? z.an;
    eclairs.push({ r, b, c, detruit: t0, detruitFin: t1 + 8, cause: z.type === "demolition" ? "Démolitions" : "Incendie", nom: z.nom });
    const n0 = tous.length;
    for (let i = 0; i < n0; i++) {
      const o = tous[i];
      if (o.g !== "bati" || o.k !== "poly" || !o.f.length || o.an >= t0 || (o.fin != null && o.fin <= t0)) continue;
      const [x, y] = centreBoite(o.f); if (!(x > b[0] && x < b[2] && y > b[1] && y < b[3] && dansAnneau(x, y, r))) continue;
      const fin = Math.round(t0 + (t1 - t0) * hachage(x, y));
      tous[i] = { ...o, fin, brule: true, demoli: z.type === "demolition" };
      tous.push({ ...o, an: Math.round(Math.max(fin + 1, z.re_de) + (z.re_a - z.re_de) * hachage(y, x)), fin: undefined, brule: false, demoli: false });
    }
  }
  tous.sort((p, q) => p.an - q.an);
  ville.objets = tous; ville.fond.bati = resteB; ville.fond.rues = resteR; ville.zonesM = zones.concat(eclairs);
  preparerObjets(); fondCache = null; sale = true; planifier();
  if (typeof recalculerCourbe === "function") recalculerCourbe();
}
let sauvegarde = 0;
function enregistrerQuartiers() {
  try { localStorage.setItem("stockholm-quartiers", JSON.stringify(quartiers)); } catch {}
  clearTimeout(sauvegarde);
  sauvegarde = setTimeout(() => {
    fetch("http://localhost:8765/depot/quartiers.json", { method: "POST", body: JSON.stringify(quartiers, null, 1) })
      .then(() => { const e = document.getElementById("ed-etat"); if (e) e.textContent = "enregistré dans donnees/quartiers.json"; })
      .catch(() => { const e = document.getElementById("ed-etat"); if (e) e.textContent = "enregistré dans ce navigateur seulement (serveur absent)"; });
  }, 500);
}

/* ---- l'éditeur ---- */
const ed = { outil: null, pts: [], sel: null };
const panneau = document.createElement("div");
panneau.id = "editeur"; panneau.hidden = true;
panneau.innerHTML = `<div class="ed-tete"><b>Dater, dessiner, détruire</b><button type="button" id="ed-fermer" title="Fermer">×</button></div>
  <p class="ed-aide">Le curseur d'année règle la date proposée. Molette = zoom, glisser = déplacer, clic = poser un point, double-clic ou Entrée = terminer, Échap = annuler.</p>
  <div class="ed-boutons"><button type="button" id="ed-zone" title="Un quartier entier, entre deux dates">▱ Zone</button><button type="button" id="ed-bat" title="Un bâtiment ou un monument à dessiner (château, citadelle…)">⌂ Dessiner</button><button type="button" id="ed-dater" title="Cliquer un bâtiment de la carte pour lui donner une année">☝ Dater un bâtiment</button></div>
  <details id="ed-tout"><summary>Tout le reste de la ville</summary><div id="ed-tout-champs"></div></details>
  <div id="ed-liste"></div><p class="ed-etat" id="ed-etat"></p>`;
document.getElementById("carte-bloc").appendChild(panneau);
const bEd = document.createElement("button"); bEd.type = "button"; bEd.id = "an-editer"; bEd.textContent = "✎"; bEd.title = "Dater les bâtiments, ajouter, détruire, reconstruire";
document.querySelector(".an-barre").appendChild(bEd);

const ORDRES = [["hasard", "au hasard"], ["centre", "du centre vers le bord"], ["bord", "du bord vers le centre"], ["nord-sud", "du nord au sud"], ["ouest-est", "de l'ouest à l'est"]];
const esc = (s) => String(s ?? "").replace(/[&"<>]/g, (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" }[c]));
const champN = (t, i, c, v, titre) => `<input type="number" data-t="${t}" data-i="${i}" data-c="${c}" value="${v ?? ""}" title="${titre}" min="800" max="2026">`;
function listeEdition() {
  const T = quartiers.tout || { actif: false, de: 1250, a: 2000, ordre: "centre" };
  document.getElementById("ed-tout-champs").innerHTML = `<p class="ed-aide">Les bâtiments et rues qui ne sont dans aucune zone et n'ont pas de date apparaissent tous, peu à peu, entre deux dates.</p>
    <label><input type="checkbox" id="ed-tout-actif" ${T.actif ? "checked" : ""}> Les faire apparaître progressivement</label><br>
    de ${champN("T", 0, "de", T.de, "de l'année")} à ${champN("T", 0, "a", T.a, "à l'année")}
    <select data-t="T" data-i="0" data-c="ordre">${ORDRES.map(([v, t]) => `<option value="${v}"${(T.ordre || "centre") === v ? " selected" : ""}>${t}</option>`).join("")}</select>`;
  let h = "";
  quartiers.zones.forEach((z, i) => {
    h += `<div class="ed-ligne${ed.sel === "z" + i ? " sel" : ""}" data-s="z${i}"><input class="n" value="${esc(z.nom)}" placeholder="Quartier" data-c="nom" data-i="${i}" data-t="z">
      ${champN("z", i, "de", z.de, "apparaît dès")} → ${champN("z", i, "a", z.a, "apparu en entier à")}
      <select data-c="ordre" data-i="${i}" data-t="z">${ORDRES.map(([v, t]) => `<option value="${v}"${(z.ordre || "hasard") === v ? " selected" : ""}>${t}</option>`).join("")}</select>
      <button type="button" data-sup="z${i}" title="Supprimer">🗑</button>
      <details class="ed-sous"${z.detruit != null ? " open" : ""}><summary>🔥 Destruction et reconstruction</summary>
        détruit en ${champN("z", i, "detruit", z.detruit, "année de la destruction (incendie, démolition)")}
        <input value="${esc(z.cause)}" placeholder="Incendie" data-c="cause" data-i="${i}" data-t="z" size="9"><br>
        reconstruit de ${champN("z", i, "re_de", z.re_de, "début de la reconstruction")} à ${champN("z", i, "re_a", z.re_a, "fin de la reconstruction")}</details></div>`;
  });
  quartiers.batiments.forEach((b, i) => {
    h += `<div class="ed-ligne${ed.sel === "b" + i ? " sel" : ""}" data-s="b${i}"><input class="n" value="${esc(b.nom)}" placeholder="Nom (ex. Château Tre Kronor)" data-c="nom" data-i="${i}" data-t="b">
      ${champN("b", i, "an", b.an, "construit en")} → détruit ${champN("b", i, "fin", b.fin, "détruit en (vide = jamais)")}
      <label title="Couleur de monument et nom affiché"><input type="checkbox" data-c="monument" data-i="${i}" data-t="b" ${b.monument ? "checked" : ""}> monument</label>
      <button type="button" data-sup="b${i}" title="Supprimer">🗑</button></div>`;
  });
  (quartiers.dates || []).forEach((d, i) => {
    h += `<div class="ed-ligne${ed.sel === "d" + i ? " sel" : ""}" data-s="d${i}"><span class="n">Bâtiment daté ${i + 1}</span> ${champN("d", i, "an", d.an, "construit en")} → détruit ${champN("d", i, "fin", d.fin, "détruit en (vide = jamais)")}
      <button type="button" data-sup="d${i}" title="Supprimer">🗑</button></div>`;
  });
  document.getElementById("ed-liste").innerHTML = h || `<p class="ed-aide">Rien encore.</p>`;
}
function changementChamp(e) {
  const t = e.target, d = t.dataset; if (!d.c && t.id !== "ed-tout-actif") return;
  if (t.id === "ed-tout-actif") { quartiers.tout = { ...(quartiers.tout || { de: 1250, a: 2000, ordre: "centre" }), actif: t.checked }; }
  else {
    let o; if (d.t === "T") o = quartiers.tout ||= { actif: false, de: 1250, a: 2000, ordre: "centre" };
    else o = (d.t === "z" ? quartiers.zones : d.t === "b" ? quartiers.batiments : quartiers.dates)[+d.i];
    o[d.c] = t.type === "checkbox" ? t.checked : t.type === "number" ? (t.value === "" ? null : +t.value) : t.value;
  }
  enregistrerQuartiers(); appliquerQuartiers();
}
panneau.addEventListener("input", changementChamp);
panneau.addEventListener("change", changementChamp);
document.getElementById("ed-liste").addEventListener("click", (e) => {
  const s = e.target.closest("[data-sup]");
  if (s) { const k = s.dataset.sup; (k[0] === "z" ? quartiers.zones : k[0] === "b" ? quartiers.batiments : quartiers.dates).splice(+k.slice(1), 1); ed.sel = null; listeEdition(); enregistrerQuartiers(); appliquerQuartiers(); return; }
  const l = e.target.closest("[data-s]"); if (l && !e.target.closest("input,select,summary,details")) { ed.sel = l.dataset.s; listeEdition(); sale = true; planifier(); }
});
function entrerEdition(on) {
  edition = on; panneau.hidden = !on; bEd.classList.toggle("actif", on);
  if (on) { libre = true; if (cam.span > 150000 || cam.span < 400) cam = vueCam("centre"); listeEdition(); elNote.textContent = "édition — l'année du curseur est celle de la carte"; if (an < 1000) { an = ANNEE_MAX; elCurseur.value = an; } }
  else { ed.outil = null; ed.pts = []; libre = false; elNote.textContent = "défiler ou jouer"; majDefilement(); }
  cv.style.cursor = on ? "grab" : ""; sale = true; planifier();
}
bEd.onclick = () => entrerEdition(!edition);
document.getElementById("ed-fermer").onclick = () => entrerEdition(false);
const choisirOutil = (o, msg) => { ed.outil = o; ed.pts = []; cv.style.cursor = "crosshair"; document.getElementById("ed-etat").textContent = msg; };
document.getElementById("ed-zone").onclick = () => choisirOutil("z", "Zone : cliquez les coins du quartier, double-clic pour finir.");
document.getElementById("ed-bat").onclick = () => choisirOutil("b", "Cliquez les coins du bâtiment ou du château, double-clic pour finir.");
document.getElementById("ed-dater").onclick = () => choisirOutil("d", "Cliquez un bâtiment de la carte pour lui donner l'année du curseur.");
const ecranVersMonde = (ex, ey) => { const r = cv.getBoundingClientRect(), S = cv.width / cam.span; return [cam.x + ((ex - r.left) * dpr - cv.width / 2) / S, cam.y - ((ey - r.top) * dpr - cv.height / 2) / S]; };
function terminerDessin() {
  if (ed.pts.length >= 3) {
    const ll = ed.pts.map(([x, y]) => demerc(x + ville.origine[0], y + ville.origine[1]).map((v) => +v.toFixed(6)));
    const a0 = Math.round(an / 10) * 10;
    if (ed.outil === "z") quartiers.zones.push({ nom: "Quartier " + (quartiers.zones.length + 1), de: Math.max(ANNEE_MIN, a0 - 30), a: a0 + 20, ordre: "hasard", zone: ll });
    else quartiers.batiments.push({ nom: "", an: Math.round(an), f: ll, monument: false });
    enregistrerQuartiers(); appliquerQuartiers(); listeEdition();
  }
  ed.outil = null; ed.pts = []; cv.style.cursor = "grab"; document.getElementById("ed-etat").textContent = ""; sale = true; planifier();
}
let glisse = null;
cv.addEventListener("pointerdown", (e) => { if (!edition) return; glisse = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, bouge: false }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener("pointermove", (e) => {
  if (!edition) return;
  if (glisse) {
    const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) glisse.bouge = true;
    if (glisse.bouge) { const S = cv.width / cam.span / dpr; cam = { ...cam, x: glisse.cx - dx / S, y: glisse.cy + dy / S }; sale = true; planifier(); }
  } else if ((ed.outil === "z" || ed.outil === "b") && ed.pts.length) { ed.curseur = ecranVersMonde(e.clientX, e.clientY); sale = true; planifier(); }
});
cv.addEventListener("pointerup", (e) => {
  if (!edition || !glisse) return;
  const clic = !glisse.bouge; glisse = null;
  if (!clic || !ed.outil) return;
  const [x, y] = ecranVersMonde(e.clientX, e.clientY);
  if (ed.outil === "d") {
    const cible = batimentSous(x, y), etat = document.getElementById("ed-etat");
    if (!cible) { etat.textContent = "Pas de bâtiment ici : cliquez sur un bâtiment (zoomez avec la molette)."; return; }
    const ll = demerc(x + ville.origine[0], y + ville.origine[1]).map((v) => +v.toFixed(6));
    quartiers.dates.push({ p: ll, an: Math.round(an) });
    etat.textContent = `Bâtiment daté de ${Math.round(an)}. Changez le curseur pour en dater un autre.`;
    enregistrerQuartiers(); appliquerQuartiers(); listeEdition(); return;
  }
  ed.pts.push([x, y]); sale = true; planifier();
});
cv.addEventListener("dblclick", () => { if (edition && (ed.outil === "z" || ed.outil === "b")) { ed.pts.pop(); terminerDessin(); } });
cv.addEventListener("wheel", (e) => {
  if (!edition) return; e.preventDefault();
  const [mx, my] = ecranVersMonde(e.clientX, e.clientY), f = Math.exp(e.deltaY * 0.0012), span = Math.max(150, Math.min(60000, cam.span * f));
  const k = span / cam.span; cam = { x: mx - (mx - cam.x) * k, y: my - (my - cam.y) * k, span }; sale = true; planifier();
}, { passive: false });
addEventListener("keydown", (e) => {
  if (!edition || e.target.matches?.("input,select,textarea")) return;
  if (e.key === "Enter" && (ed.outil === "z" || ed.outil === "b")) terminerDessin();
  else if (e.key === "Escape") { if (ed.outil) { ed.outil = null; ed.pts = []; cv.style.cursor = "grab"; sale = true; planifier(); } else entrerEdition(false); }
  else if (e.key === "Backspace" && ed.pts.length) { ed.pts.pop(); sale = true; planifier(); }
});
function dessinerEdition(P) {
  cx.save(); cx.lineJoin = "round"; cx.font = `600 ${Math.round(12 * dpr)}px "Segoe UI", system-ui, sans-serif`;
  quartiers.zones.forEach((z, i) => {
    const r = versM(z.zone); cx.beginPath(); trace(cx, r, true, cam);
    cx.fillStyle = ed.sel === "z" + i ? "rgba(200,87,42,.22)" : "rgba(200,87,42,.09)"; cx.fill();
    cx.setLineDash([8 * dpr, 5 * dpr]); cx.strokeStyle = "#c8572a"; cx.lineWidth = 1.6 * dpr; cx.stroke(); cx.setLineDash([]);
    const b = bornes(r); cx.fillStyle = P.texte; cx.textAlign = "center"; cx.fillText(`${z.nom || ""}  ${z.de ?? "?"}–${z.a ?? "?"}${z.detruit != null ? "  🔥" + z.detruit : ""}`, px((b[0] + b[2]) / 2), py((b[1] + b[3]) / 2));
  });
  quartiers.batiments.forEach((b, i) => {
    cx.beginPath(); trace(cx, versM(b.f), true, cam); cx.strokeStyle = ed.sel === "b" + i ? "#fff" : "#d1357a"; cx.lineWidth = 2 * dpr; cx.stroke();
  });
  for (const d of quartiers.dates || []) { const [x, y] = versM([d.p]); cx.beginPath(); cx.arc(px(x), py(y), 5 * dpr, 0, 6.3); cx.strokeStyle = "#c8572a"; cx.lineWidth = 1.6 * dpr; cx.stroke(); }
  if (ed.outil && ed.pts.length) {
    const p = ed.curseur ? ed.pts.concat([ed.curseur]) : ed.pts, f = new Float64Array(p.flat());
    cx.beginPath(); trace(cx, f, false, cam); cx.strokeStyle = "#c8572a"; cx.lineWidth = 2 * dpr; cx.stroke();
    cx.fillStyle = "#c8572a"; for (const [x, y] of ed.pts) { cx.beginPath(); cx.arc(px(x), py(y), 3.5 * dpr, 0, 6.3); cx.fill(); }
  }
  cx.restore();
}

/* ---- démarrage ---- */
Promise.all([
  fetch("../donnees/ville.json").then((r) => r.json()),
  fetch("../donnees/europe.json").then((r) => r.json()).catch(() => null),
  fetch("../donnees/quartiers.json").then((r) => r.ok ? r.json() : null).catch(() => null),
  fetch("../donnees/eau.json").then((r) => r.ok ? r.json() : null).catch(() => null),
  fetch("../donnees/croissance.json").then((r) => r.ok ? r.json() : null).catch(() => null),
  fetch("../donnees/zones_evenements.json").then((r) => r.ok ? r.json() : null).catch(() => null),
  fetch("../donnees/attributs_bati.json").then((r) => r.ok ? r.json() : null).catch(() => null)
]).then(([v, eu, q, eau, croissance, zev, attrs]) => {
  ville = v;
  ville.eauModerne = eau; ville.croissance = croissance; ville.zonesEv = zev?.zones || [];
  /* population, hauteur et type de chaque bâtiment (cartes d'analyse) */
  if (attrs) { ville.objets.forEach((o, i) => { if (attrs.objets[i]) o.att = attrs.objets[i]; }); ville.attParF = new Map(ville.fond.bati.map((f, i) => [f, attrs.bati[i]])); }
  if (eau) eau.salee = eau.salee.map((a) => lisserAnneau(a, 2, 2));      // l'eau vue par satellite sort d'une grille de 30 m : on adoucit les marches
  /* la mer d'autrefois : contours lissés (ils viennent d'une grille) */
  for (const m of ville.mer) m.f = m.f.map((a) => lisserAnneau(a, 3, 2));
  ville.objets0 = ville.objets; ville.bati0 = ville.fond.bati; ville.rues0 = ville.fond.rues;
  if (eu) {
    const o = ville.origine, pr = (ring) => { const r = new Array(ring.length); for (let i = 0; i < ring.length; i += 2) { const [x, y] = merc(ring[i], ring[i + 1]); r[i] = x - o[0]; r[i + 1] = y - o[1]; } return r; };
    europe = eu; for (const p of eu.pays) p.proj = p.p.map((poly) => poly.map(pr));
    eu.lacsProj = eu.lacs.flatMap((l) => l.p.map((poly) => poly.map(pr)));
  }
  let stock = null; try { stock = JSON.parse(localStorage.getItem("stockholm-quartiers") || "null"); } catch {}
  const brut = q && (q.zones?.length || q.batiments?.length || q.dates?.length || q.tout) ? q : stock || q || {};
  quartiers = { zones: brut.zones || [], batiments: brut.batiments || [], dates: brut.dates || [], tout: brut.tout || null };
  calculerSeche(); appliquerQuartiers(); preparerScenes(); dimensionner(); majDefilement(true); majGrands(); sale = true; planifier();
  setTimeout(preparerFondGlobal, 300);
}).catch(() => { elNote.textContent = "carte indisponible (donnees/ville.json)"; });
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { fondCache = null; setTimeout(preparerFondGlobal, 50); sale = true; planifier(); });
