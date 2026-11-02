# Matrice de parité Babylon.js → Unity 6.6

Statuts : **À analyser · À migrer · En cours · Implémenté · Testé · Validé · Bloqué**.
- **Testé** : vérifié par des tests automatisés exécutés (port C# comparé aux valeurs produites par le code TypeScript d'origine).
- **Implémenté** : code écrit, compilé (vérification de types contre les assemblies UnityEngine + stubs d'API de paquets) ; shaders validés
  syntaxiquement (glslang) ; **pas encore exécuté dans l'éditeur Unity** (indisponible dans cet environnement).
- **Validé** : exige une exécution dans Unity et une inspection visuelle — **aucune ligne n'a ce statut aujourd'hui** (voir MIGRATION_BLOCKERS.md).

Source de vérité : `src/` du projet Babylon (racine du dépôt). Correspondance fichier par fichier ci-dessous.

## 1. Cœur du jeu (déterministe, sans moteur)

| Système (TS d'origine) | Unity (C#) | Statut | Preuve |
|---|---|---|---|
| `core/shared/hash.ts` hash2 | `Core/Shared/Hash.cs` | Testé | 16 cas comparés bit à bit |
| `core/shared/math.ts` smoothstep (+ sémantique Math.round JS) | `Core/Shared/MathUtil.cs` | Testé | via tous les tests du monde |
| `core/config/balance.ts` | `Core/Config/Balance.cs` | Testé | session 20 s identique |
| `core/world/noise.ts` (gradient, fBm, ridged, multifractal, eroded) | `Core/World/Noise.cs` | Testé | 48 points × 5 fonctions bit à bit |
| `core/world/params.ts` TERRAIN_V1 | `Core/World/TerrainParams.cs` | Testé | valeurs d'or |
| `core/world/terrain.ts` heightAt, régions | `Core/World/Terrain.cs` | Testé | **valeurs d'or genVersion 1 reproduites bit à bit** (4 graines) |
| `core/world/biome.ts` | `Core/World/Biome.cs` | Testé | bit à bit |
| `core/world/chunk.ts` (64 m, 33×33 float32) | `Core/World/Chunk.cs` | Testé | 5 chunks complets bit à bit, bords communs |
| `core/world/triangulation.ts` | `Core/World/Triangulation.cs` | Testé | maillage et sol physique |
| `core/world/surface.ts` | `Core/World/Surface.cs` | Testé | bit à bit |
| `core/world/summit.ts` (?lieu=montagne) | `Core/World/Summit.cs` | Testé | sommet identique |
| `core/world/paths.ts` sentiers | `Core/World/Paths.cs` | Testé | 400 points denses, bit à bit |
| `core/world/placement.ts` ressources | `Core/World/Placement.cs` | Testé | id, type, variante, position, rotation, échelle de toutes les ressources de 5 chunks |
| `core/world/resource-models.ts` | `Core/World/ResourceModels.cs` | Testé | modèle de chaque ressource |
| `core/world/ground-cover.ts` couvre-sol | `Core/World/GroundCover.cs` | Testé | nombre + sommes d'ordre (x, z, rotation, échelle, modèle) de tous les éléments de 5 chunks |
| `core/world/weather.ts` météo | `Core/World/Weather.cs` | Testé | 22 instants × 2 graines ; règle de l'orage |
| `core/physics/ground.ts` | `Core/Physics/Ground.cs` | Testé | marche 20 s |
| `core/physics/colliders.ts` empreintes, pushOut | `Core/Physics/Colliders.cs` | Testé | cercles de toutes les ressources |
| `core/survival/time-of-day.ts` | `Core/Survival/TimeOfDay.cs` | Testé | 14 instants |

## 2. Application (logique pure)

| Système | Unity | Statut | Preuve |
|---|---|---|---|
| `app/loop/fixed-step.ts` (30 Hz) | `Core/App/FixedStep.cs` | Testé | tests de comportement |
| `app/loop/game-session.ts` | `Core/App/GameSession.cs` | Testé | **marche de 1 200 images dans une forêt avec collisions : trajectoire et caméra identiques au TS (±1 µm)** |
| `app/modes/input-mode.ts`, `app/input/raw-input.ts` | `Core/App/InputMode.cs` | Testé | machine à états |
| `app/input/intent.ts`, `app/camera/camera-rig.ts` | `Core/App/CameraRig.cs` | Testé | perche raccourcie, jamais sous le sol |
| `app/chunks/streamer.ts`, `replan-gate.ts` | `Core/App/Streamer.cs` | Testé | ordre des 60 premiers chunks identique |
| `app/chunks/chunk-loading.ts`, `app/ports.ts` | `Core/App/ChunkLoading.cs` | Testé | faux ChunkSource |
| `app/world/obstacle-index.ts` | `Core/App/ObstacleIndex.cs` | Testé | (+ thread-safe pour les workers) |

## 3. Données de rendu (pures)

| Système | Unity | Statut |
|---|---|---|
| palette, shade, mesh-data | `Core/RenderData/Palette.cs`, `MeshData.cs` | Testé (sommes des normales, couleurs, poids de couches) |
| instance-matrices, vegetation-instances, ground-cover-instances, shadow-casters, view-sector | `Core/RenderData/Instances.cs`, `ViewSector.cs` | Testé |
| far-terrain | `Core/RenderData/FarTerrain.cs` | Testé |
| lighting (images clés), fog, fog-blend, atmosphere, grade | `Lighting.cs`, `Fog.cs`, `Atmosphere.cs` | Testé (14 heures, 6 météos × 4 heures × éclair) |
| environment-light (IBL), surfaces, normal-maps, ground-materials | `Surfaces.cs` | Testé |
| foliage (teintes, vent), cosmos, night-magic, lens-drops, sun-rays, character-motion | `Foliage.cs`, `Misc.cs` | Testé |
| quality (profils LOW/MEDIUM/HIGH/ULTRA, dérogations, descriptions) | `Quality.cs` | Testé (lignes de description identiques) |
| storage/graphics-preferences (clé, format JSON, validation) | `Core/Storage/GraphicsPreferences.cs` | Testé (même JSON que le navigateur) |
| babylon/fps-meter (1 % low) | `Misc.cs` FpsMeter | Implémenté |

## 4. Rendu et monde (Unity)

| Système Babylon | Unity | Statut | Notes |
|---|---|---|---|
| Web Workers (chunk.worker, far-terrain.worker) | `World/ChunkWorkerSource.cs` (threads), `FarTerrainRenderer` (Task) | Implémenté | priorité, annulation, 3 essais |
| terrain-renderer + terrain-surface-plugin | `World/TerrainRenderer.cs` + `Shaders/Terrain.shader` | Implémenté | triplanaire, mélange par hauteur, flaques, ronds de pluie |
| ground-textures (GPU) | `Rendering/GroundTextures.cs` + `GroundMatter.shader` | Implémenté | 8 textures, mips, taille par profil |
| far-terrain-renderer | `World/FarTerrainRenderer.cs` + `FarTerrain.shader` | Implémenté | recentrage, fondu dans la brume |
| sky-dome (nuages plats/couches/volume, étoiles, voie lactée, filantes, lune, planète, aurores) | `Shaders/Sky.shader` (skybox URP) | Implémenté | portage ligne à ligne |
| lighting (soleil/lune, hémisphérique, brume EXP + hauteur) | `Atmosphere/SceneLighting.cs` | Implémenté | ambiance trilight = hémisphérique |
| sky-environment (sonde IBL) | `SkyEnvironment` (ReflectionProbe temps réel) | Implémenté | intensité = iblIntensityFor |
| asset-library (glTF, conversion matériaux) | `Vegetation/ModelLibrary.cs` (glTFast) | Implémenté | cartes de relief par nom |
| foliage-plugin (vent, teintes, alpha-to-coverage, contre-jour) | `Shaders/Foliage.shader` | Implémenté | |
| vegetation-renderer, ground-cover-renderer (thin instances) | `Vegetation/InstancedRenderers.cs` (RenderMeshInstanced) | Implémenté | élagage par secteur |
| shadow-proxies | idem, 2e tracé ShadowsOnly des instances proches | Implémenté | adaptation native |
| sun-shadows (cascades, PCF, PCSS) | URP cascades + ombres douces | Implémenté | PCSS → ombres douces High + 4096 (écart) |
| ambient-occlusion (SSAO2) | URP SSAO | Implémenté | |
| SSR (sol mouillé) | `AtmosphereFeature` passe WetReflections | Implémenté | URP n'a pas de SSR : passe maison |
| atmosphere-pass (perspective atmosphérique, profondeur de champ) | `AtmosphereFeature` + `Atmosphere.shader` | Implémenté | |
| sun-rays | idem | Implémenté | occlusion par la profondeur caméra (écart mineur) |
| post-processing (ACES, exposition, saturation, teinte, halo, vignette, grain, netteté, FXAA, MSAA, flou de mouvement) | `RenderPipelineController` (Volume URP) + passe de netteté | Implémenté | |
| lens-drops | `AtmosphereFeature` passe finale | Implémenté | |
| rain-renderer, night-magic-renderer (lucioles, champignons) | `Atmosphere/Particles.cs` | Implémenté | |
| wet-surfaces, pbr-fog, height-fog-plugin | shaders (globales `_JS_Wet`, `_JS_HeightFog`) | Implémenté | |
| render-pipeline (profils appliqués à chaud) | `Rendering/RenderPipelineController.cs` | Implémenté | |
| engine (densité de pixels) | `renderScale` du profil | Implémenté | |

## 5. Personnages, entrées, interface, stockage

| Système | Unity | Statut |
|---|---|---|
| capsule provisoire | `PlayerCapsule` | Implémenté |
| animated-model (héroïne 1,7 m, démon 2,6 m, teinte des cheveux) | `Characters/AnimatedCharacter.cs` | Implémenté |
| retargetAnimations (héros → héroïne, os par nom, bassin) | `RetargetedLocomotion` | Implémenté |
| locomotion-animator (Idle/Walk/Run, fondu 0,2 s, virage 12 rad/s) | idem | Implémenté |
| démon posé à 6 m, face au joueur, solide (rayon 0,9 m) | `GameBootstrap.PlaceDemon` | Implémenté |
| dom-input-device (touches physiques, souris capturée, molette) | `Input/GameInput.cs` (Input System, repli Input Manager) | Implémenté |
| pause par perte de capture, reprise par clic | `GameBootstrap` + machine des modes | Implémenté |
| touches 1-4 (moments), 5 (×60), 6 (météo), F (panneau), O (réglages), Maj (marche lente) | `GameBootstrap.Update` | Implémenté |
| panneau de démo (fps, 1 % low, GPU ms, heure, météo, chunks, couvre-sol, qualité) | `UI/GameHud.cs` | Implémenté |
| Réglages → Graphismes (radio, aperçu au survol, flèches/Début/Fin, Échap, Rétablir) | `UI/GameHud.cs` + `JeuSurvie.uss` | Implémenté |
| préférences (localStorage) | `PlayerPrefsStorage` | Implémenté |
| paramètres d'adresse (?seed, ?heure, ?meteo, ?qualite, ?ombres=0…) | arguments de ligne de commande (`LaunchOptions`) | Implémenté |
| ?capture=1 (captures automatisées) | `-capture <dossier>` | Implémenté |

## 6. Hors périmètre (n'existent pas dans le jeu d'origine)

Audio, sauvegarde de partie, inventaire, récolte, fabrication, créatures actives, mort, carte, menus de la maquette
(`docs/02-maquette`) : **spécifiés (cadrage v1, stories S1-S9) mais pas implémentés dans le projet Babylon**. Rien à migrer ;
ils restent au programme (MIGRATION_ROADMAP.md).
