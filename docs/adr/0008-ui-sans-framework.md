# ADR 0008 — Interface en DOM sans framework, alimentée par des sélecteurs
**Statut** : accepté — 2026-10-30

## Contexte
Une trentaine de composants et 13 écrans en HTML/CSS par-dessus la scène 3D, qui doivent coûter très peu à 60 images/s.

## Décision
Sélecteurs purs du cœur → modèles de vue ; `store` qui ne notifie qu'au changement ; composants `mount/update/destroy`
avec un helper `setIfChanged` ; `textContent` uniquement ; l'UI envoie des commandes via `session.dispatch`.

## Options écartées
- **Preact / lit-html** : dépendance en plus et mises à jour moins maîtrisées ; à reconsidérer si le code d'interface
  maison grossit trop (nouvel ADR).
- **Babylon GUI** : accessibilité, mise en page et maquette HTML perdues.
- **Mini-framework de diff générique maison** : sur-ingénierie.

## Conséquences
Les composants sont testés avec happy-dom ; une deuxième mise à jour identique ne doit rien écrire dans le DOM.
