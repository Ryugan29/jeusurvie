// Port of src/core/world/surface.ts — ground appearance variations (render only, no effect on heights).
using System;

namespace JeuSurvie.Core.World
{
    public readonly struct SurfaceVariation
    {
        public readonly double Patch, SnowJitter;
        public SurfaceVariation(double patch, double snowJitter) { Patch = patch; SnowJitter = snowJitter; }
    }

    public static class Surface
    {
        private static readonly NoiseLayer Patches = new NoiseLayer(1.0 / 90, 3, 2, 0.5, 31);
        private static readonly NoiseLayer SnowLine = new NoiseLayer(1.0 / 160, 2, 2, 0.5, 32);
        private const double Stretch = 2;

        private static double Clamp1(double v) => Math.Min(1, Math.Max(-1, v));

        public static SurfaceVariation VariationAt(uint seed, double x, double z)
        {
            return new SurfaceVariation(
                Clamp1(Stretch * Noise.Fbm2(seed, x * Patches.Frequency, z * Patches.Frequency, Patches, Patches.Salt)) + 0.0,
                Clamp1(Stretch * Noise.Fbm2(seed, x * SnowLine.Frequency, z * SnowLine.Frequency, SnowLine, SnowLine.Salt)) + 0.0);
        }
    }
}
