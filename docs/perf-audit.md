# Audit : ce qui s'ajoute à la liste de départ

- **La vraie cause du « ça rame »** n'était pas `dessinerObjets` seul : le flou plein écran de la carte des pays (`cx.filter`) était dessiné sous un fond régional qui le recouvrait entièrement (600 à 1 800 ms/image à l'échelle de la ville). Corrigé en ne le dessinant plus (`regionCouvre`).
- `page/axo.js` (ancienne axonométrie CSS) n'est plus chargé : candidat à suppression.
- Bug évité en chemin : la section 3D n'avait de hauteur qu'une fois la 3D construite ; sa hauteur est maintenant posée au départ, et le cadre est masqué tant que la 3D n'est pas là.
- Restent (non faits) : `ville.json` 5,6 Mo à découper ; `three.module.js` non minifié (sans effet maintenant qu'il est différé) ; pyramide de résolutions du fond régional (mémoire ≈ 107 Mo) ; recul dans le temps avec caméra en mouvement = redessin complet ; index spatial ; recompression des vidéos ; en-têtes de cache GitHub Pages.
- MapLibre GL / deck.gl : non engagé (à chiffrer sur demande).

## Fichiers jamais cités par le code (à supprimer ou archiver : NON supprimés)
Voir la liste du prompt (P10) : vidéo `20261008-…transports…mp4` (10,4 Mo), `images/gamla-stan.png`, plusieurs `cartes/*.png`, `images/*` de diapos retirées, `page/axo.js`. À valider avant tout `git rm`.
