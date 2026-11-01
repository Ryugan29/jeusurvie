// Port of src/adapters/render-data/foliage.ts — living vegetation (gradient, per-instance tint, wind). The foliage shader copies
// these formulas exactly (Shaders/Foliage.hlsl).
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.RenderData
{
    public enum FoliageKind { Grass, Plant, Flower, Tree, Pine, Bush }

    public readonly struct FoliageProfile
    {
        public readonly FoliageKind Kind;
        public readonly double HeightRefM, WindM, Gradient;
        public FoliageProfile(FoliageKind kind, double heightRefM, double windM, double gradient) { Kind = kind; HeightRefM = heightRefM; WindM = windM; Gradient = gradient; }
    }

    public readonly struct InstanceTint
    {
        public readonly Rgb Target;
        public readonly double Amount, Brightness;
        public InstanceTint(Rgb target, double amount, double brightness) { Target = target; Amount = amount; Brightness = brightness; }
    }

    public static class Foliage
    {
        private static readonly Dictionary<string, FoliageProfile> Profiles = new Dictionary<string, FoliageProfile>
        {
            { "Grass", new FoliageProfile(FoliageKind.Grass, 1.6, 0.28, 1) },
            { "Leaves", new FoliageProfile(FoliageKind.Plant, 1, 0.16, 0.8) },
            { "Flowers", new FoliageProfile(FoliageKind.Flower, 2, 0.2, 0) },
            { "Leaves_NormalTree", new FoliageProfile(FoliageKind.Tree, 8, 0.06, 0) },
            { "Leaves_Pine", new FoliageProfile(FoliageKind.Pine, 8, 0.035, 0) },
            { "Leaves_TwistedTree", new FoliageProfile(FoliageKind.Bush, 1.4, 0.05, 0) },
        };

        public static FoliageProfile? ProfileFor(string materialName) => Profiles.TryGetValue(materialName, out var p) ? p : (FoliageProfile?)null;

        /// <summary>Realistic albedo (saturation, value) per kind.</summary>
        public static (double saturation, double value) Albedo(FoliageKind k)
        {
            switch (k)
            {
                case FoliageKind.Grass: return (0.74, 0.48);
                case FoliageKind.Plant: return (0.78, 0.72);
                case FoliageKind.Flower: return (0.82, 0.72);
                case FoliageKind.Tree: return (0.78, 1);
                case FoliageKind.Pine: return (0.8, 1.25);
                default: return (0.78, 0.95);
            }
        }

        /// <summary>Back-light translucency per kind.</summary>
        public static double Translucency(FoliageKind k) =>
            k == FoliageKind.Grass || k == FoliageKind.Plant ? 0.45 : k == FoliageKind.Flower ? 0.35 : k == FoliageKind.Tree ? 0.5 : k == FoliageKind.Pine ? 0.25 : 0.4;

        /// <summary>Shader mode: 0 wind only (flowers), 1 grass (dry tufts), 2 broadleaf (autumn), 3 small plants and evergreens.</summary>
        public static int Mode(FoliageKind k) =>
            k == FoliageKind.Flower ? 0 : k == FoliageKind.Grass ? 1 : k == FoliageKind.Tree ? 2 : 3;

        /// <summary>Share of the normal pulled upward per kind.</summary>
        public static double UpNormal(FoliageKind k) =>
            k == FoliageKind.Grass ? 0.85 : k == FoliageKind.Plant ? 0.55 : k == FoliageKind.Flower ? 0.5 : k == FoliageKind.Bush ? 0.3 : 0;

        public const double HdrHeadroom = 2;
        public static readonly Rgb ShadeFoot = new Rgb(0.55, 0.62, 0.58);
        public static readonly Rgb ShadeTip = new Rgb(1.12, 1.06, 0.8);
        public const double ShadeTop = 0.75;

        public static Rgb HeightShade(double h) => Rgb.Mix(ShadeFoot, ShadeTip, MathUtil.Smoothstep(0, ShadeTop, h));

        private static double Fract(double v) => v - Math.Floor(v);

        /// <summary>Reproducible hash in [0, 1) of (x, z) (Dave Hoskins hash12).</summary>
        public static double Hash01(double x, double z)
        {
            double px = Fract(x * 0.1031), py = Fract(z * 0.1031), pz = Fract(x * 0.1031);
            double d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
            px += d; py += d; pz += d;
            return Fract((px + py) * pz);
        }

        public static double ValueNoise(double x, double z)
        {
            double ix = Math.Floor(x), iz = Math.Floor(z);
            double fx = x - ix, fz = z - iz;
            double ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
            double a = Hash01(ix, iz), b = Hash01(ix + 1, iz), c = Hash01(ix, iz + 1), d = Hash01(ix + 1, iz + 1);
            return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
        }

        public static readonly Rgb DryGold = new Rgb(0.86, 0.66, 0.2);
        public const double DryPatchM = 9, DryFrom = 0.72, DryFull = 0.82, DryStray = 0.03;

        public static InstanceTint TuftTint(double x, double z)
        {
            double patch = ValueNoise(x / DryPatchM, z / DryPatchM) + 0.12 * (Hash01(x + 31.7, z - 11.3) - 0.5);
            double stray = Hash01(x - 7.1, z + 23.9) < DryStray ? 0.8 : 0;
            return new InstanceTint(DryGold, Math.Max(MathUtil.Smoothstep(DryFrom, DryFull, patch), stray), 0.88 + 0.24 * Hash01(x + 5.3, z + 17.9));
        }

        public static readonly Rgb AutumnYellow = new Rgb(0.95, 0.74, 0.16);
        public static readonly Rgb AutumnOrange = new Rgb(0.96, 0.48, 0.1);
        public static readonly Rgb AutumnRed = new Rgb(0.86, 0.2, 0.08);
        public static readonly Rgb SpringGreen = new Rgb(0.6, 0.78, 0.18);
        public const double AutumnGroupM = 90, AutumnFrom = 0.67, AutumnFull = 0.71;

        public static InstanceTint TreeTint(double x, double z)
        {
            double autumn = MathUtil.Smoothstep(AutumnFrom, AutumnFull, ValueNoise(x / AutumnGroupM + 0.37, z / AutumnGroupM - 0.61));
            double hue = Hash01(x + 13.1, z - 3.7);
            Rgb fall = hue < 0.5 ? Rgb.Mix(AutumnYellow, AutumnOrange, hue * 2) : Rgb.Mix(AutumnOrange, AutumnRed, hue * 2 - 1);
            double spring = 0.3 * Hash01(x - 41.3, z + 9.7);
            return new InstanceTint(Rgb.Mix(SpringGreen, fall, MathUtil.Smoothstep(0.3, 0.5, autumn)), Math.Max(spring, autumn), 0.86 + 0.28 * Hash01(x + 2.9, z + 61.1));
        }

        public static InstanceTint EvergreenTint(double x, double z) => new InstanceTint(SpringGreen, 0, 0.88 + 0.24 * Hash01(x + 2.9, z + 61.1));

        public static Rgb Retint(Rgb baseC, InstanceTint tint)
        {
            double k = Lights.Luminance(baseC) / Lights.Luminance(tint.Target);
            Rgb c = Rgb.Mix(baseC, tint.Target.Scale(k), tint.Amount);
            return c.Scale(tint.Brightness);
        }

        public const double WindDirX = 0.8, WindDirZ = 0.6, WindSpeedMs = 4, GustSpacingM = 24, GustFloor = 0.25, FlutterShare = 0.15, FlutterRadS = 2.6;

        public static double WindGust(double x, double z, double timeS)
        {
            double a = ((x * WindDirX + z * WindDirZ - WindSpeedMs * timeS) * 2 * Math.PI) / GustSpacingM;
            double wave = 0.5 + 0.5 * Math.Sin(a);
            return wave * (0.6 + 0.4 * Math.Sin(a * 0.37 + 1.3));
        }

        public static Vec2XZ WindOffset(double x, double z, double h, double timeS, double amplitudeM, double local)
        {
            double hc = Math.Min(1, Math.Max(0, h));
            double bend = amplitudeM * hc * hc;
            double sway = bend * (GustFloor + (1 - GustFloor) * WindGust(x, z, timeS));
            double flutter = bend * FlutterShare * Math.Sin(timeS * FlutterRadS + local + x * 1.3 + z * 1.7);
            return new Vec2XZ(WindDirX * sway - WindDirZ * flutter, WindDirZ * sway + WindDirX * flutter);
        }

        /// <summary>Foliage material test (render-data/surfaces FOLIAGE_MATERIAL).</summary>
        public static bool IsFoliageMaterial(string name)
        {
            string n = (name ?? "").ToLowerInvariant();
            foreach (string w in new[] { "leaf", "leaves", "grass", "flower", "bush", "clover", "fern", "plant", "petal" })
                if (n.Contains(w)) return true;
            return false;
        }

        /// <summary>Small ground plants (Grass, Leaves): no baked vertex-colour shading (asset-library usesBakedShading).</summary>
        public static bool UsesBakedShading(string materialName)
        {
            string n = (materialName ?? "").ToLowerInvariant();
            return !(n == "grass" || n == "leaves");
        }
    }
}
