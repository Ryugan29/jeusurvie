// Port of src/app/chunks/streamer.ts and replan-gate.ts — which chunks to keep around the player (pure).
using System;
using System.Collections.Generic;
using System.Linq;
using JeuSurvie.Core.World;

namespace JeuSurvie.Core.App
{
    public sealed class StreamParams
    {
        public double ViewRadiusM;
        public double UnloadMarginM;
        public int MaxChunks;
        public StreamParams(double viewRadiusM, double unloadMarginM, int maxChunks) { ViewRadiusM = viewRadiusM; UnloadMarginM = unloadMarginM; MaxChunks = maxChunks; }
    }

    public sealed class StreamPlan
    {
        public readonly List<ChunkCoord> Wanted;
        public readonly List<ChunkCoord> ToLoad;
        public readonly List<string> ToUnload;
        public StreamPlan(List<ChunkCoord> wanted, List<ChunkCoord> toLoad, List<string> toUnload) { Wanted = wanted; ToLoad = toLoad; ToUnload = toUnload; }
    }

    public static class Streamer
    {
        public static double EffectiveViewRadius(double viewRadiusM, int maxChunks) =>
            Math.Min(viewRadiusM, Chunk.Size * Math.Sqrt(Math.Max(0, maxChunks) / Math.PI));

        private static double CenterD2(double x, double z, ChunkCoord c)
        {
            double dx = (c.Cx + 0.5) * Chunk.Size - x, dz = (c.Cz + 0.5) * Chunk.Size - z;
            return dx * dx + dz * dz;
        }

        private static bool InsideWorld(ChunkCoord c, double worldLimitM) => CenterD2(0, 0, c) <= worldLimitM * worldLimitM;

        private static int Compare(double x, double z, ChunkCoord a, ChunkCoord b)
        {
            int d = CenterD2(x, z, a).CompareTo(CenterD2(x, z, b));
            if (d != 0) return d;
            if (a.Cz != b.Cz) return a.Cz.CompareTo(b.Cz);
            return a.Cx.CompareTo(b.Cx);
        }

        public static List<ChunkCoord> ChunksAround(double x, double z, double radiusM, int maxChunks, double? worldLimit = null)
        {
            double worldLimitM = worldLimit ?? TerrainParams.WorldRadiusM + radiusM;
            ChunkCoord here = Chunk.CoordOf(x, z);
            int span = (int)Math.Ceiling(radiusM / Chunk.Size) + 1;
            double r2 = radiusM * radiusM;
            var found = new List<ChunkCoord>();
            for (int dz = -span; dz <= span; dz++)
                for (int dx = -span; dx <= span; dx++)
                {
                    if (dx == 0 && dz == 0) continue;
                    var c = new ChunkCoord(here.Cx + dx, here.Cz + dz);
                    if (CenterD2(x, z, c) <= r2 && InsideWorld(c, worldLimitM)) found.Add(c);
                }
            // Stable sort (JS Array.prototype.sort is stable).
            var sorted = found.Select((c, i) => (c, i)).OrderBy(p => p, Comparer<(ChunkCoord c, int i)>.Create((p, q) =>
            {
                int k = Compare(x, z, p.c, q.c);
                return k != 0 ? k : p.i.CompareTo(q.i);
            })).Select(p => p.c);
            var result = new List<ChunkCoord> { here };
            result.AddRange(sorted);
            if (result.Count > Math.Max(0, maxChunks)) result.RemoveRange(Math.Max(0, maxChunks), result.Count - Math.Max(0, maxChunks));
            return result;
        }

        public static StreamPlan Plan(double x, double z, IReadOnlyDictionary<string, ChunkCoord> loaded, StreamParams p)
        {
            double radius = EffectiveViewRadius(p.ViewRadiusM, p.MaxChunks);
            double worldLimitM = TerrainParams.WorldRadiusM + radius;
            ChunkCoord here = Chunk.CoordOf(x, z);
            double keepR = radius + p.UnloadMarginM;
            bool Keepable(ChunkCoord c) => (c.Cx == here.Cx && c.Cz == here.Cz) || (CenterD2(x, z, c) <= keepR * keepR && InsideWorld(c, worldLimitM));
            Comparison<ChunkCoord> byDistance = (a, b) => Compare(x, z, a, b);

            var kept = loaded.Values.Where(Keepable).ToList();
            kept.Sort(byDistance);
            if (kept.Count > Math.Max(0, p.MaxChunks)) kept.RemoveRange(Math.Max(0, p.MaxChunks), kept.Count - Math.Max(0, p.MaxChunks));
            var keptKeys = new HashSet<string>(kept.Select(c => Chunk.Key(c.Cx, c.Cz)));
            var toUnload = loaded.Keys.Where(k => !keptKeys.Contains(k)).ToList();

            int budget = Math.Max(0, p.MaxChunks - kept.Count);
            var toLoad = ChunksAround(x, z, radius, p.MaxChunks, worldLimitM).Where(c => !loaded.ContainsKey(Chunk.Key(c.Cx, c.Cz))).Take(budget).ToList();
            var wanted = new List<ChunkCoord>(kept);
            wanted.AddRange(toLoad);
            wanted.Sort(byDistance);
            return new StreamPlan(wanted, toLoad, toUnload);
        }
    }

    /// <summary>The streaming plan only changes when the player changes chunk (or the mode changes).</summary>
    public sealed class ReplanGate
    {
        private int cx = int.MinValue, cz = int.MinValue;
        private InputMode? mode;

        public bool ShouldReplan(double x, double z, InputMode m)
        {
            ChunkCoord c = Chunk.CoordOf(x, z);
            if (c.Cx == cx && c.Cz == cz && mode == m) return false;
            cx = c.Cx;
            cz = c.Cz;
            mode = m;
            return true;
        }
    }
}
