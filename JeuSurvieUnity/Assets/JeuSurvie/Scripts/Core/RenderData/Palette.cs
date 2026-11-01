// Port of src/adapters/render-data/palette.ts and shade.ts — terrain colour by height/slope/surface (sRGB albedos, ADR 0012)
// and the baked cavity occlusion of the vertex colours.
using System;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.RenderData
{
    public readonly struct SurfaceTint
    {
        public readonly double Patch, SnowJitter, Cold, Path;
        public SurfaceTint(double patch, double snowJitter, double cold, double path) { Patch = patch; SnowJitter = snowJitter; Cold = cold; Path = path; }
    }

    public readonly struct TerrainLayers
    {
        public readonly double Soil, Rock, Snow;
        public TerrainLayers(double soil, double rock, double snow) { Soil = soil; Rock = rock; Snow = snow; }
    }

    public static class Palette
    {
        private static readonly Rgb Moss = new Rgb(0.25, 0.32, 0.13);
        private static readonly Rgb Grass = new Rgb(0.33, 0.43, 0.16);
        private static readonly Rgb Meadow = new Rgb(0.47, 0.47, 0.22);
        private static readonly Rgb Dirt = new Rgb(0.4, 0.32, 0.23);
        private static readonly Rgb ColdGrass = new Rgb(0.44, 0.49, 0.42);
        private static readonly Rgb Rock = new Rgb(0.47, 0.44, 0.41);
        private static readonly Rgb Snow = new Rgb(0.92, 0.94, 0.97);
        private static readonly Rgb PathDirt = new Rgb(0.56, 0.46, 0.33);
        private const double PatchContrast = 0.18, PatchMeadow = 0.45;
        private const double DirtFrom = 0.08, DirtFull = 0.16, RockFrom = 0.2, RockFull = 0.34;
        private const double ColdRockFrom = 0.08, ColdRockFull = 0.15;
        private const double PathSlopeFrom = 0.06, PathSlopeGone = 0.14;
        private const double ColdSnowDrop = 70, SnowLine = 182, SnowJitterM = 15, SnowBand = 6;

        private static void Coverage(double height, double normalY, SurfaceTint tint, out double dirtT, out double rockT, out double pathT, out double snowT)
        {
            double steepness = 1 - normalY;
            double rockFrom = RockFrom + (ColdRockFrom - RockFrom) * tint.Cold;
            double rockFull = RockFull + (ColdRockFull - RockFull) * tint.Cold;
            rockT = MathUtil.Smoothstep(rockFrom, rockFull, steepness);
            pathT = tint.Path * (1 - MathUtil.Smoothstep(PathSlopeFrom, PathSlopeGone, steepness)) * (1 - rockT);
            double line = SnowLine - ColdSnowDrop * tint.Cold + SnowJitterM * tint.SnowJitter;
            snowT = MathUtil.Smoothstep(line - SnowBand, line + SnowBand, height) * (1 - 0.7 * rockT);
            dirtT = MathUtil.Smoothstep(DirtFrom, DirtFull, steepness);
        }

        public static Rgb TerrainColor(double height, double normalY, SurfaceTint tint)
        {
            Rgb low = Rgb.Mix(Moss, Grass, MathUtil.Smoothstep(-20, 0, height));
            double meadowT = Math.Min(1, Math.Max(0, MathUtil.Smoothstep(4, 16, height) + PatchMeadow * tint.Patch));
            Rgb baseC = Rgb.Mix(Rgb.Mix(low, Meadow, meadowT), ColdGrass, tint.Cold);
            double k = 1 + PatchContrast * tint.Patch;
            var grass = new Rgb(Math.Min(1, baseC.R * k), Math.Min(1, baseC.G * k), Math.Min(1, baseC.B * k));
            Coverage(height, normalY, tint, out double dirtT, out double rockT, out double pathT, out double snowT);
            Rgb slopeGround = Rgb.Mix(Rgb.Mix(grass, Dirt, dirtT), Rock, rockT);
            return Rgb.Mix(Rgb.Mix(slopeGround, PathDirt, pathT), Snow, snowT);
        }

        public static TerrainLayers Layers(double height, double normalY, SurfaceTint tint)
        {
            Coverage(height, normalY, tint, out double dirtT, out double rockT, out double pathT, out double snowT);
            double notSnow = 1 - snowT;
            return new TerrainLayers((dirtT * (1 - rockT) * (1 - pathT) + pathT) * notSnow, rockT * (1 - pathT) * notSnow, snowT);
        }
    }

    public static class Shade
    {
        public const double ShadeMin = 0.7, ShadeMax = 1.1;
        private const int Near = 2, Far = 6;
        public const int ShadeReach = Far;
        private const double CavityGain = 0.1, SlopeDarken = 0.25;

        public static double TerrainShade(Func<int, int, double> at, int col, int row, double normalY)
        {
            double h = at(col, row);
            double Ring(int k) => (at(col + k, row) + at(col - k, row) + at(col, row + k) + at(col, row - k)) / 4 - h;
            double cavity = 0.6 * Ring(Near) + 0.4 * Ring(Far);
            double shade = 1 - CavityGain * cavity - SlopeDarken * (1 - normalY);
            return Math.Min(ShadeMax, Math.Max(ShadeMin, shade));
        }
    }
}
