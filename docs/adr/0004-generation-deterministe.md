# ADR 0004 — Génération déterministe, identifiants stables, monde borné
**Statut** : accepté — 2026-10-30

## Contexte
La même graine doit donner exactement le même monde dans le navigateur et dans le .exe, aujourd'hui et après les mises
à jour, sinon les sauvegardes importées ou anciennes sont corrompues. Les ressources et lieux doivent avoir des
identifiants stables pour que la sauvegarde ne stocke que les changements.

## Décision
- Bruit maison (hash entier, gradient 2D, fBm), opérations de base seulement dans `core/world` (pas de sin/cos/pow/exp).
- `genVersion = 1` figé par des valeurs d'or (tests de caractérisation, exception écrite au TDD) ; un générateur publié
  n'est jamais modifié, on en ajoute un nouveau à côté.
- Hauteur de chaque sommet calculée en coordonnées monde : bords de chunks identiques par construction.
- Identifiants par **cellule de grille globale** : ressources `r:{gx}:{gz}`, lieux `p:{gx}:{gz}` (dépendent de la grille,
  donc de `genVersion`).
- Monde borné (rayon ≈ 8 km) par des montagnes infranchissables, décidé dès `genVersion` 1 ; pas d'origine flottante
  (vérifié au spike).
- Même fonction pure `generateChunk` dans le worker et dans les tests.

## Options écartées
- **Bibliothèque `simplex-noise`** : table de permutation dépendante d'un aléatoire, pas de garantie entre versions.
- **Fonctions trigonométriques** : précision variable entre V8 et SpiderMonkey.
- **Index dans le chunk comme identifiant** : casse dès qu'on ajoute un arbre ou change la taille des chunks.
- **Monde vraiment infini** : tremblements de l'image très loin du départ.

## Précision (2026-10-30, relecture de l'étape 1 du spike)
« Publié » = **scellé** : première version distribuée à quelqu'un d'autre que José (tag + journal). Avant scellement, les
valeurs d'or peuvent être recapturées dans un commit dédié, avec la raison au journal. La liste blanche `Math` s'applique
aussi à `core/shared` (le hash fait partie du générateur). Les paramètres du générateur vivent dans `world/params.ts`.

## Conséquences
La politique après publication (garder les anciens générateurs ou refuser les anciennes parties) est à trancher avant la
première sortie.
