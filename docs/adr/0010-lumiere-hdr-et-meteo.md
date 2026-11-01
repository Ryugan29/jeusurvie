# ADR 0010 — Lumière HDR + ACES et météo déterministe
**Statut** : accepté — 2026-11-01 (choix de José : « Lot 1 + météo »). Complète l'ADR 0009 ; avance la météo prévue
après la v1 (docs/01-cadrage.md).

## Contexte
José veut une lumière et une ambiance aussi belles que celles de « Les Brumes d'Astréa » (jeu Three.js de référence,
github.com/kruker9/testjeu, sans licence : on s'inspire des techniques, on ne copie pas le code). On avait déjà
l'essentiel de ses ingrédients (ciel peint, nuages, brume, halo, vent, IBL) ; l'écart venait des réglages : image LDR
(tout ce qui dépasse 1 est coupé), soleil faible face à l'ambiance, et pas de météo.

## Décision
- **Rendu HDR + tone mapping ACES** (`adapters/babylon/post-processing`). Le soleil passe à ×1,8 et l'ambiance à ×0,85
  (`render-data/atmosphere`) : le soleil éclaire environ 4 fois plus que l'ombre. L'exposition de jour passe à 1,0.
  Le halo (bloom) commence bien au-dessus du blanc (seuil 2, au-dessus de la neige au soleil) : seuls le disque solaire HDR (×12, `sky-dome`), les étoiles les plus brillantes (ADR 0011) et les
  éclairs rayonnent. Grain de film léger. `?tonemap=standard|neutre` permet de comparer.
- **Atmosphère** (`render-data/atmosphere`, pur) = lumière de l'heure × HDR × météo × éclair. C'est la seule entrée du
  rendu : `SceneLighting.apply(atmosphere, …)`. Un ciel couvert voile le soleil, grise le ciel et la brume, et rend
  l'ambiance diffuse. L'orage assombrit tout. Un éclair illumine le ciel et l'ambiance, et surexpose brièvement l'image.
- **Météo dans le cœur** (`core/world/weather`), fonction pure de la graine et du temps de jeu, en calcul exact (ADR 0004).
  - Épisodes de 300 s, fondus sur les 90 dernières secondes.
  - Le premier épisode d'une partie est toujours clair. Pas d'orage directement après un temps clair ou du brouillard.
  - Le sol mouillé sèche en 240 s.
  - Rien à sauvegarder, rien ne passe du rendu vers le cœur.
  - Raison : « trempé → froid » sera une règle de survie et devra lire la même vérité que l'écran.
  - Les éclairs, purement visuels, restent dans render-data (horloge réelle).
- **À l'écran** :
  - pluie en particules étirées autour de la caméra (`rain-renderer`), dont le nombre dépend de la qualité : 1 500 /
    3 000 / 6 000, `?pluie=0` pour la couper ;
  - sol mouillé, plus sombre et plus saturé, surtout sur le plat (`painted-ground-plugin`) ;
  - vent modulé ;
  - brouillard qui monte dans le ciel ;
  - nuages dont le seuil suit la couverture ;
  - démo : `?meteo=<type>` et touche 6.

## Options écartées
- **Retoucher seulement les couleurs (LDR)** : les clairs blanchissent dès qu'on pousse la lumière, l'image reste plate.
- **Météo dans le rendu seulement** : plus simple, mais la future règle de chaleur n'aurait pas eu la même vérité.
- **Météo à états sauvegardés** : inutile, puisqu'une fonction du temps est rejouable et sans risque de désaccord.

## Conséquences
- Les couleurs de l'heure (`render-data/lighting`) restent « peintes » (≤ 1) : le passage en HDR est concentré dans
  `atmosphere`.
- Tests réécrits selon leur intention : ACES remplace le tone mapping standard, l'exposition de jour 1,25 passe à 1,0, la
  teinte chaude du crépuscule est plus légère (ACES et la lumière dorée réchauffent déjà).
- Pas de lac. (Flaques, ronds de pluie et reflets du sol mouillé : ADR 0011.) Pas encore de sons (pluie, tonnerre, vent).
- La pluie est calculée par le processeur. Si la mesure sur la machine de José est mauvaise, on passera à des
  particules calculées par la carte graphique (GPUParticleSystem).
