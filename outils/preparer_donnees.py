"""Prépare deux fichiers pour la page, à partir de ville.json et de la génération SiteScope de Stockholm.

1. donnees/eau.json — l'eau d'aujourd'hui, mesurée et non modélisée : eau vue par satellite au moins la moitié du temps
   (JRC Global Surface Water, 1984-2021) + plans d'eau d'OpenStreetMap. Séparée en eau SALÉE (Baltique, Saltsjön) et
   eau DOUCE : les lacs d OpenStreetMap (le Mälaren et ses baies, les autres lacs) ; le reste de l eau vue par satellite est salée.

2. donnees/croissance.json — une date pour chaque bâtiment et chaque rue sans date connue.
   - La ville part de Stadsholmen (1252) et des objets datés (OSM, Wikidata : bâtiments, ponts, stations) ;
   - elle se propage LE LONG DES RUES : vite sur les grandes rues, lentement sur les petites (Dijkstra, temps = longueur / vitesse) ;
   - une rue apparaît quand le front l'atteint ; un bâtiment quelques années après sa rue, plus tard s'il est enfoncé dans
     l'îlot ou serré entre d'autres, plus tôt s'il est grand ;
   - près d'un bâtiment de date connue, les voisins apparaissent APRÈS lui ;
   - la croissance satellitaire GHSL (1975-2020) borne les dates : un bâtiment dans une zone bâtie entre 1990 et 2000
     reçoit une date entre 1990 et 2000.
   C'est une reconstitution plausible, pas une datation : la page le dit.

Lancé dans le conteneur SiteScope :
    docker cp donnees/ville.json sitescope-api:/tmp/ville.json
    docker cp outils/preparer_donnees.py sitescope-api:/tmp/
    docker cp donnees/rues_historiques.json sitescope-api:/tmp/
    docker exec sitescope-api python /tmp/preparer_donnees.py
    docker cp sitescope-api:/tmp/eau.json donnees/ ; docker cp sitescope-api:/tmp/croissance.json donnees/
"""
import hashlib
import heapq
import json
import math

import geopandas as gpd
import numpy as np
from pyproj import Transformer
from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Point, Polygon
from shapely.ops import transform, unary_union

JOB = "/app/data/jobs/2026-10-04_stockholm_2/03_export"
ville = json.load(open("/tmp/ville.json", encoding="utf-8"))
OX, OY = ville["origine"]
T3006 = Transformer.from_crs(3006, 3857, always_xy=True)
T4326 = Transformer.from_crs(4326, 3857, always_xy=True)


def local(g, src=T3006):
    def f(x, y, z=None):
        X, Y = src.transform(x, y)
        return np.asarray(X) - OX, np.asarray(Y) - OY
    return transform(f, g)


def src_de(gdf):
    """Les fichiers « _sweref99tm » exportés par SiteScope sont en fait en WGS84 : on lit leur vrai système."""
    return Transformer.from_crs(gdf.crs, 3857, always_xy=True)


def pt(lon, lat):
    x, y = T4326.transform(lon, lat)
    return Point(x - OX, y - OY)


def anneaux(geom):
    """Polygones → anneaux plats [x, y, x, y…] au mètre près."""
    out = []
    polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom] if isinstance(geom, Polygon) else []
    for p in polys:
        for r in [p.exterior, *p.interiors]:
            c = np.round(np.asarray(r.coords)[:, :2]).astype(int).ravel().tolist()
            if len(c) >= 8:
                out.append(c)
    return out


zone = unary_union([Polygon(np.asarray(r).reshape(-1, 2)) for r in ville["zone"]]).buffer(0)

