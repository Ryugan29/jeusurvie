// Ambiances de lumière (ADR 0009 : « la beauté passe d'abord par la lumière »). PUR, sans Babylon.
// Ici et pas dans le cœur : ce sont des couleurs de rendu, aucune règle de jeu n'en dépend.
// Principe : des images clés le long du cycle (dayFraction), interpolées linéairement → aucun saut, y compris
// aux changements de phase et au passage nuit → aube.
import { DAY_LENGTH_S, DUSK_LENGTH_S, NIGHT_LENGTH_S } from '../../core/config/balance';
import type { DayPhase, TimeOfDay } from '../../core/survival/time-of-day';
import type { Rgb } from './palette';

export interface Lighting {
  readonly skyZenith: Rgb;
  readonly skyHorizon: Rgb;
  readonly fogColor: Rgb;
  /** Couleur de l'astre qui éclaire (soleil le jour, lune la nuit). */
  readonly sunColor: Rgb;
  readonly sunIntensity: number;
  /** Intensité de l'astre avant compensation de sa hauteur : règle la force de l'ombre projetée. */
  readonly shadowIntensity: number;
  /** Direction de la lumière (de l'astre vers le sol), unitaire, toujours vers le bas. */
  readonly sunDirection: { readonly x: number; readonly y: number; readonly z: number };
  /** Lumière d'ambiance venant du ciel et, plus sombre, du sol. */
  readonly ambientColor: Rgb;
  readonly ambientGroundColor: Rgb;
  readonly ambientIntensity: number;
  /** Nuages : couleur de la face éclairée (blanche le jour, dorée au crépuscule, bleutée la nuit) et de la face à l'ombre. */
  readonly cloudLight: Rgb;
  readonly cloudShade: Rgb;
  /** Étoiles visibles (0 = invisibles le jour, 1 = pleines au cœur de la nuit). */
  readonly starVisibility: number;
  /** Force du halo autour de l'astre dans le ciel (0 à 1). */
  readonly sunGlow: number;
  /** Force des rayons de soleil à l'écran quand on regarde vers l'astre (0 à 1, discrets : jamais au-delà de 0,8). */
  readonly rayStrength: number;
}

/** Plancher de luminosité de l'ambiance : la nuit reste lisible (on voit le relief). */
export const NIGHT_MIN_LUMINANCE = 0.2;

/** Luminance perçue (Rec. 709) d'une couleur. */
export function luminance(c: Rgb): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

const CYCLE_S = DAY_LENGTH_S + NIGHT_LENGTH_S;
const DUSK_AT = (DAY_LENGTH_S - DUSK_LENGTH_S) / CYCLE_S; // 0,6
const NIGHT_AT = DAY_LENGTH_S / CYCLE_S; // 0,7

interface Key {
  readonly at: number;
  readonly zenith: Rgb;
  readonly horizon: Rgb;
  readonly fog: Rgb;
  readonly sun: Rgb;
  readonly sunI: number;
  readonly ambient: Rgb;
  readonly ambientI: number;
  readonly cloud: Rgb;
  readonly cloudShade: Rgb;
  readonly stars: number;
  readonly glow: number;
  readonly rays: number;
}

// Lumière réaliste (ADR 0012) : ciel de diffusion (zénith bleu moyen, horizon blanc-bleuté et plus clair), soleil presque blanc à
// midi (~5 800 K), doré quand il est bas, orangé au couchant ; ombres éclairées par un ciel bleu (l'écart chaud/froid dessine
// toujours les volumes, mais sans les teintes saturées d'une illustration) ; nuit sombre et bleutée où la lune découpe le relief.
// Les rapports d'éclairement restent ceux validés (sol plat ≤ 1 à midi, relief lisible : voir les tests).
const DAWN: Omit<Key, 'at'> = {
  zenith: [0.26, 0.36, 0.62],
  horizon: [0.92, 0.72, 0.56],
  fog: [0.86, 0.72, 0.6],
  sun: [1, 0.7, 0.45],
  sunI: 0,
  ambient: [0.62, 0.62, 0.8],
  ambientI: 0.55,
  cloud: [1, 0.78, 0.64],
  cloudShade: [0.52, 0.5, 0.62],
  stars: 0,
  glow: 0,
  rays: 0,
};

