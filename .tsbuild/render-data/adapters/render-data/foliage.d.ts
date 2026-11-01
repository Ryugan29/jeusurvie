import type { Rgb } from './palette';
export type FoliageKind = 'grass' | 'plant' | 'flower' | 'tree' | 'pine' | 'bush';
export interface FoliageProfile {
    readonly kind: FoliageKind;
    /** Hauteur (m, dans le modèle) qui vaut « pointe » : le dégradé et le vent montent de 0 (pied) à 1 (là). */
    readonly heightRefM: number;
    /** Débattement du vent à la pointe (m, avant l'échelle de l'instance). */
    readonly windM: number;
    /** Force du dégradé pied sombre → pointe claire (0 = aucun). */
    readonly gradient: number;
}
export declare function foliageProfileFor(materialName: string): FoliageProfile | undefined;
/**
 * Albédo réaliste de la végétation (ADR 0012). Les textures du pack sont peintes en couleurs vives (verts sans aucun bleu, herbe
 * ~2,5 fois plus claire qu'une vraie prairie) et le matériau léger les lisait telles quelles, en sRGB, comme si c'était de la
 * lumière linéaire : la végétation ressortait deux fois plus claire et plus saturée que le sol physique. Le shader les repasse en
 * linéaire, puis les ramène vers le gris (saturation, 1 = inchangée) et à une luminosité de feuille réelle (facteur) : herbe et
 * feuilles ~10 à 18 % de la lumière, aiguilles de pin plus sombres, fleurs plus colorées.
 * Mesuré sur les textures (linéaire, moyenne des pixels utiles) : feuillus 0,16, pins 0,08, feuillage des buissons et plantes 0,23,
 * nuancier de l'herbe ~0,37.
 */
export declare const FOLIAGE_ALBEDO: Readonly<Record<FoliageKind, {
    readonly saturation: number;
    readonly value: number;
}>>;
/**
 * Marge de lumière du matériau léger : il plafonne l'éclairage diffus à 1 avant de multiplier par la couleur ; sous le soleil HDR
 * (jusqu'à ~1,6 sur le sol), une feuille saturait. La lumière est divisée par cette marge avant le plafond, la couleur multipliée
 * d'autant après : même résultat sous le plafond, et jusqu'à 2 fois plus de lumière avant de saturer.
 */
export declare const FOLIAGE_HDR_HEADROOM = 2;
/** Multiplicateurs de couleur du dégradé : pied à l'ombre des autres brins (vert froid, sombre), pointe au soleil (jaune-vert). */
export declare const SHADE_FOOT: Rgb;
export declare const SHADE_TIP: Rgb;
/** Hauteur relative où la pointe est atteinte : le haut du brin reste clair, seul le bas s'assombrit. */
export declare const SHADE_TOP = 0.75;
/** Multiplicateur de couleur à la hauteur relative `h` (0 = pied, 1 = pointe). */
export declare function heightShade(h: number): Rgb;
/**
 * Hasard reproductible dans [0, 1) du point (x, z), sans sinus (« hash12 » de Dave Hoskins) : stable d'une carte graphique
 * à l'autre. Le shader le recopie (en float32 : quelques instances peuvent différer, la répartition reste la même).
 */
export declare function hash01(x: number, z: number): number;
/** Bruit doux dans [0, 1] : hasard aux coins d'une grille de 1, raccordé en douceur entre eux (plaques, groupes). */
export declare function valueNoise(x: number, z: number): number;
/** Teinte d'une instance : vers quelle couleur (`target`), de combien (0 à 1), et sa luminosité propre. */
export interface InstanceTint {
    readonly target: Rgb;
    readonly amount: number;
    readonly brightness: number;
}
/** Herbe sèche : paille dorée des aperçus. */
export declare const DRY_GOLD: Rgb;
/** Taille (m) des plaques d'herbe sèche, et seuil du bruit au-dessus duquel une plaque sèche. */
export declare const DRY_PATCH_M = 9;
export declare const DRY_FROM = 0.72, DRY_FULL = 0.82;
/** Part de touffes sèches isolées, hors plaques. */
export declare const DRY_STRAY = 0.03;
/** Teinte d'une touffe d'herbe ou d'une plante posée en (x, z). */
export declare function tuftTint(x: number, z: number): InstanceTint;
/** Feuillages d'automne : du jaune d'or au rouge, en passant par l'orange (aperçus du pack). */
export declare const AUTUMN_YELLOW: Rgb;
export declare const AUTUMN_ORANGE: Rgb;
export declare const AUTUMN_RED: Rgb;
/** Vert plus jaune de certains feuillus restés verts. */
export declare const SPRING_GREEN: Rgb;
/** Taille (m) des groupes d'arbres, et seuil du bruit au-dessus duquel un groupe est en automne. */
export declare const AUTUMN_GROUP_M = 90;
export declare const AUTUMN_FROM = 0.67, AUTUMN_FULL = 0.71;
/** Teinte d'un feuillu (ou d'un buisson feuillu) planté en (x, z). */
export declare function treeTint(x: number, z: number): InstanceTint;
/** Couleur de texture `base` teintée : vers la cible à luminosité égale (les nuances peintes restent), puis la luminosité de l'instance. */
export declare function retint(base: Rgb, tint: InstanceTint): Rgb;
/** Direction du vent (unitaire, à l'horizontale) et vitesse (m/s) à laquelle les rafales traversent la prairie. */
export declare const WIND_DIR: {
    readonly x: 0.8;
    readonly z: 0.6;
};
export declare const WIND_SPEED_MS = 4;
/** Distance (m) entre deux rafales. */
export declare const GUST_SPACING_M = 24;
/** Part du balancement qui reste entre les rafales (le vent ne tombe jamais tout à fait). */
export declare const GUST_FLOOR = 0.25;
/** Frémissement en travers du vent : part du débattement et vitesse (rad/s). */
export declare const FLUTTER_SHARE = 0.15;
export declare const FLUTTER_RAD_S = 2.6;
/** Force de la rafale (0 à 1) en (x, z) au temps `timeS` : une onde qui avance dans le sens du vent, irrégulière. */
export declare function windGust(x: number, z: number, timeS: number): number;
/**
 * Déplacement horizontal (m) d'un sommet : `h` = hauteur relative dans le modèle (0 = pied, fixe ; 1 = pointe), `amplitudeM` =
 * débattement à la pointe, `local` = décalage de phase propre au sommet (les feuilles d'un même arbre ne bougent pas d'un bloc).
 * (x, z) : position de l'instance dans le monde — les touffes voisines bougent ensemble, la rafale passe de l'une à l'autre.
 */
export declare function windOffset(x: number, z: number, h: number, timeS: number, amplitudeM: number, local: number): {
    dx: number;
    dz: number;
};
/** Teinte d'un pin ou d'un buisson persistant : pas d'automne, seulement plus ou moins clair. */
export declare function evergreenTint(x: number, z: number): InstanceTint;
