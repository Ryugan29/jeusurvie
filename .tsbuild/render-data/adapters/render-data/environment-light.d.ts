import { type Lighting } from './lighting';
/** Plafond du réglage : 1 = le rendu d'avant (ciel pris tel quel). Le reflet ne devient jamais plus fort que ce rendu validé. */
export declare const IBL_MAX = 1;
/**
 * Lumière reçue par un sol plat divisée par la luminance moyenne du ciel, par plein jour clair à midi (0,3 du cycle, temps clair) :
 * ≈ 2,54 avec le ciel réaliste de l'ADR 0012 (2,25 avec l'ancien ciel peint, plus lumineux). C'est le repère « 1 » : ailleurs, le réglage vaut (lumière du sol / luminance du ciel) / 2,25.
 * Si la palette de lumière change et que ce repère dérive, le test « plein jour clair, à midi : 1 » le signale.
 */
export declare const CLEAR_NOON_LIGHT_PER_SKY = 2.536;
/**
 * Rapport maximal visé entre la lumière d'une face verticale (reflet compris, matière de référence = la peau, matière par défaut) et celle
 * du sol. Le critère de rendu est 1,10 : on vise un peu en dessous car les cheveux et les champignons reçoivent 9 % de ciel de plus que
 * la peau (0,60 contre 0,55). Au pire (reflet à son maximum permis), ils sortent à 1,06 + 0,09 × 0,24 ≈ 1,08.
 */
export declare const SIDE_FACE_MAX_RATIO = 1.06;
/**
 * Lumière reçue par un sol plat (ambiance + astre selon sa hauteur), NON bornée : contrairement à `sceneBrightness` (atmosphere,
 * coupée à 1), elle distingue un midi franc (≈ 1,3) d'un ciel simplement couvert, ce qui est justement l'écart à suivre.
 */
export declare function groundLight(l: Lighting): number;
/** Un personnage est vu de côté : sa face verticale reçoit la moitié de ce que l'astre donnerait à un mur plein face. */
export declare const SIDE_FACE_SUN_SHARE = 0.5;
/**
 * Lumière directe et d'ambiance reçue par une face VERTICALE (un personnage vu de côté), sans le reflet du ciel : la moyenne de
 * l'ambiance du ciel (dessus) et de celle du sol (dessous), plus l'astre de côté. Même unité que `groundLight`.
 */
export declare function sideFaceLight(l: Lighting): number;
/** Luminance moyenne du ciel peint (moyenne zénith + horizon) : ce que la sonde photographie. */
export declare function skyLuminance(l: Lighting): number;
/**
 * Réglage du reflet du ciel (`scene.iblIntensity`, multiplié à chaque image au niveau de la texture d'environnement), de 0 à IBL_MAX.
 * Reflet envoyé = luminance du ciel × réglage = lumière du sol / 2,25 : le reflet baisse exactement au rythme de la lumière, au lieu
 * de suivre le ciel gris qui reste clair. Plein jour clair à midi : 1. Matin, crépuscule, ciel couvert, pluie, orage : moins.
 * La nuit, le ciel est sombre par rapport à la lune : le calcul dépasserait 1, le plafond garde alors le rendu d'avant.
 * Deuxième plafond, « combler seulement » : le reflet ne dépasse pas ce qui manque à une face verticale pour atteindre SIDE_FACE_MAX_RATIO
 * fois la lumière du sol. À midi il manque beaucoup (l'astre est haut : les faces verticales en reçoivent peu) : ce plafond est loin
 * au-dessus et ne joue pas. Astre bas (aube, lune rasante, crépuscule) : la face est déjà bien éclairée, le reflet est réduit d'autant.
 * Entrée absurde (NaN, infini) : le rendu d'avant plutôt qu'un NaN envoyé à la carte graphique.
 */
export declare function iblIntensityFor(l: Lighting): number;
