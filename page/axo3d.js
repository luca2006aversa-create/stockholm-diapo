/* =====================================================================================
   L'axonométrie éclatée du site en VRAIE 3D : chaque couche est une plaque qui suit le relief (FABDEM, 30 m, relief ×6).
   Le défilement décolle les plaques puis les parcourt une à une (celles du dessus se soulèvent).
   Un CLIC sur une plaque la met en grand : les autres partent vers le haut et vers le bas ; un second clic les ramène.
   Données : ../donnees/topo/ (étude Topo SiteScope de 10 km : relief, satellite, bassins versants) + ville.json.
   ===================================================================================== */
import * as THREE from "./lib/three.module.js";

const COUCHES = [   // de bas en haut
  { id: "eau", nom: "Eau et îles", texte: "Quatorze îles entre le lac Mälaren (eau douce, en clair) et la Baltique (eau salée, plus foncée). L'eau découpe la ville en morceaux reliés par des ponts ; la terre remonte encore de quelques millimètres par an depuis la dernière glaciation." },
  { id: "relief", nom: "Relief", texte: "Un socle de granite raboté par les glaciers : plateaux, vallées, crêtes rocheuses (Södermalm, l'ancien Brunkebergsåsen). 91 m de dénivelé sur 10 km, la moitié du sol presque plate. Les crêtes ont longtemps empêché de bâtir : la ville s'est d'abord glissée dans les creux et au bord de l'eau." },
  { id: "bassins", nom: "Bassins versants", texte: "Les lignes de partage des eaux (en pointillé) découpent le territoire en bassins : chacun envoie ses pluies vers le Mälaren ou vers la mer. Rues, égouts et parcs suivent ces pentes ; les points bas au bord de l'eau sont les premiers inondés." },
  { id: "vert", nom: "Végétation", texte: "Forêts, parcs et coins verts pénètrent jusqu'au centre (Djurgården, le parc national urbain), souvent là où la roche rendait la construction difficile : la nature de Stockholm suit son relief." },
  { id: "satellite", nom: "Vue satellite", texte: "Les éléments géographiques structurants vus du ciel : l'eau, les îles, les forêts, et la ville qui s'est installée entre eux." }
];
const EXAG = 6;
const etat = { pret: false, focus: -1, sale: true, p: 0 };
let renderer, scene, camera, plaques = [], etiquettes = [], S, SIDE, cible = null, courant = null, tPrec = 0;

