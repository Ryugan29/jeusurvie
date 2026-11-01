# ADR 0003 — Collisions cinématiques dans le cœur, sans Havok en v1
**Statut** : accepté — 2026-10-30 — **modifie `docs/pilotage/stack.md`** (qui citait « physique Havok intégrée »)

## Contexte
Le terrain est un champ de hauteur non modifiable ; les obstacles sont simples et statiques (troncs, rochers, objets
posés) ; un seul type d'attaque au corps à corps ; pas d'objet qui roule ni de ragdoll. Des règles comme « le monstre ne
traverse pas la palissade » et « la caméra ne traverse pas l'obstacle » doivent être testables hors moteur.

## Décision
Physique 2,5D dans `core/physics` : `groundHeight` sur la même triangulation que le maillage rendu (module partagé, test
d'égalité), `moveAndSlide` contre cercles et rectangles orientés, hachage spatial, `raycast`. Petit saut avec gravité, plus
bas qu'une palissade ; on ne monte pas sur les objets. Havok pourra revenir plus tard en effet purement cosmétique.

## Options écartées
- **Havok qui fait autorité derrière un port `PhysicsWorld`** : WASM asynchrone (~2 Mo), résultat dépendant du moteur,
  tests du cœur réduits à des tests de faux.
- **Havok pour le joueur seulement** : deux mondes physiques à garder cohérents.

## Conséquences
Le contrôleur maison doit être réglé (pentes, coins, accrochages) : tests de propriétés et réglage au spike. Si la
sensation est médiocre, l'option du port `PhysicsWorld` reste ouverte (nouvel ADR).
