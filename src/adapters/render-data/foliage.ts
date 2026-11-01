// Végétation vivante (PUR, sans Babylon) : dégradé du pied à la pointe, teinte par touffe ou par arbre (herbes sèches dorées,
// feuillus d'automne en groupes), et vent. Tout se décide sur la carte graphique, sommet par sommet, à partir de la position de
// l'instance dans le monde : rien à stocker, déterministe par position, aucun coût pour le processeur.
// Le shader (adapters/babylon/foliage-plugin) recopie exactement ces formules ; elles sont testées ici.

import { smoothstep } from '../../core/shared/math';
import { luminance } from './lighting';
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

/** Par nom de matériau du pack Quaternius (voir assets/models/nature). Les écorces, roches et champignons n'en ont pas. */
const PROFILES: Readonly<Record<string, FoliageProfile>> = {
  Grass: { kind: 'grass', heightRefM: 1.6, windM: 0.28, gradient: 1 },
  Leaves: { kind: 'plant', heightRefM: 1, windM: 0.16, gradient: 0.8 },
  Flowers: { kind: 'flower', heightRefM: 2, windM: 0.2, gradient: 0 },
  Leaves_NormalTree: { kind: 'tree', heightRefM: 8, windM: 0.06, gradient: 0 },
  Leaves_Pine: { kind: 'pine', heightRefM: 8, windM: 0.035, gradient: 0 },
  Leaves_TwistedTree: { kind: 'bush', heightRefM: 1.4, windM: 0.05, gradient: 0 },
};

export function foliageProfileFor(materialName: string): FoliageProfile | undefined {
  return Object.hasOwn(PROFILES, materialName) ? PROFILES[materialName] : undefined;
}

/**
 * Albédo réaliste de la végétation (ADR 0012). Les textures du pack sont peintes en couleurs vives (verts sans aucun bleu, herbe
 * ~2,5 fois plus claire qu'une vraie prairie) et le matériau léger les lisait telles quelles, en sRGB, comme si c'était de la
 * lumière linéaire : la végétation ressortait deux fois plus claire et plus saturée que le sol physique. Le shader les repasse en
 * linéaire, puis les ramène vers le gris (saturation, 1 = inchangée) et à une luminosité de feuille réelle (facteur) : herbe et
 * feuilles ~10 à 18 % de la lumière, aiguilles de pin plus sombres, fleurs plus colorées.
 * Mesuré sur les textures (linéaire, moyenne des pixels utiles) : feuillus 0,16, pins 0,08, feuillage des buissons et plantes 0,23,
 * nuancier de l'herbe ~0,37.
 */
export const FOLIAGE_ALBEDO: Readonly<Record<FoliageKind, { readonly saturation: number; readonly value: number }>> = {
  grass: { saturation: 0.62, value: 0.42 },
  plant: { saturation: 0.66, value: 0.68 },
  flower: { saturation: 0.82, value: 0.72 },
  tree: { saturation: 0.66, value: 0.95 },
  pine: { saturation: 0.7, value: 1.2 },
  bush: { saturation: 0.66, value: 0.9 },
};

/**
 * Marge de lumière du matériau léger : il plafonne l'éclairage diffus à 1 avant de multiplier par la couleur ; sous le soleil HDR
 * (jusqu'à ~1,6 sur le sol), une feuille saturait. La lumière est divisée par cette marge avant le plafond, la couleur multipliée
 * d'autant après : même résultat sous le plafond, et jusqu'à 2 fois plus de lumière avant de saturer.
 */
export const FOLIAGE_HDR_HEADROOM = 2;

/** Multiplicateurs de couleur du dégradé : pied à l'ombre des autres brins (vert froid, sombre), pointe au soleil (jaune-vert). */
export const SHADE_FOOT: Rgb = [0.55, 0.62, 0.58];
export const SHADE_TIP: Rgb = [1.12, 1.06, 0.8];
/** Hauteur relative où la pointe est atteinte : le haut du brin reste clair, seul le bas s'assombrit. */
export const SHADE_TOP = 0.75;

