// What the player is aiming at, and whether it can be worked right now. The camera of this game looks at the heroine's
// head from behind, so the target is what stands in front of her in the direction the camera looks: the closest and best
// centred harvestable (or object on the ground) within a few metres, kept while it stays a good choice. Then the checks
// a player expects, in this order: in reach, nothing in between, the right tool, a tool that is not broken, room in the bag.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Items;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.Gameplay
{
    /// <summary>The loaded world as the gameplay sees it (implemented by the game, faked by the tests).</summary>
    public interface IWorldQuery
    {
        uint Seed { get; }
        /// <summary>Harvestables of the loaded chunks within `radius` of (x, z) (generated state; the overlay is applied by the caller).</summary>
        void Near(double x, double z, double radius, List<Harvestable> into);
        bool TryGet(NodeId id, out Harvestable node);
        double? GroundAt(double x, double z);
        bool Loaded(double x, double z);
        /// <summary>Other obstacles near (x, z): creatures, the camp bench.</summary>
        void ObstaclesNear(double x, double z, double radius, List<Circle> into);
    }

    public enum TargetType { None, Node, Loot }

    public enum TargetStatus { Ok, TooFar, Blocked, NeedsTool, ToolBroken, InventoryFull }

    /// <summary>Which key works the target.</summary>
    public enum TargetInput { Use, Gather }

    public readonly struct Target
    {
        public readonly TargetType Type;
        public readonly NodeId Node;
        public readonly long LootId;
        public readonly HarvestKind Kind;
        public readonly TargetStatus Status;
        public readonly TargetInput Input;
        /// <summary>Gesture used, and whether the bonus tool (sickle on herbs) is the one in hand.</summary>
        public readonly Gesture Gesture;
        public readonly bool WithAltTool;
        /// <summary>Point to work (on the thing's surface, at chest height) and its distance from the player's centre.</summary>
        public readonly double X, Y, Z, Distance;

        public Target(TargetType type, NodeId node, long lootId, HarvestKind kind, TargetStatus status, TargetInput input, Gesture gesture,
            bool withAltTool, double x, double y, double z, double distance)
        {
            Type = type; Node = node; LootId = lootId; Kind = kind; Status = status; Input = input; Gesture = gesture; WithAltTool = withAltTool;
            X = x; Y = y; Z = z; Distance = distance;
        }

        public static readonly Target None = default;
        public bool IsNone => Type == TargetType.None;
        public bool SameThing(Target o) => Type == o.Type && (Type == TargetType.Node ? Node.Equals(o.Node) : Type == TargetType.Loot && LootId == o.LootId);
    }

    public static class Targeting
    {
        /// <summary>Candidates are looked for this far from the player's centre, within this angle of the camera's direction.</summary>
        public const double SearchM = 3.2, ConeRad = 0.9;
        private const double LootReachM = 1.6, KeepBonus = 0.35, ChestM = 1.0;

        /// <summary>The best target in front of the player, with its status.</summary>
        public static Target Pick(Vec3 player, double cameraYaw, PlayerItems items, WorldOverlay overlay, LootList loot, IWorldQuery world, long now, Target previous)
        {
            var near = new List<Harvestable>();
            world.Near(player.X, player.Z, SearchM + 2.5, near);
            Vec2XZ fwd = new Vec2XZ(Math.Sin(cameraYaw), Math.Cos(cameraYaw));
            Target best = Target.None;
            double bestScore = double.MaxValue;
            foreach (Harvestable h in near)
            {
                NodeView v = NodeViews.Of(h, overlay[h.Id], now);
                if (!v.Shown || v.Kind == null) continue;
                double cx = v.Collider?.X ?? h.X, cz = v.Collider?.Z ?? h.Z, r = v.Collider?.R ?? Harvestable.PlantRadiusM;
                double? score = Score(player, fwd, cx, cz, r);
                if (score == null) continue;
                double s = score.Value - (previous.Type == TargetType.Node && previous.Node.Equals(h.Id) ? KeepBonus : 0);
                if (s >= bestScore) continue;
                bestScore = s;
                best = NodeTarget(player, h, v, cx, cz, r, items, overlay, world, now);
            }
            foreach (LootDrop d in loot.Near(player.X, player.Z, SearchM))
            {
                double? score = Score(player, fwd, d.X, d.Z, 0.25);
                if (score == null) continue;
                double s = score.Value - 0.2 - (previous.Type == TargetType.Loot && previous.LootId == d.Id ? KeepBonus : 0); // objects on the ground first
                if (s >= bestScore) continue;
                bestScore = s;
                double dist = MathUtil.Hypot(d.X - player.X, d.Z - player.Z);
                TargetStatus status = dist > LootReachM ? TargetStatus.TooFar
                    : items.Inventory.RoomFor(d.Stack.ItemId) <= 0 ? TargetStatus.InventoryFull : TargetStatus.Ok;
                best = new Target(TargetType.Loot, default, d.Id, default, status, TargetInput.Gather, Gesture.Pickup, false, d.X, d.Y, d.Z, dist);
            }
            return best;
        }

        /// <summary>Lower is better: distance to the surface plus how far off the camera's direction; null if behind or too far.</summary>
        private static double? Score(Vec3 player, Vec2XZ fwd, double cx, double cz, double r)
        {
            double dx = cx - player.X, dz = cz - player.Z, d = MathUtil.Hypot(dx, dz);
            double edge = Math.Max(0, d - r);
            if (edge > SearchM) return null;
            double angle = d < 1e-6 ? 0 : Math.Acos(Math.Max(-1, Math.Min(1, (dx * fwd.X + dz * fwd.Z) / d)));
            double tolerance = ConeRad + Math.Atan2(r, Math.Max(d, 0.1)); // big things are easier to aim at
            if (angle > tolerance) return null;
            return edge + 1.6 * angle;
        }

        /// <summary>The target `h` (in state `v`) would be right now, with its status — rechecked at the impact.</summary>
        public static Target Evaluate(Vec3 player, Harvestable h, NodeView v, PlayerItems items, WorldOverlay overlay, IWorldQuery world, long now) =>
            NodeTarget(player, h, v, v.Collider?.X ?? h.X, v.Collider?.Z ?? h.Z, v.Collider?.R ?? Harvestable.PlantRadiusM, items, overlay, world, now);

        private static Target NodeTarget(Vec3 player, Harvestable h, NodeView v, double cx, double cz, double r, PlayerItems items,
            WorldOverlay overlay, IWorldQuery world, long now)
        {
            HarvestKind kind = v.Kind.Value;
            HarvestRule rule = HarvestData.Rules[kind];
            ItemStack tool = items.EquippedStack;
            bool alt = rule.AltTool != null && tool != null && tool.Def.Tool.Type == rule.AltTool && !tool.IsBroken;
            TargetInput input = rule.ByHand && !alt ? TargetInput.Gather : TargetInput.Use;
            Gesture gesture = alt ? GestureOf(rule.AltTool.Value) : rule.Gesture;
            double d = MathUtil.Hypot(cx - player.X, cz - player.Z);
            double k = d > 1e-6 ? Math.Max(0, d - r) / d : 0;
            double px = player.X + (cx - player.X) * k, pz = player.Z + (cz - player.Z) * k;
            double py = (world.GroundAt(px, pz) ?? player.Y) + Math.Min(ChestM, v.Collider != null && v.Collider.Value.HasHeight ? v.Collider.Value.Height * 0.6 : 0.3);
            TargetStatus status = StatusOf(player, h, cx, cz, r, rule, tool, alt, items, overlay, world, now);
            return new Target(TargetType.Node, h.Id, 0, kind, status, input, gesture, alt, px, py, pz, d);
        }

        public static Gesture GestureOf(ToolType t) =>
            t == ToolType.Axe ? Gesture.Chop : t == ToolType.Sickle ? Gesture.Sweep : t == ToolType.Hoe ? Gesture.Dig : Gesture.Overhead;

        private static TargetStatus StatusOf(Vec3 player, Harvestable h, double cx, double cz, double r, HarvestRule rule, ItemStack tool, bool alt,
            PlayerItems items, WorldOverlay overlay, IWorldQuery world, long now)
        {
            double edge = Math.Max(0, MathUtil.Hypot(cx - player.X, cz - player.Z) - r);
            if (edge > (rule.ByHand && !alt ? HarvestData.GatherReachM : HarvestData.StrikeReachM)) return TargetStatus.TooFar;
            if (Blocked(player, h, cx, cz, r, overlay, world, now)) return TargetStatus.Blocked;
            if (!rule.ByHand)
            {
                if (tool == null || tool.Def.Tool.Type != rule.Tool || tool.Def.Tool.Tier < rule.MinTier) return TargetStatus.NeedsTool;
                if (tool.IsBroken) return TargetStatus.ToolBroken;
            }
            if (items.Inventory.RoomFor(rule.PerStage.ItemId) <= 0) return TargetStatus.InventoryFull;
            return TargetStatus.Ok;
        }

        /// <summary>Is a trunk, a rock or a creature between the player and the target's surface?</summary>
        private static bool Blocked(Vec3 player, Harvestable target, double cx, double cz, double r, WorldOverlay overlay, IWorldQuery world, long now)
        {
            double d = MathUtil.Hypot(cx - player.X, cz - player.Z);
            if (d <= r + 1e-6) return false;
            double ux = (cx - player.X) / d, uz = (cz - player.Z) / d, length = d - r;
            var near = new List<Harvestable>();
            world.Near(player.X, player.Z, d + 3, near);
            var circles = new List<Circle>();
            foreach (Harvestable h in near)
            {
                if (h.Id.Equals(target.Id)) continue;
                NodeView v = NodeViews.Of(h, overlay[h.Id], now);
                if (v.Shown && v.Collider != null) circles.Add(v.Collider.Value);
            }
            world.ObstaclesNear(player.X, player.Z, d + 3, circles);
            foreach (Circle c in circles)
            {
                if (c.HasHeight && c.Height < 0.5) continue; // low things (a stump) do not hide a tree
                double t = (c.X - player.X) * ux + (c.Z - player.Z) * uz;
                if (t <= 0 || t >= length) continue;
                double px = player.X + ux * t - c.X, pz = player.Z + uz * t - c.Z;
                if (px * px + pz * pz < c.R * c.R) return true;
            }
            return false;
        }
    }
}
