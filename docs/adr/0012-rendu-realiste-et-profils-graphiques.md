# ADR 0012 — Rendu réaliste et profils graphiques LOW / MEDIUM / HIGH / ULTRA
**Statut** : accepté — 2026-11-01 (demande de José : « transformation graphique complète, objectif photoréalisme », quatre profils
graphiques sélectionnables). Remplace la partie « style stylisé coloré » de l'ADR 0009 ; prolonge les ADR 0010 et 0011.

## Contexte
- Le rendu de l'ADR 0009 était volontairement « peint » : sol en aplats peints à la main, couleurs saturées (+20 de saturation
  ajoutée), ciel en dégradé, végétation aux verts sans bleu. José demande maintenant une nouvelle identité visuelle, aussi proche
  que possible du photoréalisme, et quatre profils graphiques réellement différents, choisis dans les réglages et enregistrés.
- Contraintes inchangées : Babylon.js 9.33 sur WebGL 2, navigateur et .exe, aucun fichier ni réseau pour ce qui peut se calculer,
  CSP stricte, couches pures testées sans carte graphique.
- Aucune banque de textures photographiques n'est joignable depuis l'environnement de développement (seul GitHub l'est) ; les
  modèles 3D restent ceux du pack CC0 (géométrie stylisée).

## Décision
### 1. Un seul point de vérité : `render-data/quality`
- Quatre profils `low | medium | high | ultra` décrivent TOUT ce qui coûte : MSAA, densité de pixels, FXAA, ombres (cascades,
  carte, portée, filtrage), occlusion ambiante, reflets à l'écran, rayons, nuages, sonde d'environnement, halo, perspective
  atmosphérique, profondeur de champ, flou de mouvement, grain, netteté, textures du sol, distances (chunks, relief lointain,
  végétation, couvre-sol et sa densité), pluie.
- Dérogations (`QualityOverrides`) : elles ne peuvent que COUPER un effet (adresse ?ombres=0…, préférences enregistrées) : base
  des futurs réglages individuels.
- Anciens noms `?qualite=basse|moyenne|haute` toujours lus.
- Préférences enregistrées (`adapters/storage/graphics-preferences`) : données non fiables, validées, jamais d'exception.

### 2. Une seule chaîne de rendu : `adapters/babylon/render-pipeline`
Elle crée, ordonne, règle et détruit les effets (reconstruction à chaud au changement de profil) :
1. SSAO2 ;
2. reflets à l'écran (SSR, seulement sur sol mouillé, allumés / éteints sans réordonner les passes) ;
3. perspective atmosphérique ;
4. profondeur de champ (ULTRA) ;
5. rayons de soleil ;
6. flou de mouvement de caméra (ULTRA) ;
7. développement (halo, ACES, étalonnage de l'heure, FXAA, netteté, grain) ;
8. gouttes sur l'objectif.

Les ombres en cascade sont refaites si leur qualité change ; un registre redonne les objets qui projettent au nouveau générateur.

### 3. Matières réalistes
- **Sol** en matériau physique (PBR) avec quatre matières **générées sur la carte graphique** (herbe couchée, terre à cailloux et
  fissures, roche fracturée à lichens et strates, neige ridée) : couleur, hauteur, normale, rugosité, cavité, en 256 px (LOW) à
  2048 px (ULTRA), sans aucun fichier.
- Mélange par hauteur, anti-répétition à deux échelles, roche triplanaire (normales « whiteout »).
- Pluie : la matière fonce et se lisse ; les flaques remplissent d'abord les creux de la matière.
- **Relief lointain** dans le même matériau physique : aucune frontière de lumière entre proche et lointain.
- **Palette** ramenée à des albédos plausibles (herbe ~15 %, terre ~10 %, roche ~17 %, neige ~85 %), en gardant les rapports
  validés (creux, prairie, sentiers, biome froid).
- **Végétation** : les textures sRGB du pack étaient lues comme de la lumière linéaire, et le matériau léger plafonnait la lumière
  à 1 (feuillage deux fois trop clair et saturé à côté du sol physique). Elles sont désormais passées en linéaire, ramenées à un
  albédo de feuille réel (saturation et luminosité par type), avec une marge de lumière ×2 et un reflet cireux.

### 4. Lumière et atmosphère
- Couleurs de l'heure réalistes : ciel de diffusion, soleil presque blanc à midi, doré bas, orangé au couchant ; nuit sombre.
- Ombres plus franches (88 % du soleil caché en plein jour), plus légères sous une lumière faible.
- Ciel : halo de Mie (Henyey-Greenstein) plus fort près de l'horizon, horizon plus chaud côté soleil, disque solaire assombri sur
  son bord ; nuages plats (LOW), en couches éclairées par Beer + « poudre » (MEDIUM, HIGH), ou en volume (ULTRA : marche à travers
  une couche, ombre propre, liseré argenté).
- Perspective atmosphérique (MEDIUM et plus) : extinction de distance + brume de hauteur intégrée exactement le long du regard,
  diffusion vers l'avant de l'astre, pour TOUS les pixels (végétation et personnages compris), depuis la profondeur de la
  pré-passe (aucun dessin de plus). LOW garde la brume des matériaux.
- Développement réaliste : ACES, aucune saturation ajoutée de jour, contraste léger, vignettage d'objectif à peine visible.

### 5. Ce que chaque profil apporte

| | LOW | MEDIUM | HIGH | ULTRA |
|---|---|---|---|---|
| Image | sans MSAA, FXAA, 1× | MSAA 2×, FXAA, ≤1,25× | MSAA 4×, FXAA, ≤1,5× | MSAA 8× (plafonné par la carte), ≤2× |
| Ombres | 2×1024, 60 m, PCF bas | 3×1024, 100 m, PCF moyen | 4×2048, 150 m, PCF haut | 4×4096, 220 m, PCSS (pénombre) |
| Occlusion | — | SSAO 8 éch., ½ | SSAO 16 éch., ¾ | SSAO 32 éch., pleine, flou bilatéral |
| Reflets | ciel seulement | ciel seulement | SSR ½ (sol mouillé) | SSR plein, flou selon rugosité |
| Atmosphère | brume des matériaux | perspective atmosphérique | idem | idem |
| Ciel | nuages plats, sonde 32 px / 2 s | en couches, 64 px / 1 s | en couches, 128 px / 0,5 s | en volume, 256 px / 0,25 s |
| Cinéma | — | rayons 24 | rayons 32 | rayons 48, profondeur de champ, flou de mouvement |
| Sol | 256 px, sans relief | 512 px, relief | 1024 px | 2048 px |
| Distances | 320 m, lointain 2 km, végétation ×0,6, couvre-sol 35 m à 50 % | 448 m, 3 km, ×0,8, 55 m à 75 % | 512 m, 4 km, ×1, 70 m | 640 m, 6 km, ×1,35, 90 m |
| Pluie | 1 500 gouttes | 3 000 | 6 000 | 9 000 |

### 6. Interface
Réglages → Graphismes (maquette v1) :
- choix du profil, description, profil actif ;
- application immédiate, enregistrement, « Rétablir par défaut » ;
- accès par la pause ou la touche O ; navigation au clavier, fenêtre modale nommée.

## Options écartées
- **Textures photographiques CC0** (Poly Haven, ambientCG) : excellentes, mais injoignables depuis l'environnement de
  développement. L'architecture les accueillera sans changement de shader (mêmes canaux : couleur + hauteur, normale + rugosité
  + cavité).
- **Illumination globale en temps réel** (RSM de Babylon, sondes de lumière) : coût élevé pour une scène extérieure éclairée par
  le ciel. Le rebond est approché par l'ambiance hémisphérique (rebond vert de l'herbe) + l'éclairage d'environnement du ciel.
- **TAA de Babylon** : historique flou sur la végétation animée par le vent ; MSAA 8× + alpha-to-coverage à la place en ULTRA.
- **Brume volumétrique ombrée** (marche dans la carte d'ombre) : coût et complexité ; les rayons à l'écran la remplacent.
- **Vrai ray tracing** : non disponible en WebGL 2.

## Conséquences
- Les modèles du pack restent stylisés par leur géométrie : leurs matières sont réalistes, leurs formes non. Un vrai saut vers le
  photoréalisme demandera des modèles photogrammétriques (arbres, rochers) et des textures photographiques — choix et budget à
  faire par José.
- Le nouveau matériau du sol remplace `render-data/painted-ground` et `adapters/babylon/painted-ground-plugin` (supprimés).
- Fluidité à mesurer sur la machine de José : ULTRA vise les cartes graphiques haut de gamme ; HIGH reste le profil par défaut.
