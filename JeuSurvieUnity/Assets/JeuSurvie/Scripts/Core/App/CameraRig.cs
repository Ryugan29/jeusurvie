// Port of src/app/camera/camera-rig.ts and src/app/input/intent.ts — pure 3rd-person orbit camera and move intent.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.App
{
    /// <summary>Obstacles that may touch the camera boom from (ax, az) to (bx, bz).</summary>
    public delegate IReadOnlyList<Circle> ObstaclesAlong(double ax, double az, double bx, double bz);

    public readonly struct CameraRig
    {
        /// <summary>Yaw (rad): 0 = looking toward +Z, π/2 = toward +X.</summary>
        public readonly double Yaw;
        /// <summary>Pitch (rad): positive = camera above the player.</summary>
        public readonly double Pitch;
        public readonly double Distance;
        public CameraRig(double yaw, double pitch, double distance) { Yaw = yaw; Pitch = pitch; Distance = distance; }
    }

    public readonly struct CameraPose
    {
        public readonly Vec3 Position, Target;
        public CameraPose(Vec3 position, Vec3 target) { Position = position; Target = target; }
    }

    public static class CameraRigs
    {
        public const double MinPitch = -0.35, MaxPitch = 1.25, MinDistance = 2.5, MaxDistance = 14;
        public const double CameraGroundClearance = 0.4, CameraObstacleMargin = 0.3, MinCameraBoom = 1.2;
        private const double ZoomPerWheelUnit = 0.01;

        public static Vec2XZ ForwardOf(double yaw) => new Vec2XZ(Math.Sin(yaw), Math.Cos(yaw));

        public static CameraRig ApplyLook(CameraRig rig, double dxPx, double dyPx, double sensitivity) =>
            new CameraRig(rig.Yaw + dxPx * sensitivity, MathUtil.Clamp(rig.Pitch + dyPx * sensitivity, MinPitch, MaxPitch), rig.Distance);

        public static CameraRig ApplyZoom(CameraRig rig, double wheelDelta) =>
            new CameraRig(rig.Yaw, rig.Pitch, MathUtil.Clamp(rig.Distance + wheelDelta * ZoomPerWheelUnit, MinDistance, MaxDistance));

        private static double BoomFractionBlockedBy(Vec3 from, Vec3 to, Circle c, GroundSampler groundAt)
        {
            double dx = to.X - from.X, dz = to.Z - from.Z;
            double a = dx * dx + dz * dz;
            if (a == 0) return 1;
            double reach = c.R + CameraObstacleMargin;
            double fx = from.X - c.X, fz = from.Z - c.Z;
            double startGap = fx * fx + fz * fz - reach * reach;
            if (startGap <= 0) return 1;
            double b = 2 * (dx * fx + dz * fz);
            double discriminant = b * b - 4 * a * startGap;
            if (discriminant < 0) return 1;
            double t = (-b - Math.Sqrt(discriminant)) / (2 * a);
            if (t < 0 || t > 1) return 1;
            if (c.HasHeight)
            {
                double? baseY = groundAt?.Invoke(c.X, c.Z);
                if (baseY != null && from.Y + t * (to.Y - from.Y) >= baseY.Value + c.Height) return 1;
            }
            return t;
        }

        /// <summary>Camera pose: behind the target by yaw, raised by pitch, shortened by obstacles, never under the ground.</summary>
        public static CameraPose Pose(CameraRig rig, Vec3 target, GroundSampler groundAt = null, ObstaclesAlong obstacles = null)
        {
            Vec2XZ f = ForwardOf(rig.Yaw);
            double horizontal = Math.Cos(rig.Pitch) * rig.Distance;
            var wanted = new Vec3(target.X - f.X * horizontal, target.Y + Math.Sin(rig.Pitch) * rig.Distance, target.Z - f.Z * horizontal);
            double t = 1;
            if (obstacles != null)
            {
                foreach (Circle c in obstacles(target.X, target.Z, wanted.X, wanted.Z)) t = Math.Min(t, BoomFractionBlockedBy(target, wanted, c, groundAt));
                t = Math.Max(t, Math.Min(1, MinCameraBoom / rig.Distance));
            }
            double x = target.X + (wanted.X - target.X) * t, z = target.Z + (wanted.Z - target.Z) * t;
            double free = target.Y + (wanted.Y - target.Y) * t;
            double? groundY = groundAt?.Invoke(x, z);
            double y = groundY == null ? free : Math.Max(free, groundY.Value + CameraGroundClearance);
            return new CameraPose(new Vec3(x, y, z), target);
        }

        /// <summary>Wanted move direction (length 0 or 1), relative to the camera yaw (port of intent.ts).</summary>
        public static Vec2XZ WishDirection(bool forward, bool back, bool left, bool right, double yaw)
        {
            int ahead = (forward ? 1 : 0) - (back ? 1 : 0);
            int side = (right ? 1 : 0) - (left ? 1 : 0);
            if (ahead == 0 && side == 0) return new Vec2XZ(0, 0);
            Vec2XZ f = ForwardOf(yaw);
            double dx = ahead * f.X + side * f.Z;
            double dz = ahead * f.Z - side * f.X;
            double len = MathUtil.Hypot(dx, dz);
            return new Vec2XZ(dx / len, dz / len);
        }
    }
}
