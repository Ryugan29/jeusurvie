// What can be harvested in the world: every harvestable thing has a stable id (its grid cell, so the save only keeps what
// changed), a kind (the rule it follows), its model and its place. Three sources, all deterministic from the seed:
// the sealed vegetation of Placement (trees, rocks, tall grass, flowers), the additive Features layer (branches, stumps,
// herbs, loose soil, ore, golden flowers) and the starting camp.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Items;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.World;

namespace JeuSurvie.Core.Gameplay
{
    public enum HarvestKind { Tree, Pine, DeadTree, Stump, Rock, CopperOre, IronOre, TallGrass, Herb, FlowerRose, FlowerGold, Branch, Soil }

    /// <summary>Chop: axe · Overhead: pickaxe · Sweep: sickle · Gather: flowers (kneeling) · Pickup: from the ground ·
    /// Dig: hoe · Pull: herbs pulled up (appended: saved values keep their meaning).</summary>
    public enum Gesture { Chop, Overhead, Sweep, Gather, Pickup, Dig, Pull }

    public enum AfterHarvest { Remove, Stump, Till }

    public readonly struct Yield
    {
        public readonly string ItemId;
        public readonly int Min, Max;
        public Yield(string itemId, int min, int max) { ItemId = itemId; Min = min; Max = max; }
    }

    public readonly struct GestureTiming
    {
        public readonly double DurationS, ImpactAt;
        public GestureTiming(double durationS, double impactAt) { DurationS = durationS; ImpactAt = impactAt; }
    }

    public sealed class HarvestRule
    {
        public readonly string Name, Verb;
        /// <summary>Tool needed (null = bare hands are enough).</summary>
        public readonly ToolType? Tool;
        public readonly int MinTier;
        /// <summary>Work of one stage, in stone-tool blows; a node has `Stages` stages, each paying `PerStage`.</summary>
        public readonly int WorkPerStage, Stages;
        public readonly Yield PerStage;
        /// <summary>Seconds before it grows back (0 = never).</summary>
        public readonly double RespawnS;
        public readonly AfterHarvest After;
        public readonly Gesture Gesture;
        /// <summary>Optional tool that also works and gives `BonusWithAlt` more (the sickle on herbs).</summary>
        public readonly ToolType? AltTool;
        public readonly int BonusWithAlt;

        public HarvestRule(string name, string verb, ToolType? tool, int minTier, int workPerStage, int stages, Yield perStage, double respawnS,
            AfterHarvest after, Gesture gesture, ToolType? altTool = null, int bonusWithAlt = 0)
        {
            Name = name; Verb = verb; Tool = tool; MinTier = minTier; WorkPerStage = workPerStage; Stages = stages; PerStage = perStage;
            RespawnS = respawnS; After = after; Gesture = gesture; AltTool = altTool; BonusWithAlt = bonusWithAlt;
        }

        public bool ByHand => Tool == null;
    }

    public enum NodeLayer { Resource = 0, Feature = 1, Camp = 2 }

    /// <summary>Stable id: the layer and the cell (Placement 8 m grid, Features 4 m grid) or the camp index.</summary>
    public readonly struct NodeId : IEquatable<NodeId>
    {
        private const long Mask = (1L << 28) - 1;
        public readonly NodeLayer Layer;
        public readonly int A, B;
        public NodeId(NodeLayer layer, int a, int b) { Layer = layer; A = a; B = b; }

        public long Pack() => ((long)Layer << 56) | (((long)A & Mask) << 28) | ((long)B & Mask);

        public static NodeId Unpack(long v) =>
            new NodeId((NodeLayer)(v >> 56), SignExtend((v >> 28) & Mask), SignExtend(v & Mask));

        private static int SignExtend(long v) => (int)((v & (1L << 27)) != 0 ? v - (1L << 28) : v);

        public override string ToString() => (Layer == NodeLayer.Resource ? "r" : Layer == NodeLayer.Feature ? "f" : "c") + ":" +
            A.ToString(System.Globalization.CultureInfo.InvariantCulture) + ":" + B.ToString(System.Globalization.CultureInfo.InvariantCulture);

        public static bool TryParse(string s, out NodeId id)
        {
            id = default;
            string[] p = (s ?? "").Split(':');
            const System.Globalization.NumberStyles style = System.Globalization.NumberStyles.AllowLeadingSign;
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            if (p.Length != 3 || !int.TryParse(p[1], style, inv, out int a) || !int.TryParse(p[2], style, inv, out int b)) return false;
            NodeLayer? layer = p[0] == "r" ? NodeLayer.Resource : p[0] == "f" ? NodeLayer.Feature : p[0] == "c" ? NodeLayer.Camp : (NodeLayer?)null;
            if (layer == null) return false;
            id = new NodeId(layer.Value, a, b);
            return true;
        }

        public bool Equals(NodeId o) => Layer == o.Layer && A == o.A && B == o.B;
        public override bool Equals(object obj) => obj is NodeId o && Equals(o);
        public override int GetHashCode() => Pack().GetHashCode();
    }

