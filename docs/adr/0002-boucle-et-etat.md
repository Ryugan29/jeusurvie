# ADR 0002 — Boucle à pas fixe, `step` pur, état et aléatoire
**Statut** : accepté — 2026-10-30

## Contexte
Les règles doivent être testables et reproductibles, indépendamment du nombre d'images par seconde de la machine.

## Décision
- Simulation à **pas fixe** `SIM_HZ = 30` (une seule constante), interpolation à l'affichage, au plus 5 ticks rattrapés
  par image. Toutes les durées d'équilibrage sont en secondes, converties par un seul helper : passer à 60 Hz ne casse rien.
- Caméra et souris mises à jour à chaque image, hors tick (pas de latence du regard).
- `step(state, loaded, {intent, commands, chunks}) → {state, loaded, events}` ; commandes en file au tick suivant ;
  événements pour l'UI, les effets et le son ; le moteur n'en déduit aucune règle.
- `GameState` (ce qui se sauvegarde) immuable par convention ; `LoadedWorld` (simulation chaude) mutable dans `step`.
- Temps en ticks entiers en mémoire, en secondes dans la sauvegarde.
- PRNG pur dans la simulation, ni sauvegardé ni dans `GameState`, réinitialisé par `hash(seed, ticks)`.

## Options écartées
- **Pas variable** : règles dépendantes du taux d'images, tests non reproductibles.
- **60 Hz fixe d'emblée** : gardé comme repli si la sensation à 30 Hz est molle au spike.
- **Immuabilité totale** : copies et ramasse-miettes à 30 Hz pour rien sur la simulation chaude.
- **PRNG sauvegardé** : rien ne l'exige (pas de rejeu, créatures non sauvegardées).

## Conséquences
Latence du personnage jusqu'à ~33 ms (mesurée au spike). Les sélecteurs sur la simulation chaude comparent leur sortie
au lieu d'être mémoïsés par référence.