/** Multiplicateur de couleur à la hauteur relative `h` (0 = pied, 1 = pointe). */
export function heightShade(h: number): Rgb {
  return mixRgb(SHADE_FOOT, SHADE_TIP, smoothstep(0, SHADE_TOP, h));
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const fract = (v: number): number => v - Math.floor(v);

/**
 * Hasard reproductible dans [0, 1) du point (x, z), sans sinus (« hash12 » de Dave Hoskins) : stable d'une carte graphique
 * à l'autre. Le shader le recopie (en float32 : quelques instances peuvent différer, la répartition reste la même).
 */
export function hash01(x: number, z: number): number {
  let px = fract(x * 0.1031), py = fract(z * 0.1031), pz = fract(x * 0.1031);
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += d;
  py += d;
  pz += d;
  return fract((px + py) * pz);
}

/** Bruit doux dans [0, 1] : hasard aux coins d'une grille de 1, raccordé en douceur entre eux (plaques, groupes). */
export function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash01(ix, iz), b = hash01(ix + 1, iz), c = hash01(ix, iz + 1), d = hash01(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/** Teinte d'une instance : vers quelle couleur (`target`), de combien (0 à 1), et sa luminosité propre. */
export interface InstanceTint {
  readonly target: Rgb;
  readonly amount: number;
  readonly brightness: number;
}

/** Herbe sèche : paille dorée des aperçus. */
export const DRY_GOLD: Rgb = [0.86, 0.66, 0.2];
/** Taille (m) des plaques d'herbe sèche, et seuil du bruit au-dessus duquel une plaque sèche. */
export const DRY_PATCH_M = 9;
export const DRY_FROM = 0.72, DRY_FULL = 0.82;
/** Part de touffes sèches isolées, hors plaques. */
export const DRY_STRAY = 0.03;

/** Teinte d'une touffe d'herbe ou d'une plante posée en (x, z). */
export function tuftTint(x: number, z: number): InstanceTint {
  const patch = valueNoise(x / DRY_PATCH_M, z / DRY_PATCH_M) + 0.12 * (hash01(x + 31.7, z - 11.3) - 0.5);
  const stray = hash01(x - 7.1, z + 23.9) < DRY_STRAY ? 0.8 : 0;
  return {
    target: DRY_GOLD,
    amount: Math.max(smoothstep(DRY_FROM, DRY_FULL, patch), stray),
    brightness: 0.88 + 0.24 * hash01(x + 5.3, z + 17.9),
  };
}

/** Feuillages d'automne : du jaune d'or au rouge, en passant par l'orange (aperçus du pack). */
export const AUTUMN_YELLOW: Rgb = [0.95, 0.74, 0.16];
export const AUTUMN_ORANGE: Rgb = [0.96, 0.48, 0.1];
export const AUTUMN_RED: Rgb = [0.86, 0.2, 0.08];
/** Vert plus jaune de certains feuillus restés verts. */
export const SPRING_GREEN: Rgb = [0.6, 0.78, 0.18];
/** Taille (m) des groupes d'arbres, et seuil du bruit au-dessus duquel un groupe est en automne. */
export const AUTUMN_GROUP_M = 90;
export const AUTUMN_FROM = 0.67, AUTUMN_FULL = 0.71;

/** Teinte d'un feuillu (ou d'un buisson feuillu) planté en (x, z). */
export function treeTint(x: number, z: number): InstanceTint {
  const autumn = smoothstep(AUTUMN_FROM, AUTUMN_FULL, valueNoise(x / AUTUMN_GROUP_M + 0.37, z / AUTUMN_GROUP_M - 0.61));
  const hue = hash01(x + 13.1, z - 3.7);
  const fall = hue < 0.5 ? mixRgb(AUTUMN_YELLOW, AUTUMN_ORANGE, hue * 2) : mixRgb(AUTUMN_ORANGE, AUTUMN_RED, hue * 2 - 1);
  const spring = 0.3 * hash01(x - 41.3, z + 9.7);
  return {
    target: mixRgb(SPRING_GREEN, fall, smoothstep(0.3, 0.5, autumn)),
    amount: Math.max(spring, autumn),
    brightness: 0.86 + 0.28 * hash01(x + 2.9, z + 61.1),
  };
}

/** Couleur de texture `base` teintée : vers la cible à luminosité égale (les nuances peintes restent), puis la luminosité de l'instance. */
export function retint(base: Rgb, tint: InstanceTint): Rgb {
  const k = luminance(base) / luminance(tint.target);
  const toward: Rgb = [tint.target[0] * k, tint.target[1] * k, tint.target[2] * k];
  const c = mixRgb(base, toward, tint.amount);
  return [c[0] * tint.brightness, c[1] * tint.brightness, c[2] * tint.brightness];
}

/** Direction du vent (unitaire, à l'horizontale) et vitesse (m/s) à laquelle les rafales traversent la prairie. */
export const WIND_DIR = { x: 0.8, z: 0.6 } as const;
export const WIND_SPEED_MS = 4;
/** Distance (m) entre deux rafales. */
export const GUST_SPACING_M = 24;
/** Part du balancement qui reste entre les rafales (le vent ne tombe jamais tout à fait). */
export const GUST_FLOOR = 0.25;
/** Frémissement en travers du vent : part du débattement et vitesse (rad/s). */
export const FLUTTER_SHARE = 0.15;
export const FLUTTER_RAD_S = 2.6;

/** Force de la rafale (0 à 1) en (x, z) au temps `timeS` : une onde qui avance dans le sens du vent, irrégulière. */
export function windGust(x: number, z: number, timeS: number): number {
  const a = ((x * WIND_DIR.x + z * WIND_DIR.z - WIND_SPEED_MS * timeS) * 2 * Math.PI) / GUST_SPACING_M;
  const wave = 0.5 + 0.5 * Math.sin(a);
  return wave * (0.6 + 0.4 * Math.sin(a * 0.37 + 1.3));
}

/**
 * Déplacement horizontal (m) d'un sommet : `h` = hauteur relative dans le modèle (0 = pied, fixe ; 1 = pointe), `amplitudeM` =
 * débattement à la pointe, `local` = décalage de phase propre au sommet (les feuilles d'un même arbre ne bougent pas d'un bloc).
 * (x, z) : position de l'instance dans le monde — les touffes voisines bougent ensemble, la rafale passe de l'une à l'autre.
 */
export function windOffset(x: number, z: number, h: number, timeS: number, amplitudeM: number, local: number): { dx: number; dz: number } {
  const hc = Math.min(1, Math.max(0, h));
  const bend = amplitudeM * hc * hc;
  const sway = bend * (GUST_FLOOR + (1 - GUST_FLOOR) * windGust(x, z, timeS));
  const flutter = bend * FLUTTER_SHARE * Math.sin(timeS * FLUTTER_RAD_S + local + x * 1.3 + z * 1.7);
  // En travers du vent : (−z, x).
  return { dx: WIND_DIR.x * sway - WIND_DIR.z * flutter, dz: WIND_DIR.z * sway + WIND_DIR.x * flutter };
}

/** Teinte d'un pin ou d'un buisson persistant : pas d'automne, seulement plus ou moins clair. */
export function evergreenTint(x: number, z: number): InstanceTint {
  return { target: SPRING_GREEN, amount: 0, brightness: 0.88 + 0.24 * hash01(x + 2.9, z + 61.1) };
}
