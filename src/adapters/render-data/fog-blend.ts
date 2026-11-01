// Brume d'un pixel, vue de l'écran : ce que fait Babylon sur un matériau STANDARD, et ce que doit faire un matériau PBR pour que
// la brume soit la même à la même distance (pure, testée ; adapters/babylon/pbr-fog.ts en est la copie dans le shader).
//
// Pourquoi deux écritures ? Les deux matériaux ne comptent pas la lumière dans le même « espace » :
// - STANDARD : la couleur est en espace « gamma » (celui d'une image d'écran). La brume (scene.fogColor, aussi en gamma) s'y
//   mélange telle quelle, puis l'étalonnage de la scène (un post-traitement) repasse le tout en linéaire.
// - PBR : la couleur est déjà LINÉAIRE (une vraie quantité de lumière). Babylon y mélange pourtant la même brume gamma sans la
//   convertir, et élève en plus la visibilité à la puissance 2,2 : la brume devient bien plus claire ET bien plus épaisse
//   (19 % de brume à 6 m en deviennent 37 %). Résultat : l'héroïne et le démon virent au blanc-lavande dans le brouillard.
// La correction : mélanger le PBR dans le MÊME espace que le standard — gamma, visibilité intacte — puis revenir en linéaire.
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
 * Matériau STANDARD : couleur et brume en gamma, mélangées avec la visibilité (1 = net, 0 = tout dans la brume) ; le post-traitement
 * d'étalonnage passe ensuite le résultat en linéaire. Renvoie cette couleur LINÉAIRE (ce que l'étalonnage reçoit).
 */
export function standardFoggedColor(colorGamma: Rgb, fogColorGamma: Rgb, visibility: number): Rgb {
  return gammaToLinear(mix(fogColorGamma, colorGamma, visibility));
}

/**
 * Matériau PBR corrigé : couleur LINÉAIRE en entrée, repassée en gamma pour se mélanger à la brume comme sur un standard (même
 * visibilité, non convertie), puis remise en linéaire. Renvoie la couleur LINÉAIRE — identique, pour la même scène, à celle du standard.
 */
export function pbrFoggedColor(colorLinear: Rgb, fogColorGamma: Rgb, visibility: number): Rgb {
  return gammaToLinear(mix(fogColorGamma, linearToGamma(colorLinear), visibility));
}
