// Port of src/core/world/terrain.ts — ground height in world coordinates, from the seed alone (genVersion 1).
using System;
using JeuSurvie.Core.Shared;
using P = JeuSurvie.Core.World.TerrainParams;

namespace JeuSurvie.Core.World
{
    public readonly struct TerrainRegions
    {
        public readonly double Hills, Mountains;
        public TerrainRegions(double hills, double mountains) { Hills = hills; Mountains = mountains; }
    }

    public static class Terrain
    {
        public static TerrainRegions RegionsAt(uint seed, double x, double z)
        {
            var g = P.Regions;
            double raw = Math.Min(1, Math.Max(0, 0.5 + P.RegionsContrast * Noise.Fbm2(seed, x * g.Frequency, z * g.Frequency, g, g.Salt)));
            double away = MathUtil.Smoothstep(P.StartCalmRadius, 2 * P.StartCalmRadius, Math.Sqrt(x * x + z * z));
            double region = Math.Max(P.StartMinRegion * (1 - away), Math.Min(raw, P.StartMaxRegion + (1 - P.StartMaxRegion) * away));
            return new TerrainRegions(MathUtil.Smoothstep(P.HillsFrom, P.HillsTo, region), MathUtil.Smoothstep(P.MountainsFrom, P.MountainsTo, region));
        }

        /// <summary>Exact (float64) height at (x, z). Reserved to the generator: gameplay reads ChunkData float32 heights.</summary>
        public static double HeightAt(uint seed, double x, double z)
        {
            var w = P.Warp;
            double wx = x + P.WarpAmplitude * Noise.Fbm2(seed, x * w.Frequency, z * w.Frequency, w, w.Salt);
            double wz = z + P.WarpAmplitude * Noise.Fbm2(seed, x * w.Frequency, z * w.Frequency, w, P.WarpSaltZ);

            TerrainRegions regions = RegionsAt(seed, x, z);

            var sw = P.Swells;
            double h = P.BaseHeight + P.SwellsAmplitude * Noise.Fbm2(seed, wx * sw.Frequency, wz * sw.Frequency, sw, sw.Salt);
            var hl = P.Hills;
            double amplitude = P.PlainsAmplitude + (P.HillsAmplitude - P.PlainsAmplitude) * regions.Hills;
            h += amplitude * Noise.Fbm2(seed, wx * hl.Frequency, wz * hl.Frequency, hl, hl.Salt);

            var v = P.Valleys;
            double valleyNoise = Math.Abs(Noise.Fbm2(seed, wx * v.Frequency, wz * v.Frequency, v, v.Salt));
            double valley = 1 - MathUtil.Smoothstep(0, P.ValleyWidth, valleyNoise);

            if (regions.Mountains > 0)
            {
                var m = P.Mountains;
                var e = P.Erosion;
                double ridge = Noise.RidgedMultifractal2(seed, wx * m.Frequency, wz * m.Frequency, m, m.Salt);
                double cut = 1 - MathUtil.Smoothstep(0, P.MountainCutWidth, valleyNoise);
                h += P.MountainsAmplitude * regions.Mountains * ridge * Math.Sqrt(ridge) * (1 - P.MountainCut * cut);
                h += P.ErosionAmplitude * regions.Mountains * Noise.ErodedFbm2(seed, wx * e.Frequency, wz * e.Frequency, e, e.Salt);
            }

            h -= P.ValleyDepth * valley * (1 + regions.Mountains);
            return h + 0.0;
        }
    }
}
