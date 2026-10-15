# Banc de mesure
`npm i` puis `npx playwright install chromium`.
- `node bench.js <étiquette> [dpr]` : mesures complètes → `resultats-<étiquette>-dpr<dpr>.json` (variable `RACINE=…` pour mesurer une autre copie du site).
- `DPR=1 node resume.js avant final` : tableau comparatif.
- `node captures.js <racineA> <racineB>` : rendus à l'arrêt comparés pixel à pixel.
- `node modes.js` : vérifie diaporama, lecture, éditeur, frise, 3D.
