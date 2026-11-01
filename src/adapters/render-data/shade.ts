// Occlusion « cuite » dans les couleurs de sommets (pure) : les creux et les pentes sont légèrement assombris,
// les crêtes légèrement éclaircies. Donne du modelé au relief même quand le soleil est haut, sans coût au rendu.

export const SHADE_MIN = 0.7;
export const SHADE_MAX = 1.1;

/** Distances (en sommets) des deux anneaux de voisins : détail fin (4 m) et forme générale (12 m). */
const NEAR = 2;
const FAR = 6;
/** Distance maximale (en sommets) à laquelle l'ombrage lit les hauteurs : le maillage prévoit cette bordure. */
export const SHADE_REACH = FAR;
/** Assombrissement par mètre de « creux » (hauteur moyenne des voisins au-dessus du sommet). */
const CAVITY_GAIN = 0.1;
/** Assombrissement maximal d'une pente verticale (proportionnel à 1 − normale.y). */
const SLOPE_DARKEN = 0.25;

/**
 * Facteur multiplicatif de couleur au sommet (col, row), dans [SHADE_MIN, SHADE_MAX] ; 1 sur terrain plat.
 * `at` donne la hauteur de n'importe quel sommet, y compris hors du chunk (mêmes valeurs que le chunk voisin) :
 * le résultat ne dépend que du voisinage, donc deux chunks voisins calculent la même valeur sur leur bord.
 */
export function terrainShade(at: (col: number, row: number) => number, col: number, row: number, normalY: number): number {
  const h = at(col, row);
  const ring = (k: number): number => (at(col + k, row) + at(col - k, row) + at(col, row + k) + at(col, row - k)) / 4 - h;
  const cavity = 0.6 * ring(NEAR) + 0.4 * ring(FAR);
  const shade = 1 - CAVITY_GAIN * cavity - SLOPE_DARKEN * (1 - normalY);
  return Math.min(SHADE_MAX, Math.max(SHADE_MIN, shade));
}
