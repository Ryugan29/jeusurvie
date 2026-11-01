/**
 * Indices des deux triangles du quad (col, row) dans une grille de `verts` sommets de côté.
 * Ordre des sommets : face visible vue de dessus dans un repère main gauche (Y vers le haut) — produit vectoriel
 * standard des arêtes orienté vers le bas. Cette convention est testée.
 */
export declare function quadTriangles(col: number, row: number, verts: number): readonly number[];
/**
 * Hauteur au point (fx, fz) ∈ [0, 1]² d'un quad de hauteurs h00 (a), h10 (b), h01 (c), h11 (d),
 * interpolée sur le triangle qui le contient (abd si fx ≥ fz, sinon adc).
 */
export declare function heightInQuad(h00: number, h10: number, h01: number, h11: number, fx: number, fz: number): number;