async function construire() {
  const section = document.querySelector(".diapo.axo"); if (!section || !ville) return;
  const zone = section.querySelector(".axo-scene"), liste = section.querySelector(".axo-liste");
  const base = "../donnees/topo/";
  const [scn, aff, mer, plans, cours, bassins, partage, eauJ] = await Promise.all([
    "3d/scene.json", "3d/affine.json", "mer.geojson", "plans_eau.geojson", "cours_eau_calcules.geojson", "bassins_versants.geojson", "lignes_partage_eaux.geojson", "../eau.json"
  ].map((f) => fetch(base + f).then((r) => r.json()).catch(() => null)));
  if (!scn || !aff) return;
  S = scn; const [EX0, EY0, EX1, EY1] = S.etendue; SIDE = Math.max(EX1 - EX0, EY1 - EY0);
  const Z = new Float32Array(await fetch(base + "3d/mnt.f32").then((r) => r.arrayBuffer()));
  const A = aff.affine, o = ville.origine;
  /* Mercator (repère de la ville) → repère de la scène (SWEREF 99, mètres) : transformation affine calée sur 81 points, écart ≤ 10 m */
  const versScene = (x, y) => [A[0] * x + A[1] * y + A[2], A[3] * x + A[4] * y + A[5]];
  const N = 1400, cx2 = (X) => (X - EX0) / (EX1 - EX0) * N, cy2 = (Y) => (EY1 - Y) / (EY1 - EY0) * N;
  const traceLocal = (g, a, ferme) => { for (let i = 0; i < a.length; i += 2) { const [X, Y] = versScene(a[i], a[i + 1]); i ? g.lineTo(cx2(X), cy2(Y)) : g.moveTo(cx2(X), cy2(Y)); } if (ferme) g.closePath(); };
  const traceLL = (g, c, ferme) => { c.forEach(([lo, la], i) => { const [mx, my] = merc(lo, la), [X, Y] = versScene(mx - o[0], my - o[1]); i ? g.lineTo(cx2(X), cy2(Y)) : g.moveTo(cx2(X), cy2(Y)); }); if (ferme) g.closePath(); };
  const geo = (g, fc, ferme) => { for (const f of fc?.features || []) { const t = f.geometry?.type, c = f.geometry?.coordinates; if (!c) continue;
    if (t === "Polygon") c.forEach((r) => traceLL(g, r, true)); else if (t === "MultiPolygon") c.forEach((p) => p.forEach((r) => traceLL(g, r, true)));
    else if (t === "LineString") traceLL(g, c, ferme); else if (t === "MultiLineString") c.forEach((l) => traceLL(g, l, ferme)); } };
  const toile = (dessin) => { const c = document.createElement("canvas"); c.width = c.height = N; const g = c.getContext("2d"); g.fillStyle = "#f1ece0"; g.fillRect(0, 0, N, N); dessin(g); return new THREE.CanvasTexture(c); };
  const eauSurToile = (g) => {
    if (eauJ) { g.fillStyle = "#6ea8cf"; g.beginPath(); for (const a of eauJ.salee) traceLocal(g, a, true); g.fill("evenodd");
      g.fillStyle = "#8cc2de"; g.beginPath(); for (const a of eauJ.douce) traceLocal(g, a, true); g.fill("evenodd"); }
    g.fillStyle = "#6ea8cf"; g.beginPath(); geo(g, mer, true); g.fill("evenodd");
  };
  const chargeur = new THREE.TextureLoader();
  const charger = (f) => new Promise((ok) => chargeur.load(base + f, ok, undefined, () => ok(null)));
  const [texRelief, texSat] = await Promise.all([charger("3d/tex_relief.png"), charger("3d/tex_satellite.jpg")]);
  const textures = {
    eau: toile((g) => { eauSurToile(g); g.strokeStyle = "#5b98c4"; g.lineWidth = 1.6; g.beginPath(); geo(g, cours, false); g.stroke(); }),
    relief: texRelief,
    bassins: toile((g) => {
      const teintes = ["#e7c46a", "#9fc59a", "#d79a7c", "#8fb3d1", "#c6a3cf", "#b8c477", "#e0a1a8", "#86c4b8", "#d3b48c", "#a7a6d9"];
      (bassins?.features || []).forEach((f, i) => { g.globalAlpha = 0.7; g.fillStyle = teintes[i % teintes.length]; g.beginPath(); geo(g, { features: [f] }, true); g.fill(); });
      g.globalAlpha = 1; eauSurToile(g);
      g.strokeStyle = "#5a2d1a"; g.lineWidth = 3.2; g.setLineDash([12, 8]); g.beginPath(); geo(g, partage, false); g.stroke(); g.setLineDash([]);
    }),
    vert: toile((g) => {
      eauSurToile(g); g.fillStyle = "#5f9b55"; g.beginPath();
      for (const v of ville.fond.vert || []) for (const a of v) traceLocal(g, a, true);
      for (const x of ville.objets0 || []) if (x.g === "espaces" && x.k === "poly") for (const a of x.f) traceLocal(g, a, true);
      g.fill();
    }),
    satellite: texSat
  };
  for (const t of Object.values(textures)) if (t) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }

  /* le relief : une grille qui suit l'altitude, partagée par toutes les plaques */
  const W = S.largeur, H = S.hauteur, CELL = S.maille_m, pas = 2, w2 = Math.floor((W - 1) / pas) + 1, h2 = Math.floor((H - 1) / pas) + 1;
  const pos = new Float32Array(w2 * h2 * 3), uv = new Float32Array(w2 * h2 * 2);
  for (let i = 0; i < h2; i++) for (let j = 0; j < w2; j++) {
    const I = Math.min(H - 1, i * pas), J = Math.min(W - 1, j * pas), k = i * w2 + j, z = Z[I * W + J];
    pos[k * 3] = S.x0 + (J + 0.5) * CELL; pos[k * 3 + 1] = (z - S.zmin) * EXAG; pos[k * 3 + 2] = -(S.y0 - (I + 0.5) * CELL);
    uv[k * 2] = (J + 0.5) / W; uv[k * 2 + 1] = 1 - (I + 0.5) / H;
  }
  const idx = new Uint32Array((w2 - 1) * (h2 - 1) * 6); let n = 0;
  for (let i = 0; i < h2 - 1; i++) for (let j = 0; j < w2 - 1; j++) { const a = i * w2 + j, b = a + 1, c = a + w2, d = c + 1; idx.set([a, c, b, b, c, d], n); n += 6; }
  const grille = new THREE.BufferGeometry();
  grille.setAttribute("position", new THREE.BufferAttribute(pos, 3)); grille.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); grille.setIndex(new THREE.BufferAttribute(idx, 1));
  grille.computeVertexNormals();
  /* fil de fer pour la plaque de l'eau (comme une maquette filaire), une ligne sur 4 */
  const fil = []; const P = (i, j) => { const k = i * w2 + j; return [pos[k * 3], pos[k * 3 + 1] + 4, pos[k * 3 + 2]]; };
  for (let i = 0; i < h2; i += 4) for (let j = 0; j < w2 - 1; j++) fil.push(...P(i, j), ...P(i, j + 1));
  for (let j = 0; j < w2; j += 4) for (let i = 0; i < h2 - 1; i++) fil.push(...P(i, j), ...P(i + 1, j));
  const filGeo = new THREE.BufferGeometry(); filGeo.setAttribute("position", new THREE.Float32BufferAttribute(fil, 3));

  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#8a8070", 2.2));
  const sol = new THREE.DirectionalLight("#ffffff", 1.4); sol.position.set(-SIDE, SIDE, SIDE * 0.6); scene.add(sol);
  plaques = COUCHES.map((c, i) => {
    const grp = new THREE.Group();
    const mat = c.id === "satellite" || c.id === "relief"
      ? new THREE.MeshBasicMaterial({ map: textures[c.id], transparent: true })
      : new THREE.MeshLambertMaterial({ map: textures[c.id], transparent: true });
    const m = new THREE.Mesh(grille, mat); m.userData.i = i; grp.add(m);
    if (c.id === "eau") grp.add(new THREE.LineSegments(filGeo, new THREE.LineBasicMaterial({ color: "#3d4a55", transparent: true, opacity: 0.45 })));
    /* bord de la plaque : un trait sombre, pour qu'on lise bien chaque couche */
    const bord = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(EX1 - EX0, 1, EY1 - EY0)), new THREE.LineBasicMaterial({ color: "#2a2620", transparent: true, opacity: 0.6 }));
    bord.position.set((EX0 + EX1) / 2, 0, -(EY0 + EY1) / 2); grp.add(bord);
    scene.add(grp);
    return { grp, mat, mesh: m };
  });

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  zone.innerHTML = ""; zone.appendChild(renderer.domElement);
  const calque = document.createElement("div"); calque.className = "axo-etiquettes"; zone.appendChild(calque);
  const note = document.createElement("div"); note.className = "axo-note"; zone.appendChild(note);
  etiquettes = COUCHES.map((c) => { const e = document.createElement("span"); e.className = "axo-etiquette3d"; e.textContent = c.nom; calque.appendChild(e); return e; });
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -SIDE * 20, SIDE * 20);
  liste.innerHTML = COUCHES.map((c, i) => `<li data-i="${i}"><b>${c.nom}</b><p>${c.texte}</p></li>`).join("");
  section.querySelector(".axo-source").textContent = `Sources : ${S.relief?.libelle || "FABDEM"} (relief ×${EXAG}) ; eau : satellite JRC et OpenStreetMap ; bassins versants calculés par SiteScope ; satellite Esri. Carré de 10 km autour du centre.`;

  /* clic : une plaque en grand, les autres s'écartent ; second clic : retour */
  const ray = new THREE.Raycaster(), souris = new THREE.Vector2();
  renderer.domElement.addEventListener("click", (ev) => {
    if (etat.focus >= 0) { etat.focus = -1; etat.sale = true; return; }
    const r = renderer.domElement.getBoundingClientRect();
    souris.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(souris, camera);
    const touche = ray.intersectObjects(plaques.map((p) => p.mesh).filter((m) => m.material.opacity > 0.5), false)[0];
    if (touche) {
      etat.focus = touche.object.userData.i; etat.sale = true;
      const c = COUCHES[etat.focus]; note.innerHTML = `<b>${c.nom}</b>${c.texte}<small>Cliquez de nouveau pour revenir.</small>`;
    }
  });
  renderer.domElement.style.cursor = "pointer";
  dimensionner3d(); etat.pret = true; boucle(performance.now());
}

