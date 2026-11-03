// Rules of the heroine's animation, without Unity: the gesture's clip time (the blow lands when the game applies it), the
// six locomotion weights (gait × empty hands / tool in hand), the playback rate that keeps her feet with the ground, and a
// fade toward a target value.
using System;

namespace JeuSurvie.Core.RenderData
{
    public static class CharacterAnimation
    {
        public const double ToolFadeSeconds = 0.25, GripFadeSeconds = 0.12, MinPlayback = 0.75, MaxPlayback = 1.3;

        /// <summary>Clip time (0–1) at the gesture's progress (0–1): two straight pieces so the game's impact moment
        /// (impactAt) falls on the clip's contact frame (contact); nothing moves backward, both ends stay put.</summary>
        public static double ClipFraction(double progress, double impactAt, double contact)
        {
            double p = Math.Max(0, Math.Min(1, progress));
            if (impactAt <= 0 || impactAt >= 1) return p;
            return p <= impactAt ? p / impactAt * contact : contact + (p - impactAt) / (1 - impactAt) * (1 - contact);
        }

        /// <summary>Idle, walk, run with empty hands, then the same with a tool in hand (toolShare 0–1).</summary>
        public static double[] LocomotionWeights(double[] gait, double toolShare)
        {
            double t = Math.Max(0, Math.Min(1, toolShare));
            return new[] { gait[0] * (1 - t), gait[1] * (1 - t), gait[2] * (1 - t), gait[0] * t, gait[1] * t, gait[2] * t };
        }

        /// <summary>Playback rate of a travelling loop measured at clipMps (0: a loop that does not travel plays as is).</summary>
        public static double PlaybackRate(double groundMps, double clipMps)
        {
            if (clipMps <= 0 || groundMps <= 0) return 1;
            return Math.Max(MinPlayback, Math.Min(MaxPlayback, groundMps / clipMps));
        }

        /// <summary>value moved toward target, all the way in fadeSeconds.</summary>
        public static double Approach(double value, double target, double dtSeconds, double fadeSeconds)
        {
            double step = fadeSeconds > 0 ? dtSeconds / fadeSeconds : 1;
            return value < target ? Math.Min(target, value + step) : Math.Max(target, value - step);
        }
    }
}
