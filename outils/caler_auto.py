"""Cale automatiquement une carte ancienne sur la carte actuelle en faisant coïncider son EAU avec l'eau d'aujourd'hui (donnees/eau.json).

Utilisation :  python outils/caler_auto.py <image> <annee> <x_image_centre_ville> <y_image_centre_ville> [echelle_m_par_px_mercator]
Écrit donnees/cartes/plan-<annee>.webp (reprojeté, nord en haut), l'ajoute à donnees/cartes_anciennes.json et enregistre le masque de l'eau.
Une similitude (échelle, rotation, translation) suffit pour une carte d'arpenteur ; les cartes dessinées à la main demandent des points de repère.
"""
import json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

RACINE = Path(__file__).resolve().parent.parent
R = 6378137.0
def merc(lon, lat): return math.radians(lon) * R, R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
def inv(x, y): return math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)

def eau_actuelle(res=40):
    e = json.load(open(RACINE / "donnees" / "eau.json", encoding="utf8"))
    W, H = int(22000 / res), int(16600 / res); acc = np.zeros((H, W), bool)
    for ring in e["salee"] + e["douce"]:
        im = Image.new("1", (W, H), 0)
        ImageDraw.Draw(im).polygon([((ring[i] + 11000) / res, (8300 - ring[i + 1]) / res) for i in range(0, len(ring), 2)], fill=1)
        acc ^= np.array(im, bool)
    return acc, res

def eau_carte(img, f=2):
    a = np.array(img.convert("RGB").resize((img.width // f, img.height // f), Image.BILINEAR)).astype(float) / 255
    mx, mn = a.max(-1), a.min(-1)
    return (mx > 0.82) & ((mx - mn) < 0.13)

def score(Wm, res, M, f, p, pas=3):
    s, th, tx, ty, uc, vc = p
    H, Wd = Wm.shape; gy, gx = np.mgrid[0:H:pas, 0:Wd:pas]
    X = gx * res - 11000 + res / 2; Y = 8300 - gy * res - res / 2
    c, sn = math.cos(th), math.sin(th)
    dx, dy = (X - tx) / s, (Y - ty) / s
    u = uc + c * dx + sn * dy; v = vc - (-sn * dx + c * dy)
    ui, vi = np.round(u).astype(int), np.round(v).astype(int); ok = (ui >= 0) & (ui < M.shape[1]) & (vi >= 0) & (vi < M.shape[0])
    if ok.sum() < 2000: return 0
    a = Wm[::pas, ::pas][ok]; b = M[vi[ok], ui[ok]]
    return (a & b).sum() / max(1, (a | b).sum())

def main():
    chemin, annee, cx, cy = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
    s0 = float(sys.argv[5]) if len(sys.argv) > 5 else 20.0
    img = Image.open(chemin).convert("RGB"); f = 2
    Wm, res = eau_actuelle(); M = eau_carte(img, f)
    uc, vc = img.width / f / 2, img.height / f / 2; cxm, cym = merc(18.0709, 59.3250); ox, oy = json.load(open(RACINE / "donnees" / "ville.json", encoding="utf8"))["origine"]
    cl, cm = cxm - ox, cym - oy                                          # centre-ville en repère local
    best = (0, None)
    for s in np.linspace(s0 * 0.55, s0 * 1.7, 14):
        for th in np.radians(np.arange(0, 30.1, 2.5)):
            for tx in np.arange(cl - 3500, cl + 3501, 500):
                for ty in np.arange(cm - 3500, cm + 3501, 500):
                    # (tx, ty) = position du centre de l'image ; le centre-ville est en (cx/f, cy/f)
                    p = (s, th, tx, ty, uc, vc); sc = score(Wm, res, M, f, p, 4)
                    if sc > best[0]: best = (sc, p)
    sc, p = best; print("grossier", round(sc, 3), p)
    rng = np.random.default_rng(1); pas = [s0 * 0.03, math.radians(0.7), 150, 150]
    for it in range(1500):
        q = (p[0] + rng.normal() * pas[0], p[1] + rng.normal() * pas[1], p[2] + rng.normal() * pas[2], p[3] + rng.normal() * pas[3], uc, vc)
        sq = score(Wm, res, M, f, q, 2)
        if sq > sc: sc, p = sq, q
        if it % 500 == 499: pas = [x / 2 for x in pas]
    print("fin", round(sc, 3), p)
    json.dump({"p": list(p), "score": sc, "f": f}, open(RACINE / "outils" / f"calage_{annee}.json", "w"))
    s, th, tx, ty, uc, vc = p
    # reprojection : image de sortie nord en haut, 3 m par pixel (Mercator)
    c, sn = math.cos(th), math.sin(th); W0, H0 = img.size
    def vers_merc(u, v):                                                # pixel d'origine (taille réelle) → Mercator local
        dx, dy = (u / f - uc) * s, -(v / f - vc) * s
        return tx + c * dx - sn * dy, ty + sn * dx + c * dy
    cs = [vers_merc(0, 0), vers_merc(W0, 0), vers_merc(0, H0), vers_merc(W0, H0)]
    x0, x1, y0, y1 = min(q[0] for q in cs), max(q[0] for q in cs), min(q[1] for q in cs), max(q[1] for q in cs)
    pm = 4.0; ow, oh = int((x1 - x0) / pm), int((y1 - y0) / pm)
    # coefficients affines PIL : (i,j) sortie → (u,v) source (taille réelle)
    def src(i, j):
        X, Y = x0 + i * pm - tx, y1 - j * pm - ty
        dx, dy = c * X + sn * Y, -sn * X + c * Y
        return (dx / s + uc) * f, (vc - dy / s) * f
    a0 = src(0, 0); a1 = src(1, 0); a2 = src(0, 1)
    coef = (a1[0] - a0[0], a2[0] - a0[0], a0[0], a1[1] - a0[1], a2[1] - a0[1], a0[1])
    out = img.transform((ow, oh), Image.AFFINE, coef, resample=Image.BICUBIC)
    mask = Image.new("L", img.size, 255).transform((ow, oh), Image.AFFINE, coef, resample=Image.BILINEAR)
    out = out.convert("RGBA"); out.putalpha(mask)
    if max(out.size) > 2400: k = 2400 / max(out.size); out = out.resize((int(out.width * k), int(out.height * k)), Image.LANCZOS)
    out.save(RACINE / "donnees" / "cartes" / f"plan-{annee}.webp", quality=84)
    w, so = inv(x0 + ox, y0 + oy); e, n = inv(x1 + ox, y1 + oy)
    print("bornes", [round(w, 5), round(so, 5), round(e, 5), round(n, 5)], out.size)
    json.dump([w, so, e, n], open(RACINE / "outils" / f"bornes_{annee}.json", "w"))

if __name__ == "__main__":
    main()
