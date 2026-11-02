# Feuille de route

## Restant pour clore la migration (parité du jeu existant)
1. **Ouvrir dans Unity 6000.6.7f1** (B1) : résoudre les paquets, laisser `ProjectSetup` créer URP/renderer/scène, corriger toute
   erreur de compilation (API de paquets), lancer les tests EditMode (28 attendus verts).
2. **Importer les assets** du projet Babylon (B2) et vérifier : végétation (portées, élagage, vent, teintes d'automne), couvre-sol,
   héroïne animée (Idle/Walk/Run), démon, collisions troncs/rochers, perche de caméra.
3. **Comparaison visuelle** côte à côte avec la version navigateur, par profil et par moment : `-capture <dossier>` produit
   matin/midi/crépuscule/nuit ; ajuster les correspondances d'étalonnage (B5) jusqu'à parité.
4. **Mesures** : panneau F (fps, 1 % low, GPU ms) par profil sur la machine de référence ; Profiler Unity (draw calls,
   allocations par image, temps des threads de génération).
5. Passer chaque ligne « Implémenté » de MIGRATION_PARITY.md à « Validé » avec sa preuve.

## Optimisations prévues après parité (non commencées : mesurer d'abord)
- Tampons de matrices persistants (`GraphicsBuffer` + `RenderMeshIndirect`) pour supprimer les copies lors des refontes.
- LOD des arbres lointains (imposteurs) au-delà de 300 m.
- Allocation zéro dans `ObstacleIndex.Near/Along` (listes réutilisées).
- Génération des chunks en Jobs/Burst si les threads ne suffisent pas (en gardant la parité bit à bit, tests à l'appui).

## Suite du jeu (cadrage v1 du projet d'origine, jamais implémenté en Babylon)
Stories S1 (saut, bord du monde) à S9 : récolte, fabrication, survie (faim, chaleur), mort et tombes, créatures, lieux,
sauvegarde, carte. À développer directement dans le projet Unity, cœur dans `JeuSurvie.Core` (règles pures, testées).
