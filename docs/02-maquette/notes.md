# Maquette v1 — notes

> Figée le 2026-10-30 sur validation de José. Fichier : `docs/02-maquette/index.html` (navigable : une barre d'écrans, une barre d'états).
> Critique : designer UX/UI, game designer, développeur (1 round ; avis convergents, pas de round 2).
> Formes, décors et icônes (emojis) sont **provisoires** : seuls le contenu, la place et le moment d'apparition sont validés.

## Écrans → stories couvertes
| Écran | États | Stories |
|---|---|---|
| Titre | avec sauvegarde, première fois, .exe | S7 |
| Nouveau monde | simple, options avancées (graine) | S1 |
| Charger | liste, vide, illisible, mise à jour, supprimer, import refusé, .exe | S7 |
| Chargement | en cours, erreur | S1 |
| En jeu — jour | début de partie, récolte, fabrication réussie, faim critique, biome froid sans cape, crépuscule, après réapparition, sac plein | S1, S2, S3, S4, S9 |
| En jeu — nuit | près du Foyer, loin du Foyer, attaque hors champ, combat, réparer, nuit d'assaut, échec de sauvegarde | S3, S5, S7, S8, S9 |
| Sac (Tab) | sac, nourriture choisie, sac plein, fabriquer, fabriquer (début), construire, carnet | S2, S3, S6 |
| Coffre / tombe | coffre, ruine fouillée, tombe, tombe + sac plein | S2, S4, S6 |
| Carte (M) | exploration, après une mort, avec épingle, attaqué carte ouverte | S9 |
| Poser un objet | valide, trop pentu, bloqué | S2 |
| Pause | pause, sauvegardé, clique pour reprendre, navigation privée | S1, S7 |
| Mort | créature, froid, faim, sans couchette, sans couchette ni pierre | S4 |
| Réglages | contrôles, changer une touche, touche déjà prise, graphismes, son, accessibilité | S1 |

## Décisions
**De José**
- Boussole (haut centre), mini-carte (haut droite) et carte en grand (M) en v1 → story S9 ajoutée au cadrage.
- Carte ou sac ouvert : le monde continue, le personnage s'arrête. Seule la Pause arrête le jeu.
- Une épingle personnelle sur la carte, reportée sur la boussole.
- Réapparition avec faim et chaleur à 50 % minimum.

**Tranchées par le superviseur (techniques ou d'ergonomie)**
- Échap ouvre toujours la Pause ; M et Tab ferment carte et sac et reprennent la souris (contrainte du navigateur sur la capture de souris).
- Carte : jauges, indicateur d'attaque et bord clignotant restent visibles ; 3 niveaux de zoom fixes ; voile léger.
- Mini-carte nord en haut, flèche du joueur qui tourne ; même source de direction que la boussole ; heure en anneau autour de la mini-carte.
- Boussole : Foyer (au-delà de 30 m), tombes, pierre activée la plus proche, épingle ; pas les ressources.
- Monstres visibles sur la carte seulement s'ils t'ont repéré.
- Jauges : vie (rond), faim (carré), chaleur (hexagone, rayée bleue quand on a froid) ; flèche de tendance ; forme + couleur partout.
- Crépuscule comme état à part entière (le moment de décider de rentrer).
- Retours d'action : progression de récolte, « +N », message de fabrication, barre de vie de la cible, état des constructions.
- Pas de glisser-déposer en v1 : clic puis 1–8 ; pas de « ×5 », pas de « Renommer ».
- Fantôme de pose : teinte bleue ✓ / rouge en pointillés ✗ + raison écrite.
- Pas de flou derrière les fenêtres (coût GPU).

## Composants d'interface identifiés
Jauge · CaseObjet · BarreRapide · GrilleSac · DetailObjet · LigneRecette (Fabriquer et Construire) · Onglets · Panneau/Fenêtre · Bouton (principal/normal/discret/lien/danger) · Message (info/erreur/ok) · BarreProgression · Champ · Touche · LigneRéglage (curseur/sélecteur/touche) · EntréeMonde · Horloge (anneau) · Invite · Indice · Objectifs · Toast · IndicateurSauvegarde · InfoPose · AideTouches · Réticule · ArcEndurance · IndicateurDégâts · VieCible · ÉtatConstruction · Boussole + RepèreBoussole · RenduCarte (mini-carte et carte, un seul composant) · MarqueurCarte · TransfertDeuxGrilles (coffre/tombe) · Carnet.
Tous alimentés par des sélecteurs purs du cœur du jeu ; l'affichage n'écrit que ce qui change.

## Contraintes techniques relevées (pour l'archi)
- Échelle d'interface = min(largeur/1280, hauteur/720) × réglage, pouvant descendre sous 1 (portable 1366×768 ≈ 650 px utiles dans le navigateur).
- Résolution de rendu 3D séparée de l'interface (réglage d'échelle de rendu).
- Touches lues par position physique (`KeyboardEvent.code`) ; affichage selon le clavier du joueur quand c'est possible (ZQSD/WASD).
- Raccourcis navigateur : Tab, F5, clic droit, Espace, Ctrl+molette neutralisés ; Ctrl+W impossible à bloquer → sauvegarde auto. Electron : menu par défaut supprimé.
- Zone explorée : grille de cellules (~16 m) en régions creuses, sauvegardée (quelques Ko) ; images de carte recalculées depuis la graine, jamais sauvegardées, générées hors du fil principal.
- Pause déclenchée par la perte de capture de souris, pas par la touche Échap.
- Icônes : un jeu d'icônes maison (SVG) remplacera les emojis (affichage variable selon le système, et 🗿 retiré : objet du monde réel).
- Navigation privée pas toujours détectable : avertissement « au mieux ».

## Points reportés
- Jeu d'icônes définitif, direction artistique, noms du jeu, des biomes et des créatures.
- Navigation complète au clavier dans le sac ; manette ; filtres daltoniens.
- Sous-titres de tous les sons (seul l'indicateur visuel des attaques est en v1).
- Valeurs exactes (rayons, durées, seuils) : fixées par le spike puis le premier playtest.
- Firefox : comportement de la capture de souris et des touches à vérifier pendant le spike.
