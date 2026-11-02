// Port of src/core/world/biome.ts — temperate forest and cold biome from temperature/humidity maps (genVersion 1).
using System;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.World
{
    public readonly struct BiomeSample
    {
        /// <summary>Share of the cold biome (0 = temperate forest, 1 = cold).</summary>
        public readonly double Cold;
        /// <summary>Humidity (0 = dry, 1 = wet).</summary>
        public readonly double Humidity;
        public BiomeSample(double cold, double humidity) { Cold = cold; Humidity = humidity; }
    }

    public static class Biome
    {
        public const double StartBiomeRadiusM = 800;
        private static readonly NoiseLayer Temperature = new NoiseLayer(1.0 / 3500, 3, 2, 0.5, 41);
        private static readonly NoiseLayer HumidityLayer = new NoiseLayer(1.0 / 2500, 3, 2, 0.5, 42);
        private const double Stretch = 2.2;
        private static readonly double[,] StartDirections =
        {
            { 1, 0 }, { 0.7071067811865476, 0.7071067811865476 }, { 0, 1 }, { -0.7071067811865476, 0.7071067811865476 },
            { -1, 0 }, { -0.7071067811865476, -0.7071067811865476 }, { 0, -1 }, { 0.7071067811865476, -0.7071067811865476 },
        };
        private const int StartSalt = 43;
        private const double RampAtStart = -0.8, RampGain = 1.8;
        private const double ColdFrom = -0.15, ColdTo = 0.15;

        public static BiomeSample At(uint seed, double x, double z)
        {
            double baseCold = -Stretch * Noise.Fbm2(seed, x * Temperature.Frequency, z * Temperature.Frequency, Temperature, Temperature.Salt);
            uint dir = Hash.Hash2(seed, 0, 0, StartSalt) & 7;
            double dx = StartDirections[dir, 0], dz = StartDirections[dir, 1];
            double ramp = Math.Min(1, Math.Max(-1, RampAtStart + (RampGain * (x * dx + z * dz)) / StartBiomeRadiusM));
            double away = MathUtil.Smoothstep(StartBiomeRadiusM, 2 * StartBiomeRadiusM, Math.Sqrt(x * x + z * z));
            double coldness = ramp * (1 - away) + baseCold * away;
            double humidity = Math.Min(1, Math.Max(0, 0.5 + Stretch * Noise.Fbm2(seed, x * HumidityLayer.Frequency, z * HumidityLayer.Frequency, HumidityLayer, HumidityLayer.Salt)));
            return new BiomeSample(MathUtil.Smoothstep(ColdFrom, ColdTo, coldness), humidity + 0.0);
        }
    }
}