function dimensionner3d() {
  if (!renderer) return;
  const z = renderer.domElement.parentElement, w = z.clientWidth || 600, h = z.clientHeight || 500;
  renderer.setSize(w, h, false); renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
  etat.aspect = w / h; etat.sale = true;
}

/* Les cibles d'après le défilement et le clic ; l'image rejoint les cibles en douceur. */
function cibles() {
  const section = document.querySelector(".diapo.axo"), n = COUCHES.length, diapo = enDiapo(), cadre = section.querySelector(".axo-cadre");
  let p = 0.55;
  if (!diapo) {
    section.style.height = (innerHeight * (1.6 + n * 0.5)) + "px"; p = borne01((scrollY - section.offsetTop) / (section.offsetHeight - innerHeight));
    /* fondu d'entrée et de sortie : le fond fonce d'abord sur la carte, puis les plaques apparaissent ; à la sortie, l'inverse */
    const R = section.getBoundingClientRect(), H = innerHeight, entree = (H - R.top) / H, sortie = R.bottom / H;
    const fond = Math.min(borne01(entree / 0.65), borne01((sortie - 0.05) / 0.6)), contenu = Math.min(borne01((entree - 0.45) / 0.5), borne01((sortie - 0.5) / 0.45));
    cadre.style.setProperty("--fond", fond.toFixed(3)); cadre.style.setProperty("--contenu", contenu.toFixed(3));
    cadre.classList.toggle("cache", fond <= 0.001);
    if (fond <= 0.001 && etat.focus >= 0) etat.focus = -1;
  } else { cadre.style.setProperty("--fond", 1); cadre.style.setProperty("--contenu", 1); cadre.classList.remove("cache"); }
  const ecart = SIDE * 0.17 * lisse(borne01(p / 0.15));
  const actif = etat.focus >= 0 ? etat.focus : !diapo && p > 0.15 ? Math.min(n - 1, Math.floor((p - 0.15) / 0.85 * n)) : -1;
  const y = COUCHES.map((c, i) => {
    let v = i * ecart;
    if (etat.focus >= 0) v = i === etat.focus ? 0 : (i > etat.focus ? 1 : -1) * SIDE * 3 + (i - etat.focus) * SIDE * 0.2;
    else if (actif >= 0 && i > actif) v += SIDE * 0.32;
    return v;
  });
  const op = COUCHES.map((c, i) => etat.focus >= 0 ? (i === etat.focus ? 1 : 0) : actif >= 0 && i > actif ? 0.14 : 1);
  const centreY = etat.focus >= 0 ? 0 : (n - 1) * ecart / 2 + (actif >= 0 && actif < n - 1 ? SIDE * 0.12 : 0);
  const zoom = etat.focus >= 0 ? 1.75 : 1;
  section.querySelectorAll(".axo-liste li").forEach((l, i) => l.classList.toggle("actif", i === actif));
  section.classList.toggle("axo-focus", etat.focus >= 0);
  return { y, op, centreY, zoom };
}

