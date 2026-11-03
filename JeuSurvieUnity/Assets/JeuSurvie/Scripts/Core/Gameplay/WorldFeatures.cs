// The harvest layer added on top of the sealed world: fallen branches and old stumps in the woods, wild herbs, loose soil
// with roots, golden flowers in the clearings, copper and iron deposits (more of them in the cold and the mountains), and
// the starting camp. Deterministic from the seed (own hash salts, never those of the world), and never on a tree, a rock,
// a path, a steep slope or the camp. Placement itself is only read, so the world stays exactly as it was.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.World;

namespace JeuSurvie.Core.Gameplay
{
    public static class Features
    {
        public const int CellM = 4;
        private const int CellsPerChunk = Chunk.Size / CellM;
        /// <summary>Hash salts of this layer (the sealed world uses 0–75 and 300–520).</summary>
        public const int SaltKind = 1001, SaltSpot = 1002, SaltLook = 1003, SaltVariant = 1004;
        private const double Unit = 1.0 / 65536;
        private const double PlantMaxSlope = 0.75, SoilMaxSlope = 0.4, OreMaxSlope = 1.4;
        private const double ClearOfObstaclesM = 0.4, ClearOfPlantsM = 1.0, SpawnClearM = 3;

        /// <summary>Features of chunk (cx, cz), in cell order.</summary>
        public static List<Harvestable> InChunk(uint seed, int cx, int cz, CampSite camp)
        {
            var placement = new Dictionary<long, Resource>();
            Resource PlacementAt(int gx, int gz)
            {
                long key = ((long)gx << 32) ^ (uint)gz;
                if (!placement.TryGetValue(key, out Resource r)) placement[key] = r = Placement.InCell(seed, gx, gz);
                return r;
            }
            var list = new List<Harvestable>();
            for (int fz = cz * CellsPerChunk; fz < (cz + 1) * CellsPerChunk; fz++)
                for (int fx = cx * CellsPerChunk; fx < (cx + 1) * CellsPerChunk; fx++)
                {
                    Harvestable h = InCell(seed, fx, fz, camp, PlacementAt);
                    if (h != null) list.Add(h);
                }
            return list;
        }

        public static Harvestable InCell(uint seed, int fx, int fz, CampSite camp, Func<int, int, Resource> placementAt = null)
        {
            placementAt = placementAt ?? ((gx, gz) => Placement.InCell(seed, gx, gz));
            uint kindHash = Hash.Hash2(seed, fx, fz, SaltKind), spot = Hash.Hash2(seed, fx, fz, SaltSpot);
            double roll = (kindHash & 0xffff) * Unit;
            double x = (fx + 0.2 + 0.6 * (spot & 0xffff) * Unit) * CellM, z = (fz + 0.2 + 0.6 * (spot >> 16) * Unit) * CellM;
            BiomeSample biome = Biome.At(seed, x, z);
            bool forest = biome.Cold < 0.5, even = (fx & 1) == 0 && (fz & 1) == 0;
            double grove = Placement.ForestFactorAt(seed, x, z);
            (HarvestKind kind, double p)[] table =
            {
                (HarvestKind.Branch, forest ? 0.045 * grove : 0),
                (HarvestKind.Stump, forest ? 0.008 * grove : 0),
                (HarvestKind.Herb, 0.012 + 0.02 * biome.Humidity),
                (HarvestKind.Soil, 0.014),
                (HarvestKind.FlowerGold, forest ? 0.03 * Math.Max(0, 1.2 - grove) : 0.008),
                (HarvestKind.CopperOre, even ? 0.012 + 0.02 * biome.Cold : 0), // ore on every other cell: deposits never touch
                (HarvestKind.IronOre, even ? 0.004 + 0.024 * biome.Cold : 0),
            };
            HarvestKind? picked = null;
            double acc = 0;
            foreach (var (k, p) in table)
            {
                acc += p;
                if (roll < acc) { picked = k; break; }
            }
            if (picked == null || x * x + z * z < SpawnClearM * SpawnClearM) return null;
            HarvestKind kind = picked.Value;
            if (camp != null && camp.Covers(x, z, 2)) return null;
            bool ore = kind == HarvestKind.CopperOre || kind == HarvestKind.IronOre;
            double h = Terrain.HeightAt(seed, x, z);
            double slope = Math.Max(Math.Abs(Terrain.HeightAt(seed, x + 1, z) - h), Math.Abs(Terrain.HeightAt(seed, x, z + 1) - h));
            if (slope > (ore ? OreMaxSlope : kind == HarvestKind.Soil ? SoilMaxSlope : PlantMaxSlope)) return null;
            if (!ore && h >= Placement.TreeLineAt(biome.Cold)) return null;
            if (Paths.PathAt(seed, x, z) > Placement.PathClearThreshold) return null;
            uint look = Hash.Hash2(seed, fx, fz, SaltLook), variant = Hash.Hash2(seed, fx, fz, SaltVariant);
            double rotation = (look & 0xffff) * Unit, shape = (look >> 16) * Unit;
            var made = new Harvestable(new NodeId(NodeLayer.Feature, fx, fz), kind, ModelOf(kind, variant), x, z, rotation, ScaleOf(kind, shape));
            return ClearOfPlacement(made, placementAt) ? made : null;
        }

