// Port of src/adapters/render-data/lighting.ts — keyframed light of the day cycle (realistic light, ADR 0012). PURE.
using System;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.Survival;

namespace JeuSurvie.Core.RenderData
{
    public sealed class Lighting
    {
        public Rgb SkyZenith, SkyHorizon, FogColor, SunColor;
        public double SunIntensity, ShadowIntensity;
        /// <summary>Light direction (from the body toward the ground), unit, always downward.</summary>
        public Vec3 SunDirection;
        public Rgb AmbientColor, AmbientGroundColor;
        public double AmbientIntensity;
        public Rgb CloudLight, CloudShade;
        public double StarVisibility, SunGlow, RayStrength;

        public Lighting Clone() => (Lighting)MemberwiseClone();
    }

    public static class Lights
    {
        public const double NightMinLuminance = 0.2;
        public static double Luminance(Rgb c) => 0.2126 * c.R + 0.7152 * c.G + 0.0722 * c.B;

        private const double CycleS = Balance.DayLengthS + Balance.NightLengthS;
        private const double DuskAt = (Balance.DayLengthS - Balance.DuskLengthS) / CycleS;
        private const double NightAt = Balance.DayLengthS / CycleS;

        private sealed class Key
        {
            public double At;
            public Rgb Zenith, Horizon, Fog, Sun, Ambient, Cloud, CloudShade;
            public double SunI, AmbientI, Stars, Glow, Rays;
            public Key With(double at) { var k = (Key)MemberwiseClone(); k.At = at; return k; }
        }

        private static Rgb C(double r, double g, double b) => new Rgb(r, g, b);

        private static Key K(double at, Rgb zenith, Rgb horizon, Rgb fog, Rgb sun, double sunI, Rgb ambient, double ambientI, Rgb cloud, Rgb cloudShade, double stars, double glow, double rays) =>
            new Key { At = at, Zenith = zenith, Horizon = horizon, Fog = fog, Sun = sun, SunI = sunI, Ambient = ambient, AmbientI = ambientI, Cloud = cloud, CloudShade = cloudShade, Stars = stars, Glow = glow, Rays = rays };

        private static readonly Key Dawn = K(0, C(0.26, 0.36, 0.62), C(0.92, 0.72, 0.56), C(0.86, 0.72, 0.6), C(1, 0.7, 0.45), 0, C(0.62, 0.62, 0.8), 0.55, C(1, 0.78, 0.64), C(0.52, 0.5, 0.62), 0, 0, 0);

        private static readonly Key[] Keys =
        {
            Dawn.With(0),
            K(0.08, C(0.24, 0.4, 0.76), C(0.84, 0.78, 0.7), C(0.86, 0.79, 0.68), C(1, 0.82, 0.6), 1, C(0.56, 0.65, 0.9), 0.68, C(1, 0.9, 0.8), C(0.6, 0.6, 0.72), 0, 0.85, 0.7),
            K(0.3, C(0.2, 0.36, 0.78), C(0.62, 0.74, 0.9), C(0.66, 0.75, 0.87), C(1, 0.95, 0.87), 0.85, C(0.57, 0.68, 0.95), 0.42, C(1, 1, 1), C(0.58, 0.63, 0.72), 0, 0.6, 0.3),
            K(DuskAt - 0.05, C(0.22, 0.37, 0.74), C(0.88, 0.8, 0.66), C(0.84, 0.77, 0.64), C(1, 0.86, 0.64), 0.8, C(0.6, 0.68, 0.92), 0.52, C(1, 0.94, 0.84), C(0.62, 0.64, 0.74), 0, 0.8, 0.5),
            K(DuskAt + 0.06, C(0.17, 0.22, 0.48), C(1, 0.57, 0.27), C(0.94, 0.63, 0.4), C(1, 0.63, 0.32), 0.55, C(0.46, 0.53, 0.8), 0.6, C(1, 0.68, 0.43), C(0.46, 0.38, 0.5), 0, 1, 0.8),
            K(NightAt, C(0.08, 0.1, 0.24), C(0.3, 0.26, 0.38), C(0.25, 0.25, 0.36), C(1, 0.6, 0.3), 0, C(0.42, 0.48, 0.72), 0.45, C(0.42, 0.42, 0.58), C(0.16, 0.17, 0.3), 0.25, 0, 0),
            K(0.85, C(0.018, 0.028, 0.08), C(0.07, 0.09, 0.17), C(0.07, 0.09, 0.16), C(0.66, 0.74, 0.96), 0.35, C(0.38, 0.46, 0.74), 0.45, C(0.22, 0.25, 0.4), C(0.07, 0.08, 0.16), 1, 0.45, 0),
            K(0.97, C(0.1, 0.12, 0.26), C(0.38, 0.32, 0.43), C(0.31, 0.29, 0.39), C(0.66, 0.74, 0.96), 0.05, C(0.5, 0.5, 0.7), 0.48, C(0.44, 0.4, 0.55), C(0.19, 0.19, 0.31), 0.4, 0.1, 0),
            Dawn.With(1),
        };

