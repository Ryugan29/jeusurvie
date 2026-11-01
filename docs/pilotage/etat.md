# Jeu de survie fantasy — état
**Phase courante** : dev (commence par le spike « beau et fluide »)
**Objectif du projet** : sortir en 6 mois un bon jeu de survie fantasy en 3D (3e personne), solo, jouable dans le navigateur et en .exe.

## Décisions prises (date — décision — où c'est écrit)
- 2026-10-29 — Vue 3D à la 3e personne (choix de José) — ici
- 2026-10-29 — Solo, sans serveur ni compte (choix de José) — ici
- 2026-10-29 — Sauvegardes sur la machine du joueur (choix de José) — ici
- 2026-10-29 — Stack TypeScript + Babylon.js + Vite + Electron — docs/pilotage/stack.md
- 2026-10-29 — Monde infini généré, terrain naturel non modifiable ; récolte + objets posés (choix de José) — ici
- 2026-10-29 — Pas de fin : survie sans limite, score en jours survécus (choix de José) — docs/01-cadrage.md
- 2026-10-29 — Périmètre v1 validé : spike de fluidité préalable + stories S1 à S9 (José) — docs/01-cadrage.md
- 2026-10-29 — Jour/nuit + faim + chaleur en v1, pas de soif (proposé par l'équipe, validé par José) — docs/01-cadrage.md
- 2026-10-29 — 2 biomes en v1 (forêt tempérée de départ + biome froid) — docs/01-cadrage.md
- 2026-10-29 — 3 créatures en v1 : animal paisible, animal qui se défend, monstre de nuit ; dragons plus tard — docs/01-cadrage.md
- 2026-10-29 — Météo : premier ajout après la v1 (José) — docs/01-cadrage.md
- 2026-10-29 — Mort : réapparition (couchette > pierre-veilleuse > départ), sac dans une tombe, faim et chaleur à 50 % minimum au retour (José) — docs/01-cadrage.md
- 2026-10-29 — Boussole, mini-carte et carte en grand (M) en v1 → story S9 « Se repérer » ; une épingle personnelle (José) — docs/01-cadrage.md
- 2026-10-29 — Carte ou sac ouvert : le monde continue, le perso s'arrête ; seule la Pause arrête le jeu (José) — docs/02-maquette/notes.md
- 2026-10-29 — Nuit d'assaut toutes les 5 nuits : dernière story de la v1, sacrifiable (José) — docs/01-cadrage.md
- 2026-10-30 — Maquette v1 figée : 13 écrans et leurs états (José) — docs/02-maquette/
- 2026-10-30 — Direction artistique : stylisé coloré « fantasy » ; modèles 3D gratuits (CC0) d'abord, pack payant seulement si le test de beauté le justifie ; le spike devient un test « beau et fluide » (vrai style, lumière jour/crépuscule/nuit) validé par José (José) — docs/adr/0009
- 2026-10-30 — Repousse : bois et plantes oui (1-2 jours de jeu), roches et givrite non ; petit saut (ne franchit pas une palissade) ; le compteur de jours continue après une mort ; la nuit d'assaut vient au joueur s'il est loin du camp (José) — docs/01-cadrage.md, docs/03-archi.md
- 2026-10-30 — Architecture validée : cœur pur à pas fixe 30 Hz, collisions cinématiques sans Havok, génération déterministe figée, sauvegarde JSON validée par `load()`, port de stockage texte, Electron durci, UI DOM sans framework (José) — docs/03-archi.md, docs/adr/0001 à 0009

- 2026-11-01 — Lumière « de cinéma » (HDR + ACES) et météo avancée avant la v1 : clair → orage, pluie, sol mouillé, brouillard ; météo calculée depuis la graine, dans le cœur (José : « Lot 1 + météo ») — docs/adr/0010

- 2026-11-01 — Pluie réaliste (gouttes sur l'écran, nuages de pluie, reflets, flaques) et ciel fantastique : étoiles, voie lactée, étoiles filantes, planète géante, aurores (José : « Planète + aurores », gouttes toujours sous la pluie) — docs/adr/0011

- 2026-11-01 — Nouvelle identité visuelle réaliste (fin du « stylisé coloré » de l'ADR 0009) et quatre profils graphiques LOW / MEDIUM / HIGH / ULTRA, choisis dans Réglages → Graphismes, appliqués à chaud et enregistrés (José : « transformation graphique complète, objectif photoréalisme ») — docs/adr/0012

## Questions ouvertes (qui doit répondre)
- Machine de référence pour la fluidité (« PC moyen ») — superviseur, pendant le spike
- Modèles 3D animés libres de droits disponibles (fixe le bestiaire) — superviseur, pendant le spike
- Firefox dans la cible navigateur ? — superviseur, pendant le spike
- Noms du jeu, des 2 biomes et des créatures — José, quand il veut
- Origine et stockage des jeux HTML sur itch.io — superviseur, upload brouillon pendant le spike
- Politique `genVersion` après publication — superviseur, avant la première sortie
- Signature du .exe (« éditeur inconnu » ou certificat payant) — José, en phase déploiement
- Hébergement itch.io et mise sur GitHub — José, en phase déploiement

- Textures photographiques et modèles photogrammétriques CC0 (arbres, rochers) pour aller plus loin vers le photoréalisme : quelle source, quel budget de poids — José
- Profil par défaut au premier lancement (HIGH aujourd'hui) et détection automatique selon la carte graphique — José, après mesure sur sa machine

## Prochaine étape
Test « beau et fluide » : la scène 3D tourne (terrain, relief, biomes, végétation, lumière jour/crépuscule/nuit, brume, ombre).
Fait le 2026-10-30 : lumière de midi adoucie ; biomes + placement de la végétation + modèles 3D gratuits (nature) intégrés, contrôlés et AFFICHÉS dans la scène (arbres, pins, buissons, rochers, herbe, fleurs ; portée par type).
Fait aussi (retour de José : « mon perso passe à travers le décor ») : troncs d'arbres/pins (0,6 m) et rochers (1,3 m) arrêtent le joueur ; buissons, herbe et fleurs se traversent. Cercles vus du dessus, joueur repoussé hors du cercle (il longe l'obstacle) — core/physics/colliders, app/world/obstacle-index, GameSession.
Zone bloquante des rochers ajustée rocher par rocher après le retour de José (« je rentre un peu dans le rocher ») ; reste un cercle, donc un peu de mur invisible possible.
Caméra (2026-10-31) : elle se rapproche du joueur quand un tronc ou un rocher la gêne (perche raccourcie, minimum 1,2 m, survol des rochers bas) ; pas de lissage (elle saute) : José a dit que ça ne le gêne pas (2026-10-31).
Graphismes retravaillés (2026-11-01, retour de José : « pas beau, textures pas assez travaillées, univers fantasy façon WoW ») :
sol peint à la main (herbe à coups de pinceau, terre à cailloux, roche en blocs à fissures, neige à rides), généré au
démarrage (~0,45 s), mélangé selon la pente/le sentier/l'altitude ; lumière « peinte » (soleil doré, ombres bleues, crépuscule
doré sans vert olive), vignette légère et netteté. À valider à l'œil par José sur sa machine.
Refonte graphique (2026-11-01, demande de José : « vraie refonte, amélioration perceptible ») :
- image nette : rendu en vrais pixels de l'écran (125 %/150 % n'étirent plus l'image), MSAA 4×, bords des brins et des feuilles
  lissés (alpha-to-coverage) ; la toile suit sa taille (plus d'image 300 × 150 pixelisée à l'ouverture en arrière-plan) ;
- prairie : herbe à la cheville (les modèles du pack faisaient 1,3 à 1,8 m), plus dense, éclairée comme le sol (normales vers le
  haut), contre-jour doré dans l'herbe et les feuillages quand le soleil est bas ;
- lointains : relief réel sur 4 km autour du joueur (grille grossière calculée dans un worker), forêts lisibles de loin, brume
  réglée sur les kilomètres (chaînes qui bleuissent, vallées embrumées) ;
- PBR : roches, écorces, champignons et personnages en métal/rugosité, éclairés par le ciel de l'heure (sonde IBL) ;
- nuit : lucioles autour du joueur, champignons bioluminescents.
Interrupteurs pour comparer : ?aa=0 ?lointain=0 ?ibl=0 ?translucide=0 ?magie=0 ; le panneau (F) affiche le temps GPU par image.
Non vérifié : la fluidité. Dans l'aperçu de l'outil, le GPU mesuré variait de 15 à 220 ms pour une même scène (fenêtre en
arrière-plan) : à mesurer par José sur sa machine (panneau F, ligne « GPU … ms »).
Non fait : l'héroïne reste en sous-vêtements (aucune tenue dans les packs téléchargés : il faut un pack de tenues, à choisir
par José) ; arbres tortueux (TwistedTree, ~9 500 triangles) écartés par le plafond de 6 000 triangles des assets.
Pas encore : créatures et objets posés (rectangles) viendront avec leurs étapes.
Reste : mesurer la fluidité sur la vraie machine de José (pas de culling par chunk, brume de hauteur seulement sur le terrain, modèles hors du build) ; José valide à l'œil (beauté + fluidité sur sa machine) ; perso et créature animés CC0 ; squelette Electron durci ; mesures de
fluidité ; ADR « rendu et animation ». Puis prototype jouable.
Preview : double-clic sur run.bat → http://localhost:5173 (rechargement automatique à chaque modif).
Lumière et météo (2026-11-01, demande de José : « aussi beau que Les Brumes d'Astréa ») : rendu HDR + ACES, soleil fort et ombres colorées,
crépuscule doré, disque solaire qui rayonne, grain ; météo (clair, nuageux, bruine, pluie, orage, brouillard) qui s'enchaîne seule, pluie,
éclairs, sol mouillé, vent — ADR 0010. Démo : touche 6 ou ?meteo=pluie|orage|brouillard ; ?tonemap=standard et ?pluie=0 pour comparer.
Non vérifié : la fluidité sur la machine de José (pluie = particules processeur, 6 000 en qualité haute). Pas encore de sons.
Pluie et ciel (2026-11-01, suite, demande de José) : gouttes sur l'objectif (?gouttes=0), nuages de pluie bas et ardoise, sol qui reflète le ciel,
flaques à ronds de pluie, roches/troncs/personnages luisants ; la nuit : étoiles en 3 couches qui rayonnent, voie lactée, étoiles filantes, lune à mers ;
planète géante toujours visible (10° à 30°), pâle le jour ; aurores chaque nuit dégagée — ADR 0011. Fluidité mesurée sur la machine de José : ~90-98 images/s.
Refonte réaliste et profils graphiques (2026-11-01, ADR 0012) : sol physique à matières générées sur la carte graphique (herbe couchée,
terre à cailloux, roche à lichens, neige ridée), palette et lumière réalistes, végétation repassée en albédo réel, ciel à diffusion de Mie
et nuages en couches ou en volume (ULTRA), perspective atmosphérique en passe d'image, ombres PCSS (ULTRA), reflets à l'écran sur sol
mouillé (HIGH, ULTRA), profondeur de champ et flou de mouvement (ULTRA), élagage de la végétation hors du champ. Réglages → Graphismes
(pause ou touche O) : LOW / MEDIUM / HIGH / ULTRA, description, application immédiate, enregistrement, « Rétablir par défaut ».
Vérifié à l'écran dans le navigateur automatique (rendu logiciel, sans carte graphique) ; NON vérifié : la fluidité réelle de chaque profil
sur la machine de José (panneau F, ligne « GPU … ms »).
