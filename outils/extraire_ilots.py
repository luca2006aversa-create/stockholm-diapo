"""Extrait les îlots (blocs bâtis) du plan de 1900 calé (donnees/cartes/plan-1900.webp) et les associe aux bâtiments.

Un îlot = une tache connexe de la couleur des blocs bâtis du plan (saumon) ou de ses bâtiments publics (rouge), séparée des autres par les rues.
Sortie : donnees/ilots.json  {"carte": 1900, "bati": [numéro d'îlot ou -1 pour chaque bâtiment de ville.fond.bati], "n": nombre d'îlots}
Utilisation :  python outils/extraire_ilots.py          (Python avec numpy et Pillow)
"""
import json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
R = 6378137.0
def merc(lon, lat): return math.radians(lon) * R, R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

def masque(rgba):
    a = rgba[..., :3].astype(float) / 255; al = rgba[..., 3] > 200
    mx, mn = a.max(-1), a.min(-1); d = mx - mn + 1e-9
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = d / (mx + 1e-9)
    saumon = (h > 8) & (h < 38) & (s > 0.18) & (s < 0.65) & (mx > 0.8)
    rouge = ((h < 12) | (h > 340)) & (s > 0.55) & (mx > 0.5)
    return (saumon | rouge) & al

def etiqueter(m):
    """composantes connexes (4-voisins), sans scipy"""
    H, W = m.shape; lab = np.full((H, W), -1, np.int32); n = 0
    for y0 in range(H):
        xs = np.nonzero(m[y0] & (lab[y0] < 0))[0]
        for x0 in xs:
            if lab[y0, x0] >= 0: continue
            pile = [(y0, x0)]; lab[y0, x0] = n
            while pile:
                y, x = pile.pop()
                for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and lab[yy, xx] < 0:
                        lab[yy, xx] = n; pile.append((yy, xx))
            n += 1
    return lab, n

def main():
    bornes = json.load(open(RACINE / "donnees" / "cartes_anciennes.json", encoding="utf8"))[0]["bornes"]
    im = Image.open(RACINE / "donnees" / "cartes" / "plan-1900.webp").convert("RGBA")
    f = 2; im = im.resize((im.width // f, im.height // f), Image.LANCZOS)                       # ~6 m par pixel (Mercator) : assez pour des îlots
    rgba = np.array(im); m = masque(rgba)
    # un léger « ouvert » pour séparer les îlots reliés par un trait fin (rues dessinées en gris fin)
    m = m & np.roll(m, 1, 0) & np.roll(m, -1, 0) | (m & np.roll(m, 1, 1) & np.roll(m, -1, 1))
    lab, n = etiqueter(m)
    taille = np.bincount(lab[lab >= 0].ravel(), minlength=n)
    H, W = m.shape; x0, y0 = merc(bornes[0], bornes[1]); x1, y1 = merc(bornes[2], bornes[3])
    pm = (x1 - x0) / W                                                                      # mètres Mercator par pixel
    aire_max = 60000 * 1.96 ** 2 / pm ** 2                                                  # plus grand qu'un îlot normal : tache qui a débordé sur un quartier
    garde = (taille >= 4) & (taille <= aire_max)
    ville = json.load(open(RACINE / "donnees" / "ville.json", encoding="utf8")); ox, oy = ville["origine"]
    res = []; hors = 0
    for ring in ville["fond"]["bati"]:
        a = ring[0]; cx = sum(a[0::2]) / (len(a) / 2) + ox; cy = sum(a[1::2]) / (len(a) / 2) + oy
        px = int((cx - x0) / pm); py = int((y1 - cy) / pm); k = -1
        if 0 <= px < W and 0 <= py < H:
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    yy, xx = py + dy, px + dx
                    if 0 <= yy < H and 0 <= xx < W and lab[yy, xx] >= 0 and garde[lab[yy, xx]]: k = int(lab[yy, xx]); break
                if k >= 0: break
        else: hors += 1
        res.append(k)
    ids = sorted(set(k for k in res if k >= 0)); remap = {k: i for i, k in enumerate(ids)}
    res = [remap.get(k, -1) for k in res]
    json.dump({"carte": 1900, "n": len(ids), "bati": res}, open(RACINE / "donnees" / "ilots.json", "w"))
    print(f"{n} taches, {int(garde.sum())} îlots gardés, {sum(1 for k in res if k >= 0)} / {len(res)} bâtiments rattachés ({hors} hors de la carte)")
    # image de contrôle
    vis = np.zeros((H, W, 3), np.uint8); rng = np.random.default_rng(3)
    cols = rng.integers(60, 255, (n, 3)); 
    for k in range(n):
        pass
    vis[lab >= 0] = cols[lab[lab >= 0] % n]; vis[(lab >= 0) & ~garde[np.clip(lab, 0, n - 1)]] = (255, 0, 255)
    Image.fromarray(vis).save(RACINE / "outils" / "bench" / "captures" / "ilots-controle.png")

if __name__ == "__main__":
    main()
