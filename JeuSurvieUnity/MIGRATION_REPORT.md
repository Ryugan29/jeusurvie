# Rapport final de migration — Babylon.js → Unity 6.6 (6000.6.7f1)

## 1. Ce qui a été migré
Le projet Babylon.js contient aujourd'hui **le « spike beau et fluide »** — la seule partie jouable du jeu (les stories de
survie S1-S9 du cadrage sont spécifiées mais jamais développées). Cartographie de l'original (≈ 5 800 lignes de TypeScript
hors tests, 781 tests) et sa contrepartie Unity :

| Domaine | Original | Unity |
|---|---|---|
| Monde | génération déterministe (bruit maison, régions, montagnes multifractales, vallées, biomes forêt/froid, sentiers, ressources sur grille globale, couvre-sol), chunks 64 m dans des Web Workers, relief lointain sur 2-6 km | `Core/World` (port bit à bit) + `World/ChunkWorkerSource` (threads), `TerrainRenderer`, `FarTerrainRenderer` |
| Jeu | pas fixe 30 Hz, déplacement sur le sol, pente max, collisions cercles (troncs, rochers, démon), caméra 3e personne à perche raccourcie, modes jeu/pause | `Core/App`, `Core/Physics` (port testé) + `GameBootstrap` |
| Temps | cycle 20 min (14 jour dont 2 crépuscule, 6 nuit), touches de moments, ×60 | `Core/Survival/TimeOfDay`, `Core/RenderData/Lighting` |
| Météo | 6 temps enchaînés depuis la graine, sol mouillé qui sèche, éclairs | `Core/World/Weather`, `Core/RenderData/Atmosphere` |
| Rendu | sol PBR à 4 matières générées sur GPU, végétation instanciée avec vent et teintes, PBR nature/personnages, ciel procédural complet, IBL du ciel, ombres en cascade, SSAO, SSR, perspective atmosphérique, rayons, profondeur de champ, flou de mouvement, ACES, étalonnage de l'heure, pluie, gouttes sur l'objectif, lucioles, champignons luminescents | 8 shaders URP + `AtmosphereFeature` (Render Graph) + Volume URP + `RenderPipelineController` |
| Profils | LOW / MEDIUM / HIGH / ULTRA appliqués à chaud, enregistrés | `Core/RenderData/Quality` (identique) + réglage live de l'asset URP |
| Personnages | héroïne (animations du héros reciblées), démon, capsule de repli | `Characters/AnimatedCharacter` (glTFast) |
| Interface | panneau de démo, voile de pause, Réglages → Graphismes accessible au clavier | UI Toolkit (`GameHud` + USS) |
| Données | préférences graphiques (localStorage, JSON validé) | PlayerPrefs, même clé, même JSON |
| Démo | paramètres d'adresse, captures automatisées | arguments de lancement, `-capture` |
| Absent de l'original | audio, sauvegarde de partie, inventaire, réseau | — (rien à migrer) |

## 2. Architecture Unity
URP (Render Graph) · asmdef `JeuSurvie.Core` sans moteur (règles et calculs purs, déterministes) · `JeuSurvie.Runtime`
(adaptateurs, racine de composition `GameBootstrap`) · `JeuSurvie.Editor` (configuration automatique, import des assets) ·
tests NUnit partagés Unity / dotnet. Détails et justifications : `MIGRATION_DECISIONS.md` (20 décisions).

## 3. Fonctionnalités validées / testées
- **Testées (preuve automatisée)** : tout le cœur — monde identique bit à bit à la version navigateur pour une même graine
  (valeurs d'or scellées de genVersion 1 reproduites), ressources et couvre-sol identiques, maillages, météo, lumière de chaque
  heure, atmosphère de chaque météo, perspective, étalonnage, profils, préférences, streaming, et une **session de jeu de
  20 secondes** (marche en forêt avec collisions et caméra) superposée à celle du TypeScript à 1 µm près.
- **Validées dans Unity** : aucune — l'éditeur n'a pas pu être exécuté ici (`MIGRATION_BLOCKERS.md` B1).

## 4. Écarts restants
- Exécution et inspection visuelle dans Unity à faire (B1) ; assets CC0 à importer (B2).
- Adaptations natives sans équivalent exact : PCSS → ombres douces URP ; SSR maison limité au sol plat mouillé ; occlusion des
  rayons par la profondeur caméra ; correspondances approchées de vignette, grain, teinte et seuil de halo (B5).
- Versions précises des paquets à confirmer à l'ouverture (B3) ; champs privés URP réglés par réflexion (B4).

## 5. Tests réalisés
| Test | Résultat |
|---|---|
| Suite d'origine `npm test` (référence avant migration) | 781/781 |
| `dotnet test` — 28 tests NUnit (18 de parité sur fixtures générées depuis le TS, 10 de comportement) | 28/28 |
| Compilation de tout le C# Unity contre UnityEngine (réf.) + stubs de paquets, 2 variantes | 0 erreur |
| glslang sur 8 shaders, 120 points d'entrée, mots-clés éteints/allumés | 120/120 |
Défauts trouvés et corrigés par ces vérifications : précision float d'une somme de contrôle, ambiguïtés de types
(`QualityLevel`/`QualitySettings` d'UnityEngine), affichage initial du panneau de démo.

## 6. Performances mesurées
**Aucune** : Unity n'a pas pu tourner ici. Les budgets de l'original sont repris (mêmes profils, mêmes portées, mêmes
élagages, instanciation GPU, ombres proches seulement, génération hors du fil principal ≤ 4 chunks intégrés par image).
Mesure à faire avec le panneau F (fps, 1 % low, GPU ms) et le Profiler (voir `MIGRATION_ROADMAP.md`).

## 7. Lancement
Voir `README.md` : Unity Hub → ce dossier → 6000.6.7f1 → configuration automatique → importer les assets → Play.

## 8. Taux de parité
Systèmes du jeu existant couverts par du code Unity : **100 %**. Systèmes **prouvés** identiques par des tests : le cœur
(génération, physique, session, lumière, météo, profils). Systèmes **validés dans Unity** : **0 %** à ce jour. La migration
n'est donc **pas déclarée terminée** : il reste l'ouverture dans Unity, la vérification visuelle et la mesure.
