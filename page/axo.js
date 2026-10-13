/* =====================================================================================
   L'axonométrie éclatée du site : les couches posées l'une sur l'autre se décollent quand on descend,
   puis on les parcourt une à une (celles du dessus se soulèvent). Survoler une couche ou son nom fait la même chose.
   Données : étude Topo de SiteScope (../donnees/topo/, 10 km autour du centre) + la ville (ville.json).
   ===================================================================================== */
const AXO_N = 1100;
const AXO_COUCHES = [
  { id: "relief", nom: "Relief", texte: "Un socle de granite raboté par les glaciers : plateaux, vallées et crêtes rocheuses (Södermalm, l'ancien Brunkebergsåsen). 91 m de dénivelé sur 10 km, la moitié du sol presque plate. Les crêtes ont longtemps empêché de bâtir ; on a construit dans les creux et au bord de l'eau." },
  { id: "eau", nom: "Eau et îles", texte: "Quatorze îles entre le lac Mälaren et la Baltique. L'eau découpe la ville en morceaux reliés par des ponts, et ses rives bougent : la terre remonte encore de quelques millimètres par an depuis la dernière glaciation, et les quais ont gagné sur l'eau." },
  { id: "bassins", nom: "Bassins versants", texte: "Les lignes de partage des eaux découpent le territoire en bassins : chacun envoie ses pluies vers le Mälaren ou vers la mer. Rues, égouts et parcs suivent ces pentes ; les points bas au bord de l'eau sont les premiers inondés." },
  { id: "vert", nom: "Végétation", texte: "Les espaces verts pénètrent jusqu'au centre (Djurgården, le parc national urbain). Souvent là où la roche rendait la construction difficile : la nature de Stockholm suit son relief." },
  { id: "rues", nom: "Rues et ponts", texte: "Ruelles tortueuses du Moyen Âge à Gamla Stan, grille régulière du XVIIe à Norrmalm, boulevards du plan Lindhagen (1866). Les ponts sont les passages obligés entre les îles : la ville se resserre autour d'eux." },
  { id: "bati", nom: "Bâti", texte: "Îlots fermés et serrés au centre, immeubles en barres et en tours dans le parc dans les banlieues du XXe siècle : la densité baisse à mesure qu'on s'éloigne de l'eau et du centre." },
  { id: "transports", nom: "Métro et trains", texte: "Le métro (1950) relie le centre aux villes ABC de banlieue (Vällingby, Farsta) : la ville s'est étendue le long de ses lignes, chaque station devenant un petit centre." }
];
const axoEtat = { pret: false, actif: -1, survol: -1, ecart: 0 };

