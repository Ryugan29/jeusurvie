// Port of src/core/world/params.ts — WORLD GENERATOR parameters, version 1 (ADR 0004). Changing them changes every world.
namespace JeuSurvie.Core.World
{
    public static class TerrainParams
    {
        public const double BaseHeight = 0;

        // Domain warp (salt for x, SaltZ for z).
        public static readonly NoiseLayer Warp = new NoiseLayer(1.0 / 1024, 2, 2, 0.5, 11);
        public const int WarpSaltZ = 16;
        public const double WarpAmplitude = 90;

        // Regions: plains (low r), hills, mountains (high r).
        public static readonly NoiseLayer Regions = new NoiseLayer(1.0 / 4096, 3, 2, 0.5, 12);
        public const double RegionsContrast = 1.6;
        public const double HillsFrom = 0.3, HillsTo = 0.55, MountainsFrom = 0.6, MountainsTo = 0.85;

        public static readonly NoiseLayer Swells = new NoiseLayer(1.0 / 2048, 2, 2, 0.5, 15);
        public const double SwellsAmplitude = 20;

        public static readonly NoiseLayer Hills = new NoiseLayer(1.0 / 256, 5, 2, 0.5, 1);
        public const double PlainsAmplitude = 8, HillsAmplitude = 28;

        public static readonly NoiseLayer Mountains = new NoiseLayer(1.0 / 1400, 5, 2, 0.5, 13);
        public const double MountainsAmplitude = 270;

        public static readonly NoiseLayer Erosion = new NoiseLayer(1.0 / 180, 4, 2, 0.5, 17);
        public const double ErosionAmplitude = 10;

        public static readonly NoiseLayer Valleys = new NoiseLayer(1.0 / 1536, 2, 2, 0.5, 14);
        public const double ValleyWidth = 0.08, ValleyDepth = 12, MountainCut = 0.85, MountainCutWidth = 0.3;

        public const double StartCalmRadius = 450, StartMinRegion = 0.48, StartMaxRegion = 0.5;

        public const double MinHeight = BaseHeight - SwellsAmplitude - HillsAmplitude - ErosionAmplitude - 2 * ValleyDepth;
        public const double MaxHeight = BaseHeight + SwellsAmplitude + HillsAmplitude + MountainsAmplitude + ErosionAmplitude;

        /// <summary>World radius from the origin (m), ADR 0004.</summary>
        public const double WorldRadiusM = 8000;
        /// <summary>Edge band width (m) — future impassable mountains.</summary>
        public const double EdgeBandM = 300;
    }
}
