// Port of src/app/loop/fixed-step.ts — pure fixed-step accumulator.
using System;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.App
{
    public readonly struct AdvanceResult
    {
        public readonly int Steps;
        public readonly double AccMs;
        public readonly double Alpha;
        public AdvanceResult(int steps, double accMs, double alpha) { Steps = steps; AccMs = accMs; Alpha = alpha; }
    }

    public static class FixedStep
    {
        public const double MaxFrameMs = 250;

        public static AdvanceResult Advance(double accMs, double frameMs, double stepMs, int maxSteps = 5)
        {
            double frame = MathUtil.IsFinite(frameMs) && frameMs > 0 ? Math.Min(frameMs, MaxFrameMs) : 0;
            double acc = accMs + frame;
            int steps = (int)Math.Floor(acc / stepMs);
            if (steps > maxSteps)
            {
                steps = maxSteps;
                acc -= Math.Floor(acc / stepMs) * stepMs;
            }
            else acc -= steps * stepMs;
            if (acc < 0) acc = 0;
            return new AdvanceResult(steps, acc, acc / stepMs);
        }
    }
}