const KEYS: readonly Key[] = [
  { at: 0, ...DAWN },
  { at: 0.08, zenith: [0.24, 0.4, 0.76], horizon: [0.84, 0.78, 0.7], fog: [0.86, 0.79, 0.68], sun: [1, 0.82, 0.6], sunI: 1, ambient: [0.56, 0.65, 0.9], ambientI: 0.68, cloud: [1, 0.9, 0.8], cloudShade: [0.6, 0.6, 0.72], stars: 0, glow: 0.85, rays: 0.7 },
  { at: 0.3, zenith: [0.2, 0.36, 0.78], horizon: [0.62, 0.74, 0.9], fog: [0.66, 0.75, 0.87], sun: [1, 0.95, 0.87], sunI: 0.85, ambient: [0.57, 0.68, 0.95], ambientI: 0.42, cloud: [1, 1, 1], cloudShade: [0.58, 0.63, 0.72], stars: 0, glow: 0.6, rays: 0.3 },
  { at: DUSK_AT - 0.05, zenith: [0.22, 0.37, 0.74], horizon: [0.88, 0.8, 0.66], fog: [0.84, 0.77, 0.64], sun: [1, 0.86, 0.64], sunI: 0.8, ambient: [0.6, 0.68, 0.92], ambientI: 0.52, cloud: [1, 0.94, 0.84], cloudShade: [0.62, 0.64, 0.74], stars: 0, glow: 0.8, rays: 0.5 },
  { at: DUSK_AT + 0.06, zenith: [0.17, 0.22, 0.48], horizon: [1, 0.57, 0.27], fog: [0.94, 0.63, 0.4], sun: [1, 0.63, 0.32], sunI: 0.55, ambient: [0.46, 0.53, 0.8], ambientI: 0.6, cloud: [1, 0.68, 0.43], cloudShade: [0.46, 0.38, 0.5], stars: 0, glow: 1, rays: 0.8 },
  // Au coucher, le soleil garde sa couleur jusqu'à s'éteindre (intensité nulle) : la lune prend le relais sans qu'on voie la bascule.
  { at: NIGHT_AT, zenith: [0.08, 0.1, 0.24], horizon: [0.3, 0.26, 0.38], fog: [0.25, 0.25, 0.36], sun: [1, 0.6, 0.3], sunI: 0, ambient: [0.42, 0.48, 0.72], ambientI: 0.45, cloud: [0.42, 0.42, 0.58], cloudShade: [0.16, 0.17, 0.3], stars: 0.25, glow: 0, rays: 0 },
  { at: 0.85, zenith: [0.018, 0.028, 0.08], horizon: [0.07, 0.09, 0.17], fog: [0.07, 0.09, 0.16], sun: [0.66, 0.74, 0.96], sunI: 0.35, ambient: [0.38, 0.46, 0.74], ambientI: 0.45, cloud: [0.22, 0.25, 0.4], cloudShade: [0.07, 0.08, 0.16], stars: 1, glow: 0.45, rays: 0 },
  { at: 0.97, zenith: [0.1, 0.12, 0.26], horizon: [0.38, 0.32, 0.43], fog: [0.31, 0.29, 0.39], sun: [0.66, 0.74, 0.96], sunI: 0.05, ambient: [0.5, 0.5, 0.7], ambientI: 0.48, cloud: [0.44, 0.4, 0.55], cloudShade: [0.19, 0.19, 0.31], stars: 0.4, glow: 0.1, rays: 0 },
  { at: 1, ...DAWN },
];

/**
 * Rebond de la lumière sur l'herbe : le bas de l'ambiance (arbres, rochers, dessous) mêle le ciel et l'astre qui éclaire
 * l'herbe, teintés jaune-vert. Il reste chaud même quand l'ambiance du haut est franchement bleue.
 */
const GRASS_BOUNCE: Rgb = [0.62, 0.66, 0.3];

/** Instants des images clés le long du cycle (fraction), strictement croissants de 0 à 1 (testé). */
export const LIGHTING_KEY_TIMES: readonly number[] = KEYS.map((k) => k.at);

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function normalize(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const len = Math.hypot(x, y, z);
  return { x: x / len, y: y / len, z: z / len };
}

/** Hauteur maximale du soleil au-dessus de l'horizon (rad) : jamais au zénith, sinon le relief paraît plat. */
const SUN_MAX_ELEVATION = (52 * Math.PI) / 180;
/** Hauteur maximale de la lune (rad). */
const MOON_MAX_ELEVATION = (35 * Math.PI) / 180;
/** Hauteur minimale de la lumière (rad) : l'astre éclaire toujours un peu par le haut. */
const MIN_ELEVATION = 0.08;
/** Hauteur minimale du soleil (rad) : même au lever et au coucher, l'ombre du perso reste sous 2× sa taille. */
const SUN_MIN_ELEVATION = (27 * Math.PI) / 180;

/**
 * Direction de la lumière (de l'astre vers le sol). Le soleil se lève à l'est (+X), passe au sud (−Z) au plus haut,
 * se couche à l'ouest, pendant le jour (crépuscule compris) ; la lune fait de même la nuit, plus bas. Au lever et au
 * coucher l'intensité est nulle : changer d'astre ne se voit pas.
 * Le soleil est posé plus haut que sa course « naturelle » (ombres courtes) ; `groundFactor` baisse son intensité
 * d'autant, pour que le sol plat reçoive la même lumière que sous la course naturelle (sinon le matin brûle).
 */
