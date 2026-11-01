// Port of src/core/survival/time-of-day.ts.
using System;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.Survival
{
    public enum DayPhase { Jour, Crepuscule, Nuit }

    public readonly struct TimeOfDay
    {
        /// <summary>Day number, from 1.</summary>
        public readonly int Day;
        /// <summary>Position in the full cycle: 0 = sunrise, → 1 at the end of the night.</summary>
        public readonly double DayFraction;
        public readonly DayPhase Phase;
        public TimeOfDay(int day, double dayFraction, DayPhase phase) { Day = day; DayFraction = dayFraction; Phase = phase; }

        public const double CycleS = Balance.DayLengthS + Balance.NightLengthS;

        public static TimeOfDay From(double elapsedSeconds)
        {
            double elapsed = MathUtil.IsFinite(elapsedSeconds) && elapsedSeconds > 0 ? elapsedSeconds : 0;
            double cycles = Math.Floor(elapsed / CycleS);
            double inCycle = elapsed - cycles * CycleS;
            DayPhase phase = inCycle < Balance.DayLengthS - Balance.DuskLengthS ? DayPhase.Jour : inCycle < Balance.DayLengthS ? DayPhase.Crepuscule : DayPhase.Nuit;
            return new TimeOfDay((int)cycles + 1, inCycle / CycleS, phase);
        }

        /// <summary>French phase label as displayed by the original debug panel.</summary>
        public static string PhaseLabel(DayPhase p) => p == DayPhase.Jour ? "jour" : p == DayPhase.Crepuscule ? "crepuscule" : "nuit";
    }
}
