// Port of src/adapters/render-data/atmosphere.ts and grade.ts — HDR light of the hour + weather + lightning; colour grading.
using System;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.World;

namespace JeuSurvie.Core.RenderData
{
    public sealed class Atmosphere
    {
        public Lighting Light;
        public double CloudCover, Rain, Fog, Wetness, Wind, Flash, FogDensityFactor, FogBankDensity;
    }

    public readonly struct Grade
    {
        /// <summary>Global exposure (1 = unchanged).</summary>
        public readonly double Exposure;
        /// <summary>Added saturation (−100 to 100).</summary>
        public readonly double Saturation;
        /// <summary>Strength of the global tint (0 to 100).</summary>
        public readonly double Tint;
        /// <summary>Tint hue (degrees: 30 = low-sun orange, 220 = moonlight blue).</summary>
        public readonly double Hue;
        public Grade(double exposure, double saturation, double tint, double hue) { Exposure = exposure; Saturation = saturation; Tint = tint; Hue = hue; }
    }

    public static class Atmospheres
    {
        public const double SunHdrGain = 1.8, AmbientHdrGain = 0.85;
        private const double OvercastFrom = 0.3, OvercastFull = 1, SunVeil = 0.75;
        private static readonly Rgb OvercastGrey = new Rgb(0.42, 0.45, 0.5);
        private const double OvercastSkyShare = 0.85, OvercastHorizonShare = 0.75;
        private const double StormSkyDarken = 0.5, StormAmbientDarken = 0.4, StormCloudDarken = 0.55;
        private const double RainCloudDarken = 0.35;
        private static readonly Rgb Slate = new Rgb(0.86, 0.92, 1.04);
        private const double OvercastAmbientLift = 0.3;
        private static readonly Rgb FlashSky = new Rgb(0.5, 0.55, 0.7);
        private const double FlashAmbient = 2.5, RainFog = 2.5;
        private const double FogBankDistanceM = 60, FogBankVisibility = 0.12;
        private static readonly double FogBankDensity = Fog.DensityFor(FogBankDistanceM, FogBankVisibility);
        public const double FogLightCeiling = 0.75;
        private const double RainDesaturation = 35, FogDesaturation = 18, FlashExposure = 0.4;

        private static double FogBankWeight(double fog) => fog * fog;
        private static Rgb Tint(Rgb c, Rgb t, double k) => new Rgb(c.R * MathUtil.Mix(1, t.R, k), c.G * MathUtil.Mix(1, t.G, k), c.B * MathUtil.Mix(1, t.B, k));
        private static Rgb Add(Rgb c, Rgb d, double k) => new Rgb(c.R + d.R * k, c.G + d.G * k, c.B + d.B * k);
        private static Rgb Grey(Rgb c) { double l = Lights.Luminance(c); return new Rgb(l, l, l); }

        public static Atmosphere For(Lighting l, WeatherState w, double flash)
        {
            double overcast = MathUtil.Smoothstep(OvercastFrom, OvercastFull, w.CloudCover);
            double dark = w.Storm;
            double veil = 1 - SunVeil * overcast;
            Rgb overcastSky = OvercastGrey.Scale((Lights.Luminance(l.SkyHorizon) * (1 - StormSkyDarken * dark)) / Lights.Luminance(OvercastGrey));
            Lighting light = l.Clone();
            light.SkyZenith = Add(Rgb.Mix(l.SkyZenith, overcastSky.Scale(0.85), overcast * OvercastSkyShare), FlashSky, flash);
            light.SkyHorizon = Add(Rgb.Mix(l.SkyHorizon, overcastSky, overcast * OvercastHorizonShare), FlashSky, flash);
            light.FogColor = Add(Rgb.Mix(l.FogColor, overcastSky, Math.Max(w.Fog, overcast * 0.85)), FlashSky, flash * 0.6);
            light.SunColor = Rgb.Mix(l.SunColor, Grey(l.SunColor), overcast * 0.5);
            light.SunIntensity = l.SunIntensity * SunHdrGain * veil;
            light.ShadowIntensity = l.ShadowIntensity * veil;
            light.AmbientColor = Rgb.Mix(l.AmbientColor, Grey(l.AmbientColor), overcast * 0.6);
            light.AmbientIntensity = l.AmbientIntensity * AmbientHdrGain * (1 + OvercastAmbientLift * overcast) * (1 - StormAmbientDarken * dark) + FlashAmbient * flash;
            light.CloudLight = Add(Rgb.Mix(l.CloudLight, overcastSky.Scale(1.15), overcast * 0.5).Scale(1 - StormCloudDarken * dark), FlashSky, flash);
            light.CloudShade = Tint(Rgb.Mix(l.CloudShade, overcastSky.Scale(0.6), overcast * 0.5), Slate, w.Rain)
                .Scale((1 - 0.3 * overcast - 0.25 * dark) * (1 - RainCloudDarken * w.Rain));
            light.StarVisibility = l.StarVisibility * (1 - overcast);
            light.SunGlow = l.SunGlow * (1 - 0.9 * overcast);
            light.RayStrength = l.RayStrength * (1 - MathUtil.Smoothstep(0.2, 0.7, overcast));
            light.FogColor = LimitFogLight(light, w.Fog);
            return new Atmosphere
            {
                Light = light,
                CloudCover = w.CloudCover,
                Rain = w.Rain,
                Fog = w.Fog,
                Wetness = w.Wetness,
                Wind = w.Wind,
                Flash = flash,
                FogDensityFactor = 1 + RainFog * w.Rain,
                FogBankDensity = FogBankDensity * FogBankWeight(w.Fog),
            };
        }

