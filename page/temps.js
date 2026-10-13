/* =====================================================================================
   La frise chronologique sous la carte : phases colorées, courbe de la ville bâtie, traits des événements.
   Données : ../donnees/chronologie.json. Dépend de carte.js (an, ville, libre, lecture, rendre…).
   ===================================================================================== */
const FRISE_W = 1000, FRISE_H = 64, FRISE_PAD = 6;
const COULEURS_EVENEMENTS = { incendie: "#e0301c", plan: "#3f6fb0", infrastructure: "#2f8f8a", economie: "#c99a20", politique: "#7a5c9e", demolition: "#8a3a2a", autre: "#7d776c" };
const NOMS_TYPES = { incendie: "incendie", plan: "plan d'urbanisme", infrastructure: "infrastructure", economie: "économie", politique: "politique", demolition: "démolition", autre: "autre" };
let chrono = { phases: [], evenements: [] }, courbe = null;

/* L'échelle n'est pas linéaire : le Moyen Âge est tassé, les deux derniers siècles ont plus de place. */
const xAn = (y) => FRISE_PAD + (FRISE_W - 2 * FRISE_PAD) * Math.pow(borne01((y - ANNEE_MIN) / (ANNEE_MAX - ANNEE_MIN)), 1.55);
const anX = (x) => ANNEE_MIN + (ANNEE_MAX - ANNEE_MIN) * Math.pow(borne01((x - FRISE_PAD) / (FRISE_W - 2 * FRISE_PAD)), 1 / 1.55);

const blocFrise = document.createElement("div");
blocFrise.className = "frise";
blocFrise.innerHTML = `<svg viewBox="0 0 ${FRISE_W} ${FRISE_H}" preserveAspectRatio="none" aria-label="Frise chronologique"></svg><div class="frise-bulle" hidden></div>`;
document.getElementById("an-curseur").replaceWith(blocFrise);
blocFrise.appendChild(elCurseur); elCurseur.hidden = true;           // l'ancien curseur reste pour le code, invisible
const svgF = blocFrise.querySelector("svg"), bulle = blocFrise.querySelector(".frise-bulle");
const bandeau = document.createElement("div"); bandeau.className = "an-evenement"; bandeau.hidden = true;
document.getElementById("carte-bloc").appendChild(bandeau);

/* La courbe : combien de bâtiments sont debout à chaque date (d'après les dates de la carte, donc aussi celles que tu donnes). */
function recalculerCourbe() {
  if (!ville) return;
  const pas = 5, n = Math.ceil((ANNEE_MAX - ANNEE_MIN) / pas) + 1, d = new Float32Array(n);
  for (const o of ville.objets) {
    if (o.g !== "bati" && o.g !== "monument") continue;
    const i0 = Math.max(0, Math.ceil((o.an - ANNEE_MIN) / pas)), i1 = o.fin != null && o.brule ? Math.min(n, Math.ceil((o.fin - ANNEE_MIN) / pas)) : n;
    for (let i = i0; i < i1; i++) d[i]++;
  }
  const max = Math.max(1, ...d);
  courbe = Array.from(d, (v, i) => [ANNEE_MIN + i * pas, v / max]);
  construireFrise();
}