        private static readonly Rgb GrassBounce = new Rgb(0.62, 0.66, 0.3);
        public static double[] KeyTimes() { var t = new double[Keys.Length]; for (int i = 0; i < t.Length; i++) t[i] = Keys[i].At; return t; }

        private const double SunMaxElevation = 52 * Math.PI / 180;
        private const double MoonMaxElevation = 35 * Math.PI / 180;
        private const double MinElevation = 0.08;
        private const double SunMinElevation = 27 * Math.PI / 180;

        private static Vec3 Normalize(double x, double y, double z)
        {
            double len = MathUtil.Hypot(x, y, z);
            return new Vec3(x / len, y / len, z / len);
        }

        private static Vec3 LightDirection(DayPhase phase, double fraction, out double groundFactor)
        {
            bool night = phase == DayPhase.Nuit;
            double progress = Math.Min(1, Math.Max(0, night ? (fraction - NightAt) / (1 - NightAt) : fraction / NightAt));
            double azimuth = Math.PI * progress;
            double natural = Math.Max(MinElevation, (night ? MoonMaxElevation : SunMaxElevation) * Math.Sin(azimuth));
            double elevation = night ? natural : SunMinElevation + (SunMaxElevation - SunMinElevation) * Math.Sin(azimuth);
            double ground = Math.Cos(elevation);
            groundFactor = Math.Sin(natural) / Math.Sin(elevation);
            return Normalize(-ground * Math.Cos(azimuth), -Math.Sin(elevation), ground * Math.Sin(azimuth));
        }

        public static Lighting For(TimeOfDay time)
        {
            double f = time.DayFraction - Math.Floor(time.DayFraction);
            int i = 0;
            while (i < Keys.Length - 2 && f >= Keys[i + 1].At) i++;
            Key a = Keys[i], b = Keys[i + 1];
            double t = (f - a.At) / (b.At - a.At);
            Rgb ambient = Rgb.Mix(a.Ambient, b.Ambient, t);
            Rgb sunColor = Rgb.Mix(a.Sun, b.Sun, t);
            Rgb bounce = Rgb.Mix(ambient, sunColor, 0.5);
            Vec3 dir = LightDirection(time.Phase, f, out double groundFactor);
            return new Lighting
            {
                SkyZenith = Rgb.Mix(a.Zenith, b.Zenith, t),
                SkyHorizon = Rgb.Mix(a.Horizon, b.Horizon, t),
                FogColor = Rgb.Mix(a.Fog, b.Fog, t),
                SunColor = sunColor,
                SunIntensity = MathUtil.Mix(a.SunI, b.SunI, t) * groundFactor,
                ShadowIntensity = MathUtil.Mix(a.SunI, b.SunI, t),
                SunDirection = dir,
                AmbientColor = ambient,
                AmbientGroundColor = new Rgb(bounce.R * GrassBounce.R, bounce.G * GrassBounce.G, bounce.B * GrassBounce.B),
                AmbientIntensity = MathUtil.Mix(a.AmbientI, b.AmbientI, t),
                CloudLight = Rgb.Mix(a.Cloud, b.Cloud, t),
                CloudShade = Rgb.Mix(a.CloudShade, b.CloudShade, t),
                StarVisibility = MathUtil.Mix(a.Stars, b.Stars, t),
                SunGlow = MathUtil.Mix(a.Glow, b.Glow, t),
                RayStrength = MathUtil.Mix(a.Rays, b.Rays, t),
            };
        }

        public static double SkyWeight(double heightFraction) => Math.Sqrt(Math.Min(1, Math.Max(0, heightFraction)));

        public static Rgb SkyColorAt(Lighting l, double heightFraction)
        {
            double t = SkyWeight(heightFraction);
            Rgb h = l.SkyHorizon, z = l.SkyZenith;
            return new Rgb(h.R * (1 - t) + z.R * t, h.G * (1 - t) + z.G * t, h.B * (1 - t) + z.B * t);
        }

        private const double ShadowMax = 0.88, ShadowFullAt = 1;

        /// <summary>Strength of the cast shadow (0 invisible, 1 black), proportional to the body intensity (k^1.5).</summary>
        public static double ShadowStrength(Lighting l)
        {
            double k = Math.Min(1, Math.Max(0, l.ShadowIntensity / ShadowFullAt));
            return ShadowMax * k * Math.Sqrt(k);
        }
    }
}
