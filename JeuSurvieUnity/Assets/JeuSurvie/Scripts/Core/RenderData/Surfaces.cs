// Port of render-data/surfaces.ts, normal-maps.ts, ground-materials.ts, environment-light.ts.
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.RenderData
{
    public readonly struct SurfaceSpec
    {
        public readonly double Metallic, Roughness, EnvironmentIntensity, Darken;
        public SurfaceSpec(double metallic, double roughness, double environmentIntensity, double darken = 1)
        {
            Metallic = metallic; Roughness = roughness; EnvironmentIntensity = environmentIntensity; Darken = darken;
        }
    }

    public readonly struct NormalMapSpec
    {
        public readonly string File;
        public readonly double Level;
        public NormalMapSpec(string file, double level) { File = file; Level = level; }
    }

    public enum SurfaceLayer { Grass, Soil, Rock, Snow }

    public readonly struct SurfaceLayerSpec
    {
        public readonly double TileM, BumpDepthM, Roughness;
        public readonly Rgb ReferenceAlbedo;
        public SurfaceLayerSpec(double tileM, double bumpDepthM, Rgb referenceAlbedo, double roughness) { TileM = tileM; BumpDepthM = bumpDepthM; ReferenceAlbedo = referenceAlbedo; Roughness = roughness; }
    }

    public static class Surfaces
    {
        public static readonly SurfaceSpec Default = new SurfaceSpec(0, 0.62, 0.55);

        private static readonly (Regex pattern, SurfaceSpec surface)[] Table =
        {
            (new Regex("^rocks$|pathrocks|rock", RegexOptions.IgnoreCase), new SurfaceSpec(0, 0.82, 0.5)),
            (new Regex("bark|bois", RegexOptions.IgnoreCase), new SurfaceSpec(0, 0.9, 0.4)),
            (new Regex("mushroom", RegexOptions.IgnoreCase), new SurfaceSpec(0, 0.45, 0.6)),
            (new Regex("hair|cheveux|sourcils|cils", RegexOptions.IgnoreCase), new SurfaceSpec(0, 0.42, 0.6)),
            (new Regex("eye|yeux", RegexOptions.IgnoreCase), new SurfaceSpec(0, 0.15, 0.8)),
            (new Regex("feuille|leaf", RegexOptions.IgnoreCase), new SurfaceSpec(0, 0.7, 0.5)),
            (new Regex("cuir|leather|tenue", RegexOptions.IgnoreCase), new SurfaceSpec(0, 0.75, 0.45)),
            (new Regex("skin|body|superhero|demon", RegexOptions.IgnoreCase), new SurfaceSpec(0, 0.55, 0.55)),
        };

        public static SurfaceSpec For(string materialName)
        {
            foreach (var (pattern, surface) in Table) if (pattern.IsMatch(materialName ?? "")) return surface;
            return Default;
        }

        private const double WetRoughnessDrop = 0.55, WetDarken = 0.3, WetRoughnessFloor = 0.12;

        public static SurfaceSpec Wet(SurfaceSpec s, double wetness)
        {
            double w = MathUtil.IsFinite(wetness) ? Math.Min(1, Math.Max(0, wetness)) : 0;
            return new SurfaceSpec(s.Metallic, Math.Min(s.Roughness, Math.Max(WetRoughnessFloor, s.Roughness * (1 - WetRoughnessDrop * w))), s.EnvironmentIntensity, 1 - WetDarken * w);
        }

        // --- normal-maps.ts
        private static readonly Dictionary<string, NormalMapSpec> NormalMaps = new Dictionary<string, NormalMapSpec>
        {
            { "Bark_NormalTree", new NormalMapSpec("Bark_NormalTree_Normal.png", 1) },
            { "Bark_DeadTree", new NormalMapSpec("Bark_DeadTree_Normal.png", 1) },
            { "Rocks", new NormalMapSpec("Rocks_Normal.png", 0.9) },
        };

        public static NormalMapSpec? NormalMapFor(string materialName) => NormalMaps.TryGetValue(materialName ?? "", out var n) ? n : (NormalMapSpec?)null;

        // --- ground-materials.ts
        public static SurfaceLayerSpec Layer(SurfaceLayer l)
        {
            switch (l)
            {
                case SurfaceLayer.Grass: return new SurfaceLayerSpec(3, 0.012, new Rgb(0.072, 0.088, 0.04), 0.85);
                case SurfaceLayer.Soil: return new SurfaceLayerSpec(2.5, 0.02, new Rgb(0.125, 0.098, 0.074), 0.88);
                case SurfaceLayer.Rock: return new SurfaceLayerSpec(9, 0.09, new Rgb(0.19, 0.18, 0.165), 0.8);
                default: return new SurfaceLayerSpec(6, 0.03, new Rgb(0.78, 0.81, 0.86), 0.55);
            }
        }

        public const double AlbedoFactorMax = 3;
        public static double EncodeAlbedoFactor(double factor)
        {
            double f = MathUtil.IsFinite(factor) ? Math.Min(AlbedoFactorMax, Math.Max(0, factor)) : 0;
            return Math.Sqrt(f / AlbedoFactorMax);
        }
        public static double DecodeAlbedoFactor(double code) => code * code * AlbedoFactorMax;
        public static double NormalSlopeScale(SurfaceLayer layer, int size) { var s = Layer(layer); return (s.BumpDepthM * size) / s.TileM; }
        public const double WetAlbedoDarken = 0.42, WetRoughness = 0.32, PuddleRoughness = 0.04;

        // --- environment-light.ts
        public const double IblMax = 1, ClearNoonLightPerSky = 2.536, SideFaceMaxRatio = 1.06, SideFaceSunShare = 0.5;

        public static double GroundLight(Lighting l) =>
            l.AmbientIntensity * Lights.Luminance(l.AmbientColor) + l.SunIntensity * Lights.Luminance(l.SunColor) * Math.Max(0, -l.SunDirection.Y);

        public static double SideFaceLight(Lighting l)
        {
            double up = l.AmbientIntensity * Lights.Luminance(l.AmbientColor);
            double down = l.AmbientIntensity * Lights.Luminance(l.AmbientGroundColor);
            double side = l.SunIntensity * Lights.Luminance(l.SunColor) * MathUtil.Hypot(l.SunDirection.X, l.SunDirection.Z) * SideFaceSunShare;
            return (up + down) / 2 + side;
        }

        public static double SkyLuminance(Lighting l) => (Lights.Luminance(l.SkyZenith) + Lights.Luminance(l.SkyHorizon)) / 2;

        /// <summary>Strength of the sky reflection (IBL) on PBR materials, following the real scene light (0 to 1).</summary>
        public static double IblIntensityFor(Lighting l)
        {
            double light = GroundLight(l), sky = SkyLuminance(l), side = SideFaceLight(l);
            if (!MathUtil.IsFinite(light) || !MathUtil.IsFinite(sky) || !MathUtil.IsFinite(side)) return IblMax;
            if (light <= 0) return 0;
            if (sky <= 0) return IblMax;
            double followsLight = light / (ClearNoonLightPerSky * sky);
            double roomLeft = Math.Max(0, SideFaceMaxRatio * light - side);
            double fillsOnly = roomLeft / (Default.EnvironmentIntensity * sky);
            return Math.Min(IblMax, Math.Min(followsLight, fillsOnly));
        }
    }
}