        private static Rgb LimitFogLight(Lighting l, double fog)
        {
            double hazeMax = FogLightCeiling * SceneBrightness(l);
            double fogMax = Math.Max(0, (hazeMax - Fog.HazeLighten) / (1 - Fog.HazeLighten));
            double lum = Lights.Luminance(l.FogColor);
            if (lum <= fogMax) return l.FogColor;
            return Rgb.Mix(l.FogColor, l.FogColor.Scale(fogMax / lum), FogBankWeight(fog));
        }

        public static double DistanceFogDensity(Atmosphere a, double hourDensity) => hourDensity * a.FogDensityFactor + a.FogBankDensity;

        public static double SceneBrightness(Lighting l)
        {
            double lit = l.AmbientIntensity * Lights.Luminance(l.AmbientColor) + l.SunIntensity * Lights.Luminance(l.SunColor) * Math.Max(0, -l.SunDirection.Y);
            return Math.Min(1, Math.Max(0, lit));
        }

        public static Grade WeatherGrade(Grade g, Atmosphere a) =>
            new Grade(g.Exposure * (1 + FlashExposure * a.Flash), g.Saturation - RainDesaturation * a.Rain - FogDesaturation * a.Fog, g.Tint, g.Hue);

        private const double LightningSlotS = 3, LightningChance = 0.45, LightningLengthS = 0.7;
        private const int LightningSalt = 0x1a7e;

        private static double LightningEnvelope(double dt)
        {
            if (dt < 0.07) return 1;
            if (dt < 0.13) return 0.25;
            if (dt < 0.2) return 0.85;
            return 0.85 * Math.Exp(-(dt - 0.2) * 7);
        }

        public static double LightningFlash(uint seed, double timeS, double storm)
        {
            if (!(storm > 0) || !(timeS >= 0)) return 0;
            int slot = (int)Math.Floor(timeS / LightningSlotS);
            if (Hash.Unit(seed, slot, 1, LightningSalt) >= LightningChance * Math.Min(1, storm)) return 0;
            double offset = Hash.Unit(seed, slot, 2, LightningSalt) * (LightningSlotS - LightningLengthS);
            double dt = timeS - slot * LightningSlotS - offset;
            if (dt < 0 || dt >= LightningLengthS) return 0;
            return LightningEnvelope(dt) * (0.6 + 0.4 * Hash.Unit(seed, slot, 3, LightningSalt));
        }

        // --- grade.ts
        public const double DayExposure = 1.6, DaySaturation = 10;
        private const double NightExposureDrop = 0.4, NightDesaturation = 50;
        private const double WarmthMax = 14, WarmFrom = 0.3, WarmFull = 0.75, WarmHue = 30, WarmSunFull = 0.5, WarmSaturation = 10;
        private const double MoonTintMax = 14, MoonFrom = 0.3, MoonHue = 220;

        public static Grade GradeFor(Lighting l)
        {
            double night = l.StarVisibility;
            double warm = WarmthMax * MathUtil.Smoothstep(WarmFrom, WarmFull, l.SunColor.R - l.SunColor.B) * MathUtil.Smoothstep(0, WarmSunFull, l.ShadowIntensity);
            double moon = MoonTintMax * MathUtil.Smoothstep(MoonFrom, 1, l.StarVisibility);
            double tint = warm >= moon ? warm : moon, hue = warm >= moon ? WarmHue : MoonHue;
            double warmth = hue == WarmHue ? tint / WarmthMax : 0;
            return new Grade(DayExposure - NightExposureDrop * night, DaySaturation - NightDesaturation * night + WarmSaturation * warmth, tint, hue);
        }
    }
}
