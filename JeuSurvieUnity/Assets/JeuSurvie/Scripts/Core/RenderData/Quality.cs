// Port of src/adapters/render-data/quality.ts — THE single place deciding what the GPU must do: LOW / MEDIUM / HIGH / ULTRA.
using System;
using System.Collections.Generic;
using System.Linq;

namespace JeuSurvie.Core.RenderData
{
    public enum QualityLevel { Low, Medium, High, Ultra }
    public enum ShadowFilter { PcfLow, PcfMedium, PcfHigh, Pcss }
    public enum CloudQuality { Flat, Layered, Volumetric }
    public enum QualityOverrideKey { Shadows, Ao, Ssr, Rays, Msaa, Aerial, Dof, MotionBlur, Rain }

    public sealed class ShadowQuality { public int Cascades, MapSize; public double RangeM; public ShadowFilter Filter; }
    public sealed class AoQuality { public int Samples; public double Ratio, RadiusM, Strength; public bool ExpensiveBlur; }
    public sealed class SsrQuality { public double Ratio; public int Steps; public double MaxDistanceM; public bool Blur; }
    public sealed class RaysQuality { public int Samples; public double Ratio, OccluderRangeM; }
    public sealed class ImageQuality { public int Msaa; public double MaxPixelRatio; public bool Fxaa; }
    public sealed class SkyQuality { public CloudQuality Clouds; public int EnvProbeSize; public double EnvProbeRefreshS; }
    public sealed class DofQuality { public double FromM, FullM, MaxBlurPx; }
    public sealed class PostQuality { public int BloomKernel; public bool AerialPerspective; public DofQuality Dof; public double MotionBlur, Grain, Sharpen; }
    public sealed class TerrainQuality { public int TextureSize, Anisotropy; public bool NormalMaps; }
    public sealed class FarTerrainQuality { public double HalfSizeM, StepM; }
    public sealed class DistanceQuality { public double ViewRadiusM; public FarTerrainQuality FarTerrain; public double VegetationRange, CoverRadiusM, CoverDensity; }

    public sealed class QualitySettings
    {
        public QualityLevel Level;
        public ImageQuality Image;
        public ShadowQuality Shadows;
        public AoQuality Ao;
        public SsrQuality Ssr;
        public RaysQuality Rays;
        public SkyQuality Sky;
        public PostQuality Post;
        public TerrainQuality Terrain;
        public DistanceQuality Distances;
        public int RainDrops;
    }

    public sealed class QualityDescription
    {
        public readonly string Label, Summary;
        public readonly string[] Details;
        public QualityDescription(string label, string summary, params string[] details) { Label = label; Summary = summary; Details = details; }
    }

    public static class Quality
    {
        public static readonly QualityLevel[] Levels = { QualityLevel.Low, QualityLevel.Medium, QualityLevel.High, QualityLevel.Ultra };
        public const QualityLevel DefaultLevel = QualityLevel.High;

        public static string Id(QualityLevel l) => l == QualityLevel.Low ? "low" : l == QualityLevel.Medium ? "medium" : l == QualityLevel.High ? "high" : "ultra";