function boucle(t) {
  if (!etat.pret) return;
  const dt = Math.min(0.1, (t - tPrec) / 1000 || 0.016); tPrec = t;
  cible = cibles();
  if (!courant) courant = JSON.parse(JSON.stringify(cible));
  const k = 1 - Math.exp(-dt / 0.16); let bouge = false;
  const suivre = (a, b) => { const v = a + (b - a) * k; if (Math.abs(b - v) > Math.abs(b) * 1e-4 + 0.5) bouge = true; return Math.abs(b - v) < 0.5 ? b : v; };
  courant.y = courant.y.map((v, i) => suivre(v, cible.y[i]));
  courant.op = courant.op.map((v, i) => { const r = v + (cible.op[i] - v) * k; if (Math.abs(cible.op[i] - r) > 0.01) bouge = true; return Math.abs(cible.op[i] - r) < 0.01 ? cible.op[i] : r; });
  courant.centreY = suivre(courant.centreY, cible.centreY);
  courant.zoom = courant.zoom + (cible.zoom - courant.zoom) * k; if (Math.abs(cible.zoom - courant.zoom) > 0.002) bouge = true;
  const z = renderer.domElement.parentElement;
  if (z.clientWidth && Math.abs(z.clientWidth - renderer.domElement.clientWidth) > 1) dimensionner3d();
  if (bouge || etat.sale) { rendre3d(); etat.sale = false; }
  if (!window.__sansRaf) requestAnimationFrame(boucle);      // __sansRaf : pour les tests, quand le navigateur est masqué
}
window.__axoPas = (t) => boucle(t);

