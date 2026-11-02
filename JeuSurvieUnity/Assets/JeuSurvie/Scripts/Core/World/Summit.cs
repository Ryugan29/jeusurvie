// Port of src/core/world/summit.ts — deterministic search of the highest summit of an area (?lieu=montagne).
using System;

namespace JeuSurvie.Core.World
{
    public readonly struct Summit
    {
        public readonly double X, Z, Height;
        public Summit(double x, double z, double height) { X = x; Z = z; Height = height; }
    }

    public static class SummitSearch
    {
        public static Summit Find(uint seed, double radiusM, double gridStepM)
        {
            var best = new Summit(0, 0, Terrain.HeightAt(seed, 0, 0));
            double r = radiusM, r2 = r * r;
            double limit = r + gridStepM, limit2 = limit * limit;
            for (double x = -r; x <= r; x += gridStepM)
            {
                for (double z = -r; z <= r; z += gridStepM)
                {
                    if (x * x + z * z > r2) continue;
                    double height = Terrain.HeightAt(seed, x, z);
                    if (height > best.Height) best = new Summit(x, z, height);
                }
            }
            for (double step = Math.Max(2, gridStepM / 2); ; step = Math.Max(2, step / 2))
            {
                bool moved = true;
                while (moved)
                {
                    moved = false;
                    double[][] dirs = { new[] { step, 0.0 }, new[] { -step, 0.0 }, new[] { 0.0, step }, new[] { 0.0, -step } };
                    foreach (var d in dirs)
                    {
                        double x = best.X + d[0], z = best.Z + d[1];
                        if (x * x + z * z > limit2) continue;
                        double height = Terrain.HeightAt(seed, x, z);
                        if (height > best.Height)
                        {
                            best = new Summit(x, z, height);
                            moved = true;
                        }
                    }
                }
                if (step == 2) break;
            }
            return best;
        }
    }
}