    /// <summary>One harvestable thing as generated (before anything was harvested).</summary>
    public sealed class Harvestable
    {
        public readonly NodeId Id;
        public readonly HarvestKind Kind;
        public readonly string Model;
        public readonly double X, Z, Rotation, Scale;
        /// <summary>Obstacle circle of the intact thing (null: walked through, like plants).</summary>
        public readonly Circle? Collider;

        public Harvestable(NodeId id, HarvestKind kind, string model, double x, double z, double rotation, double scale)
        {
            Id = id; Kind = kind; Model = model; X = x; Z = z; Rotation = rotation; Scale = scale;
            Collider = Colliders.ColliderAt(model, x, z, rotation, scale);
        }

        public HarvestRule Rule => HarvestData.Rules[Kind];

        /// <summary>Radius used to aim at it and to measure the reach (the obstacle circle, or a small plant radius).</summary>
        public double AimRadius => Collider?.R ?? PlantRadiusM;
        public double AimX => Collider?.X ?? X;
        public double AimZ => Collider?.Z ?? Z;
        /// <summary>Height of the aiming cylinder above the ground (m).</summary>
        public double AimHeight => Collider != null && Collider.Value.HasHeight ? Math.Min(Collider.Value.Height, 3) : PlantHeightM * Scale;

        public const double PlantRadiusM = 0.35, PlantHeightM = 0.7;
    }

    public static class HarvestSources
    {
        /// <summary>The Placement resource as a harvestable, or null (bushes are not harvestable).</summary>
        public static Harvestable FromResource(Resource r)
        {
            string model = ResourceModels.ModelKeyFor(r);
            HarvestKind? kind;
            switch (r.Kind)
            {
                case ResourceKind.Tree: kind = model.StartsWith("DeadTree", StringComparison.Ordinal) ? HarvestKind.DeadTree : HarvestKind.Tree; break;
                case ResourceKind.Pine: kind = model.StartsWith("DeadTree", StringComparison.Ordinal) ? HarvestKind.DeadTree : HarvestKind.Pine; break;
                case ResourceKind.Rock: kind = HarvestKind.Rock; break;
                case ResourceKind.Grass: kind = HarvestKind.TallGrass; break;
                case ResourceKind.Flowers: kind = HarvestKind.FlowerRose; break;
                default: kind = null; break;
            }
            return kind == null ? null : new Harvestable(new NodeId(NodeLayer.Resource, r.Gx, r.Gz), kind.Value, model, r.X, r.Z, r.Rotation, r.Scale);
        }

        /// <summary>Everything harvestable whose position lies in chunk (cx, cz), in a stable order.</summary>
        public static List<Harvestable> InChunk(uint seed, int cx, int cz, IReadOnlyList<Resource> resources, CampSite camp)
        {
            var list = new List<Harvestable>();
            foreach (Resource r in resources)
            {
                Harvestable h = FromResource(r);
                if (h != null) list.Add(h);
            }
            list.AddRange(Features.InChunk(seed, cx, cz, camp));
            if (camp != null)
                foreach (Harvestable h in camp.Nodes)
                    if (Chunk.CoordOf(h.X, h.Z).Equals(new ChunkCoord(cx, cz))) list.Add(h);
            return list;
        }
    }
}
