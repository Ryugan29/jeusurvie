// Port of src/core/world/triangulation.ts — shared by the rendered mesh and the physics ground.
namespace JeuSurvie.Core.World
{
    public static class Triangulation
    {
        /// <summary>Indices of the two triangles of quad (col, row): a, d, c, a, b, d (fixed diagonal a → d).</summary>
        public static void QuadTriangles(int col, int row, int verts, int[] into, int offset)
        {
            int a = row * verts + col, b = a + 1, c = a + verts, d = c + 1;
            into[offset] = a; into[offset + 1] = d; into[offset + 2] = c;
            into[offset + 3] = a; into[offset + 4] = b; into[offset + 5] = d;
        }

        /// <summary>Height at (fx, fz) ∈ [0,1]² of a quad, interpolated on the triangle containing it (abd if fx ≥ fz, else adc).</summary>
        public static double HeightInQuad(double h00, double h10, double h01, double h11, double fx, double fz)
        {
            return fx >= fz ? h00 + fx * (h10 - h00) + fz * (h11 - h10) : h00 + fz * (h01 - h00) + fx * (h11 - h01);
        }
    }
}
