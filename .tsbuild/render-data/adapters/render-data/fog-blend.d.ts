import type { Rgb } from './palette';
/** Exposant de la courbe gamma approchée de Babylon (LinearEncodePowerApprox de ses shaders : 2,2, et non la courbe sRGB exacte). */
export declare const GAMMA = 2.2;
/** De l'espace « gamma » (écran) vers le linéaire. Valable au-delà de 1 (couleurs HDR). */
export declare function gammaToLinear(c: Rgb): Rgb;
/** Du linéaire vers l'espace « gamma » (écran). Valable au-delà de 1 (couleurs HDR). */
export declare function linearToGamma(c: Rgb): Rgb;
/**
 * Matériau STANDARD : couleur et brume en gamma, mélangées avec la visibilité (1 = net, 0 = tout dans la brume) ; le post-traitement
 * d'étalonnage passe ensuite le résultat en linéaire. Renvoie cette couleur LINÉAIRE (ce que l'étalonnage reçoit).
 */
export declare function standardFoggedColor(colorGamma: Rgb, fogColorGamma: Rgb, visibility: number): Rgb;
/**
 * Matériau PBR corrigé : couleur LINÉAIRE en entrée, repassée en gamma pour se mélanger à la brume comme sur un standard (même
 * visibilité, non convertie), puis remise en linéaire. Renvoie la couleur LINÉAIRE — identique, pour la même scène, à celle du standard.
 */
export declare function pbrFoggedColor(colorLinear: Rgb, fogColorGamma: Rgb, visibility: number): Rgb;
