# Jeu de survie fantasy — journal

## [2026-10-29] demarrage | Stack fixée
Solo, 3D 3e personne, monde infini généré (terrain naturel non modifiable, biomes, météo dynamique), sauvegardes locales.
TypeScript + Babylon.js + Vite + Electron. Dragons hors v1. Prochaine phase : cadrage.

## [2026-10-29] cadrage | Rounds 1 et 2 de l'équipe
Analyste, game designer, designer UX, concepteur technique. Convergence : spike perfs d'abord ; jour/nuit + faim + chaleur en v1 (pas de soif) ;
objets posés librement ; 2 biomes ; plafond ~15 créatures ; export/import de sauvegarde ; brume ; .exe de test tôt.
Désaccords restants : météo en v1 ou v1.1, mort définitive ou réapparition, contenu anti-vide (lieux, Foyer, nuit d'assaut). En attente de José.

## [2026-10-29] cadrage | Périmètre v1 validé par José
docs/01-cadrage.md écrit : 8 stories (monde, récolte/fabrication/pose, jour-nuit + faim + chaleur, mort et tombe, créatures,
exploration + Foyer 2 paliers, sauvegarde + export, nuit d'assaut sacrifiable), spike de fluidité préalable.
Arbitrages de José : météo juste après la v1, réapparition avec sac dans une tombe, nuit d'assaut gardée. Prochaine phase : maquette.

## [2026-10-29] maquette | Dessin et ajouts de José
Maquette HTML navigable dessinée par le superviseur. José ajoute : boussole, mini-carte, carte en grand (M) sans pause.

## [2026-10-30] maquette | Critique et gel
Critique UX, game design, développeur (avis convergents, 1 round). Corrections : crépuscule, retours d'action, coffre/tombe,
manger, carnet, carte sûre ouverte, HUD allégé, réglages complets. Choix de José : retour à 50 %, épingle, perso immobile carte/sac ouverts.
Maquette figée (13 écrans), notes écrites, cadrage mis à jour (S9 « Se repérer », critères ajoutés à S2, S3, S4). Prochaine phase : archi.

## [2026-10-30] archi | Architecture validée
Round 1 : concepteur technique + concepteur de données. Round 2 : relecteur d'architecture + auditeur sécurité, puis
confrontation sans objection bloquante (simplifications : pas de checksum, pas de réparation auto, pas de Web Locks ;
ajouts : garde-fous ESLint/tsconfig, durcissement Electron R1-R15, audio, bord du monde). Choix de José : repousse bois/plantes,
petit saut, jours qui continuent après la mort, assaut qui vient au joueur, style stylisé coloré + CC0 d'abord.
Écrits : docs/03-archi.md, ADR 0001-0009, CLAUDE.md (règles + sécurité), stack.md corrigé (sans Havok, sécurité), cadrage complété.
Prochaine phase : dev, en commençant par le spike « beau et fluide ».

## [2026-10-30] dev | Spike étape 1 : fondations et générateur de terrain
Écrivain : fondations, garde-fous ESLint/tsconfig prouvés par fixtures, hash/bruit/heightAt/generateChunk en TDD, valeurs d'or.
Défaut trouvé en route : relief nul tous les 256 m (octaves alignées), corrigé avec test. Relecture code + archi + sécu :
pas de bloquant ; corrigés : liste blanche Math (world + shared), globaux et XSS étendus, contrat chunk float32, règle de
scellement de genVersion 1, params du générateur dans world/params.ts. Vérifié par le superviseur : 59 tests, lint,
typecheck, audit OK. Non commité (attente de José). Étape 2 reportée à la demande de José.

## [2026-10-30] dev | Spike : recapture des valeurs d'or de genVersion 1 (avant scellement)
Raison : retours de José sur le relief (« trop basique », « juste des hauts et des bas ») → régions plaine/collines/
montagnes, chaînes jusqu'à ~270 m (ridged multifractal, fBm érodé, déformation de domaine), vallées formant des cols,
sel dédié pour la déformation en z (relecture). Valeurs d'or recapturées une fois, point d'or ajouté en montagne.
Note TDD : dans le lot visuel 1, shade/fog/surface-normal/character-pose/capsule n'ont eu qu'un rouge « module absent »,
sans rouge de comportement (TDD non respecté, signalé à José) ; rouges de comportement faits dans le lot 2.

## [2026-10-30] dev | Lumière de midi trop forte (retour de José)
Cause : à midi, soleil 1,3 + ambiance donnaient ~1,35 sur sol plat (~1,56 sur pente face au soleil) : les couleurs du sol saturaient
vers le blanc, donc relief aplati. Rouge prouvé (2 tests : plat ≤ 1, pente ≤ 1,15), puis vert : soleil de midi 1,3 → 0,75, ambiance
0,45 → 0,38, image clé de fin d'après-midi adoucie (0,8 / 0,5), ombre du perso recalée (max 0,7). Reste lisible : pente face/dos ≥ 1,6.
Hors périmètre, déjà rouge avant : tests/assets (9 modèles CC0 : COLOR_0 non clampé à 1,0001). Non commité.

## [2026-10-30] dev | Preview simple pour José
José ne voyait « page introuvable » sur http://localhost:5173 : seule /spike.html existait. En dev, l'adresse nue redirige maintenant vers la démo
(vite.config.ts, plugin rootToSpike, sans effet sur le build). Préférence de José : preview à chaque modif, aucun jargon (branche, commit…).

## [2026-10-30] dev | Végétation branchée dans la scène du spike
Worker : calcule aussi les matrices d'instances (resourcesInChunk → vegetationInstances), transférées sans copie (ChunkRenderData = mesh + vegetation).
Rendu : AssetLibrary (glTF chargés une fois, transformation cuite dans les sommets, matériaux PBR → standard + 30 % d'auto-éclairage pour que
feuillages et écorce ne noircissent pas) + VegetationRenderer : UN tampon d'instances par morceau de modèle (~17 dessins), instances de tous les
chunks à portée mises bout à bout (concatInstances), portée par type (arbres 600 m, buissons/rochers 280 m, herbe/fleurs 110 m, au chunk près).
BUG trouvé à l'écran (1re version : un clone par chunk) : les clones partagent les sommets du modèle, donc le tampon d'instances du dernier chunk
chargé écrasait les autres → quasi aucune végétation visible. Corrigé ; test de régression sur vrai moteur sans carte graphique (NullEngine).
Relecture de code (agent) : pas de fuite au déchargement, couches respectées ; à garder en tête : modèles hors du build (assets/ pas dans public/),
pas de culling par chunk (tout ce qui est à portée est dessiné : mesurer sur la machine de José), brume de hauteur seulement sur le terrain,
worker-chunk-source : double erreur (onerror + onmessageerror) peut créer un worker orphelin (antérieur, à corriger + test).
Vérifié : 302 tests, lint, typecheck, build, audit OK. Fluidité réelle non mesurée (navigateur intégré = rendu logiciel, 1-3 images/s).
Démo : ?regard=<rad>, ?vegetation=0 ; l'adresse nue redirige vers la démo en gardant les réglages.

## 2026-10-30 — Collisions : le joueur ne traverse plus troncs et rochers (pilote-dev, retour de José)
Constat : le décor n'était que visuel (moveOnGround sans obstacles). TDD : tests écrits d'abord (rouge : modules absents + 3 tests de session),
puis core/physics/colliders (colliderOf, pushOut, rayons tree/pine 0,6 · rock 1,3 mesurés sur les modèles glTF, × échelle de la ressource),
app/world/obstacle-index (cercles des cases de la grille 8 m autour du joueur, cache par case, mêmes ressources que le rendu),
GameSession.avoidObstacles (après moveOnGround : repousse hors des cercles ; sol d'arrivée non chargé → reste en place),
PLAYER_RADIUS_M = 0,35 dans balance.ts. Spike : obstacles actifs seulement si la végétation est chargée (?vegetation=0 → on traverse le vide).
Relecture de code (agent, mutations + fuzz) : aucun bloquant ; tests trop faibles et 2 cas réels corrigés (rouge prouvé d'abord) :
(1) passage plus étroit que le joueur entre deux obstacles : la poussée de l'un renvoyait dans l'autre (jusqu'à 10 cm dedans) → déplacement refusé
(sauf si le joueur y était déjà au départ) ; (2) pente non recontrôlée après la poussée (rapport jusqu'à 1,4 contre 1 permis) → refusé.
Tests ajoutés : portée de recherche (tous côtés, bords de case), sol non chargé après poussée, arrêt exact au bord, mémoire bornée, rayons en littéral.
RESOURCE_SCALE_MAX exporté (placement.ts) au lieu de 1,25 recopié ; avoidObstacles reçoit la position de départ en paramètre.
Limite constatée par José à l'écran (capture) : « je peux rentrer un peu dans le rocher » (cercle centré sur l'origine du modèle, rayon unique 1,3 m).
Correction : empreinte PAR MODÈLE (centre décalé + rayon) mesurée sur les sommets tels qu'affichés dans Babylon (test jetable NullEngine, supprimé).
Piège trouvé à la mesure : le chargement glTF retourne l'axe X (pas Z) par rapport au fichier — les bornes lues dans le .gltf donnaient le mauvais côté.
Rochers : n°1 centre (0,11 ; 0,35) r 1,45 · n°2 (0,18 ; 0,08) r 1,35 · n°3 (0,11 ; 0,85) r 1,5 ; arbres 0,6, pins 0,6 / 0,5. Le décalage suit l'échelle et la
rotation de l'instance ; test de cohérence avec la matrice d'instance (vecteur ligne). Modèles par type déplacés dans core/world/resource-models (partagés
rendu + collisions, ré-exportés par render-data). Reste imparfait : un cercle ne colle pas à un rocher irrégulier (un peu de mur invisible ici ou là).
Caméra pas encore bloquée par les obstacles.

## 2026-10-31 — Caméra : plus de traversée des troncs et rochers (pilote-dev, suite des collisions, demande de José)
TDD (rouge prouvé : constantes absentes + comportements) : cameraPose(rig, cible, sol, obstacles?) raccourcit la perche au premier obstacle
(cercle élargi de CAMERA_OBSTACLE_MARGIN = 0,3 m, sous le rayon du joueur donc la cible est toujours dehors), perche minimale MIN_CAMERA_BOOM = 1,2 m
(pas de caméra dans la tête du perso), cible déjà dans la marge → obstacle ignoré. Un obstacle bas (rocher ≤ 2 m) est survolé quand la perche est plus
haute que lui à l'entrée ; sol inconnu = obstacle supposé assez haut. Circle.height et Footprint.h (hauteur mesurée du tronc/rocher × échelle).
ObstacleIndex.along(a, b) : cases du rectangle englobant la perche (test : tout obstacle frôlé est trouvé ; mutation détectée).
Limites : saut instantané (pas de lissage quand la perche se raccourcit/rallonge) ; seul le tronc bloque, pas le feuillage ; pas de test à la sortie de
l'obstacle pour une perche plongeante (tangage min −0,35 rad : sans effet pratique).

## 2026-11-01 — Lumière HDR + ACES et météo (demande de José : « Lot 1 + météo »)
Référence : « Les Brumes d'Astréa » (Three.js, sans licence : techniques seulement). Écart constaté : réglages (LDR, soleil faible) et pas de météo.
Fait en TDD (rouge prouvé à chaque étape) : core/world/weather (épisodes 300 s, fondu 90 s, pas d'orage après clair/brouillard, sol qui sèche en 240 s),
render-data/atmosphere (heure × HDR × météo × éclair, lightningFlash, sceneBrightness, weatherGrade), sky-dome (couverture, disque HDR, éclair,
brouillard dans le ciel), post-processing (HDR, ACES, bloom > 1, grain, ?tonemap=), rain-renderer, sol mouillé (painted-ground-plugin), quality.rainDrops.
Réglé à l'œil (captures Playwright, vrai GPU) : exposition 1,0, soleil ×1,8, zénith du crépuscule plus profond, brume moins délavée, teinte chaude
globale réduite (elle grisait le ciel), pluie plus ternie et plus brumeuse, brume d'orage grise. Tests réécrits selon leur intention (ACES, exposition).
Vérifié : 748 tests, typecheck, lint, build. Non vérifié : fluidité sur la machine de José. Le jeu de référence n'a pas pu être lancé (code externe bloqué).

## 2026-11-01 — Pluie réaliste et ciel fantastique (demande de José, choix : planète + aurores, gouttes toujours)
TDD (rouge prouvé) : render-data/lens-drops, babylon/lens-drops (passe d'image accrochée seulement s'il y a des gouttes), nuages de pluie (test : dessous
assez sombres pour se détacher du ciel — le rouge l'a prouvé, d'où la couche basse ardoise), wetSurface + WetSurfaces (PBR luisants), reflets et flaques du sol
(Fresnel, ronds de pluie), render-data/cosmos (rotation de la voûte, aurores par nuit), nouveau shader du ciel (3 couches d'étoiles en grille 3D, voie lactée,
étoile filante, planète, aurores, lune). Réglé à l'œil : gouttes plus grosses, flaques plus petites et sombres (elles ressemblaient à de la neige, rayures
d'ondulation remplacées par des ronds), étoiles plus fines, planète abaissée (hors champ à 33-67°) et éclairée de trois quarts (noire quand la lune l'éclairait).
Vérifié : 777 tests, typecheck, lint, build ; console sans erreur de shader ; ~90-98 images/s sur la machine de José.