function rendre3d() {
  const [EX0, EY0, EX1, EY1] = S.etendue, cxs = (EX0 + EX1) / 2, czs = -(EY0 + EY1) / 2;
  plaques.forEach((p, i) => {
    p.grp.position.y = courant.y[i]; p.mat.opacity = courant.op[i]; p.grp.visible = courant.op[i] > 0.02;
    p.grp.children.forEach((c) => { if (c.material && c !== p.mesh) c.material.opacity = (c.isLineSegments ? 0.5 : 1) * courant.op[i]; });
  });
  /* caméra axonométrique : 40° d'azimut, 34° au-dessus de l'horizon */
  const az = THREE.MathUtils.degToRad(-40), el = THREE.MathUtils.degToRad(34), d = SIDE * 4;
  const c = new THREE.Vector3(cxs, courant.centreY, czs);
  camera.position.set(c.x + d * Math.cos(el) * Math.sin(az), c.y + d * Math.sin(el), c.z + d * Math.cos(el) * Math.cos(az));
  camera.lookAt(c);
  const demi = SIDE * 0.62 / courant.zoom, a = etat.aspect || 1.4;
  camera.left = -demi * a; camera.right = demi * a; camera.top = demi; camera.bottom = -demi; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  /* étiquettes : à gauche de chaque plaque */
  const z = renderer.domElement, w = z.clientWidth, h = z.clientHeight;
  let dernierY = -1e9;
  [...plaques.keys()].reverse().forEach((i) => {           // du haut vers le bas : plaques collées → on lit le nom du dessus
    const e = etiquettes[i];
    let best = null;
    for (const [X, Y] of [[EX0, EY0], [EX0, EY1], [EX1, EY0], [EX1, EY1]]) {
      const v = new THREE.Vector3(X, courant.y[i] + 20, -Y).project(camera); const sx = (v.x + 1) / 2 * w, sy = (1 - v.y) / 2 * h;
      if (!best || sx < best[0]) best = [sx, sy];
    }
    e.style.transform = `translate(10px, ${best[1].toFixed(0)}px) translateY(-100%)`; e.style.width = Math.max(40, best[0] - 18).toFixed(0) + "px";
    /* jamais deux noms l'un sur l'autre : quand les plaques sont collées, on n'en montre qu'un ; en grand, seulement celui de la plaque */
    const libre = Math.abs(best[1] - dernierY) > 26, montre = etat.focus >= 0 ? false : courant.op[i] > 0.5 && libre;
    e.style.opacity = montre ? 1 : 0; if (montre) dernierY = best[1];
    e.classList.toggle("actif", etat.focus === i || (etat.focus < 0 && document.querySelectorAll(".axo-liste li")[i]?.classList.contains("actif")));
  });
}

addEventListener("resize", () => { dimensionner3d(); });
addEventListener("scroll", () => { etat.sale = true; }, { passive: true });
(function attendre() { if (typeof ville !== "undefined" && ville && ville.objets0) construire(); else setTimeout(attendre, 300); })();