function lightDirection(phase: DayPhase, fraction: number): { direction: { x: number; y: number; z: number }; groundFactor: number } {
  const night = phase === 'nuit';
  const progress = Math.min(1, Math.max(0, night ? (fraction - NIGHT_AT) / (1 - NIGHT_AT) : fraction / NIGHT_AT));
  const azimuth = Math.PI * progress;
  const natural = Math.max(MIN_ELEVATION, (night ? MOON_MAX_ELEVATION : SUN_MAX_ELEVATION) * Math.sin(azimuth));
  const elevation = night ? natural : SUN_MIN_ELEVATION + (SUN_MAX_ELEVATION - SUN_MIN_ELEVATION) * Math.sin(azimuth);
  const ground = Math.cos(elevation);
  // Position de l'astre : (cos e·cos a, sin e, −cos e·sin a) ; la lumière va dans le sens opposé.
  return {
    direction: normalize(-ground * Math.cos(azimuth), -Math.sin(elevation), ground * Math.sin(azimuth)),
    groundFactor: Math.sin(natural) / Math.sin(elevation),
  };
}

export function lightingFor(time: TimeOfDay): Lighting {
  const f = time.dayFraction - Math.floor(time.dayFraction);
  let i = 0;
  while (i < KEYS.length - 2 && f >= KEYS[i + 1]!.at) i++;
  const a = KEYS[i]!, b = KEYS[i + 1]!;
  const t = (f - a.at) / (b.at - a.at);
  const ambient = mixRgb(a.ambient, b.ambient, t);
  const sunColor = mixRgb(a.sun, b.sun, t);
  const bounce = mixRgb(ambient, sunColor, 0.5);
  const light = lightDirection(time.phase, f);
  return {
    skyZenith: mixRgb(a.zenith, b.zenith, t),
    skyHorizon: mixRgb(a.horizon, b.horizon, t),
    fogColor: mixRgb(a.fog, b.fog, t),
    sunColor,
    sunIntensity: mix(a.sunI, b.sunI, t) * light.groundFactor,
    shadowIntensity: mix(a.sunI, b.sunI, t),
    sunDirection: light.direction,
    ambientColor: ambient,
    ambientGroundColor: [bounce[0] * GRASS_BOUNCE[0], bounce[1] * GRASS_BOUNCE[1], bounce[2] * GRASS_BOUNCE[2]],
    ambientIntensity: mix(a.ambientI, b.ambientI, t),
    cloudLight: mixRgb(a.cloud, b.cloud, t),
    cloudShade: mixRgb(a.cloudShade, b.cloudShade, t),
    starVisibility: mix(a.stars, b.stars, t),
    sunGlow: mix(a.glow, b.glow, t),
    rayStrength: mix(a.rays, b.rays, t),
  };
}

/**
 * Couleur du ciel à une hauteur relative du dôme (0 = horizon, 1 = zénith). Racine de la hauteur : le dégradé
 * monte vite au-dessus de l'horizon, comme un vrai ciel. Sous l'horizon : couleur de l'horizon.
 */
export function skyColorAt(l: Lighting, heightFraction: number): Rgb {
  const t = skyWeight(heightFraction);
  // a·(1 − t) + b·t : exact aux deux extrémités.
  const h = l.skyHorizon, z = l.skyZenith;
  return [h[0] * (1 - t) + z[0] * t, h[1] * (1 - t) + z[1] * t, h[2] * (1 - t) + z[2] * t];
}

/** Poids du zénith dans le dégradé du ciel à une hauteur relative du dôme (racine, bornée à [0, 1]). */
export function skyWeight(heightFraction: number): number {
  return Math.sqrt(Math.min(1, Math.max(0, heightFraction)));
}

/**
 * Assombrissement maximal de l'ombre projetée (en plein soleil) : l'objet cache presque tout le soleil, seule la lumière du ciel
 * (ambiance, environnement) éclaire l'ombre — des ombres franches qui donnent du volume, jamais noires (ADR 0012).
 */
const SHADOW_MAX = 0.88;
/** Intensité de l'astre à partir de laquelle l'ombre atteint sa force maximale. */
const SHADOW_FULL_AT = 1;

/** Force de l'ombre projetée (0 = invisible, 1 = noire), proportionnelle à l'intensité de l'astre. */
export function shadowStrength(l: Lighting): number {
  const k = Math.min(1, Math.max(0, l.shadowIntensity / SHADOW_FULL_AT));
  // Une lumière faible (lune, soleil voilé) porte une ombre plus légère que sa simple proportion : courbe en k^1,5.
  return SHADOW_MAX * k * Math.sqrt(k);
}
