// What the player changed in the world, on top of what the seed generates: only the touched things are remembered
// (a tree being cut, a felled tree's stump, a depleted rock waiting to grow back, tilled soil). Immutable like the
// inventory: a change builds a new overlay. NodeViews turns a generated thing and its state into what is shown and
// solid; OverlayInstances applies that to a chunk's instance batches (removing, shrinking or replacing models).
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.RenderData;

namespace JeuSurvie.Core.Gameplay
{
    public enum NodePhase { Intact, Damaged, Stump, Depleted, Regrowing, Tilled }

    public readonly struct NodeState
    {
        public readonly NodePhase Phase;
        /// <summary>Stages completed, and work done in the current stage (hundredths of a stone-tool blow).</summary>
        public readonly int Stage, Work;
        /// <summary>Valid blows received since the thing (re)appeared: with Generation, seeds the yields.</summary>
        public readonly int Hits, Generation;
        /// <summary>Play tick when it may grow back (0 = never), and when the current phase began.</summary>
        public readonly long RespawnAt, Since;

        public NodeState(NodePhase phase, int stage, int work, int hits, int generation, long respawnAt, long since)
        {
            Phase = phase; Stage = stage; Work = work; Hits = hits; Generation = generation; RespawnAt = respawnAt; Since = since;
        }

        public static readonly NodeState Fresh = default;
        public bool IsFresh => Phase == NodePhase.Intact && Stage == 0 && Work == 0 && Hits == 0 && Generation == 0 && RespawnAt == 0;
    }

    public sealed class WorldOverlay
    {
        private readonly Dictionary<long, NodeState> nodes;

        private WorldOverlay(Dictionary<long, NodeState> nodes) { this.nodes = nodes; }

        public static readonly WorldOverlay Empty = new WorldOverlay(new Dictionary<long, NodeState>());

        public int Count => nodes.Count;

        public NodeState this[NodeId id] => nodes.TryGetValue(id.Pack(), out NodeState s) ? s : NodeState.Fresh;

        public IEnumerable<KeyValuePair<NodeId, NodeState>> Entries
        {
            get { foreach (var kv in nodes) yield return new KeyValuePair<NodeId, NodeState>(NodeId.Unpack(kv.Key), kv.Value); }
        }

        /// <summary>The overlay with one thing's state replaced (a fresh state is simply forgotten).</summary>
        public WorldOverlay With(NodeId id, NodeState state)
        {
            var next = new Dictionary<long, NodeState>(nodes);
            if (state.IsFresh) next.Remove(id.Pack());
            else next[id.Pack()] = state;
            return new WorldOverlay(next);
        }
    }

    /// <summary>What a thing looks like and does in its current state.</summary>
    public readonly struct NodeView
    {
        public readonly bool Shown;
        /// <summary>The rule that applies now (a felled tree is a stump), null if it cannot be harvested now.</summary>
        public readonly HarvestKind? Kind;
        public readonly string Model;
        public readonly double Scale;
        public readonly Circle? Collider;
        /// <summary>1 when fully grown; less while growing back.</summary>
        public readonly double Growth;

        public NodeView(bool shown, HarvestKind? kind, string model, double scale, Circle? collider, double growth)
        {
            Shown = shown; Kind = kind; Model = model; Scale = scale; Collider = collider; Growth = growth;
        }
    }

    public static class NodeViews
    {
        public const string TilledModel = "Terre_Labouree";
        private static readonly double[] OreStageScales = { 1, 0.78 };

        public static string StumpModelFor(Harvestable h) => h.Kind == HarvestKind.DeadTree ? "Souche_Morte" : "Souche_Feuillu";

        public static double StumpScaleFor(Harvestable h) => h.Scale * (h.Kind == HarvestKind.DeadTree ? HarvestData.DeadStumpScale : HarvestData.StumpScale);

        public static double StageScale(HarvestKind kind, int stage)
        {
            double[] scales = kind == HarvestKind.Rock ? HarvestData.RockStageScales
                : kind == HarvestKind.CopperOre || kind == HarvestKind.IronOre ? OreStageScales : null;
            return scales == null ? 1 : scales[Math.Max(0, Math.Min(stage, scales.Length - 1))];
        }

        public static long RegrowTicks(HarvestKind kind)
        {
            bool big = kind == HarvestKind.Tree || kind == HarvestKind.Pine || kind == HarvestKind.DeadTree || kind == HarvestKind.Rock
                || kind == HarvestKind.CopperOre || kind == HarvestKind.IronOre || kind == HarvestKind.Stump;
            return (long)Math.Round((big ? HarvestData.RegrowBigS : HarvestData.RegrowSmallS) * Config.Balance.SimHz);
        }

