// Two-bone reach (an arm onto a handle): where the elbow and the wrist go so the wrist touches the target, bone lengths
// kept, the elbow staying on the side it was (its animated position is the hint). An unreachable target is reached for
// along the same line, the arm almost straight. Same solve as Tools~/Blender/anim/retarget.py two_bone.
using System;

namespace JeuSurvie.Core.Shared
{
    public static class ArmReach
    {
        public static (Vec3 elbow, Vec3 wrist) Solve(Vec3 shoulder, Vec3 elbowHint, Vec3 target, double upper, double lower)
        {
            Vec3 to = Sub(target, shoulder);
            double len = Length(to);
            double d = Math.Max(Math.Abs(upper - lower) + 1e-4, Math.Min(len, (upper + lower) * 0.99));
            Vec3 n = len > 1e-9 ? Scale(to, 1 / len) : new Vec3(0, -1, 0);
            double a = (upper * upper - lower * lower + d * d) / (2 * d);
            double h = Math.Sqrt(Math.Max(0, upper * upper - a * a));
            Vec3 pole = Sub(elbowHint, shoulder);
            pole = Sub(pole, Scale(n, Dot(pole, n)));
            if (Length(pole) < 1e-6) pole = Math.Abs(n.Y) < 0.9 ? Cross(n, new Vec3(0, 1, 0)) : Cross(n, new Vec3(1, 0, 0));
            pole = Scale(pole, 1 / Length(pole));
            Vec3 elbow = Add(Add(shoulder, Scale(n, a)), Scale(pole, h));
            return (elbow, Add(shoulder, Scale(n, d)));
        }

        private static Vec3 Add(Vec3 a, Vec3 b) => new Vec3(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        private static Vec3 Sub(Vec3 a, Vec3 b) => new Vec3(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        private static Vec3 Scale(Vec3 a, double k) => new Vec3(a.X * k, a.Y * k, a.Z * k);
        private static double Dot(Vec3 a, Vec3 b) => a.X * b.X + a.Y * b.Y + a.Z * b.Z;
        private static double Length(Vec3 a) => Math.Sqrt(Dot(a, a));
        private static Vec3 Cross(Vec3 a, Vec3 b) => new Vec3(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X);
    }
}
