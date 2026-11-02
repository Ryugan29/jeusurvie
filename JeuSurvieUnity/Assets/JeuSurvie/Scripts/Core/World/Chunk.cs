// Port of src/core/world/chunk.ts — 64 m chunks, 33×33 float32 heights (the ground truth for physics AND rendering).
using System;

namespace JeuSurvie.Core.World
{
    public readonly struct ChunkCoord : IEquatable<ChunkCoord>
    {
        public readonly int Cx, Cz;
        public ChunkCoord(int cx, int cz) { Cx = cx; Cz = cz; }
        public bool Equals(ChunkCoord o) => Cx == o.Cx && Cz == o.Cz;
        public override bool Equals(object obj) => obj is ChunkCoord o && Equals(o);
        public override int GetHashCode() => unchecked(Cx * 73856093 ^ Cz * 19349663);
        public override string ToString() => Chunk.Key(Cx, Cz);
    }

    public sealed class ChunkData
    {
        public readonly int Cx, Cz;
        public const int GenVersion = 1;
        /// <summary>Heights row by row: index = row (Z) * CHUNK_VERTS + col (X); float32 of HeightAt (contract).</summary>
        public readonly float[] Heights;
        public ChunkData(int cx, int cz, float[] heights) { Cx = cx; Cz = cz; Heights = heights; }
    }

    public static class Chunk
    {
        public const int Size = 64;
        public const int Verts = 33;
        public const double Step = (double)Size / (Verts - 1);

        /// <summary>Generates chunk (cx, cz) — pure: same arguments, same chunk, on every platform.</summary>
        public static ChunkData Generate(uint seed, int cx, int cz)
        {
            var heights = new float[Verts * Verts];
            for (int row = 0; row < Verts; row++)
                for (int col = 0; col < Verts; col++)
                    heights[row * Verts + col] = (float)Terrain.HeightAt(seed, cx * Size + col * Step, cz * Size + row * Step);
            return new ChunkData(cx, cz, heights);
        }

        /// <summary>Unique text key « cx,cz ».</summary>
        public static string Key(int cx, int cz) => cx + "," + cz;

        /// <summary>Chunk containing world point (x, z) (west and north edges included).</summary>
        public static ChunkCoord CoordOf(double x, double z) => new ChunkCoord(CellOf(x), CellOf(z));

        private static int CellOf(double v)
        {
            double c = Math.Floor(v / Size);
            if (v < c * Size) c -= 1;
            else if (v >= (c + 1) * Size) c += 1;
            return (int)c;
        }
    }
}
