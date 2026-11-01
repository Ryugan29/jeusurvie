// Port of src/core/shared/math.ts plus the JS Math semantics the port depends on.
using System;

namespace JeuSurvie.Core.Shared
{
    public static class MathUtil
    {
        /// <summary>Smooth transition 3t² − 2t³ between edge0 and edge1 (same float64 operations as the TS).</summary>
        public static double Smoothstep(double edge0, double edge1, double x)
        {
            double t = Math.Min(1.0, Math.Max(0.0, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        }

        /// <summary>JavaScript Math.round : halves round toward +∞ (C# Math.Round would round to even).</summary>
        public static double JsRound(double v) => Math.Floor(v + 0.5);

        /// <summary>JavaScript Math.hypot for two values.</summary>
        public static double Hypot(double a, double b) => Math.Sqrt(a * a + b * b);

        /// <summary>JavaScript Math.hypot for three values.</summary>
        public static double Hypot(double a, double b, double c) => Math.Sqrt(a * a + b * b + c * c);

        public static double Clamp01(double v) => v < 0 ? 0 : v > 1 ? 1 : v;

        public static double Clamp(double v, double lo, double hi) => Math.Min(hi, Math.Max(lo, v));

        public static double Mix(double a, double b, double t) => a + (b - a) * t;

        /// <summary>JS Number.isFinite.</summary>
        public static bool IsFinite(double v) => !double.IsNaN(v) && !double.IsInfinity(v);

        /// <summary>Normalises -0 to +0 (the TS `+ 0`).</summary>
        public static double NoNegZero(double v) => v + 0.0;
    }
}
