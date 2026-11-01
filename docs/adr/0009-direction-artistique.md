# ADR 0009 — Direction artistique et test « beau et fluide »
**Statut** : accepté — 2026-10-30 (choix de José)

## Contexte
José veut que le perso, les créatures et les décors soient beaux dès le début. Il n'y a pas d'artiste ; le jeu doit
rester fluide dans un navigateur sur un PC moyen.

## Décision
- Style **stylisé coloré « fantasy »** (formes douces, couleurs vives, ambiance chaleureuse), univers 100 % original.
- Modèles **gratuits CC0 d'abord**, en packs cohérents (même auteur, squelette d'animation commun) ; achat d'un pack
  payant ciblé seulement si le test de beauté le justifie.
- La beauté passe d'abord par la **lumière** : cycle jour/crépuscule/nuit, brume, lueurs, palette par biome,
  post-traitement léger.
- Le spike devient un test **« beau et fluide »** : vraie scène dans le style du jeu (perso, une créature, forêt, trois
  ambiances de lumière), validée par José et mesurée en images/s.
- Assets validés (`gltf-validator`, pas d'URI externe, textures ≤ 2048) et crédités dans `assets/CREDITS.md`.

## Options écartées
- **Réaliste** : demande des artistes et une machine puissante.
- **Low-poly épuré** et **stylisé sombre** : proposés à José, non retenus.
- **Packs payants d'emblée** : on achète quand on sait ce qui manque.
- **Formes grises au spike** : le look serait découvert trop tard.

## Conséquences
Le bestiaire et les animations dépendent des packs trouvés. La technique d'animation et le budget de rendu (LOD,
appels de dessin) font l'objet d'un ADR en sortie de spike.