function construireFrise() {
  let h = "";
  for (const p of chrono.phases) {
    const a = xAn(p.debut), b = xAn(p.fin);
    h += `<rect class="f-phase" x="${a.toFixed(1)}" y="46" width="${(b - a).toFixed(1)}" height="9" fill="${p.couleur}"><title>${p.nom} (${p.debut}–${p.fin})</title></rect>`;
    if (b - a > 70) h += `<text class="f-nom-phase" x="${((a + b) / 2).toFixed(1)}" y="63" text-anchor="middle">${p.nom}</text>`;
  }
  if (courbe) {
    const pts = courbe.map(([y, v]) => `${xAn(y).toFixed(1)},${(42 - v * 34).toFixed(1)}`);
    h += `<path class="f-courbe-aire" d="M${xAn(ANNEE_MIN)},42 L${pts.join(" L")} L${xAn(ANNEE_MAX)},42 Z"/><path class="f-courbe" d="M${pts.join(" L")}"/>`;
  }
  chrono.evenements.forEach((e, i) => {
    const x = xAn(e.an), c = COULEURS_EVENEMENTS[e.type] || COULEURS_EVENEMENTS.autre;
    if (e.fin != null && e.fin - e.an > 2) h += `<rect x="${x.toFixed(1)}" y="40" width="${(xAn(Math.min(e.fin, ANNEE_MAX)) - x).toFixed(1)}" height="3" fill="${c}" opacity=".55"/>`;
    h += `<g class="f-ev" data-i="${i}"><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="6" y2="46" stroke="${c}"/><circle cx="${x.toFixed(1)}" cy="6" r="${e.type === "incendie" ? 4.2 : 3.2}" fill="${c}"/><rect x="${(x - 6).toFixed(1)}" y="0" width="12" height="48" fill="transparent"/></g>`;
  });
  h += `<line id="f-tete" y1="0" y2="56" stroke="currentColor" stroke-width="2"/>`;
  svgF.innerHTML = h;
  dessinerTemps();
}

function dessinerTemps() {
  const t = svgF.querySelector("#f-tete"); if (t) { const x = xAn(an).toFixed(1); t.setAttribute("x1", x); t.setAttribute("x2", x); }
  /* l'événement du moment, en bandeau sur la carte */
  if (!ville || cam.span > 150000) { bandeau.hidden = true; return; }
  const proches = chrono.evenements.filter((e) => (an >= e.an - 1.5 && an <= e.an + 6) || (e.fin != null && e.fin - e.an <= 25 && an >= e.an && an <= e.fin));
  if (!proches.length) { bandeau.hidden = true; return; }
  const e = proches.sort((p, q) => Math.abs(an - p.an) - Math.abs(an - q.an))[0], c = COULEURS_EVENEMENTS[e.type] || "#777";
  bandeau.hidden = false;
  bandeau.style.setProperty("--c", c);
  bandeau.innerHTML = `<b>${e.an}${e.fin ? "–" + e.fin : ""}</b> ${e.titre}${e.lieu ? `<small>${e.lieu}</small>` : ""}`;
}

/* ---- interaction : glisser sur la frise = choisir l'année ; survoler un trait = l'événement ; cliquer = y aller ---- */
function allerAnnee(y) {
  lecture = false; elLecture.textContent = "▶"; libre = true; elNote.textContent = "année choisie — défilez pour reprendre le récit";
  if (cam.span > 150000) cam = vueCam("tout");
  an = Math.round(y); elCurseur.value = an; sale = true; rendre(); dessinerTemps();
}
const xSouris = (e) => { const r = svgF.getBoundingClientRect(); return (e.clientX - r.left) / r.width * FRISE_W; };
let tire = false;
svgF.addEventListener("pointerdown", (e) => { tire = true; svgF.setPointerCapture(e.pointerId); const ev = e.target.closest(".f-ev"); allerAnnee(ev ? chrono.evenements[+ev.dataset.i].an : anX(xSouris(e))); });
svgF.addEventListener("pointermove", (e) => {
  if (tire) { allerAnnee(anX(xSouris(e))); return; }
  const ev = e.target.closest(".f-ev");
  if (!ev) { bulle.hidden = true; return; }
  const x = chrono.evenements[+ev.dataset.i];
  bulle.hidden = false; bulle.innerHTML = `<b>${x.an}${x.fin ? "–" + x.fin : ""}</b> · ${NOMS_TYPES[x.type] || ""}<br>${x.titre}`;
  const r = svgF.getBoundingClientRect(); bulle.style.left = Math.min(r.width - 220, Math.max(0, e.clientX - r.left - 110)) + "px";
});
svgF.addEventListener("pointerup", () => { tire = false; });
svgF.addEventListener("pointerleave", () => { bulle.hidden = true; });

fetch("../donnees/chronologie.json").then((r) => r.json()).then((c) => { chrono = c; construireFrise(); }).catch(() => {});