# ---------------------------------------------------------------------------------------------------- 1. l'eau
jrc = gpd.read_file(f"{JOB}/eau_frequence_sweref99tm.geojson")
jrc = jrc[jrc["min_pct"] >= 50]
osm = gpd.read_file(f"{JOB}/eau_surfacique_sweref99tm.geojson")
# eau douce : ce qu OpenStreetMap appelle lac (le Mälaren et ses baies, les lacs) ; eau salée : le reste de l eau vue par satellite
douce_osm = unary_union([local(g, src_de(osm)) for g in osm.geometry if g is not None]).buffer(0)
jrc_eau = unary_union([local(g, src_de(jrc)) for g in jrc.geometry if g is not None]).buffer(0)
eau_douce = douce_osm.intersection(zone).buffer(4).buffer(-4).simplify(3)
eau_salee = jrc_eau.difference(douce_osm.buffer(25)).intersection(zone)
eau_salee = eau_salee.buffer(8).buffer(-8).simplify(4)
eau_salee = unary_union([g for g in (eau_salee.geoms if hasattr(eau_salee, "geoms") else [eau_salee]) if g.area > 20000])
json.dump({"salee": anneaux(eau_salee), "douce": anneaux(eau_douce),
           "source": "eau douce : lacs d OpenStreetMap (Mälaren et ses baies, lacs) ; eau salée : eau vue par satellite au moins 50 % du temps (JRC Global Surface Water 1984-2021) hors des lacs"},
          open("/tmp/eau.json", "w"))
print("eau : salée %.1f km², douce %.1f km²" % (eau_salee.area / 1e6 * math.cos(math.radians(59.33)) ** 2, eau_douce.area / 1e6 * math.cos(math.radians(59.33)) ** 2))

# ---------------------------------------------------------------------------------------------------- 2. la croissance
VITESSE = {1: 0.72, 2: 1.05, 3: 1.6, 4: 2.2}            # mètres au sol par an le long d'une rue, selon sa largeur (avant 1600)
RALENTI = 0.5      # avant 1850 la ville se développe deux fois moins vite (demande du 15/10) ; un seul réglage à changer
PLANCHER = {1: 1850, 2: 1700, 3: 0, 4: 0}   # année minimale d'un bâtiment sur une rue de chaque niveau (1 = desserte … 4 = grand axe), hors du cœur ancien
VITESSE_AXE = 40     # mètres au sol par an : vitesse à laquelle un axe principal se prolonge depuis le centre
DECALAGE_RUE = 4   # une rue secondaire naît au plus 4 ans avant son premier bâtiment
RUE_VIDE_APRES = 1960   # une rue sans aucun bâtiment (autoroute, desserte technique) : pas avant cette date


def rythme(t):
    """La ville ne grandit pas à vitesse constante : lente au Moyen Âge, plus vite sous l'Empire, stagnation 1750-1850,
    accélération industrielle, explosion après 1950 (métro, Programme Million)."""
    base = 0.8 if t < 1350 else 1.0 if t < 1600 else 1.4 if t < 1750 else 1.1 if t < 1850 else 3.5 if t < 1900 else 6.0 if t < 1950 else 12.0
    return base * (RALENTI if t < 1850 else 1.0)
K = 1 / math.cos(math.radians(59.33))                 # 1 m au sol ≈ 1,96 m Mercator à Stockholm
noeuds, voisins = {}, []


def noeud(x, y):
    k = (round(x / 2), round(y / 2))
    if k not in noeuds:
        noeuds[k] = len(voisins)
        voisins.append([])
    return noeuds[k]



# noms des rues : la voirie OSM (avec ses noms) rapprochée de chaque rue du fond par son milieu
voirie = gpd.read_file(f"{JOB}/voirie_sweref99tm.geojson")
tv = src_de(voirie)
v_geoms, v_noms = [], []
for g, n in zip(voirie.geometry, voirie["name"]):
    if g is not None and isinstance(n, str) and n:
        v_geoms.append(local(g, tv))
        v_noms.append(n)
arbre_voirie = STRtree(v_geoms)


def nom_de(p, rayon=8):
    j = arbre_voirie.nearest(p)
    return v_noms[j] if v_geoms[j].distance(p) < rayon * K else None


hist = json.load(open("/tmp/rues_historiques.json", encoding="utf-8"))
HIST = {r["nom"]: {**r, "rayon": 4000} for r in hist["rues"]} | {r["nom"]: {**r, "rayon": 8000} for r in hist["ponts"]}
CENTRE = pt(18.0705, 59.3250)                                          # les homonymes de banlieue (Storgatan à Solna…) sont écartés


def ajouter_trace(f, w, vitesse=None):
    v = (vitesse or VITESSE[min(4, max(1, round(w or 1)))]) * K
    ids = set()
    for i in range(0, len(f) - 2, 2):
        a, b = noeud(f[i], f[i + 1]), noeud(f[i + 2], f[i + 3])
        cout = math.hypot(f[i + 2] - f[i], f[i + 3] - f[i + 1]) / v          # en années, au rythme de base (divisé par rythme(t) au parcours)
        voisins[a].append((b, cout))
        voisins[b].append((a, cout))
        ids.update((a, b))
    return ids


