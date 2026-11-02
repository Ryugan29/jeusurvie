// Port of src/adapters/render-data/fog.ts and fog-blend.ts — exponential distance fog, height fog, haze colour.
using System;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.Survival;

namespace JeuSurvie.Core.RenderData
{
    public readonly struct HeightFog
    {
        public readonly double Density, Thickness;
        public HeightFog(double density, double thickness) { Density = density; Thickness = thickness; }
    }

    public static class Fog
    {
        public static double Visibility(double distanceM, double density) => Math.Exp(-distanceM * density);
        public static double Amount(double distanceM, double density) => 1 - Visibility(distanceM, density);

        public static double DensityFor(double distanceM, double visibility)
        {
            if (!(visibility > 0 && visibility < 1)) throw new ArgumentOutOfRangeException(nameof(visibility), "visibilité de brume hors de ]0, 1[ : " + visibility);
            if (!(MathUtil.IsFinite(distanceM) && distanceM > 0)) throw new ArgumentOutOfRangeException(nameof(distanceM), "distance de brume invalide : " + distanceM);
            return -Math.Log(visibility) / distanceM;
        }

        public static double HeightFogAmount(double distanceM, double heightAboveBaseM, HeightFog fog) =>
            (1 - Math.Exp(-distanceM * fog.Density)) * Math.Exp(-Math.Max(0, heightAboveBaseM) / fog.Thickness);

        private static readonly double[,] HeightFogKeys =
        {
            { 0, 0.014, 28 }, { 0.12, 0.009, 24 }, { 0.3, 0.003, 14 }, { 0.5, 0.003, 14 }, { 0.66, 0.011, 32 }, { 0.85, 0.008, 26 }, { 1, 0.014, 28 },
        };

        public static HeightFog HeightFogFor(TimeOfDay time)
        {
            double f = time.DayFraction - Math.Floor(time.DayFraction);
            int n = HeightFogKeys.GetLength(0), i = 0;
            while (i < n - 2 && f >= HeightFogKeys[i + 1, 0]) i++;
            double t = (f - HeightFogKeys[i, 0]) / (HeightFogKeys[i + 1, 0] - HeightFogKeys[i, 0]);
            return new HeightFog(HeightFogKeys[i, 1] + (HeightFogKeys[i + 1, 1] - HeightFogKeys[i, 1]) * t,
                HeightFogKeys[i, 2] + (HeightFogKeys[i + 1, 2] - HeightFogKeys[i, 2]) * t);
        }

        private const double HazeDesaturate = 0.15;
        public const double HazeLighten = 0.05;

        public static Rgb HazeColor(Lighting l)
        {
            double gray = Lights.Luminance(l.FogColor);
            double F(double v) { double d = v + (gray - v) * HazeDesaturate; return d + (1 - d) * HazeLighten; }
            return new Rgb(F(l.FogColor.R), F(l.FogColor.G), F(l.FogColor.B));
        }

        private const double HazeHorizonBand = 0.15;
        public static double HazeHorizonWeight(double heightFraction) => 1 - MathUtil.Smoothstep(0, HazeHorizonBand, heightFraction);

        private static readonly double[,] DistanceFogKeys = { { 0, 0.13 }, { 0.12, 0.18 }, { 0.3, 0.32 }, { 0.5, 0.32 }, { 0.66, 0.1 }, { 0.85, 0.12 }, { 1, 0.13 } };

        public static double DistanceFogVisibilityFor(TimeOfDay time)
        {
            double f = time.DayFraction - Math.Floor(time.DayFraction);
            int n = DistanceFogKeys.GetLength(0), i = 0;
            while (i < n - 2 && f >= DistanceFogKeys[i + 1, 0]) i++;
            return DistanceFogKeys[i, 1] + ((DistanceFogKeys[i + 1, 1] - DistanceFogKeys[i, 1]) * (f - DistanceFogKeys[i, 0])) / (DistanceFogKeys[i + 1, 0] - DistanceFogKeys[i, 0]);
        }

        /// <summary>Babylon's approximate gamma (2.2), used for sRGB palette → linear in the shaders.</summary>
        public const double Gamma = 2.2;
        public static Rgb GammaToLinear(Rgb c) => new Rgb(Math.Pow(c.R, Gamma), Math.Pow(c.G, Gamma), Math.Pow(c.B, Gamma));
        public static Rgb LinearToGamma(Rgb c) => new Rgb(Math.Pow(c.R, 1 / Gamma), Math.Pow(c.G, 1 / Gamma), Math.Pow(c.B, 1 / Gamma));
        /// <summary>Linear fog blend (fog-blend.ts): mix(fog, colour, visibility).</summary>
        public static Rgb FoggedColor(Rgb colorLinear, Rgb fogColor, double visibility) =>
            new Rgb(fogColor.R * (1 - visibility) + colorLinear.R * visibility, fogColor.G * (1 - visibility) + colorLinear.G * visibility, fogColor.B * (1 - visibility) + colorLinear.B * visibility);
    }
}
