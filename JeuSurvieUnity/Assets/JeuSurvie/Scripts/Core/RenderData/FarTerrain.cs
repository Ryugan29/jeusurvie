// Port of src/adapters/render-data/far-terrain.ts — coarse grid of the REAL terrain over kilometres beyond the chunks.
using System;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.World;

namespace JeuSurvie.Core.RenderData
{
    public sealed class FarTerrainMesh
    {
        /// <summary>Positions RELATIVE to the centre (float32 precision kept far from the origin).</summary>
        public float[] Positions;
        public float[] Normals;
        public float[] Colors;
        public int[] Indices;
        public double CenterX, CenterZ;
    }

    public static class FarTerrain
    {
        public static readonly Rgb Canopy = new Rgb(0.16, 0.24, 0.09);
        private static readonly Rgb PineCanopy = new Rgb(0.11, 0.19, 0.14);
        private static readonly Rgb AutumnCanopy = new Rgb(0.5, 0.32, 0.11);
        private const double CanopyFrom = 0.5, CanopyFull = 1.8;
        public const double CanopyMax = 0.85;
        private const double CanopySlopeFrom = 0.25, CanopySlopeGone = 0.4;
        private const int MaxVertices = 1 << 20;

        public static Rgb FarColor(uint seed, double x, double z, double height, double normalY)
        {
            double cold = Biome.At(seed, x, z).Cold;
            Rgb ground = Palette.TerrainColor(height, normalY, new SurfaceTint(0, 0, cold, 0));
            double slopeOk = 1 - MathUtil.Smoothstep(CanopySlopeFrom, CanopySlopeGone, 1 - normalY);
            double line = Placement.TreeLineAt(cold);
            double belowLine = 1 - MathUtil.Smoothstep(line - 10, line + 5, height);
            double canopy = CanopyMax * MathUtil.Smoothstep(CanopyFrom, CanopyFull, Placement.ForestFactorAt(seed, x, z)) * slopeOk * belowLine;
            if (canopy <= 0) return ground;
            double autumn = MathUtil.Smoothstep(Foliage.AutumnFrom, Foliage.AutumnFull, Foliage.ValueNoise(x / Foliage.AutumnGroupM + 0.37, z / Foliage.AutumnGroupM - 0.61));
            Rgb leaves = Rgb.Mix(Rgb.Mix(Canopy, AutumnCanopy, autumn * 0.6), PineCanopy, cold);
            return Rgb.Mix(ground, leaves, canopy);
        }

        public static Vec2XZ CenterFor(double x, double z, double snapM) =>
            new Vec2XZ(MathUtil.JsRound(x / snapM) * snapM + 0.0, MathUtil.JsRound(z / snapM) * snapM + 0.0);

        public static FarTerrainMesh Build(uint seed, double centerX, double centerZ, double halfSizeM, double stepM)
        {
            if (!(MathUtil.IsFinite(stepM) && stepM > 0 && MathUtil.IsFinite(halfSizeM) && halfSizeM > 0))
                throw new ArgumentOutOfRangeException(nameof(stepM), $"grille lointaine invalide : demi-côté {halfSizeM}, pas {stepM}");
            int n = (int)MathUtil.JsRound(halfSizeM / stepM);
            int side = 2 * n + 1;
            if ((long)side * side > MaxVertices) throw new ArgumentOutOfRangeException(nameof(halfSizeM), $"grille lointaine trop grande : {side} × {side}");
            int w = side + 2;
            var h = new double[w * w];
            for (int r = 0; r < w; r++)
                for (int c = 0; c < w; c++)
                    h[r * w + c] = Terrain.HeightAt(seed, centerX + (c - 1 - n) * stepM, centerZ + (r - 1 - n) * stepM);
            var mesh = new FarTerrainMesh
            {
                Positions = new float[side * side * 3],
                Normals = new float[side * side * 3],
                Colors = new float[side * side * 4],
                Indices = new int[(side - 1) * (side - 1) * 6],
                CenterX = centerX,
                CenterZ = centerZ,
            };
            for (int r = 0; r < side; r++)
                for (int c = 0; c < side; c++)
                {
                    int i = r * side + c, k = (r + 1) * w + (c + 1);
                    double lx = (c - n) * stepM, lz = (r - n) * stepM, y = h[k];
                    mesh.Positions[i * 3] = (float)lx; mesh.Positions[i * 3 + 1] = (float)y; mesh.Positions[i * 3 + 2] = (float)lz;
                    double nx = (h[k - 1] - h[k + 1]) / (2 * stepM), nz = (h[k - w] - h[k + w]) / (2 * stepM);
                    double len = MathUtil.Hypot(nx, 1, nz);
                    mesh.Normals[i * 3] = (float)(nx / len); mesh.Normals[i * 3 + 1] = (float)(1 / len); mesh.Normals[i * 3 + 2] = (float)(nz / len);
                    Rgb col = FarColor(seed, centerX + lx, centerZ + lz, y, 1 / len);
                    mesh.Colors[i * 4] = (float)col.R; mesh.Colors[i * 4 + 1] = (float)col.G; mesh.Colors[i * 4 + 2] = (float)col.B; mesh.Colors[i * 4 + 3] = 1;
                }
            int o = 0;
            for (int r = 0; r < side - 1; r++)
                for (int c = 0; c < side - 1; c++, o += 6)
                    Triangulation.QuadTriangles(c, r, side, mesh.Indices, o);
            return mesh;
        }
    }
}
