# ADR 0011 — Pluie réaliste et ciel fantastique (planète, aurores)
**Statut** : accepté — 2026-11-01. Choix de José : « Planète + aurores », gouttes sur l'écran « toujours sous la pluie ».
Prolonge l'ADR 0010.

## Contexte
Retour de José sur la refonte de l'ADR 0010 :
- pas de gouttes sur l'écran ;
- quasiment pas de nuages quand il pleut ;
- peu de reflets ;
- trop peu d'étoiles, et sans éclat ;
- envie de lever les yeux et de voir une planète.

## Décision
- **Gouttes sur l'objectif** :
  - `render-data/lens-drops` (pur) calcule la densité selon la pluie et l'inclinaison de la caméra (plus de gouttes en
    regardant le ciel). L'objectif se mouille en ~1,2 s et sèche en ~5 s.
  - `babylon/lens-drops` est une dernière passe d'image : deux tailles de gouttes, qui glissent en laissant un filet
    d'eau, chacune agissant comme une petite lentille (l'image derrière est retournée).
  - Cette passe n'est accrochée à la caméra que s'il y a des gouttes : aucun coût par temps sec. `?gouttes=0` la coupe.
- **Nuages de pluie** :
  - sous la couche haute, une couche basse, sombre et en lambeaux, qui file avec le vent ;
  - dessous gris ardoise, assez sombres pour se détacher du ciel couvert (`atmosphere`).
- **Reflets** :
  - le sol mouillé reflète les couleurs du ciel, surtout en rasant (effet Fresnel) ;
  - des flaques se forment sur le plat (surtout les sentiers), font miroir et montrent des ronds de pluie ;
  - roches, écorces, champignons et personnages (matériaux PBR) deviennent plus lisses, donc luisants (ils reflètent le
    ciel de l'heure), et plus sombres (`render-data/surfaces → wetSurface`, `babylon/wet-surfaces`). Leur état sec est
    retenu et rétabli exactement.
  - Ce sont des reflets « peints » à partir des couleurs du ciel, pas de vrais miroirs : coût très faible.
- **Ciel de nuit** :
  - **étoiles** en trois couches, réparties sur une grille 3D de la voûte : poussière, moyennes, brillantes. Les plus
    brillantes ont un halo et passent le seuil du halo de l'étalonnage. Couleurs bleutées, blanches ou dorées, avec
    scintillement ;
  - **voie lactée** colorée, traversée de fils de poussière ;
  - **étoile filante** possible toutes les 5 s ;
  - **lune** plus grande, avec des mers sombres.
- **Ciel fantastique** :
  - **voûte** : elle tourne d'un tour par cycle autour d'un pôle à 20° au-dessus de l'horizon (`render-data/cosmos`) ;
  - **planète géante** fixée près de ce pôle, donc toujours entre 10° et 30° de hauteur, dans le champ de la caméra à la
    3e personne :
    - bandes turquoise et violettes, tempêtes ambrées, atmosphère qui s'allume sur le bord ;
    - éclairée de trois quarts par une étoile lointaine (un croissant d'ombre toujours lisible) : éclairée par la lune,
      elle n'apparaissait que comme un disque noir ;
    - pâle le jour, splendide la nuit ;
  - **aurores** : deux rideaux vert d'eau virant au violet, striés de rayons, au-dessus de l'horizon +Z. Elles sont là
    chaque nuit par temps dégagé, et leur force varie d'une nuit à l'autre (`AURORA_MIN` = 0,55).

## Options écartées
- **Vrais reflets miroir** (rendu de la scène retournée) : coût élevé pour un gain faible dans un jeu à la 3e personne.
- **Planète à anneaux** ou **planète + petite lune** : proposées à José, non retenues.
- **Planète éclairée par l'astre du moment** : la nuit, l'astre est la lune, juste à côté ; on ne voyait alors que la
  face sombre.

## Conséquences
- Le shader du ciel est plus lourd la nuit. Mesuré sur la machine de José (navigateur automatique, qualité haute,
  2560 × 1249) : ~98 images/s et 9,8 ms de carte graphique le matin, ~90 images/s sous la pluie, ~86 images/s et 11,4 ms la nuit (planète et étoiles). Voie lactée et planète en bruit à 3 octaves pour alléger ; pistes si besoin : cuire la voûte dans un cube.
- Relecture : gouttes jamais coupées par leur case, passe des gouttes raccrochée en dernier quand l'étalonnage se reconstruit, halo des étoiles sans « petit carré », matériaux mouillés suivis par relecture de la liste (Babylon annonce les ajouts au tour suivant).
- La planète n'a pas encore de nom (à choisir par José, avec les noms du monde).