        private static string ModelOf(HarvestKind kind, uint variant)
        {
            switch (kind)
            {
                case HarvestKind.Branch: return "Branche_Sol_" + (1 + variant % 2);
                case HarvestKind.Stump: return "Souche_Feuillu";
                case HarvestKind.Herb: return "Herbe_Sauvage";
                case HarvestKind.Soil: return "Terre_Meuble";
                case HarvestKind.FlowerGold: return "Flower_4_Group";
                case HarvestKind.CopperOre: return "Gisement_Cuivre_" + (1 + variant % 3);
                default: return "Gisement_Fer_" + (1 + variant % 3);
            }
        }

        private static double ScaleOf(HarvestKind kind, double t)
        {
            switch (kind)
            {
                case HarvestKind.CopperOre:
                case HarvestKind.IronOre: return 0.42 + 0.16 * t;
                case HarvestKind.Stump: return 0.9 + 0.35 * t;
                default: return 0.85 + 0.3 * t;
            }
        }

        /// <summary>Radius a feature needs around its centre (its obstacle circle, or the size of the plant or branch).</summary>
        private static double FootOf(Harvestable h) => h.Collider?.R ?? (h.Kind == HarvestKind.Branch ? 0.6 * h.Scale : h.Kind == HarvestKind.Soil ? 0.6 * h.Scale : 0.4);

        private static bool ClearOfPlacement(Harvestable h, Func<int, int, Resource> placementAt)
        {
            double foot = FootOf(h);
            double cx = h.Collider?.X ?? h.X, cz = h.Collider?.Z ?? h.Z;
            int gx0 = (int)Math.Floor((cx - foot - 4) / Placement.ResourceCellM), gx1 = (int)Math.Floor((cx + foot + 4) / Placement.ResourceCellM);
            int gz0 = (int)Math.Floor((cz - foot - 4) / Placement.ResourceCellM), gz1 = (int)Math.Floor((cz + foot + 4) / Placement.ResourceCellM);
            for (int gz = gz0; gz <= gz1; gz++)
                for (int gx = gx0; gx <= gx1; gx++)
                {
                    Resource r = placementAt(gx, gz);
                    if (r == null) continue;
                    Circle? c = Colliders.ColliderOf(r);
                    if (c != null)
                    {
                        if (MathUtil.Hypot(cx - c.Value.X, cz - c.Value.Z) < c.Value.R + foot + ClearOfObstaclesM) return false;
                    }
                    else if (MathUtil.Hypot(cx - r.X, cz - r.Z) < foot + ClearOfPlantsM) return false;
                }
            return true;
        }
    }

    /// <summary>
    /// The starting camp: a log bench with the first tools on it, near the arrival and in front of the first view, and one of
    /// each harvestable around it (the test area). Placed on a clear spot so it never needs to hide anything of the world.
    /// </summary>
    public sealed class CampSite
    {
        public const double RadiusM = 10;
        public readonly double X, Z;
        /// <summary>Direction from the camp toward the arrival (radians, yaw convention: forward = (sin, cos)).</summary>
        public readonly double TowardSpawn;
        public readonly IReadOnlyList<Harvestable> Nodes;
        /// <summary>The bench: decor and obstacle only (never listed in Nodes, so never targeted or harvested).</summary>
        public readonly Harvestable Bench;

        /// <summary>The tools waiting on the bench (item, wear or null = new), as offsets along the bench (m).</summary>
        public static readonly (string item, int? durability, double along)[] StarterTools =
        {
            ("axe_stone", null, -0.62), ("pickaxe_stone", null, -0.36), ("hoe_stone", null, -0.1),
            ("sickle_stone", null, 0.14), ("pickaxe_copper", null, 0.38), ("axe_stone", 3, 0.62),
        };

        /// <summary>Around the bench: kind, model, scale, distance (m) and angle (degrees from « away from the arrival »).</summary>
        private static readonly (HarvestKind kind, string model, double scale, double r, double deg)[] Layout =
        {
            (HarvestKind.Tree, "CommonTree_3", 0.9, 7.5, 55),
            (HarvestKind.Stump, "Souche_Feuillu", 1.0, 5.2, 100),
            (HarvestKind.Branch, "Branche_Sol_1", 1.0, 3.6, -150),
            (HarvestKind.Branch, "Branche_Sol_2", 1.0, 4.6, 145),
            (HarvestKind.Rock, "Rock_Medium_2", 0.55, 7.2, -55),
            (HarvestKind.CopperOre, "Gisement_Cuivre_2", 0.5, 8.0, -95),
            (HarvestKind.IronOre, "Gisement_Fer_1", 0.5, 8.4, -15),
            (HarvestKind.TallGrass, "Grass_Common_Tall", 1.0, 4.4, 18),
            (HarvestKind.TallGrass, "Grass_Common_Tall", 0.9, 5.0, 32),
            (HarvestKind.Herb, "Herbe_Sauvage", 1.0, 4.2, -32),
            (HarvestKind.Herb, "Herbe_Sauvage", 0.9, 4.8, -122),
            (HarvestKind.FlowerRose, "Flower_3_Group", 0.9, 5.6, 160),
            (HarvestKind.FlowerGold, "Flower_4_Group", 0.9, 5.2, -165),
            (HarvestKind.Soil, "Terre_Meuble", 1.0, 5.6, 0),
            (HarvestKind.Soil, "Terre_Meuble", 1.0, 6.2, -75),
        };