        public static QualitySettings For(QualityLevel level)
        {
            switch (level)
            {
                case QualityLevel.Low:
                    return new QualitySettings
                    {
                        Level = level,
                        Image = new ImageQuality { Msaa = 1, MaxPixelRatio = 1, Fxaa = true },
                        Shadows = new ShadowQuality { Cascades = 2, MapSize = 1024, RangeM = 60, Filter = ShadowFilter.PcfLow },
                        Sky = new SkyQuality { Clouds = CloudQuality.Flat, EnvProbeSize = 32, EnvProbeRefreshS = 2 },
                        Post = new PostQuality { BloomKernel = 32, AerialPerspective = false, MotionBlur = 0, Grain = 0, Sharpen = 0 },
                        Terrain = new TerrainQuality { TextureSize = 256, Anisotropy = 2, NormalMaps = false },
                        Distances = new DistanceQuality { ViewRadiusM = 320, FarTerrain = new FarTerrainQuality { HalfSizeM = 2000, StepM = 80 }, VegetationRange = 0.6, CoverRadiusM = 35, CoverDensity = 0.5 },
                        RainDrops = 1500,
                    };
                case QualityLevel.Medium:
                    return new QualitySettings
                    {
                        Level = level,
                        Image = new ImageQuality { Msaa = 2, MaxPixelRatio = 1.25, Fxaa = true },
                        Shadows = new ShadowQuality { Cascades = 3, MapSize = 1024, RangeM = 100, Filter = ShadowFilter.PcfMedium },
                        Ao = new AoQuality { Samples = 8, Ratio = 0.5, RadiusM = 0.8, Strength = 1, ExpensiveBlur = false },
                        Rays = new RaysQuality { Samples = 24, Ratio = 0.33, OccluderRangeM = 150 },
                        Sky = new SkyQuality { Clouds = CloudQuality.Layered, EnvProbeSize = 64, EnvProbeRefreshS = 1 },
                        Post = new PostQuality { BloomKernel = 48, AerialPerspective = true, MotionBlur = 0, Grain = 4, Sharpen = 0.08 },
                        Terrain = new TerrainQuality { TextureSize = 512, Anisotropy = 4, NormalMaps = true },
                        Distances = new DistanceQuality { ViewRadiusM = 448, FarTerrain = new FarTerrainQuality { HalfSizeM = 3000, StepM = 50 }, VegetationRange = 0.8, CoverRadiusM = 55, CoverDensity = 0.75 },
                        RainDrops = 3000,
                    };
                case QualityLevel.High:
                    return new QualitySettings
                    {
                        Level = level,
                        Image = new ImageQuality { Msaa = 4, MaxPixelRatio = 1.5, Fxaa = true },
                        Shadows = new ShadowQuality { Cascades = 4, MapSize = 2048, RangeM = 150, Filter = ShadowFilter.PcfHigh },
                        Ao = new AoQuality { Samples = 12, Ratio = 1, RadiusM = 0.8, Strength = 1, ExpensiveBlur = false },
                        Ssr = new SsrQuality { Ratio = 0.5, Steps = 32, MaxDistanceM = 60, Blur = false },
                        Rays = new RaysQuality { Samples = 32, Ratio = 0.5, OccluderRangeM = 200 },
                        Sky = new SkyQuality { Clouds = CloudQuality.Layered, EnvProbeSize = 128, EnvProbeRefreshS = 0.5 },
                        Post = new PostQuality { BloomKernel = 64, AerialPerspective = true, MotionBlur = 0, Grain = 5, Sharpen = 0.1 },
                        Terrain = new TerrainQuality { TextureSize = 1024, Anisotropy = 8, NormalMaps = true },
                        Distances = new DistanceQuality { ViewRadiusM = 512, FarTerrain = new FarTerrainQuality { HalfSizeM = 4000, StepM = 40 }, VegetationRange = 1, CoverRadiusM = 70, CoverDensity = 1 },
                        RainDrops = 6000,
                    };
                default:
                    return new QualitySettings
                    {
                        Level = QualityLevel.Ultra,
                        Image = new ImageQuality { Msaa = 8, MaxPixelRatio = 2, Fxaa = false },
                        Shadows = new ShadowQuality { Cascades = 4, MapSize = 4096, RangeM = 220, Filter = ShadowFilter.Pcss },
                        Ao = new AoQuality { Samples = 16, Ratio = 1, RadiusM = 1.1, Strength = 1.1, ExpensiveBlur = true },
                        Ssr = new SsrQuality { Ratio = 1, Steps = 64, MaxDistanceM = 120, Blur = true },
                        Rays = new RaysQuality { Samples = 48, Ratio = 0.5, OccluderRangeM = 300 },
                        Sky = new SkyQuality { Clouds = CloudQuality.Volumetric, EnvProbeSize = 256, EnvProbeRefreshS = 0.25 },
                        Post = new PostQuality { BloomKernel = 96, AerialPerspective = true, Dof = new DofQuality { FromM = 90, FullM = 900, MaxBlurPx = 6 }, MotionBlur = 0.35, Grain = 5, Sharpen = 0.12 },
                        Terrain = new TerrainQuality { TextureSize = 2048, Anisotropy = 16, NormalMaps = true },
                        Distances = new DistanceQuality { ViewRadiusM = 640, FarTerrain = new FarTerrainQuality { HalfSizeM = 6000, StepM = 32 }, VegetationRange = 1.35, CoverRadiusM = 90, CoverDensity = 1 },
                        RainDrops = 9000,
                    };
            }
        }

        public static QualityDescription Describe(QualityLevel l)
        {
            switch (l)
            {
                case QualityLevel.Low:
                    return new QualityDescription("LOW", "Performances maximales pour les configurations modestes.",
                        "Ombres simples (2 cascades, 1024 px)", "Brume classique, nuages plats", "Distance de vue 320 m, végétation allégée", "Textures du sol 256 px, sans relief");
                case QualityLevel.Medium:
                    return new QualityDescription("MEDIUM", "Le bon compromis entre qualité et fluidité.",
                        "Ombres 3 cascades, occlusion ambiante", "Perspective atmosphérique et rayons de soleil", "Distance de vue 450 m", "Textures du sol 512 px avec relief");
                case QualityLevel.High:
                    return new QualityDescription("HIGH", "Un rendu très riche : ombres fines, reflets de pluie, végétation dense.",
                        "Ombres 4 cascades 2048 px", "Reflets à l’écran sur le sol mouillé", "Distance de vue 512 m, relief lointain 4 km", "Textures du sol 1024 px");
                default:
                    return new QualityDescription("ULTRA", "Le meilleur rendu possible, pour les cartes graphiques puissantes.",
                        "Ombres 4096 px à pénombre réaliste (PCSS)", "Nuages en volume, occlusion ambiante pleine résolution", "Profondeur de champ, flou de mouvement, MSAA 8×", "Distance de vue 640 m, relief lointain 6 km, textures 2048 px");
            }
        }

