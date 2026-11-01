export declare const SHADE_MIN = 0.7;
export declare const SHADE_MAX = 1.1;
/** Distance maximale (en sommets) à laquelle l'ombrage lit les hauteurs : le maillage prévoit cette bordure. */
export declare const SHADE_REACH = 6;
/**
 * Facteur multiplicatif de couleur au sommet (col, row), dans [SHADE_MIN, SHADE_MAX] ; 1 sur terrain plat.
 * `at` donne la hauteur de n'importe quel sommet, y compris hors du chunk (mêmes valeurs que le chunk voisin) :
 * le résultat ne dépend que du voisinage, donc deux chunks voisins calculent la même valeur sur leur bord.
 */
export declare function terrainShade(at: (col: number, row: number) => number, col: number, row: number, normalY: number): number;
