# Fluidité du site : mesures avant / après

Banc : `outils/bench` (Playwright + Chromium **sans GPU**, rendu logiciel : les valeurs absolues sont gonflées, lire les proportions). Fenêtre 1440×900.

| Mesure | Avant | Après |
|---|---|---|
| Une image `rendre()`, vue Centre 1790 (dpr 1) | 936 ms | 2,6 ms |
| Centre 2026 (dpr 1) | 2 021 ms | 10 ms |
| Gamla Stan 1500 | 592 ms | 1,5 ms |
| Norrmalm 1968 | 755 ms | 15–33 ms |
| Grand Stockholm 1950 | 58 ms | 10 ms |
| Même mesure à dpr 2 : Centre 2026 | 12 134 ms | 10 ms |
| Rendus WebGL hors de la section 3D | 143 (en 49 images) | 0 |
| Mémoire des canvas (dpr 1) | 163 Mo | 107 Mo (objectif 80 Mo non atteint) |
| Requêtes / poids au démarrage (non compressé) | 57 / 23,5 Mo | 20 / 11,5 Mo |
| Démarrage jusqu'au fond global prêt | 3,4 s | 2,4 s |
| Fond régional, coloriage | ≈1,4 s, 2 copies de 58 Mo | table de couleurs, image source libérée |

Rendu à l'arrêt comparé pixel à pixel (`captures.js`) : Europe/Suède identiques ; ville : 0,1 à 4 % de pixels différents, dus (1) aux petits objets < 15 m² (< 40 m² dézoomé) retirés (kiosques, abris, entrées de métro), (2) aux lignes de métro désormais au-dessus des petits bâtiments, (3) aux nouvelles dates des rues.

## Correctifs, un commit chacun
1. Fond régional : seule la partie visible est copiée ; carte des pays non dessinée quand le fond la recouvre ; copie mise en cache caméra immobile.
2. 3D : plus aucune image ni rendu hors section ; three.js, textures et relief construits par morceaux à 2 écrans de la section ; pixel ratio ≤ 1,5.
3. Objets datés : couche hors écran complétée année par année (on n'ajoute que les nouveaux), jeunes objets et destructions seuls en direct, petits bâtiments en rectangles groupés.
4. Appels en double (`dessinerTemps`), positions des scènes et des points en cache, plus de `setInterval`, grilles des cartes d'analyse en cache, légendes sans réécriture, `backdrop-filter` retiré.
5. Chargement différé : étude topo (~4 Mo), `analyses.json`, images des diapos.
6. Résolution adaptative : le dpr maximal baisse d'un cran si les images dépassent 30 ms.
