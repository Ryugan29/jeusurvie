# Cadrage — v1 du jeu de survie fantasy

> Validé par José le 2026-10-29. Équipe : analyste métier, game designer, designer UX/UI, concepteur technique (2 rounds).
> Les critères d'acceptation deviennent les tests : chaque valeur « fixée » (durées, seuils) est un paramètre d'équilibrage
> défini dans le cœur du jeu, ajustable après playtest sans casser les tests.

## Intention
Un jeu de survie solo en 3D, vue à la 3e personne, dans un monde fantasy original, coloré et stylisé, généré sans fin.
Le jour, on part explorer et récolter ; à la tombée de la nuit, on rentre se mettre à l'abri près du feu, parce que la nuit
est froide et que les monstres sortent. Il n'y a pas de fin : on survit le plus longtemps possible, et on s'éloigne toujours
un peu plus pour trouver ce qui fait grandir son camp. La v1 doit répondre à une seule question : **est-ce que la boucle
« explorer → récolter → construire → tenir la nuit » donne envie de rejouer ?**

## Joueur cible
Joueur PC habitué aux jeux de survie, qui veut lancer une partie en moins d'une minute, dans le navigateur ou en .exe, sans compte.

## Boucle de jeu
- **Courte (30 s – 2 min)** : repérer une ressource ou une menace → récolter ou combattre → l'inventaire se remplit →
  fabriquer ou poser un objet → décider où aller selon l'heure, la chaleur et ce qui manque.
