// Port of src/core/world/paths.ts — dirt paths: level-0 lines of a warped low-frequency fBm.
using System;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.World
{
    public static class Paths
    {
        private static readonly NoiseLayer Network = new NoiseLayer(1.0 / 110, 2, 2, 0.5, 61);
        private static readonly NoiseLayer Warp = new NoiseLayer(1.0 / 110, 2, 2, 0.5, 63);
        private const int WarpSaltZ = 64;
        private const double WarpAmplitude = 20;
        private const double CoreHalfWidthM = 0.5, EdgeHalfWidthM = 1.9, GradientStepM = 0.5, MinGradient = 0.002, FarFromPath = 0.15;

        private static double NetworkAt(uint seed, double x, double z)
        {
            double wx = x + WarpAmplitude * Noise.Fbm2(seed, x * Warp.Frequency, z * Warp.Frequency, Warp, Warp.Salt);
            double wz = z + WarpAmplitude * Noise.Fbm2(seed, x * Warp.Frequency, z * Warp.Frequency, Warp, WarpSaltZ);
            return Noise.Fbm2(seed, wx * Network.Frequency, wz * Network.Frequency, Network, Network.Salt);
        }

        /// <summary>Share of dirt path at (x, z), in [0, 1].</summary>
        public static double PathAt(uint seed, double x, double z)
        {
            double f = NetworkAt(seed, x, z);
            double distanceToZero = Math.Abs(f);
            if (distanceToZero > FarFromPath) return 0;
            double gx = (NetworkAt(seed, x + GradientStepM, z) - f) / GradientStepM;
            double gz = (NetworkAt(seed, x, z + GradientStepM) - f) / GradientStepM;
            double distance = distanceToZero / Math.Max(Math.Sqrt(gx * gx + gz * gz), MinGradient);
            return 1 - MathUtil.Smoothstep(CoreHalfWidthM, EdgeHalfWidthM, distance);
        }
    }
}
