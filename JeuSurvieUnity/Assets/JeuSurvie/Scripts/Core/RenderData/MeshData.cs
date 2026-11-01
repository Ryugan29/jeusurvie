// Port of src/adapters/render-data/mesh-data.ts — ChunkData → mesh buffers (runs on worker threads).
using System;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.World;

namespace JeuSurvie.Core.RenderData
{
    public sealed class ChunkMeshData
    {
        /// <summary>Positions local to the chunk (x, y, z); the mesh is placed at (cx·64, 0, cz·64).</summary>
        public float[] Positions;
        public float[] Normals;
        /// <summary>RGBA vertex colours (sRGB palette × baked shade).</summary>
        public float[] Colors;
        /// <summary>Layer weights per vertex (soil, rock, snow; grass takes the rest).</summary>
        public float[] Layers;
        public int[] Indices;
    }

    public interface IMeshSamplers
    {
        double Height(int col, int row);
        SurfaceTint Surface(int col, int row);
    }

    /// <summary>Samplers of world `seed` around chunk (cx, cz) — float32 of HeightAt like ChunkData.</summary>
    public sealed class WorldSamplers : IMeshSamplers
    {
        private readonly uint seed;
        private readonly double ox, oz;
        public WorldSamplers(uint seed, int cx, int cz) { this.seed = seed; ox = cx * (double)Chunk.Size; oz = cz * (double)Chunk.Size; }
        public double Height(int col, int row) => (float)Terrain.HeightAt(seed, ox + col * Chunk.Step, oz + row * Chunk.Step);
        public SurfaceTint Surface(int col, int row)
        {
            double x = ox + col * Chunk.Step, z = oz + row * Chunk.Step;
            SurfaceVariation v = World.Surface.VariationAt(seed, x, z);
            return new SurfaceTint(v.Patch, v.SnowJitter, Biome.At(seed, x, z).Cold, Paths.PathAt(seed, x, z));
        }
    }

    public static class MeshData
    {
        private const int V = Chunk.Verts;
        private const double Step = Chunk.Step;
        private static readonly int Pad = Math.Max(1, Shade.ShadeReach);
        private static readonly int W = V + 2 * Pad;

        public static ChunkMeshData Build(ChunkData chunk, IMeshSamplers samplers)
        {
            float[] h = chunk.Heights;
            var grid = new float[W * W];
            for (int row = -Pad; row < V + Pad; row++)
                for (int col = -Pad; col < V + Pad; col++)
                {
                    bool inside = col >= 0 && col < V && row >= 0 && row < V;
                    grid[(row + Pad) * W + col + Pad] = inside ? h[row * V + col] : (float)samplers.Height(col, row);
                }
            double At(int col, int row) => grid[(row + Pad) * W + col + Pad];
            Func<int, int, double> at = At;
            var mesh = new ChunkMeshData
            {
                Positions = new float[V * V * 3],
                Normals = new float[V * V * 3],
                Colors = new float[V * V * 4],
                Layers = new float[V * V * 3],
                Indices = new int[(V - 1) * (V - 1) * 6],
            };
            for (int row = 0; row < V; row++)
                for (int col = 0; col < V; col++)
                {
                    int i = row * V + col;
                    double y = h[i];
                    mesh.Positions[i * 3] = (float)(col * Step);
                    mesh.Positions[i * 3 + 1] = (float)y;
                    mesh.Positions[i * 3 + 2] = (float)(row * Step);
                    double dhdx = (At(col + 1, row) - At(col - 1, row)) / (2 * Step);
                    double dhdz = (At(col, row + 1) - At(col, row - 1)) / (2 * Step);
                    double len = MathUtil.Hypot(dhdx, 1, dhdz);
                    double ny = 1 / len;
                    mesh.Normals[i * 3] = (float)(-dhdx / len);
                    mesh.Normals[i * 3 + 1] = (float)ny;
                    mesh.Normals[i * 3 + 2] = (float)(-dhdz / len);
                    double shade = Shade.TerrainShade(at, col, row, ny);
                    SurfaceTint tint = samplers.Surface(col, row);
                    Rgb c = Palette.TerrainColor(y, ny, tint);
                    mesh.Colors[i * 4] = (float)Math.Min(1, c.R * shade);
                    mesh.Colors[i * 4 + 1] = (float)Math.Min(1, c.G * shade);
                    mesh.Colors[i * 4 + 2] = (float)Math.Min(1, c.B * shade);
                    mesh.Colors[i * 4 + 3] = 1;
                    TerrainLayers layer = Palette.Layers(y, ny, tint);
                    mesh.Layers[i * 3] = (float)layer.Soil;
                    mesh.Layers[i * 3 + 1] = (float)layer.Rock;
                    mesh.Layers[i * 3 + 2] = (float)layer.Snow;
                }
            int k = 0;
            for (int row = 0; row < V - 1; row++)
                for (int col = 0; col < V - 1; col++, k += 6)
                    Triangulation.QuadTriangles(col, row, V, mesh.Indices, k);
            return mesh;
        }
    }
}
