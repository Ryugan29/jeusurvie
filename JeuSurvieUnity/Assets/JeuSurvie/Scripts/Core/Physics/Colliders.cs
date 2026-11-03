// Port of src/core/physics/colliders.ts — obstacles are circles seen from above; the player is pushed out of them.
using System;
using System.Collections.Generic;
using System.Linq;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.World;

namespace JeuSurvie.Core.Physics
{
    public readonly struct Circle
    {
        public readonly double X, Z, R;
        /// <summary>Obstacle height above the ground (m); NaN = high enough to always block.</summary>
        public readonly double Height;
        public Circle(double x, double z, double r, double height = double.NaN) { X = x; Z = z; R = r; Height = height; }
        public bool HasHeight => !double.IsNaN(Height);
    }

    public readonly struct Footprint
    {
        public readonly double Ox, Oz, R, H;
        public Footprint(double ox, double oz, double r, double h) { Ox = ox; Oz = oz; R = r; H = h; }
    }

    public static class Colliders
    {
        public static readonly IReadOnlyDictionary<string, Footprint> FootprintByModel = new Dictionary<string, Footprint>
        {
            { "CommonTree_2", new Footprint(0, 0, 0.6, 6.7) },
            { "CommonTree_3", new Footprint(0, 0, 0.6, 8) },
            { "CommonTree_4", new Footprint(0, 0, 0.6, 7.9) },
            { "CommonTree_5", new Footprint(0, 0, 0.6, 5.4) },
            { "DeadTree_3", new Footprint(0, 0, 0.7, 12.9) },
            { "DeadTree_4", new Footprint(0, 0, 0.8, 12.4) },
            { "DeadTree_5", new Footprint(0, 0, 0.8, 16.1) },
            { "Pine_1", new Footprint(0, 0, 0.6, 6.8) },
            { "Pine_2", new Footprint(0, 0, 0.6, 6.8) },
            { "Pine_3", new Footprint(0, 0, 0.6, 7) },
            { "Pine_4", new Footprint(0, 0, 0.6, 9.7) },
            { "Pine_5", new Footprint(0, 0, 0.5, 8.3) },
            { "Rock_Medium_1", new Footprint(0.11, 0.35, 1.45, 2) },
            { "Rock_Medium_2", new Footprint(0.18, 0.08, 1.35, 1.85) },
            { "Rock_Medium_3", new Footprint(0.11, 0.85, 1.5, 2) },
        };

        public static readonly double MaxColliderExtentM = FootprintByModel.Values.Max(f => MathUtil.Hypot(f.Ox, f.Oz) + f.R);

        /// <summary>Obstacle circle of a resource, or null if the player walks through it.</summary>
        public static Circle? ColliderOf(Resource resource) =>
            ColliderAt(ResourceModels.ModelKeyFor(resource), resource.X, resource.Z, resource.Rotation, resource.Scale);

        /// <summary>Obstacle circle of `model` placed at (x, z) turned by `rotation` (turns) and scaled, or null.</summary>
        public static Circle? ColliderAt(string model, double x, double z, double rotation, double scale)
        {
            Footprint f;
            if (!FootprintByModel.TryGetValue(model, out f) && !HarvestFootprints.TryGetValue(model, out f)) return null;
            double angle = rotation * 2 * Math.PI, c = Math.Cos(angle), s = Math.Sin(angle), sc = scale;
            return new Circle(
                x + sc * (f.Ox * c + f.Oz * s),
                z + sc * (-f.Ox * s + f.Oz * c),
                f.R * sc,
                f.H * sc);
        }

        /// <summary>
        /// Harvest props (ore deposits are pack rocks with nuggets, so they keep the rocks' footprints). Kept apart from
        /// FootprintByModel, whose content belongs to the ported world (MaxColliderExtentM, ObstacleIndex reach).
        /// </summary>
        public static readonly IReadOnlyDictionary<string, Footprint> HarvestFootprints = new Dictionary<string, Footprint>
        {
            { "Gisement_Cuivre_1", new Footprint(0.11, 0.35, 1.45, 2) },
            { "Gisement_Cuivre_2", new Footprint(0.18, 0.08, 1.35, 1.85) },
            { "Gisement_Cuivre_3", new Footprint(0.11, 0.85, 1.5, 2) },
            { "Gisement_Fer_1", new Footprint(0.11, 0.35, 1.45, 2) },
            { "Gisement_Fer_2", new Footprint(0.18, 0.08, 1.35, 1.85) },
            { "Gisement_Fer_3", new Footprint(0.11, 0.85, 1.5, 2) },
            { "Souche_Feuillu", new Footprint(0, 0, 0.32, 0.45) },
            { "Souche_Morte", new Footprint(0, 0, 0.32, 0.45) },
            { "Tronc_Camp", new Footprint(0, 0, 0.7, 0.45) },
        };

        private const double EdgeToleranceM = 1e-6;

        public static bool Overlaps(double x, double z, double radius, IReadOnlyList<Circle> circles)
        {
            for (int i = 0; i < circles.Count; i++)
            {
                Circle c = circles[i];
                if (MathUtil.Hypot(x - c.X, z - c.Z) < c.R + radius - EdgeToleranceM) return true;
            }
            return false;
        }

        private const int MaxPasses = 4;

        /// <summary>Pushes (x, z) out of the circles, keeping `radius` between its centre and their edge.</summary>
        public static Vec2XZ PushOut(double px, double pz, double radius, IReadOnlyList<Circle> circles)
        {
            double x = px, z = pz;
            for (int pass = 0; pass < MaxPasses; pass++)
            {
                bool moved = false;
                for (int i = 0; i < circles.Count; i++)
                {
                    Circle c = circles[i];
                    double dx = x - c.X, dz = z - c.Z;
                    double reach = c.R + radius;
                    double distance = Math.Sqrt(dx * dx + dz * dz);
                    if (distance >= reach) continue;
                    moved = true;
                    if (distance == 0) x = c.X + reach;
                    else
                    {
                        x = c.X + (dx / distance) * reach;
                        z = c.Z + (dz / distance) * reach;
                    }
                }
                if (!moved) break;
            }
            return new Vec2XZ(x, z);
        }
    }
}