rues_noeuds = [set().union(*[ajouter_trace(f, r["w"]) for f in r["f"]]) if r["f"] else set() for r in ville["fond"]["rues"]]
objets_noeuds = {}
for k, o in enumerate(ville["objets"]):
    if o["k"] == "ligne" and o["g"] in ("voirie", "ponts"):
        objets_noeuds[k] = set().union(*[ajouter_trace(f, o.get("w", 2), 3 if o["g"] == "ponts" else None) for f in o["f"]]) if o["f"] else set()
N = len(voisins)
coords = np.zeros((N, 2))
for (kx, ky), i in noeuds.items():
    coords[i] = (kx * 2, ky * 2)
arbre_noeuds = STRtree([Point(c) for c in coords])

# Raccords : les rues sont simplifiées, une rue qui débouche sur une autre ne tombe pas toujours sur un de ses sommets.
# Chaque bout libre est raccroché au tronçon le plus proche (à moins de 8 m), aux deux extrémités de ce tronçon.
troncons = sorted({(min(a, b), max(a, b)) for a in range(N) for b, _ in voisins[a]})
arbre_troncons = STRtree([LineString([coords[a], coords[b]]) for a, b in troncons])
raccords = []
for n in range(N):
    if len({b for b, _ in voisins[n]}) != 1:
        continue
    p = Point(coords[n])
    for q in sorted(arbre_troncons.query(p.buffer(8 * K)), key=lambda q: arbre_troncons.geometries[q].distance(p)):
        a, b = troncons[q]
        if n in (a, b) or any(m in (a, b) for m, _ in voisins[n]):
            continue
        for m in (a, b):
            cout = p.distance(Point(coords[m])) / (VITESSE[2] * K)
            voisins[n].append((m, cout))
            voisins[m].append((n, cout))
            raccords.append((n, m))
        break
