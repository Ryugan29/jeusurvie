// Brume d'un pixel dans les matériaux (profil LOW : brume des matériaux ; les autres profils la calculent dans une passe d'image,
// adapters/babylon/atmosphere-pass). Pure, testée ; adapters/babylon/pbr-fog.ts en est la copie dans le shader.
//
// Depuis l'ADR 0012, TOUT est en lumière linéaire : sol et relief lointain physiques (PBR), végétation repassée en linéaire dans
// son shader (foliage-plugin), ciel en valeurs linéaires. La brume se mélange donc partout de la même façon, en linéaire, vers la
// couleur de brume telle que l'horizon du ciel l'affiche (le lointain s'y fond sans marche), avec la visibilité telle quelle.
// Babylon, lui, élève la visibilité à la puissance 2,2 sur un PBR (19 % de brume à 6 m en deviennent 37 %) : c'est ce que
// pbr-fog corrige. (Avant l'ADR 0012, le matériau standard calculait en « gamma » et le PBR mélangeait en gamma pour l'égaler.)
import type { Rgb } from './palette';

/** Exposant de la courbe gamma approchée de Babylon (LinearEncodePowerApprox de ses shaders : 2,2, et non la courbe sRGB exacte). */
export const GAMMA = 2.2;

/** De l'espace « gamma » (écran) vers le linéaire. Valable au-delà de 1 (couleurs HDR). */
export function gammaToLinear(c: Rgb): Rgb {
  return [Math.pow(c[0], GAMMA), Math.pow(c[1], GAMMA), Math.pow(c[2], GAMMA)];
}

/** Du linéaire vers l'espace « gamma » (écran). Valable au-delà de 1 (couleurs HDR). */
export function linearToGamma(c: Rgb): Rgb {
  return [Math.pow(c[0], 1 / GAMMA), Math.pow(c[1], 1 / GAMMA), Math.pow(c[2], 1 / GAMMA)];
}

/** mix(a, b, t) du GLSL : a · (1 − t) + b · t. */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
}

/**
 * Matériau STANDARD (végétation, repassée en linéaire par son shader) : couleur et brume linéaires, mélangées avec la visibilité
 * (1 = net, 0 = tout dans la brume).
 */
export function standardFoggedColor(colorLinear: Rgb, fogColor: Rgb, visibility: number): Rgb {
  return mix(fogColor, colorLinear, visibility);
}

/** Matériau PBR corrigé : exactement le même mélange linéaire que le standard (visibilité non convertie). */
export function pbrFoggedColor(colorLinear: Rgb, fogColor: Rgb, visibility: number): Rgb {
  return mix(fogColor, colorLinear, visibility);
}
