/**
 * Part de sentier de terre au point (x, z) du monde, dans [0, 1] : 1 au milieu du sentier, 0 hors sentier, bord adouci.
 * Le sentier fait ≈ 2,4 m de large (largeur mesurée en mètres : le réseau est divisé par sa pente), et on en croise un
 * tous les 100 m environ, sans quadrillage. Fait partie de genVersion 1 : les paramètres ci-dessus sont figés.
 * @param seed graine du monde, entier non signé 32 bits (validée à la frontière).
 */
export declare function pathAt(seed: number, x: number, z: number): number;
