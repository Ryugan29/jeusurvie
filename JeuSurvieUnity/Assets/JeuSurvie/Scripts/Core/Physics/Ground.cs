// Port of src/core/physics/ground.ts — interpolates the chunk float32 heights on the SAME triangulation as the rendered mesh.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.World;

namespace JeuSurvie.Core.Physics
{
    /// <summary>Ground height in (x, z), or null if the chunk is not loaded.</summary>
    public delegate double? GroundSampler(double x, double z);

    public static class Ground
    {
        private const double Step = Chunk.Step;
        private const int LastQuad = Chunk.Verts - 2;

        public static double? HeightIn(float[] heights, double originX, double originZ, double x, double z)
        {
            double lx = (x - originX) / Step, lz = (z - originZ) / Step;
            if (!(lx >= 0 && lz >= 0 && lx <= Chunk.Verts - 1 && lz <= Chunk.Verts - 1)) return null;
            int col = Math.Min((int)Math.Floor(lx), LastQuad), row = Math.Min((int)Math.Floor(lz), LastQuad);
            int i = row * Chunk.Verts + col;
            return Triangulation.HeightInQuad(heights[i], heights[i + 1], heights[i + Chunk.Verts], heights[i + Chunk.Verts + 1], lx - col, lz - row);
        }

        public static double? HeightIn(IReadOnlyDictionary<string, ChunkData> chunks, double x, double z)
        {
            ChunkCoord c = Chunk.CoordOf(x, z);
            if (!chunks.TryGetValue(Chunk.Key(c.Cx, c.Cz), out ChunkData chunk)) return null;
            return HeightIn(chunk.Heights, c.Cx * (double)Chunk.Size, c.Cz * (double)Chunk.Size, x, z);
        }

        /// <summary>Moves by (dx, dz) and lands on the ground; refused if unloaded or steeper than maxSlope.</summary>
        public static Vec3 MoveOnGround(Vec3 pos, double dx, double dz, GroundSampler ground, double maxSlope)
        {
            double? here = ground(pos.X, pos.Z);
            Vec3 stay = here == null ? pos : new Vec3(pos.X, here.Value, pos.Z);
            double distance = Math.Sqrt(dx * dx + dz * dz);
            if (distance == 0) return stay;
            double x = pos.X + dx, z = pos.Z + dz;
            double? there = ground(x, z);
            if (there == null) return stay;
            if (here != null && there.Value - here.Value > maxSlope * distance) return stay;
            return new Vec3(x, there.Value, z);
        }
    }
}
