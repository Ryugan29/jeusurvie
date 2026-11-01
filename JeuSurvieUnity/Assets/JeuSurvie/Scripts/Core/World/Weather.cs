// Port of src/core/world/weather.ts — world weather, a PURE function of the seed and game time (no state to save).
using System;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.World
{
    public enum WeatherKind { Clair, Nuageux, Bruine, Pluie, Orage, Brouillard }

    /// <summary>Weather quantities, all in [0, 1] (Weather / WeatherPreset).</summary>
    public readonly struct WeatherState
    {
        public readonly double CloudCover, Rain, Storm, Fog, Wind, Wetness;
        public WeatherState(double cloudCover, double rain, double storm, double fog, double wind, double wetness)
        {
            CloudCover = cloudCover; Rain = rain; Storm = storm; Fog = fog; Wind = wind; Wetness = wetness;
        }
    }

    public static class Weather
    {
        public static readonly WeatherKind[] Kinds = { WeatherKind.Clair, WeatherKind.Nuageux, WeatherKind.Bruine, WeatherKind.Pluie, WeatherKind.Orage, WeatherKind.Brouillard };
        /// <summary>French ids, as displayed and accepted on the command line (?meteo=).</summary>
        public static readonly string[] KindIds = { "clair", "nuageux", "bruine", "pluie", "orage", "brouillard" };

        /// <summary>Presets (wetness unused: 0).</summary>
        public static WeatherState Preset(WeatherKind k)
        {
            switch (k)
            {
                case WeatherKind.Clair: return new WeatherState(0.15, 0, 0, 0, 0.3, 0);
                case WeatherKind.Nuageux: return new WeatherState(0.65, 0, 0, 0, 0.5, 0);
                case WeatherKind.Bruine: return new WeatherState(0.8, 0.3, 0, 0.25, 0.45, 0);
                case WeatherKind.Pluie: return new WeatherState(0.92, 0.75, 0, 0.15, 0.7, 0);
                case WeatherKind.Orage: return new WeatherState(1, 1, 1, 0.1, 1, 0);
                default: return new WeatherState(0.5, 0, 0, 1, 0.1, 0);
            }
        }

        private static readonly double[] Weights = { 30, 25, 12, 14, 7, 12 };
        private const double WeightTotal = 100;
        public const double SegmentS = 300;
        public const double TransitionS = 90;
        private const double DryingStepS = 30;
        private const int DryingSteps = 8;
        public const double DryingS = DryingStepS * DryingSteps;
        private const int WeatherSalt = 0x77e4;

        private static bool StormAfter(WeatherKind k) => k == WeatherKind.Nuageux || k == WeatherKind.Bruine || k == WeatherKind.Pluie || k == WeatherKind.Orage;

        private static WeatherKind DrawnKind(uint seed, int index)
        {
            if (index <= 0) return WeatherKind.Clair;
            double pick = (Hash.Hash2(seed, index, 0, WeatherSalt) / 4294967296.0) * WeightTotal;
            for (int i = 0; i < Kinds.Length; i++)
            {
                pick -= Weights[i];
                if (pick < 0) return Kinds[i];
            }
            return WeatherKind.Clair;
        }

        private static WeatherKind KindOfSegment(uint seed, int index)
        {
            WeatherKind kind = DrawnKind(seed, index);
            return kind == WeatherKind.Orage && !StormAfter(DrawnKind(seed, index - 1)) ? WeatherKind.Pluie : kind;
        }

        private static double ValidTime(double timeS) => MathUtil.IsFinite(timeS) && timeS > 0 ? timeS : 0;
        private static int SegmentOf(double timeS) => (int)Math.Floor(ValidTime(timeS) / SegmentS);

        public static WeatherKind KindAt(uint seed, double timeS) => KindOfSegment(seed, SegmentOf(timeS));

        public static string IdOf(WeatherKind k) => KindIds[(int)k];

        public static bool TryParse(string id, out WeatherKind kind)
        {
            for (int i = 0; i < KindIds.Length; i++)
                if (KindIds[i] == id) { kind = Kinds[i]; return true; }
            kind = WeatherKind.Clair;
            return false;
        }

        private static WeatherState PresetAt(uint seed, double timeS)
        {
            double t = ValidTime(timeS);
            int index = SegmentOf(t);
            WeatherState a = Preset(KindOfSegment(seed, index));
            double blend = MathUtil.Smoothstep(SegmentS - TransitionS, SegmentS, t - index * SegmentS);
            if (blend == 0) return a;
            WeatherState b = Preset(KindOfSegment(seed, index + 1));
            double Mix(double x, double y) => x + (y - x) * blend;
            return new WeatherState(Mix(a.CloudCover, b.CloudCover), Mix(a.Rain, b.Rain), Mix(a.Storm, b.Storm), Mix(a.Fog, b.Fog), Mix(a.Wind, b.Wind), 0);
        }

        /// <summary>Weather at game time timeS (s since the start of the game).</summary>
        public static WeatherState At(uint seed, double timeS)
        {
            WeatherState now = PresetAt(seed, timeS);
            double wetness = now.Rain;
            for (int k = 1; k < DryingSteps; k++)
                wetness = Math.Max(wetness, PresetAt(seed, timeS - k * DryingStepS).Rain * (1 - (double)k / DryingSteps));
            return new WeatherState(now.CloudCover, now.Rain, now.Storm, now.Fog, now.Wind, wetness);
        }

        /// <summary>Forced weather (?meteo=, key 6): the preset, ground as wet as it rains.</summary>
        public static WeatherState Forced(WeatherKind k)
        {
            WeatherState p = Preset(k);
            return new WeatherState(p.CloudCover, p.Rain, p.Storm, p.Fog, p.Wind, p.Rain);
        }
    }
}
