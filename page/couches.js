/* =====================================================================================
   Couches qu'on allume sur la carte : la densité bâtie (à l'année affichée) et les cartes anciennes calées.
   Dépend de carte.js. Cartes anciennes : ../donnees/cartes_anciennes.json
   [{ "an": 1750, "titre": "…", "image": "../donnees/cartes/1750.jpg", "bornes": [ouest, sud, est, nord] (degrés), "source": "…" }]
   (image déjà reprojetée en Web Mercator, alignée nord-sud : voir outils/caler_carte.py).
   ===================================================================================== */
let densiteOn = false, cartesOn = true, cartesAnciennes = [];
const barre = document.querySelector(".an-barre");
const bDens = document.createElement("button"); bDens.type = "button"; bDens.className = "an-bouton"; bDens.textContent = "▦"; bDens.title = "Densité bâtie (emprise au sol) à l'année affichée";
const bCartes = document.createElement("button"); bCartes.type = "button"; bCartes.className = "an-bouton actif"; bCartes.textContent = "🗺"; bCartes.title = "Cartes anciennes calées sur la carte"; bCartes.hidden = true;
barre.insertBefore(bCartes, document.getElementById("an-editer")); barre.insertBefore(bDens, bCartes);
const legende = document.createElement("div"); legende.className = "legende-carte"; legende.hidden = true;
document.getElementById("carte-bloc").appendChild(legende);
bDens.onclick = () => { densiteOn = !densiteOn; bDens.classList.toggle("actif", densiteOn); sale = true; planifier(); };
bCartes.onclick = () => { cartesOn = !cartesOn; bCartes.classList.toggle("actif", cartesOn); sale = true; planifier(); };

/* ---- densité : part de chaque carré couverte par des bâtiments debout à l'année affichée ---- */
const RAMPE_D = [[0.03, "#fbe7a1"], [0.12, "#f6b25e"], [0.25, "#e0572b"], [0.4, "#a8251b"], [1, "#5e0e0e"]];
const aireAnneau = (r) => { let s = 0; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) s += (r[j] + r[i]) * (r[j + 1] - r[i + 1]); return Math.abs(s / 2); };
function dessinerDensite(P) {
  if (!densiteOn || cam.span > 60000) {
    legende.hidden = !legende.dataset.carte;
    if (legende.dataset.carte) { const h = `<span class="source">${legende.dataset.carte}</span>`; if (legende._h !== h) legende.innerHTML = legende._h = h; }
    return;
  }
  const cote = cam.span > 15000 ? 500 : cam.span > 4000 ? 250 : 100, cellules = new Map();
  const ajouter = (f, o) => {
    const a = f[0], b = lie(a), x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2;
    const k = Math.floor(x / cote) + "," + Math.floor(y / cote);
    cellules.set(k, (cellules.get(k) || 0) + (o ? (o.aire ??= aireAnneau(a)) : (a.aire ??= aireAnneau(a))));
  };
  for (const o of ville.objets) {
    if (o.an > an) break;
    if ((o.g !== "bati" && o.g !== "monument") || o.k !== "poly" || !o.f.length) continue;
    if (o.fin != null && an > o.fin && (o.brule || o.g === "monument")) continue;
    ajouter(o.f, o);
  }
  if (an >= ANNEE_MAX - 1) for (const f of ville.fond.bati) ajouter(f, null);     // aujourd'hui : aussi les bâtiments sans date
  const S = cv.width / cam.span, aire = cote * cote, top = [];
  cx.save();
  for (const [k, v] of cellules) {
    const [i, j] = k.split(",").map(Number), ces = v / aire; if (ces < 0.03) continue;
    const x0 = px(i * cote), y0 = py((j + 1) * cote), t = cote * S;
    if (x0 > cv.width || y0 > cv.height || x0 + t < 0 || y0 + t < 0) continue;
    cx.globalAlpha = 0.62; cx.fillStyle = RAMPE_D.find(([s]) => ces < s)?.[1] || RAMPE_D[RAMPE_D.length - 1][1];
    cx.fillRect(x0, y0, t + 0.5, t + 0.5);
    if (t > 34 * dpr) top.push([ces, x0 + t / 2, y0 + t / 2]);
  }
  /* les centres les plus denses, chiffrés */
  cx.globalAlpha = 1; cx.font = `700 ${Math.round(11 * dpr)}px "Segoe UI", system-ui, sans-serif`; cx.textAlign = "center"; cx.textBaseline = "middle";
  top.sort((a, b) => b[0] - a[0]).slice(0, 6).forEach(([ces, x, y]) => { cx.lineWidth = 3 * dpr; cx.strokeStyle = "#fff"; cx.fillStyle = "#3a0b0b"; const t = Math.round(ces * 100) + " %"; cx.strokeText(t, x, y); cx.fillText(t, x, y); });
  cx.restore();
  legende.hidden = false;
  const html = `<b>Densité bâtie en ${Math.round(an)}</b><span>part du sol couverte par des bâtiments, carrés de ${cote} m</span>
    <div class="rampe">${RAMPE_D.map(([s, c], i) => `<i style="background:${c}"></i><em>${i === 0 ? "3" : Math.round(RAMPE_D[i - 1][0] * 100)}–${s < 1 ? Math.round(s * 100) : "+"}</em>`).join("")}</div>
    ${legende.dataset.carte ? `<span class="source">${legende.dataset.carte}</span>` : ""}`;
  if (legende._h !== html) legende.innerHTML = legende._h = html;       // réécrit seulement si le texte change
}

/* ---- cartes anciennes : la plus récente avant l'année affichée, posée exactement à sa place ---- */
function dessinerCartesAnciennes(P) {
  delete legende.dataset.carte;
  if (!cartesOn || !cartesAnciennes.length || cam.span > 80000) return;
  const avant = cartesAnciennes.filter((c) => c.an <= an + 0.5); if (!avant.length) return;
  const c = avant[avant.length - 1], ecart = an - c.an;
  const alpha = 0.92 * (1 - borne01((ecart - 25) / 50));                    // s'efface quand on s'éloigne de sa date
  if (alpha <= 0.02) return;
  if (!c.img) { c.img = new Image(); c.img.onload = () => { sale = true; planifier(); }; c.img.src = c.image; return; }
  if (!c.img.complete || !c.img.naturalWidth) return;
  const o = ville.origine, [x0, y1] = merc(c.bornes[0], c.bornes[3]), [x1, y0] = merc(c.bornes[2], c.bornes[1]);
  const X = px(x0 - o[0]), Y = py(y1 - o[1]), W = px(x1 - o[0]) - X, H = py(y0 - o[1]) - Y;
  cx.save(); cx.globalAlpha = alpha; cx.drawImage(c.img, X, Y, W, H); cx.restore();
  legende.dataset.carte = `Carte de ${c.an} — ${c.titre}${c.source ? " (" + c.source + ")" : ""}`;
}

fetch("../donnees/cartes_anciennes.json").then((r) => r.ok ? r.json() : []).then((l) => {
  cartesAnciennes = (Array.isArray(l) ? l : l.cartes || []).filter((c) => c.image && c.bornes?.length === 4).sort((a, b) => a.an - b.an);
  bCartes.hidden = !cartesAnciennes.length; sale = true; planifier();
}).catch(() => {});