        private static readonly Dictionary<string, QualityLevel> LegacyLevels = new Dictionary<string, QualityLevel>
        {
            { "basse", QualityLevel.Low }, { "moyenne", QualityLevel.Medium }, { "haute", QualityLevel.High },
        };

        public static bool TryParseLevel(string text, out QualityLevel level)
        {
            level = DefaultLevel;
            if (text == null) return false;
            foreach (QualityLevel l in Levels) if (Id(l) == text) { level = l; return true; }
            return LegacyLevels.TryGetValue(text, out level);
        }

        public static readonly QualityOverrideKey[] OverrideKeys = (QualityOverrideKey[])Enum.GetValues(typeof(QualityOverrideKey));
        public static string OverrideId(QualityOverrideKey k) => k == QualityOverrideKey.MotionBlur ? "motionBlur" : k.ToString().ToLowerInvariant();

        /// <summary>Profile `level` with its overrides (each one can only switch its effect OFF).</summary>
        public static QualitySettings Resolve(QualityLevel level, IReadOnlyDictionary<QualityOverrideKey, bool> overrides = null)
        {
            QualitySettings q = For(level);
            bool Off(QualityOverrideKey k) => overrides != null && overrides.TryGetValue(k, out bool v) && v == false;
            if (Off(QualityOverrideKey.Msaa)) q.Image.Msaa = 1;
            if (Off(QualityOverrideKey.Shadows)) q.Shadows = null;
            if (Off(QualityOverrideKey.Ao)) q.Ao = null;
            if (Off(QualityOverrideKey.Ssr)) q.Ssr = null;
            if (Off(QualityOverrideKey.Rays)) q.Rays = null;
            if (Off(QualityOverrideKey.Aerial)) q.Post.AerialPerspective = false;
            if (Off(QualityOverrideKey.Dof)) q.Post.Dof = null;
            if (Off(QualityOverrideKey.MotionBlur)) q.Post.MotionBlur = 0;
            if (Off(QualityOverrideKey.Rain)) q.RainDrops = 0;
            return q;
        }

        /// <summary>URL-style switches (ombres=0 …) → overrides. Only « 0 » switches off.</summary>
        public static readonly IReadOnlyDictionary<string, QualityOverrideKey> UrlSwitches = new Dictionary<string, QualityOverrideKey>
        {
            { "ombres", QualityOverrideKey.Shadows }, { "ao", QualityOverrideKey.Ao }, { "ssr", QualityOverrideKey.Ssr }, { "rayons", QualityOverrideKey.Rays },
            { "aa", QualityOverrideKey.Msaa }, { "brume", QualityOverrideKey.Aerial }, { "dof", QualityOverrideKey.Dof }, { "flou", QualityOverrideKey.MotionBlur }, { "pluie", QualityOverrideKey.Rain },
        };

        public static Dictionary<QualityOverrideKey, bool> OverridesFrom(Func<string, string> get)
        {
            var output = new Dictionary<QualityOverrideKey, bool>();
            foreach (var kv in UrlSwitches) if (get(kv.Key) == "0") output[kv.Value] = false;
            return output;
        }

        public static double PixelRatioFor(double devicePixelRatio, double maxPixelRatio)
        {
            double dpr = !double.IsNaN(devicePixelRatio) && !double.IsInfinity(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
            return Math.Max(1, Math.Min(dpr, maxPixelRatio));
        }

        public static int MsaaSamplesFor(int wanted, int hardwareMax) => Math.Max(1, Math.Min(wanted, Math.Max(1, hardwareMax)));

        public static string DescribeLine(QualitySettings q)
        {
            var parts = new List<string>
            {
                q.Image.Msaa > 1 ? $"MSAA {q.Image.Msaa}×" : "sans MSAA",
                q.Shadows != null ? $"ombres {q.Shadows.Cascades}×{q.Shadows.MapSize}{(q.Shadows.Filter == ShadowFilter.Pcss ? " PCSS" : "")}" : "sans ombres",
                q.Ao != null ? "contact" : "sans contact",
                q.Ssr != null ? "reflets" : "sans reflets",
                q.Rays != null ? "rayons" : "sans rayons",
                q.Post.AerialPerspective ? "atmosphère" : "brume simple",
                $"nuages {(q.Sky.Clouds == CloudQuality.Flat ? "plats" : q.Sky.Clouds == CloudQuality.Layered ? "en couches" : "en volume")}",
                $"sol {q.Terrain.TextureSize} px",
            };
            return $"Qualité {Describe(q.Level).Label} : {string.Join(" · ", parts)}";
        }

        /// <summary>Neighbour profile for the arrows / Home / End keys of the settings radio group (no wrap).</summary>
        public static QualityLevel? Neighbour(QualityLevel current, string key)
        {
            int i = Array.IndexOf(Levels, current);
            switch (key)
            {
                case "ArrowRight": case "ArrowDown": return Levels[Math.Min(Levels.Length - 1, i + 1)];
                case "ArrowLeft": case "ArrowUp": return Levels[Math.Max(0, i - 1)];
                case "Home": return Levels[0];
                case "End": return Levels[Levels.Length - 1];
                default: return null;
            }
        }
    }
}
