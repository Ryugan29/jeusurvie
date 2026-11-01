// Triangulation des chunks, partagée par le maillage affiché (adapters/render-data/mesh-data) et le sol de la
// physique (core/physics/ground) : le personnage marche exactement sur la surface qu'on voit.
//
// Quad (col, row) : a = (col, row), b = (col+1, row), c = (col, row+1), d = (col+1, row+1)
// (col le long de X, row le long de Z). Diagonale fixe a → d.

/**
 * Indices des deux triangles du quad (col, row) dans une grille de `verts` sommets de côté.
 * Ordre des sommets : face visible vue de dessus dans un repère main gauche (Y vers le haut) — produit vectoriel
 * standard des arêtes orienté vers le bas. Cette convention est testée.
 */
export function quadTriangles(col: number, row: number, verts: number): readonly number[] {
  const a = row * verts + col, b = a + 1, c = a + verts, d = c + 1;
  return [a, d, c, a, b, d];
}

/**
 * Hauteur au point (fx, fz) ∈ [0, 1]² d'un quad de hauteurs h00 (a), h10 (b), h01 (c), h11 (d),
 * interpolée sur le triangle qui le contient (abd si fx ≥ fz, sinon adc).
 */
export function heightInQuad(h00: number, h10: number, h01: number, h11: number, fx: number, fz: number): number {
  return fx >= fz ? h00 + fx * (h10 - h00) + fz * (h11 - h10) : h00 + fz * (h01 - h00) + fx * (h11 - h01);
}