        public static NodeView Of(Harvestable h, NodeState s, long now)
        {
            switch (s.Phase)
            {
                case NodePhase.Depleted:
                    return new NodeView(false, null, null, 0, null, 0);
                case NodePhase.Tilled:
                    return new NodeView(true, null, TilledModel, h.Scale, null, 1);
                case NodePhase.Stump:
                {
                    string model = StumpModelFor(h);
                    double scale = StumpScaleFor(h);
                    return new NodeView(true, HarvestKind.Stump, model, scale, Colliders.ColliderAt(model, h.X, h.Z, h.Rotation, scale), 1);
                }
                case NodePhase.Regrowing:
                {
                    double g = Math.Max(0.05, Math.Min(1, (now - s.Since) / (double)Math.Max(1, RegrowTicks(h.Kind))));
                    return new NodeView(true, null, h.Model, h.Scale * g, null, g);
                }
                default:
                {
                    double scale = h.Scale * StageScale(h.Kind, s.Stage);
                    return new NodeView(true, h.Kind, h.Model, scale, Colliders.ColliderAt(h.Model, h.X, h.Z, h.Rotation, scale), 1);
                }
            }
        }
    }

    /// <summary>Movement obstacles as the harvest changed them (a felled tree no longer blocks the way, its stump a little).</summary>
    public static class HarvestObstacles
    {
        private const double MarginM = 3;

        /// <summary>
        /// `circles`: the world index's circles of the box [x0, x1] × [z0, z1] (generated vegetation); `near`: the harvestables
        /// around it. The generated circles of what was cut or broken are replaced by their current ones (none, a stump's,
        /// a shrunk rock's), and the circles of the harvest layer (ore, stumps, camp) are added.
        /// </summary>
        public static void Adjust(List<Circle> circles, IReadOnlyList<Harvestable> near, WorldOverlay overlay, long now, double x0, double z0, double x1, double z1)
        {
            for (int i = 0; i < near.Count; i++)
            {
                Harvestable h = near[i];
                NodeState s = overlay[h.Id];
                bool inIndex = h.Id.Layer == NodeLayer.Resource && h.Collider != null;
                if (inIndex && s.IsFresh) continue;
                if (inIndex) RemoveSame(circles, h.Collider.Value);
                Circle? current = NodeViews.Of(h, s, now).Collider;
                if (current == null) continue;
                Circle c = current.Value;
                if (c.X + c.R >= x0 - MarginM && c.X - c.R <= x1 + MarginM && c.Z + c.R >= z0 - MarginM && c.Z - c.R <= z1 + MarginM) circles.Add(c);
            }
        }

        private static void RemoveSame(List<Circle> circles, Circle c)
        {
            for (int i = circles.Count - 1; i >= 0; i--)
                if (circles[i].X == c.X && circles[i].Z == c.Z && circles[i].R == c.R) circles.RemoveAt(i);
        }
    }

    /// <summary>When something may grow back: never under the player's eyes.</summary>
    public static class Respawn
    {
        /// <summary>True if (x, z) is unloaded, far, or out of view and not too close.</summary>
        public static bool CanAppear(double x, double z, double playerX, double playerZ, ViewCull? view, bool loaded)
        {
            if (!loaded) return true;
            double d = Math.Sqrt((x - playerX) * (x - playerX) + (z - playerZ) * (z - playerZ));
            if (d > HarvestData.RespawnFarM) return true;
            bool inView = view == null || ViewSectors.InSector(view.Value.Sector, view.Value.X, view.Value.Z, x, z, 3);
            return !inView && d > HarvestData.RespawnHiddenM;
        }
    }

    /// <summary>A chunk's instance batches as the overlay shows them (batches are never modified: new arrays are made).</summary>
    public static class OverlayInstances
    {
        /// <summary>Flat props (soil, fallen branches, herbs) barely sink into the ground; the rest sinks like the vegetation.</summary>
        private static readonly HashSet<string> LowProps = new HashSet<string>
            { "Terre_Meuble", NodeViews.TilledModel, "Branche_Sol_1", "Branche_Sol_2", "Herbe_Sauvage" };

        public const double LowSinkM = 0.03;

        public static double SinkOf(string model) => LowProps.Contains(model) ? LowSinkM : VegetationInstances.SinkM;

