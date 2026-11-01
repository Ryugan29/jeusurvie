export declare const DETAIL_MIN = 0.8;
export declare const DETAIL_MAX = 1.1;
/** Couleur diffuse (gris) du matériau du sol : l'octet 255 de la texture vaut alors DETAIL_MAX. */
export declare const DETAIL_GAIN = 1.1;
/** Facteurs de luminosité (size × size, ligne par ligne) dans [DETAIL_MIN, DETAIL_MAX], de moyenne ≈ 1. */
export declare function groundDetailFactors(size: number): Float32Array;
/** Octets RGBA 8 bits de la texture (gris, opaque) : octet = facteur / DETAIL_GAIN × 255. */
export declare function groundDetailRgba(size: number): Uint8Array;