async function preparerAxo() {
  const section = document.querySelector(".diapo.axo"); if (!section || !ville) return;
  const pile = section.querySelector(".axo-pile"), liste = section.querySelector(".axo-liste");
  const [lim, mer, plans, cours, bassins, partage, courbes] = await Promise.all(["limites.json", "mer.geojson", "plans_eau.geojson", "cours_eau_calcules.geojson", "bassins_versants.geojson", "lignes_partage_eaux.geojson", "courbes_niveau.geojson"]
    .map((f) => fetch("../donnees/topo/" + f).then((r) => r.json()).catch(() => null)));
  if (!lim) return;
  const [w, s, e, n] = lim.limites, [mx0, my0] = merc(w, s), [mx1, my1] = merc(e, n), o = ville.origine;
  const X = (mx) => (mx - mx0) / (mx1 - mx0) * AXO_N, Y = (my) => (my1 - my) / (my1 - my0) * AXO_N;
  const traceLL = (g, c, ferme) => { c.forEach(([lo, la], i) => { const [mx, my] = merc(lo, la); i ? g.lineTo(X(mx), Y(my)) : g.moveTo(X(mx), Y(my)); }); if (ferme) g.closePath(); };
  const traceM = (g, a, ferme) => { for (let i = 0; i < a.length; i += 2) { const x = X(a[i] + o[0]), y = Y(a[i + 1] + o[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); } if (ferme) g.closePath(); };
  const geo = (g, fc, ferme) => { for (const f of fc?.features || []) { const t = f.geometry?.type, c = f.geometry?.coordinates; if (!c) continue;
    if (t === "Polygon") c.forEach((r) => traceLL(g, r, true)); else if (t === "MultiPolygon") c.forEach((p) => p.forEach((r) => traceLL(g, r, true)));
    else if (t === "LineString") traceLL(g, c, ferme); else if (t === "MultiLineString") c.forEach((l) => traceLL(g, l, ferme)); } };
  const image = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  const [relief, ombre] = await Promise.all([image("../donnees/topo/relief_mnt.png"), image("../donnees/topo/ombrage.png")]);
  const tous = ville.objets0.concat(ville.objets.filter((x) => !ville.objets0.includes(x)));

  const dessins = {
    relief(g) {
      g.fillStyle = "#e9e3d3"; g.fillRect(0, 0, AXO_N, AXO_N);
      if (relief) g.drawImage(relief, 0, 0, AXO_N, AXO_N);
      if (ombre) { g.globalCompositeOperation = "multiply"; g.globalAlpha = 0.75; g.drawImage(ombre, 0, 0, AXO_N, AXO_N); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; }
      g.strokeStyle = "rgba(60,45,30,.45)"; g.lineWidth = 0.8;
      for (const f of courbes?.features || []) { g.lineWidth = f.properties.p ? 1.3 : 0.6; g.beginPath(); geo(g, { features: [f] }, false); g.stroke(); }
    },
    eau(g) {
      g.fillStyle = "#4f95c2"; g.beginPath(); geo(g, mer, true); geo(g, plans, true); g.fill("evenodd");
      g.beginPath(); for (const f of ville.fond.eau) for (const a of f) traceM(g, a, true); g.fill();
      g.strokeStyle = "#4f95c2"; g.lineWidth = 1.4; g.beginPath(); geo(g, cours, false); g.stroke();
    },
    bassins(g) {
      const teintes = ["#e7c46a", "#9fc59a", "#d79a7c", "#8fb3d1", "#c6a3cf", "#b8c477", "#e0a1a8", "#86c4b8", "#d3b48c", "#a7a6d9"];
      (bassins?.features || []).forEach((f, i) => { g.globalAlpha = 0.55; g.fillStyle = teintes[i % teintes.length]; g.beginPath(); geo(g, { features: [f] }, true); g.fill(); });
      g.globalAlpha = 1; g.strokeStyle = "#5a2d1a"; g.lineWidth = 2.4; g.setLineDash([10, 6]); g.beginPath(); geo(g, partage, false); g.stroke(); g.setLineDash([]);
    },
    vert(g) { g.fillStyle = "#5f9b55"; g.beginPath(); for (const v of ville.fond.vert) for (const a of v) traceM(g, a, true); for (const x of tous) if (x.g === "espaces" && x.k === "poly") for (const a of x.f) traceM(g, a, true); g.fill(); },
    rues(g) {
      g.strokeStyle = "#6e665a"; g.lineCap = g.lineJoin = "round";
      for (const w of [1, 2, 3, 4]) {
        g.lineWidth = w * 0.7; g.beginPath();
        for (const r of ville.rues0) if (Math.min(4, Math.max(1, Math.round(r.w))) === w) for (const a of r.f) traceM(g, a, false);
        for (const x of tous) if (x.g === "voirie" && Math.min(4, Math.max(1, Math.round(x.w || 1))) === w) for (const a of x.f) traceM(g, a, false);
        g.stroke();
      }
      g.strokeStyle = "#1d1c1a"; g.lineWidth = 3; g.beginPath(); for (const x of tous) if (x.g === "ponts" && x.k === "ligne") for (const a of x.f) traceM(g, a, false); g.stroke();
    },
    bati(g) { g.fillStyle = "#b5532f"; g.beginPath(); for (const f of ville.bati0) for (const a of f) traceM(g, a, true); for (const x of tous) if ((x.g === "bati" || x.g === "monument") && x.k === "poly") for (const a of x.f) traceM(g, a, true); g.fill(); },
    transports(g) { g.lineCap = g.lineJoin = "round"; for (const x of tous) { if (x.g !== "lignes" || x.k !== "ligne") continue; g.strokeStyle = x.couleur || "#2f6f8f"; g.lineWidth = 4; g.beginPath(); for (const a of x.f) traceM(g, a, false); g.stroke(); } }
  };

  pile.innerHTML = ""; liste.innerHTML = "";
  AXO_COUCHES.forEach((c, i) => {
    const d = document.createElement("div"); d.className = "axo-couche" + (i === 0 ? " socle" : ""); d.dataset.i = i; d.style.setProperty("--i", i);
    const cnv = document.createElement("canvas"); cnv.width = cnv.height = AXO_N; d.appendChild(cnv);
    const et = document.createElement("span"); et.className = "axo-etiquette"; et.textContent = c.nom; d.appendChild(et);
    pile.appendChild(d);
    try { dessins[c.id](cnv.getContext("2d")); } catch (err) { console.warn("axo", c.id, err); }
    const li = document.createElement("li"); li.dataset.i = i; li.innerHTML = `<b>${c.nom}</b><p>${c.texte}</p>`; liste.appendChild(li);
  });
  const survol = (i) => { axoEtat.survol = i; majAxo(); };
  pile.addEventListener("pointerover", (ev) => { const d = ev.target.closest(".axo-couche"); if (d) survol(+d.dataset.i); });
  pile.addEventListener("pointerleave", () => survol(-1));
  liste.addEventListener("pointerover", (ev) => { const l = ev.target.closest("li"); if (l) survol(+l.dataset.i); });
  liste.addEventListener("pointerleave", () => survol(-1));
  section.querySelector(".axo-source").textContent = `Sources : ${lim.source} ; OpenStreetMap ; SiteScope. Zone : ${((mx1 - mx0) / 1000 / (1 / Math.cos(59.33 * Math.PI / 180))).toFixed(0)} km de côté.`;
  axoEtat.pret = true; majAxo();
}

/* Défilement : 0-15 % les couches se décollent, puis on monte d'une couche à l'autre. Survol = prioritaire. */
function majAxo() {
  const section = document.querySelector(".diapo.axo"); if (!section || !axoEtat.pret) return;
  const n = AXO_COUCHES.length, diapo = enDiapo();
  let p = 0.6;
  if (!diapo) {
    section.style.height = (innerHeight * (1.4 + n * 0.45)) + "px";
    p = borne01((scrollY - section.offsetTop) / (section.offsetHeight - innerHeight));
  }
  const ecart = diapo ? 1 : lisse(borne01(p / 0.15));
  const actifDefil = !diapo && p > 0.15 ? Math.min(n - 1, Math.floor((p - 0.15) / 0.85 * n)) : -1;
  const actif = axoEtat.survol >= 0 ? axoEtat.survol : actifDefil;
  section.querySelector(".axo-pile").style.setProperty("--ecart", (ecart * 46).toFixed(1) + "px");
  section.querySelectorAll(".axo-couche").forEach((d, i) => {
    d.style.setProperty("--leve", actif >= 0 && i > actif ? "230px" : "0px");
    d.classList.toggle("actif", i === actif); d.classList.toggle("estompe", actif >= 0 && i > actif);
  });
  section.querySelectorAll(".axo-liste li").forEach((l, i) => l.classList.toggle("actif", i === actif));
}
addEventListener("scroll", () => { if (!enDiapo()) majAxo(); }, { passive: true });
addEventListener("resize", () => majAxo());
/* préparé quand la ville est chargée */
(function attendre() { if (ville && ville.objets0) preparerAxo(); else setTimeout(attendre, 300); })();