        /// <summary>Matrices of the harvest layer's things (features, camp) of a chunk, grouped by model, merged into `into`.</summary>
        public static void AddBatches(IReadOnlyList<Harvestable> items, World.ChunkData chunk, Dictionary<string, float[]> into)
        {
            foreach (bool low in new[] { false, true })
            {
                var group = new List<Harvestable>();
                foreach (Harvestable h in items) if (LowProps.Contains(h.Model) == low) group.Add(h);
                if (group.Count == 0) continue;
                var made = InstanceMatrices.Build(group, h => h.Model, h => (h.X, h.Z, h.Rotation, h.Scale), chunk, low ? LowSinkM : VegetationInstances.SinkM);
                foreach (var kv in made)
                {
                    if (into.TryGetValue(kv.Key, out float[] existing))
                    {
                        var merged = new float[existing.Length + kv.Value.Length];
                        existing.CopyTo(merged, 0);
                        kv.Value.CopyTo(merged, existing.Length);
                        into[kv.Key] = merged;
                    }
                    else into[kv.Key] = kv.Value;
                }
            }
        }
        /// <summary>
        /// `batches`: the chunk's generated matrices (16 floats each, translation at 12–14, Y scale at 5) per model;
        /// `nodes`: the chunk's harvestables; `hidden`: things drawn elsewhere for now (falling, shaking, growing).
        /// </summary>
        public static Dictionary<string, float[]> Effective(IReadOnlyDictionary<string, float[]> batches, IReadOnlyList<Harvestable> nodes,
            WorldOverlay overlay, long now, ISet<long> hidden = null)
        {
            var removed = new Dictionary<string, HashSet<(float, float)>>();
            var added = new Dictionary<string, List<float>>();
            foreach (Harvestable h in nodes)
            {
                NodeState s = overlay[h.Id];
                bool hide = hidden != null && hidden.Contains(h.Id.Pack());
                if (s.IsFresh && !hide) continue;
                if (!removed.TryGetValue(h.Model, out var set)) removed[h.Model] = set = new HashSet<(float, float)>();
                set.Add(((float)h.X, (float)h.Z));
                NodeView v = NodeViews.Of(h, s, now);
                if (hide || !v.Shown || !batches.TryGetValue(h.Model, out float[] source)) continue;
                int at = Find(source, h.X, h.Z);
                if (at < 0) continue;
                if (!added.TryGetValue(v.Model, out List<float> list)) added[v.Model] = list = new List<float>();
                Rescaled(source, at, h.Scale, v.Scale, SinkOf(h.Model), SinkOf(v.Model), list);
            }
            if (removed.Count == 0) return new Dictionary<string, float[]>(ToDictionary(batches));
            var result = new Dictionary<string, float[]>();
            foreach (var kv in batches)
            {
                if (!removed.TryGetValue(kv.Key, out var gone)) { result[kv.Key] = kv.Value; continue; }
                var kept = new List<float>(kv.Value.Length);
                for (int o = 0; o < kv.Value.Length; o += 16)
                    if (!gone.Contains((kv.Value[o + 12], kv.Value[o + 14])))
                        for (int k = 0; k < 16; k++) kept.Add(kv.Value[o + k]);
                result[kv.Key] = kept.ToArray();
            }
            foreach (var kv in added)
            {
                var merged = new List<float>(result.TryGetValue(kv.Key, out float[] existing) ? existing : Array.Empty<float>());
                merged.AddRange(kv.Value);
                result[kv.Key] = merged.ToArray();
            }
            return result;
        }

        private static Dictionary<string, float[]> ToDictionary(IReadOnlyDictionary<string, float[]> d)
        {
            var copy = new Dictionary<string, float[]>();
            foreach (var kv in d) copy[kv.Key] = kv.Value;
            return copy;
        }

        private static int Find(float[] m, double x, double z)
        {
            float fx = (float)x, fz = (float)z;
            for (int o = 0; o < m.Length; o += 16)
                if (m[o + 12] == fx && m[o + 14] == fz) return o;
            return -1;
        }

        /// <summary>Copies the matrix at `o` with its scale changed from `from` to `to`, keeping its foot on the ground.</summary>
        private static void Rescaled(float[] m, int o, double from, double to, double sinkFrom, double sinkTo, List<float> into)
        {
            double k = from > 0 ? to / from : 1;
            double ground = m[o + 13] + sinkFrom * m[o + 5];
            for (int i = 0; i < 16; i++)
            {
                double v = m[o + i];
                if (i < 12 && i % 4 != 3) v *= k;
                into.Add((float)v);
            }
            into[into.Count - 3] = (float)(ground - sinkTo * m[o + 5] * k);
        }
    }
}