        public const string BenchModel = "Tronc_Camp";
        public const int LayoutVersion = 1;
        /// <summary>Height of the bench top above the ground, where the tools lie (m).</summary>
        public const double BenchTopM = 0.42;

        private CampSite(double x, double z, double towardSpawn)
        {
            X = x; Z = z; TowardSpawn = towardSpawn;
            var nodes = new List<Harvestable>();
            double away = towardSpawn + Math.PI;
            for (int i = 0; i < Layout.Length; i++)
            {
                var l = Layout[i];
                double a = away + l.deg * Math.PI / 180;
                nodes.Add(new Harvestable(new NodeId(NodeLayer.Camp, i, 0), l.kind, l.model, x + Math.Sin(a) * l.r, z + Math.Cos(a) * l.r,
                    Fraction(a * 1.7), l.scale));
            }
            Nodes = nodes;
            Bench = new Harvestable(new NodeId(NodeLayer.Camp, -1, 0), HarvestKind.Branch, BenchModel, x, z, Fraction(towardSpawn / (2 * Math.PI)), 1);
        }

        private static double Fraction(double v) => v - Math.Floor(v);

        /// <summary>Point of the bench top `along` metres from its middle (where the tools lie).</summary>
        public Vec2XZ AlongBench(double along) =>
            new Vec2XZ(X + Math.Cos(TowardSpawn) * along, Z - Math.Sin(TowardSpawn) * along);

        public bool Covers(double x, double z, double marginM) => MathUtil.Hypot(x - X, z - Z) < RadiusM + marginM;

        /// <summary>The first clear spot 13 to 60 m in front of the first view (no tree or rock within the camp, gentle ground).</summary>
        public static CampSite Find(uint seed, double spawnX, double spawnZ, double yaw)
        {
            for (double r = 13; r <= 60; r += 4)
                for (int k = 0; k < 9; k++)
                {
                    double a = yaw + (k % 2 == 0 ? 1 : -1) * ((k + 1) / 2) * 0.35;
                    double cx = spawnX + Math.Sin(a) * r, cz = spawnZ + Math.Cos(a) * r;
                    if (Clear(seed, cx, cz)) return At(cx, cz, spawnX, spawnZ);
                }
            Vec2XZ ahead = new Vec2XZ(spawnX + Math.Sin(yaw) * 13, spawnZ + Math.Cos(yaw) * 13);
            return At(ahead.X, ahead.Z, spawnX, spawnZ);
        }

        /// <summary>The camp as a save remembers it (it never moves once the game has started).</summary>
        public static CampSite Restore(double x, double z, double towardSpawn) => new CampSite(x, z, towardSpawn);

        public static CampSite At(double x, double z, double spawnX, double spawnZ) =>
            new CampSite(x, z, Math.Atan2(spawnX - x, spawnZ - z));

        private static bool Clear(uint seed, double x, double z)
        {
            double reach = RadiusM + 1 + Colliders.MaxColliderExtentM * Placement.ResourceScaleMax;
            int gx0 = (int)Math.Floor((x - reach) / Placement.ResourceCellM), gx1 = (int)Math.Floor((x + reach) / Placement.ResourceCellM);
            int gz0 = (int)Math.Floor((z - reach) / Placement.ResourceCellM), gz1 = (int)Math.Floor((z + reach) / Placement.ResourceCellM);
            for (int gz = gz0; gz <= gz1; gz++)
                for (int gx = gx0; gx <= gx1; gx++)
                {
                    Resource r = Placement.InCell(seed, gx, gz);
                    Circle? c = r == null ? null : Colliders.ColliderOf(r);
                    if (c != null && MathUtil.Hypot(c.Value.X - x, c.Value.Z - z) < RadiusM + 1 + c.Value.R) return false;
                }
            double lo = double.MaxValue, hi = double.MinValue;
            for (int i = 0; i < 9; i++)
            {
                double a = i * Math.PI / 4, d = i == 8 ? 0 : RadiusM - 1;
                double h = Terrain.HeightAt(seed, x + Math.Sin(a) * d, z + Math.Cos(a) * d);
                lo = Math.Min(lo, h);
                hi = Math.Max(hi, h);
            }
            return hi - lo <= 2.5;
        }
    }
}
