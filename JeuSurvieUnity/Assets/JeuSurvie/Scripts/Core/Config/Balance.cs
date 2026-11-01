// Port of src/core/config/balance.ts — every tuning value of the game, durations in seconds.
namespace JeuSurvie.Core.Config
{
    public static class Balance
    {
        /// <summary>Simulation frequency (ticks per second).</summary>
        public const int SimHz = 30;
        /// <summary>Day length including dusk (s).</summary>
        public const double DayLengthS = 14 * 60;
        /// <summary>Dusk = the last seconds of the day (s).</summary>
        public const double DuskLengthS = 2 * 60;
        /// <summary>Night length (s).</summary>
        public const double NightLengthS = 6 * 60;
        /// <summary>Player walk speed (m/s).</summary>
        public const double PlayerWalkSpeedMps = 5;
        /// <summary>Player radius seen from above (m).</summary>
        public const double PlayerRadiusM = 0.35;
        /// <summary>Maximum climbable slope (rise / run; 1 = 45°).</summary>
        public const double PlayerMaxSlope = 1;
    }
}
