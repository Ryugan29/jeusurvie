import type { Rgb } from './palette';
/** Exposant de la courbe gamma approchée de Babylon (LinearEncodePowerApprox de ses shaders : 2,2, et non la courbe sRGB exacte). */
export declare const GAMMA = 2.2;
/** De l'espace « gamma » (écran) vers le linéaire. Valable au-delà de 1 (couleurs HDR). */
export declare function gammaToLinear(c: Rgb): Rgb;
/** Du linéaire vers l'espace « gamma » (écran). Valable au-delà de 1 (couleurs HDR). */
export declare function linearToGamma(c: Rgb): Rgb;
/**
 * Matériau STANDARD (végétation, repassée en linéaire par son shader) : couleur et brume linéaires, mélangées avec la visibilité
 * (1 = net, 0 = tout dans la brume).
 */
export declare function standardFoggedColor(colorLinear: Rgb, fogColor: Rgb, visibility: number): Rgb;
/** Matériau PBR corrigé : exactement le même mélange linéaire que le standard (visibilité non convertie). */
export declare function pbrFoggedColor(colorLinear: Rgb, fogColor: Rgb, visibility: number): Rgb;
