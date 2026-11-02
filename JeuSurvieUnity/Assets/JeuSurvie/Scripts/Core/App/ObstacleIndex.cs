// Port of src/app/world/obstacle-index.ts — trunks and rocks around a point, exactly those the renderer draws.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.World;

namespace JeuSurvie.Core.App
{
    public sealed class ObstacleIndex
    {
        private const int DefaultMaxCachedCells = 50000;
        private static readonly double ReachM = Colliders.MaxColliderExtentM * Placement.ResourceScaleMax + Balance.PlayerRadiusM;
        private readonly Dictionary<long, Circle?> cells = new Dictionary<long, Circle?>();
        private readonly uint seed;
        private readonly int maxCachedCells;
        private readonly object gate = new object();

        public ObstacleIndex(uint seed, int maxCachedCells = DefaultMaxCachedCells)
        {
            this.seed = seed;
            this.maxCachedCells = maxCachedCells;
        }

        public List<Circle> Near(double x, double z) => InBox(x, z, x, z);

        public List<Circle> Along(double ax, double az, double bx, double bz) =>
            InBox(Math.Min(ax, bx), Math.Min(az, bz), Math.Max(ax, bx), Math.Max(az, bz));

        private List<Circle> InBox(double x0, double z0, double x1, double z1)
        {
            var output = new List<Circle>();
            int gx0 = (int)Math.Floor((x0 - ReachM) / Placement.ResourceCellM), gx1 = (int)Math.Floor((x1 + ReachM) / Placement.ResourceCellM);
            int gz0 = (int)Math.Floor((z0 - ReachM) / Placement.ResourceCellM), gz1 = (int)Math.Floor((z1 + ReachM) / Placement.ResourceCellM);
            for (int gz = gz0; gz <= gz1; gz++)
                for (int gx = gx0; gx <= gx1; gx++)
                {
                    Circle? circle = Cell(gx, gz);
                    if (circle != null) output.Add(circle.Value);
                }
            return output;
        }

        private Circle? Cell(int gx, int gz)
        {
            long key = ((long)gx << 32) ^ (uint)gz;
            lock (gate)
            {
                if (cells.TryGetValue(key, out Circle? known)) return known;
            }
            Resource resource = Placement.InCell(seed, gx, gz);
            Circle? circle = resource == null ? null : Colliders.ColliderOf(resource);
            lock (gate)
            {
                if (cells.Count >= maxCachedCells) cells.Clear();
                cells[key] = circle;
            }
            return circle;
        }
    }
}
