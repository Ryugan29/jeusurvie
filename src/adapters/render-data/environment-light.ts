// Force du reflet du ciel (IBL) sur les matériaux PBR (PUR, sans Babylon) : elle suit la lumière RÉELLE de la scène.
// Le problème : l'éclairage d'environnement vient d'une photo du ciel peint (adapters/babylon/sky-environment). Sous un ciel couvert,
// le soleil s'éteint (jusqu'à −75 %) mais le ciel devient un gris de la luminosité de l'horizon, PLUS clair que le bleu dégagé : le
// reflet montait pendant que tout le reste baissait. Les personnages ressortaient clairs, délavés, sans contraste avec le décor.
// Le remède : le reflet ne doit jamais dépasser sa part de la lumière que la scène reçoit. On le rapporte donc à la lumière du sol,
// ramenée à la luminosité du ciel peint, et normalisée pour que le plein jour clair de midi (le rendu validé) donne exactement 1.
// Second défaut, vu à l'aube : quand l'astre est BAS (lune qui se couche avant l'aube, soleil qui se lève), il frappe les faces
// verticales presque aussi fort que le sol (jusqu'à ×1,6 sur la part de l'astre), alors qu'à midi elles en reçoivent la moitié.
// Le même reflet, qui valait ~25 % de la lumière du sol, s'ajoutait donc à une face déjà presque aussi éclairée que le sol : le
// personnage montait à 1,2 fois le sol. Le reflet ne sert qu'à COMBLER ce qui manque à la face verticale : il s'arrête au rapport visé.
import { luminance, type Lighting } from './lighting';
import { DEFAULT_SURFACE } from './surfaces';

/** Plafond du réglage : 1 = le rendu d'avant (ciel pris tel quel). Le reflet ne devient jamais plus fort que ce rendu validé. */
export const IBL_MAX = 1;

/**
 * Lumière reçue par un sol plat divisée par la luminance moyenne du ciel, par plein jour clair à midi (0,3 du cycle, temps clair) :
 * ≈ 2,54 avec le ciel réaliste de l'ADR 0012 (2,25 avec l'ancien ciel peint, plus lumineux). C'est le repère « 1 » : ailleurs, le réglage vaut (lumière du sol / luminance du ciel) / 2,25.
 * Si la palette de lumière change et que ce repère dérive, le test « plein jour clair, à midi : 1 » le signale.
 */
export const CLEAR_NOON_LIGHT_PER_SKY = 2.536;

/**
 * Rapport maximal visé entre la lumière d'une face verticale (reflet compris, matière de référence = la peau, matière par défaut) et celle
 * du sol. Le critère de rendu est 1,10 : on vise un peu en dessous car les cheveux et les champignons reçoivent 9 % de ciel de plus que
 * la peau (0,60 contre 0,55). Au pire (reflet à son maximum permis), ils sortent à 1,06 + 0,09 × 0,24 ≈ 1,08.
 */
export const SIDE_FACE_MAX_RATIO = 1.06;

/**
 * Lumière reçue par un sol plat (ambiance + astre selon sa hauteur), NON bornée : contrairement à `sceneBrightness` (atmosphere,
 * coupée à 1), elle distingue un midi franc (≈ 1,3) d'un ciel simplement couvert, ce qui est justement l'écart à suivre.
 */
export function groundLight(l: Lighting): number {
  return l.ambientIntensity * luminance(l.ambientColor) + l.sunIntensity * luminance(l.sunColor) * Math.max(0, -l.sunDirection.y);
}

/** Un personnage est vu de côté : sa face verticale reçoit la moitié de ce que l'astre donnerait à un mur plein face. */
export const SIDE_FACE_SUN_SHARE = 0.5;

/**
 * Lumière directe et d'ambiance reçue par une face VERTICALE (un personnage vu de côté), sans le reflet du ciel : la moyenne de
 * l'ambiance du ciel (dessus) et de celle du sol (dessous), plus l'astre de côté. Même unité que `groundLight`.
 */
export function sideFaceLight(l: Lighting): number {
  const ambientUp = l.ambientIntensity * luminance(l.ambientColor);
  const ambientDown = l.ambientIntensity * luminance(l.ambientGroundColor);
  const sideSun = l.sunIntensity * luminance(l.sunColor) * Math.hypot(l.sunDirection.x, l.sunDirection.z) * SIDE_FACE_SUN_SHARE;
  return (ambientUp + ambientDown) / 2 + sideSun;
}

/** Luminance moyenne du ciel peint (moyenne zénith + horizon) : ce que la sonde photographie. */
export function skyLuminance(l: Lighting): number {
  return (luminance(l.skyZenith) + luminance(l.skyHorizon)) / 2;
}

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
export function iblIntensityFor(l: Lighting): number {
  const light = groundLight(l);
  const sky = skyLuminance(l);
  const side = sideFaceLight(l);
  if (!Number.isFinite(light) || !Number.isFinite(sky) || !Number.isFinite(side)) return IBL_MAX;
  if (light <= 0) return 0;
  // Ciel noir : son reflet n'éclaire rien, quel que soit le réglage (et la division serait infinie).
  if (sky <= 0) return IBL_MAX;
  const followsLight = light / (CLEAR_NOON_LIGHT_PER_SKY * sky);
  // Ce qu'il manque à la face verticale pour atteindre le rapport visé au sol (jamais négatif), en réglage du reflet de la matière de référence.
  const roomLeft = Math.max(0, SIDE_FACE_MAX_RATIO * light - side);
  const fillsOnly = roomLeft / (DEFAULT_SURFACE.environmentIntensity * sky);
  return Math.min(IBL_MAX, followsLight, fillsOnly);
}
