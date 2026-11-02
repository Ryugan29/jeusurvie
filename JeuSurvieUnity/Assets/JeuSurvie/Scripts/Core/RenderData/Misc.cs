// Ports of render-data/cosmos.ts, night-magic.ts, lens-drops.ts, sun-rays.ts, character-motion.ts, character-pose.ts and
// babylon/fps-meter.ts (pure parts).
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.Survival;

namespace JeuSurvie.Core.RenderData
{
    public readonly struct Cosmos
    {
        public readonly double Rotation, Aurora;
        public Cosmos(double rotation, double aurora) { Rotation = rotation; Aurora = aurora; }
        public const double AuroraMin = 0.55;
        private const int AuroraSalt = 0xa0a0;

        public static Cosmos For(TimeOfDay time)
        {
            double fraction = time.DayFraction - Math.Floor(time.DayFraction);
            double h = Hash.Unit(0, time.Day, 0, AuroraSalt);
            return new Cosmos(2 * Math.PI * fraction, AuroraMin + (1 - AuroraMin) * h);
        }
    }

    public static class NightMagic
    {
        private const double NightFrom = 0.2, NightFull = 0.7;
        public static readonly Rgb FireflyColor = new Rgb(1, 0.92, 0.45);
        public const int FireflyMax = 220;
        public const double FireflyRadiusM = 28, FireflyMinY = 0.25, FireflyMaxY = 2.6;
        public static readonly Rgb MushroomGlowColor = new Rgb(0.35, 0.85, 1);
        private const double MushroomGlowMax = 0.9;

        public static double Strength(Lighting l) => MathUtil.Smoothstep(NightFrom, NightFull, l.StarVisibility);
        public static int FireflyCount(Lighting l) => (int)MathUtil.JsRound(FireflyMax * Strength(l));
        public static Rgb MushroomGlow(Lighting l) => MushroomGlowColor.Scale(MushroomGlowMax * Strength(l));
    }

    public static class LensDrops
    {
        public const double WetUpS = 1.2, DryS = 5, LookDownShare = 0.4, PitchDown = 0.7, PitchUp = -0.35;

        public static double RainTarget(double rain, double pitch)
        {
            double r = MathUtil.Clamp01(rain);
            if (r == 0) return 0;
            double p = MathUtil.IsFinite(pitch) ? pitch : 0;
            double look = LookDownShare + (1 - LookDownShare) * MathUtil.Smoothstep(PitchDown, PitchUp, p);
            return MathUtil.Clamp01(r * look);
        }

        public static double Step(double current, double target, double dtS)
        {
            if (!(dtS > 0)) return current;
            double time = target > current ? WetUpS : DryS;
            return target + (current - target) * Math.Exp(-dtS / time);
        }
    }

    public readonly struct CameraBasis
    {
        public readonly Vec3 Forward, Right, Up;
        public readonly double TanHalfFovY, Aspect;
        public CameraBasis(Vec3 forward, Vec3 right, Vec3 up, double tanHalfFovY, double aspect) { Forward = forward; Right = right; Up = up; TanHalfFovY = tanHalfFovY; Aspect = aspect; }
    }

    public static class SunRays
    {
        private static double Dot(Vec3 a, Vec3 b) => a.X * b.X + a.Y * b.Y + a.Z * b.Z;
        private const double FacingFrom = 0.2, FacingFull = 0.85;

        /// <summary>Screen position (u, v; v up) of the body in direction toSun, and the cosine with the view. Null behind.</summary>
        public static bool ScreenUv(Vec3 toSun, CameraBasis cam, out double u, out double v, out double facing)
        {
            facing = Dot(toSun, cam.Forward);
            u = v = 0;
            if (facing <= 1e-6) return false;
            double x = Dot(toSun, cam.Right) / facing, y = Dot(toSun, cam.Up) / facing;
            u = 0.5 + (0.5 * x) / (cam.TanHalfFovY * cam.Aspect);
            v = 0.5 + (0.5 * y) / cam.TanHalfFovY;
            return true;
        }

        public static double Intensity(double strength, double facing) => strength * MathUtil.Smoothstep(FacingFrom, FacingFull, facing);
    }

    public enum Locomotion { Idle, Walk, Run }

    public static class CharacterMotion
    {
        public const double WalkFromMps = 0.3, RunFromMps = 3.5, FadeSeconds = 0.2, TurnRateRadPerS = 12;

        public static Locomotion For(double speedMps) => speedMps < WalkFromMps ? Locomotion.Idle : speedMps < RunFromMps ? Locomotion.Walk : Locomotion.Run;

        public static double HorizontalSpeed(Vec3 from, Vec3 to, double stepSeconds) => MathUtil.Hypot(to.X - from.X, to.Z - from.Z) / stepSeconds;

        /// <summary>Animation weights after dt of fading toward `target` (the target climbs at 1/fade per second; sum stays 1).</summary>
        public static double[] FadeWeights(double[] weights, Locomotion target, double dtSeconds, double fadeSeconds)
        {
            int t = (int)target;
            double gained = Math.Min(1, weights[t] + dtSeconds / fadeSeconds);
            double othersTotal = 0;
            for (int i = 0; i < 3; i++) if (i != t) othersTotal += weights[i];
            double scale = othersTotal > 0 ? (1 - gained) / othersTotal : 0;
            var next = new double[3];
            for (int i = 0; i < 3; i++) if (i != t) next[i] = weights[i] * scale;
            next[t] = gained;
            return next;
        }

        /// <summary>Heading (rad) of a move, camera convention (0 = +Z, π/2 = +X); null when still.</summary>
        public static double? HeadingOf(double dx, double dz) => dx == 0 && dz == 0 ? (double?)null : Math.Atan2(dx, dz);

        public static double TurnToward(double from, double to, double maxStep)
        {
            double gap = Math.Atan2(Math.Sin(to - from), Math.Cos(to - from));
            return from + Math.Min(maxStep, Math.Max(-maxStep, gap));
        }
    }

    /// <summary>Port of babylon/fps-meter.ts: average fps and « 1 % low » over the last N frames.</summary>
    public sealed class FpsMeter
    {
        private readonly int windowFrames;
        private readonly Queue<double> samples = new Queue<double>();
        private double total;
        public FpsMeter(int windowFrames = 600) { this.windowFrames = windowFrames; }

        public void Record(double frameMs)
        {
            if (!MathUtil.IsFinite(frameMs) || frameMs <= 0) return;
            samples.Enqueue(frameMs);
            total += frameMs;
            if (samples.Count > windowFrames) total -= samples.Dequeue();
        }

        public (double fps, double low1, int frames) Stats()
        {
            int n = samples.Count;
            if (n == 0) return (0, 0, 0);
            var sorted = new List<double>(samples);
            sorted.Sort((a, b) => b.CompareTo(a));
            int k = Math.Max(1, n / 100);
            double slow = 0;
            for (int i = 0; i < k; i++) slow += sorted[i];
            return (1000.0 * n / total, 1000 / (slow / k), n);
        }
    }
}