- **Moyenne (un cycle d'environ 20 min : ~14 de jour, ~6 de nuit)** : expédition le jour, retour au camp au crépuscule,
  tenir la nuit près du feu, bilan à l'aube.
- **Longue (plusieurs sessions)** : faire évoluer le **Foyer** (feu central du camp) de *braises* à *foyer de pierre*,
  ce qui demande de la *givrite* trouvée seulement dans le biome froid ; découvrir des lieux ; tenir les nuits d'assaut.
- **Score** : jours survécus + carnet d'explorateur minimal (biomes, créatures et lieux vus).

## Préalable technique (pas une story)
**Spike de fluidité (1 à 2 semaines), avant toute story** : terrain en chunks chargés pendant qu'on court, végétation,
une capsule qui court, 20 créatures animées, capture de la souris (navigateur + Electron), compteur d'images/s.
Il fixe le plafond de créatures, la distance de vue et la machine de référence. Si l'objectif de fluidité n'est pas tenu,
retour au cadrage avant d'aller plus loin.

## User stories de la v1 (dans l'ordre de construction)

### S1 — Parcourir un monde généré
En tant que joueur, je veux démarrer une partie dans un monde généré et le parcourir à la 3e personne, afin d'avoir un terrain nouveau à explorer.
- Given une graine G, When on génère deux fois la zone (x,z), Then hauteurs, biome et ressources sont identiques.
- Given deux chunks voisins, When on compare leurs sommets de bord, Then ils ont exactement la même hauteur (pas de couture).
- Given une graine G, When on échantillonne 1 000 positions dans le rayon de départ, Then les 2 biomes de la v1 apparaissent.
- Given un joueur qui se déplace, Then le nombre de chunks chargés ne dépasse jamais le plafond fixé, et le joueur ne tombe jamais dans le vide.
- Given le jeu dans le navigateur, When je clique dans la scène, Then la souris est capturée pour la caméra ; When j'appuie sur Échap, Then le jeu se met en pause et la souris est libérée.
- Given la caméra derrière le joueur et un obstacle entre les deux, Then la caméra se rapproche au lieu de traverser l'obstacle.
- Given le joueur au sol, When il saute, Then il s'élève puis retombe sur le sol ; la hauteur du saut est inférieure à celle d'une palissade.
- Given le joueur qui avance vers le bord du monde, Then il reste bloqué par des montagnes infranchissables et ne dépasse jamais le rayon du monde.
- Given la machine de référence et le plafond de créatures atteint, When on mesure 60 s, Then la moyenne est d'au moins 60 images/s.

### S2 — Récolter, fabriquer et poser
En tant que joueur, je veux récolter des ressources, fabriquer des outils et poser des objets, afin de m'équiper et de bâtir un camp.
- Given une ressource à portée, When je récolte, Then l'inventaire gagne la quantité définie et la ressource disparaît.
- Given une ressource récoltée, When son chunk est déchargé puis rechargé, Then elle est toujours absente (identifiant stable).
- Given un arbre ou une plante récoltés, When le temps de repousse (≈ 1-2 jours de jeu) est écoulé, Then la ressource est de nouveau là ; Given une roche ou de la givrite récoltées, Then elles ne repoussent jamais.
- Given une ressource hors de portée, When je récolte, Then l'inventaire ne change pas.
- Given que j'ai ramassé au moins un ingrédient d'une recette, Then la recette apparaît, grisée tant que les ingrédients manquent, avec les manquants signalés.
- Given les ingrédients d'une recette, When je fabrique, Then l'objet est ajouté et les ingrédients sont retirés exactement.
- Given un objet posable et son coût, When je le pose sur un emplacement valide, Then il apparaît et l'inventaire diminue exactement du coût.
- Given un emplacement invalide (pente trop forte, chevauchement), When je vise, Then l'aperçu est rouge avec la raison écrite, et la pose est refusée sans rien dépenser.
- Given un coffre posé ouvert, When je déplace des objets entre sac et coffre (un par un ou « tout »), Then les quantités totales sont conservées exactement.
- Given une récolte réussie ou une fabrication, Then un retour visible confirme le gain (« +2 bois », « Hachette fabriquée → case 1 »).
- Contenu v1 : outils *hachette*, *pioche*, une arme, une *cape chaude* ; objets posables *feu de camp/Foyer*, *abri*, *couchette*, *coffre*, *palissade*, *torche*.

### S3 — Survivre au jour, à la nuit, à la faim et au froid
En tant que joueur, je veux que la nuit, la faim et le froid me mettent en danger, afin que me préparer et construire aient un sens.
- Given un cycle de durée D, When le temps atteint la fraction « nuit », Then l'état passe à nuit (horloge injectée).
- Given le temps à moins de C minutes de la nuit, Then l'état « crépuscule » est actif : il est affiché, et un indice donne la distance au Foyer si le joueur en est loin.
- Given la nuit, Then l'image reste lisible (luminosité minimale), et la torche et le feu éclairent nettement autour d'eux.
- Given le joueur à plus de R m d'un feu allumé la nuit (ou dans le biome froid sans cape), When le temps passe, Then la chaleur baisse au rythme fixé ; à moins de R m d'un feu, elle remonte.
- Given le temps qui passe, Then la faim baisse au rythme fixé ; When je mange, Then elle remonte de la valeur de l'aliment.
- Given faim ou chaleur à 0, Then la vie baisse au rythme fixé.
- Given que le joueur est en échec probable (la nuit tombe sans feu, faim critique), Then un indice d'une ligne s'affiche une fois, sans fenêtre ; les indices sont désactivables.
- Given les 10 premières minutes d'une nouvelle partie, Then 4 objectifs légers et désactivables guident le joueur : couper du bois, fabriquer la hachette, allumer un feu, survivre à la nuit.

### S4 — Mourir et revenir
En tant que joueur, je veux comprendre pourquoi je suis mort et pouvoir revenir chercher mes affaires, afin que la mort pique sans effacer des heures de jeu.
- Given la vie à 0, Then l'écran de mort affiche la cause (faim, froid, nom de la créature) et le nombre de jours survécus.
- Given la mort, Then tout le contenu du sac (barre rapide comprise) et la cape portée sont déposés dans une tombe à l'endroit de la mort, visible de loin.
- Given la mort au jour N, When je réapparais, Then le compteur de jours continue (toujours N) et le nombre de morts du carnet augmente de 1.
- Given une couchette posée, When je réapparais, Then c'est à la couchette ; sinon à la dernière pierre-veilleuse activée ; sinon au point de départ.
- Given une réapparition, Then faim et chaleur valent au moins 50 % (remontées si elles étaient plus basses).
- Given une tombe, When je l'ouvre et récupère tout, Then je récupère exactement son contenu et elle disparaît.
- Given une tombe et un sac sans assez de place, When je récupère tout, Then le sac se remplit et le reste demeure dans la tombe, qui reste en place.
- Given une nouvelle mort avant d'avoir récupéré la tombe précédente, Then la règle appliquée est définie (par défaut : les deux tombes restent).

### S5 — Affronter les créatures
En tant que joueur, je veux croiser des animaux et un monstre de nuit et pouvoir me battre, afin que l'exploration et la nuit soient risquées.
- Créatures v1 : un animal paisible (nourriture), un animal qui se défend quand on l'attaque, un monstre de nuit.
- Given le jour, Then le monstre de nuit n'apparaît pas ; Given la nuit, Then il apparaît, sans que le total de créatures actives dépasse le plafond (≈15, fixé par le spike).
- Given une créature hostile qui détecte le joueur dans son rayon, When elle est à portée, Then les PV du joueur baissent du montant défini.
- Given une créature à portée, When le joueur frappe, Then ses PV baissent ; à 0, elle meurt et laisse son butin.
- Given un obstacle (palissade) entre un monstre et sa cible, Then le monstre ne le traverse pas et le frappe ; la palissade perd des PV et disparaît à 0.
- Given une attaque venant de hors de l'écran, Then un indicateur montre sa direction.
- Combat v1 : une attaque, endurance visible seulement en combat ou en sprint ; pas d'esquive.

### S6 — Explorer et faire grandir son camp
En tant que joueur, je veux trouver des lieux et des ressources rares en m'éloignant, afin d'avoir une raison d'explorer sans fin.
- Given une graine G, Then des lieux sont placés de façon déterministe, avec au moins un lieu tous les 2-3 chunks, sur un sol assez plat.
- Lieux v1 : *pierre-veilleuse* (une fois activée : point de réapparition et repère) et *ruine* avec un coffre.
- Given un coffre de ruine ouvert, When je reviens plus tard ou recharge la partie, Then il reste ouvert et vide.
- Given la *givrite* (biome froid uniquement) et les autres matériaux requis, When j'améliore le Foyer, Then il passe de *braises* à *foyer de pierre* et son rayon de chaleur augmente.
- Given la distance au point de départ, Then le danger augmente par anneaux (calme près du départ, plus de monstres et meilleur butin plus loin).

### S7 — Sauvegarder et reprendre
En tant que joueur, je veux quitter puis reprendre ma partie sans rien perdre, dans le navigateur comme dans le .exe.
- Given une partie (ressources récoltées, objets posés, coffres ouverts, tombe, heure du cycle, faim, chaleur, inventaire), When je sauvegarde puis recharge, Then tout est identique.
- Given un fichier de sauvegarde, Then il ne contient aucune donnée de terrain : la graine, les changements, l'état du joueur et un numéro de version.
- Given une sauvegarde corrompue ou modifiée à la main, When on la charge, Then le jeu ne plante pas et affiche un message.
- Given le jeu dans le navigateur, Then la partie est sauvegardée automatiquement à intervalle régulier et quand l'onglet passe en arrière-plan.
- Given une partie, When j'exporte, Then je reçois un fichier ; When je l'importe sur un navigateur vierge ou dans le .exe, Then la partie est identique.
- Given le .exe, When je sauvegarde, ferme puis rouvre, Then la partie se recharge depuis le dossier utilisateur.

### S9 — Se repérer (ajoutée par José en maquette, le 2026-10-29)
En tant que joueur, je veux une boussole, une mini-carte et une carte en grand, afin de m'orienter dans un monde infini sans perdre le goût de la découverte.
*À construire après S6 (lieux) et avant S8.*
- Given le joueur qui se déplace, Then les cellules dans un rayon fixe autour de lui (≈50 m, indépendant des réglages graphiques) sont marquées explorées ; de nuit, le rayon est réduit.
- Given la carte ou la mini-carte, Then seules les zones explorées sont visibles ; les ressources n'y figurent jamais ; un lieu n'y apparaît qu'une fois approché.
- Given des repères connus, Then la boussole affiche au plus : le Foyer (au-delà de 30 m), les tombes (avec leur jour), la pierre-veilleuse activée la plus proche et l'épingle, chacun avec sa distance arrondie à 10 m.
- Given un monstre qui a repéré le joueur, Then il apparaît sur la mini-carte et la carte ; les autres non.
- Given la touche M, When je l'appuie, Then la carte s'ouvre ; le monde continue, le personnage s'arrête ; M la referme, Échap ouvre la pause.
- Given la carte ouverte, When le joueur subit une attaque, Then jauges et indicateur d'attaque restent visibles et le bord de la carte le signale.
- Given la carte, When je pose une épingle, Then elle remplace la précédente (une seule) et apparaît sur la boussole.
- Given une sauvegarde puis un rechargement, Then la zone explorée et l'épingle sont identiques.

### S8 — La nuit d'assaut *(dernière story de la v1, sacrifiable si le temps manque)*
En tant que joueur, je veux qu'une nuit régulière mette mon camp à l'épreuve, afin de ne pas pouvoir m'enfermer et ne plus prendre de risque.
- Given toutes les 5 nuits, Then le nombre de monstres est doublé (dans la limite du plafond) et ils se dirigent vers le Foyer si le joueur en est proche.
- Given une nuit d'assaut et le joueur loin de son Foyer, Then les monstres de l'assaut le traquent là où il est ; le camp n'est jamais attaqué en son absence.
- Given une nuit d'assaut à venir, Then un compteur discret l'annonce (« Assaut dans 2 nuits ») et un signal l'annonce au crépuscule.
- Given une construction abîmée, When je la vise, Then son état est visible ; When je la répare avec des ressources, Then elle retrouve ses PV.

## Hors périmètre de la v1 (explicite)
- **Météo** (pluie, neige, orage, annonce de la météo) : **premier ajout après la v1**, branché sur la chaleur et les biomes.
- 3e biome et suivants ; nids de monstres, sources ; fragments de recette ; paliers 3 et 4 du Foyer.
- Créatures au-delà de 3 ; **dragons**.
- Soif ; esquive ; murs/sols/toits à assembler ; séchoir, appentis.
- Manette, bestiaire complet, filtres daltoniens (mais forme + couleur partout dès la v1), langues autres que le français, sous-titres de tous les sons.
- Mode de jeu à mort définitive ; difficultés ; multijoueur.
- Publication itch.io, signature du .exe, intégration continue (phase déploiement).

## Hypothèses à vérifier
- Le spike tient 60 images/s avec 2 biomes et ~15 créatures sur un PC moyen (machine de référence à définir).
- Des modèles 3D animés libres de droits (CC0), cohérents et partageant un squelette commun, existent pour le joueur, 2 animaux et 1 monstre.
- La nuit + la faim + le froid créent assez de tension sans la météo.
- Un cycle de ~20 min convient à une session de test.
- Monde « infini » : il est vaste (plusieurs km) avec un bord discret que le joueur ne rencontre pas en pratique, pour éviter les tremblements de l'image très loin du départ.

## Risques
- **Majeur** — fluidité du monde généré dans le navigateur → spike préalable.
- **Majeur** — disponibilité des modèles animés libres de droits → inventaire des packs pendant le spike ; le bestiaire s'adapte à ce qui existe.
- **Majeur** — monstres coincés sur le relief (pas de calcul de chemin sur un monde infini) → règle « tout droit, et frapper l'obstacle ».
- **Majeur** — monde répétitif au-delà des premiers anneaux → lieux à découvrir et danger par la distance ; à juger au premier playtest.
- **Mineur** — sauvegardes du navigateur effaçables par le navigateur → sauvegarde auto, export/import, avertissement en navigation privée.
- **Mineur** — sauvegardes navigateur et .exe séparées → le dire au joueur ; l'export/import fait le pont.