print("bouts de rue raccordés :", len(raccords) // 2)

# Contraintes. « échéance » : le nœud doit exister au plus tard à cette date — alors tout le chemin qui le relie au centre
# existe aussi (une rue ne naît jamais isolée). « ouverture » : pas avant cette date (pont, avenue percée) — rien ne passe
# par là avant. Sources : rues et ponts datés (donnees/rues_historiques.json), objets datés (OSM, Wikidata), GHSL.
echeances = []
ouverture = np.full(N, -np.inf)
explicite = np.zeros(N, bool)
historiques = {}


def milieu(f):
    m = len(f) // 4 * 2
    return Point(f[m], f[m + 1])


for i, r in enumerate(ville["fond"]["rues"]):
    if not r["f"]:
        continue
    p = milieu(r["f"][0])
    n = nom_de(p)
    h = HIST.get(n)
    if not h or p.distance(CENTRE) > h["rayon"] * K:
        continue
    historiques.setdefault(n, {"existe": h["existe"], "rues": []})["rues"].append(i)
    for j in rues_noeuds[i]:
        D = h["existe"]
        if h.get("axe"):                                                   # un axe se prolonge depuis le centre, de proche en proche, au lieu de naître d'un bloc
            D += Point(coords[j]).distance(CENTRE) / (VITESSE_AXE * K)
        echeances.append((D, j))
        explicite[j] = True
        if h.get("ouvre"):
            ouverture[j] = max(ouverture[j], h["ouvre"])
print("rues historiques reconnues :", {n: len(v["rues"]) for n, v in historiques.items()})
print("non trouvées :", [n for n in HIST if n not in historiques])

for k, o in enumerate(ville["objets"]):
    an = o.get("an")
    if an is None or an < 1252 or an > 2026 or not o["f"]:
        continue
    if k in objets_noeuds:                                                # rue ou pont daté : ni avant ni après sa date
        for j in objets_noeuds[k]:
            echeances.append((an, j))
            ouverture[j] = max(ouverture[j], an)
            explicite[j] = True
        continue
    f = o["f"][0]
    p = Point(f[0], f[1]) if len(f) == 2 else Polygon(np.asarray(f).reshape(-1, 2)).centroid if o["k"] == "poly" and len(f) >= 6 else milieu(f)
    idx = arbre_noeuds.query(p.buffer(260 * K))
    if len(idx):                                                          # un lieu daté : sa rue d'accès existe à sa date
        j = idx[int(np.argmin([p.distance(Point(coords[q])) for q in idx]))]
        echeances.append((an, j))

# GHSL : époque où chaque lieu est devenu bâti (bornes des dates)
ghsl = gpd.read_file(f"{JOB}/analyse_croissance_ghsl_1975-2020_sweref99tm.geojson")
col = "epoque" if "epoque" in ghsl.columns else ghsl.columns[0]
epoques = sorted({int(e) for e in ghsl[col] if e is not None})
ghsl_geoms = [local(g, src_de(ghsl)) for g in ghsl.geometry]
ghsl_ep = [int(e) for e in ghsl[col]]
arbre_ghsl = STRtree(ghsl_geoms)
ep_noeud = np.full(N, np.inf)
for g, e in zip(ghsl_geoms, ghsl_ep):
    for j in arbre_noeuds.query(g, predicate="intersects"):
        ep_noeud[j] = min(ep_noeud[j], e)
for j in np.nonzero(np.isfinite(ep_noeud))[0]:
    e = int(ep_noeud[j])
    echeances.append((e, j))                                              # bâti à cette époque : desservi au plus tard alors
    k = epoques.index(e)
    if k > 0 and not explicite[j]:
        ouverture[j] = max(ouverture[j], epoques[k - 1] + 1)              # pas bâti avant l'époque précédente : pas de rue avant


def borne_ghsl(p, an):
    idx = arbre_ghsl.query(p, predicate="within")
    if len(idx) == 0:
        return an
    e = min(ghsl_ep[i] for i in idx)
    k = epoques.index(e)
    bas = epoques[k - 1] + 1 if k > 0 else 1252
    return min(max(an, bas), e)


temps = np.full(N, np.inf)
pred = np.full(N, -1)


def propager(depart):
    tas = [(temps[i], i) for i in depart]
    heapq.heapify(tas)
    while tas:
        t, i = heapq.heappop(tas)
        if t > temps[i]:
            continue
        for j, c in voisins[i]:
            tj = max(t + c / rythme(t), ouverture[j])
            if tj < temps[j]:
                temps[j], pred[j] = tj, i
                heapq.heappush(tas, (tj, j))


# 1. la ville part de Stadsholmen en 1252 et grandit le long des rues
racine = arbre_noeuds.query(pt(18.0717, 59.3268).buffer(45 * K))      # le château : seul point de départ ; les premières rues (Västerlånggatan, Österlånggatan…) arrivent de leur date
temps[racine] = 1252
propager(racine)
print("réseau :", N, "nœuds,", int(np.isfinite(temps).sum()), "atteints depuis Stadsholmen")
# 2. les échéances, des plus anciennes aux plus récentes : le plus court chemin vers la ville déjà là à cette date
#    (sans passer par un pont pas encore ouvert) est avancé à la date — la rue datée arrive raccordée.
def relier(j, D, limite=40000):
    dist, prec, tas, vus = {j: 0.0}, {j: -1}, [(0.0, j)], 0
    while tas:
        d, i = heapq.heappop(tas)
        if d > dist[i]:
            continue
        if temps[i] <= D:
            k, n, vers = prec[i], 0, i
            while k != -1:
                temps[k] = D
                pred[k] = vers                                                # k se rattache au réseau déjà là, du côté de i
                if ouverture[k] > D:
                    ouverture[k] = D
                vers, k, n = k, prec[k], n + 1
            return n
        vus += 1
        if vus > limite:
            break
        for m, c in voisins[i]:
            if explicite[m] and ouverture[m] > D:
                continue
            if d + c < dist.get(m, np.inf):
                dist[m], prec[m] = d + c, i
                heapq.heappush(tas, (d + c, m))
    temps[j] = min(temps[j], D)                                           # rien trouvé (île sans pont dans les données) : seule
    return -1


n_tires, n_seules = 0, 0
for D, j in sorted(echeances):
    if temps[j] > D:
        n = relier(j, D)
        n_tires += max(n, 0)
        n_seules += n < 0
print("nœuds avancés par les échéances :", n_tires, "; sans raccord possible :", n_seules)
# 3. la croissance repart de partout où la ville est arrivée plus tôt
propager(np.nonzero(np.isfinite(temps))[0])


def date_noeud_proche(p, rayon=260):
    idx = arbre_noeuds.query(p.buffer(rayon * K))
    if len(idx) == 0:
        return None, None
    d = [p.distance(Point(coords[i])) for i in idx]
    j = int(np.argmin(d))
    return temps[idx[j]], d[j] / K


def alea(x, y, graine=""):
    h = hashlib.md5(f"{round(x)},{round(y)},{graine}".encode()).digest()
    return int.from_bytes(h[:4], "little") / 2 ** 32


front_euclide = STRtree([Point(c) for c in coords[np.isfinite(temps)]])
temps_finis = temps[np.isfinite(temps)]

# rues, première passe : la date du front (le plus tôt de leurs nœuds) ; une rue est toujours raccordée à une rue existante
t_front = []
for r, ids in zip(ville["fond"]["rues"], rues_noeuds):
    t = min((temps[j] for j in ids), default=np.inf)
    if not np.isfinite(t):
        p = milieu(r["f"][0])
        j = front_euclide.nearest(p)
        t = temps_finis[j] + p.distance(front_euclide.geometries[j]) / (VITESSE[1] * K * rythme(temps_finis[j]))
    t_front.append(t)
lignes_rues = [LineString(np.asarray(r["f"][0]).reshape(-1, 2)) if r["f"] and len(r["f"][0]) >= 4 else Point(0, 0).buffer(0.1) for r in ville["fond"]["rues"]]
arbre_rues = STRtree(lignes_rues)

# bâtiments : après leur rue ; plus tard s'ils sont enfoncés dans l'îlot ou serrés, plus tôt s'ils sont grands
dates_connues = []
for o in ville["objets"]:
    if o["g"] == "bati" and o.get("an") and 1252 <= o["an"] <= 2026 and o["f"]:
        f = o["f"][0]
        dates_connues.append((Point(f[0], f[1]) if len(f) == 2 else Polygon(np.asarray(f).reshape(-1, 2)).centroid, o["an"]))
emprises = [Polygon(np.asarray(f[0]).reshape(-1, 2)).buffer(0) for f in ville["fond"]["bati"]]
centres = [e.centroid for e in emprises]
arbre_bati = STRtree(centres)
arbre_connus = STRtree([p for p, _ in dates_connues]) if dates_connues else None
dates_bati = []
for e, c in zip(emprises, centres):
    t, d = date_noeud_proche(c)
    if t is None or not np.isfinite(t):                                   # hors du réseau : le front le plus proche, à vol d'oiseau
        j = front_euclide.nearest(c)
        t, d = temps_finis[j] + c.distance(front_euclide.geometries[j]) / (VITESSE[1] * K * rythme(temps_finis[j])), 30
    aire = e.area / K / K
    serres = len(arbre_bati.query(c.buffer(22 * K))) - 1                   # bâtiments collés autour : construits plus tard
    vieille = t < 1500                                                     # la ville médiévale : les grands bâtiments d'abord, le tissu serré un siècle plus tard
    an = t + 2 + min(d, 120) * (0.4 if vieille else 0.12) + min(80 if vieille else 10, serres * (6 if vieille else 0.9)) - (4 if aire > 1500 else 0) - (25 if vieille and aire > 700 else 0) + (alea(c.x, c.y) - 0.5) * 10
    if arbre_connus is not None:                                          # après le bâtiment connu le plus proche
        j = arbre_connus.nearest(c)
        p0, an0 = dates_connues[j]
        dist = c.distance(p0) / K
        if dist < 220 and an < an0 < an + 60:                              # un bâtiment connu un peu plus récent : ses voisins le suivent
            an = an0 + dist * 0.05 + alea(c.x, c.y, "v") * 4
    an = borne_ghsl(c, an)
    dates_bati.append(an)                                                 # provisoire : la rue qui le dessert sera datée d'après lui

# --- les rues d'après les bâtiments ---
# Une rue de l'ossature (axes principaux, rues datées par les sources) naît à la date du front ou de sa source. Toute autre rue naît
# peu avant son PREMIER bâtiment (au plus DECALAGE_RUE ans avant) ; une rue qui sert de raccord à une rue plus récente existe au plus
# tard à la date de cette dernière ; une rue sans aucun bâtiment n'apparaît pas avant RUE_VIDE_APRES.
rue_de = []
premier = np.full(len(lignes_rues), np.inf)
for b, (c, an) in enumerate(zip(centres, dates_bati)):
    j = arbre_rues.nearest(c)
    ok = lignes_rues[j].distance(c) < 35 * K
    rue_de.append(j if ok else -1)
    if ok:
        # hiérarchie : loin du cœur ancien, un bâtiment sur une petite rue n'arrive pas avant que la ville ait vraiment grandi jusque-là
        if not any(explicite[q] for q in rues_noeuds[j]) and c.distance(CENTRE) > 700 * K:
            an = max(an, PLANCHER[min(4, max(1, round(ville["fond"]["rues"][j]["w"] or 1)))])
            dates_bati[b] = an
        premier[j] = min(premier[j], an)
d0 = np.full(len(lignes_rues), np.inf)
for i, ids in enumerate(rues_noeuds):
    if any(explicite[j] for j in ids):
        d0[i] = t_front[i]
    elif np.isfinite(premier[i]):
        d0[i] = max(t_front[i], premier[i] - DECALAGE_RUE)
besoin = np.full(N, np.inf)                                              # à quelle date un nœud doit exister pour que ce qui en dépend soit raccordé
for i in np.argsort(d0):
    if not np.isfinite(d0[i]) or not rues_noeuds[i]:
        continue
    j = min(rues_noeuds[i], key=lambda q: temps[q])
    while j != -1 and besoin[j] > d0[i]:
        besoin[j] = d0[i]
        j = pred[j]
dates_rues = []
nb_vides = 0
for i, ids in enumerate(rues_noeuds):
    nd = min((besoin[j] for j in ids), default=np.inf)
    if np.isfinite(d0[i]):
        t = min(d0[i], nd)
    elif np.isfinite(nd):
        t = nd                                                           # raccord d'une rue plus récente
    else:
        t = max(t_front[i], RUE_VIDE_APRES); nb_vides += 1
    dates_rues.append(int(round(min(2024, max(1252, t)))))
print("rues sans bâtiment ni raccord :", nb_vides)
# un bâtiment ne vient jamais avant la rue qui le dessert
for b, c in enumerate(centres):
    j = rue_de[b] if rue_de[b] >= 0 else arbre_rues.nearest(c)
    an = dates_bati[b]
    if lignes_rues[j].distance(c) < 150 * K:
        an = max(an, dates_rues[j] + 1 + alea(c.x, c.y, "r") * 3)
    dates_bati[b] = int(round(min(2024, max(1252, an))))

json.dump({"bati": dates_bati, "rues": dates_rues, "historiques": historiques,
           "methode": "propagation le long des rues depuis Stadsholmen (1252) ; les rues et ponts datés par les sources et les objets datés tirent derrière eux le chemin qui les relie au centre (aucune rue isolée) ; un bâtiment vient après sa rue ; bornée par GHSL 1975-2020 ; reconstitution plausible, pas une datation"},
          open("/tmp/croissance.json", "w"))
h = np.histogram(dates_bati, bins=[1252, 1500, 1650, 1800, 1900, 1950, 1975, 2000, 2025])
print("bâtiments par période :", dict(zip([f"{a}-{b}" for a, b in zip(h[1][:-1], h[1][1:])], h[0].tolist())))

# contrôle : à chaque année, les rues présentes forment-elles un seul réseau ?
for Y in (1400, 1650, 1790, 1880, 1950):
    parent = {}

    def racine_uf(a):
        while parent.setdefault(a, a) != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    presentes = [i for i, d in enumerate(dates_rues) if d <= Y and rues_noeuds[i]]
    for i in presentes:
        ids = list(rues_noeuds[i])
        for b in ids[1:]:
            parent[racine_uf(ids[0])] = racine_uf(b)
    for n, m in raccords:
        parent[racine_uf(n)] = racine_uf(m)
    for k, ids in objets_noeuds.items():
        if ville["objets"][k].get("an", 9999) <= Y and ids:
            ids = list(ids)
            for b in ids[1:]:
                parent[racine_uf(ids[0])] = racine_uf(b)
    taille = {}
    for i in presentes:
        r = racine_uf(next(iter(rues_noeuds[i])))
        taille[r] = taille.get(r, 0) + 1
    grand = max(taille.values()) if taille else 0
    print(f"{Y} : {len(presentes)} rues, {len(taille)} morceaux, {grand / max(1, len(presentes)):.0%} dans le plus grand")
