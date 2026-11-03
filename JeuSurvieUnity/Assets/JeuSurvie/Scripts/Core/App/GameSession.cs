// Port of src/app/loop/game-session.ts — fixed step, time in integer ticks, player on the ground, render interpolation.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.App
{
    /// <summary>Obstacles likely to touch a player standing in (x, z).</summary>
    public delegate IReadOnlyList<Circle> ObstaclesNear(double x, double z);

    public sealed class GameSession
    {
        private const double StepMs = 1000.0 / Balance.SimHz;
        private const int MaxStepsPerFrame = 5;
        private const long CycleTicks = (long)((Balance.DayLengthS + Balance.NightLengthS) * Balance.SimHz);

        private readonly GroundSampler ground;
        private readonly ObstaclesNear obstacles;

        /// <summary>World time in integer ticks (time = ticks / SimHz).</summary>
        public long WorldTicks;
        /// <summary>World ticks per simulation tick (1 = normal, 60 = demo accelerated cycle).</summary>
        public int TimeScale = 1;
        /// <summary>Time actually played, in world ticks: never goes back (unlike WorldTicks, moved by the demo's time-of-day keys).</summary>
        public long PlayTicks;
        public Vec3 Previous;
        public Vec3 Current;
        private double accMs;
        private bool grounded;

        public GameSession(double spawnX, double spawnZ, GroundSampler ground, ObstaclesNear obstacles = null)
        {
            this.ground = ground;
            this.obstacles = obstacles;
            Current = new Vec3(spawnX, 0, spawnZ);
            Previous = Current;
        }

        public double ElapsedWorldSeconds => (double)WorldTicks / Balance.SimHz;

        /// <summary>Sets the time to `fraction` of the current cycle (0 = sunrise).</summary>
        public void SetTimeOfDay(double fraction)
        {
            WorldTicks = (long)Math.Floor((double)WorldTicks / CycleTicks) * CycleTicks + (long)MathUtil.JsRound(fraction * CycleTicks);
        }

        /// <summary>One frame: plays the due ticks (if running) with the wanted direction. Returns alpha for interpolation.</summary>
        public double Frame(double frameMs, bool running, double dirX, double dirZ)
        {
            SettleOnGround();
            AdvanceResult step = FixedStep.Advance(accMs, running ? frameMs : 0, StepMs, MaxStepsPerFrame);
            accMs = step.AccMs;
            for (int i = 0; i < step.Steps; i++) Tick(dirX, dirZ);
            return step.Alpha;
        }

        public Vec3 Interpolated(double alpha)
        {
            Vec3 p = Previous, c = Current;
            return new Vec3(p.X + (c.X - p.X) * alpha, p.Y + (c.Y - p.Y) * alpha, p.Z + (c.Z - p.Z) * alpha);
        }

        private void SettleOnGround()
        {
            if (grounded) return;
            double? y = ground(Current.X, Current.Z);
            if (y == null) return;
            Current = new Vec3(Current.X, y.Value, Current.Z);
            Previous = Current;
            grounded = true;
        }

        private void Tick(double dirX, double dirZ)
        {
            double distance = Balance.PlayerWalkSpeedMps / Balance.SimHz;
            Vec3 from = Current;
            Previous = from;
            Current = AvoidObstacles(from, Ground.MoveOnGround(from, dirX * distance, dirZ * distance, ground, Balance.PlayerMaxSlope));
            WorldTicks += TimeScale;
            PlayTicks += TimeScale;
        }

        private Vec3 AvoidObstacles(Vec3 from, Vec3 moved)
        {
            if (obstacles == null) return moved;
            IReadOnlyList<Circle> circles = obstacles(moved.X, moved.Z);
            Vec2XZ pushed = Colliders.PushOut(moved.X, moved.Z, Balance.PlayerRadiusM, circles);
            if (pushed.X == moved.X && pushed.Z == moved.Z) return moved;
            double? y = ground(pushed.X, pushed.Z);
            if (y == null) return from;
            if (y.Value - from.Y > Balance.PlayerMaxSlope * MathUtil.Hypot(pushed.X - from.X, pushed.Z - from.Z)) return from;
            if (Colliders.Overlaps(pushed.X, pushed.Z, Balance.PlayerRadiusM, circles) && !Colliders.Overlaps(from.X, from.Z, Balance.PlayerRadiusM, circles)) return from;
            return new Vec3(pushed.X, y.Value, pushed.Z);
        }
    }
}
