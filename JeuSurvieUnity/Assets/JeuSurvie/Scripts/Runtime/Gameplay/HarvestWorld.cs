// The loaded world as the harvest sees it: the harvestable things of every loaded chunk (looked up by id or around a
// point), the chunks' generated vegetation batches (shown with what was harvested removed), and the obstacles adjusted
// to what was cut (a felled tree no longer blocks the way, its stump does, a little).
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.World;

namespace JeuSurvie.Gameplay
{
    public sealed class HarvestWorld : IWorldQuery
    {
        private sealed class Entry
        {
            public int Cx, Cz;
            public Dictionary<string, float[]> Batches;
            public List<Harvestable> Nodes;
        }

        private readonly Dictionary<string, Entry> chunks = new Dictionary<string, Entry>();
        private readonly Dictionary<long, (Harvestable node, string chunk)> byId = new Dictionary<long, (Harvestable, string)>();
        private readonly Func<double, double, double?> ground;
        private readonly Func<double, double, double, List<Circle>> others;

        /// <summary>`others`: obstacles that are not harvestable (creatures, the camp bench) around a point.</summary>
        public HarvestWorld(uint seed, Func<double, double, double?> ground, Func<double, double, double, List<Circle>> others)
        {
            Seed = seed;
            this.ground = ground;
            this.others = others;
        }

        public uint Seed { get; }

        public void Track(string key, int cx, int cz, Dictionary<string, float[]> batches, List<Harvestable> nodes)
        {
            Untrack(key);
            var e = new Entry { Cx = cx, Cz = cz, Batches = batches, Nodes = nodes ?? new List<Harvestable>() };
            chunks[key] = e;
            foreach (Harvestable h in e.Nodes) byId[h.Id.Pack()] = (h, key);
        }

        public void Untrack(string key)
        {
            if (!chunks.TryGetValue(key, out Entry e)) return;
            foreach (Harvestable h in e.Nodes) byId.Remove(h.Id.Pack());
            chunks.Remove(key);
        }

        public bool Tracked(string key) => chunks.ContainsKey(key);

        public IEnumerable<string> Keys => new List<string>(chunks.Keys);

        public bool ChunkOf(NodeId id, out string key, out int cx, out int cz)
        {
            key = null; cx = cz = 0;
            if (!byId.TryGetValue(id.Pack(), out var v)) return false;
            Entry e = chunks[v.chunk];
            key = v.chunk; cx = e.Cx; cz = e.Cz;
            return true;
        }

        /// <summary>The chunk's batches as the overlay shows them (`hidden`: drawn elsewhere for now).</summary>
        public Dictionary<string, float[]> Effective(string key, WorldOverlay overlay, long now, ISet<long> hidden) =>
            chunks.TryGetValue(key, out Entry e) ? OverlayInstances.Effective(e.Batches, e.Nodes, overlay, now, hidden) : null;

        public (int cx, int cz) CoordsOf(string key) => chunks.TryGetValue(key, out Entry e) ? (e.Cx, e.Cz) : (0, 0);

        public void Near(double x, double z, double radius, List<Harvestable> into)
        {
            int cx0 = (int)Math.Floor((x - radius) / Chunk.Size), cx1 = (int)Math.Floor((x + radius) / Chunk.Size);
            int cz0 = (int)Math.Floor((z - radius) / Chunk.Size), cz1 = (int)Math.Floor((z + radius) / Chunk.Size);
            double r2 = (radius + 3) * (radius + 3);
            for (int cz = cz0; cz <= cz1; cz++)
                for (int cx = cx0; cx <= cx1; cx++)
                {
                    if (!chunks.TryGetValue(Chunk.Key(cx, cz), out Entry e)) continue;
                    foreach (Harvestable h in e.Nodes)
                        if ((h.X - x) * (h.X - x) + (h.Z - z) * (h.Z - z) <= r2) into.Add(h);
                }
        }

        public bool TryGet(NodeId id, out Harvestable node)
        {
            bool found = byId.TryGetValue(id.Pack(), out var v);
            node = found ? v.node : null;
            return found;
        }

        public double? GroundAt(double x, double z) => ground(x, z);

        public bool Loaded(double x, double z) => chunks.ContainsKey(Chunk.Key((int)Math.Floor(x / Chunk.Size), (int)Math.Floor(z / Chunk.Size)));

        public void ObstaclesNear(double x, double z, double radius, List<Circle> into) => into.AddRange(others(x, z, radius));

        private readonly List<Harvestable> nearBuffer = new List<Harvestable>();

        /// <summary>Movement obstacles of the box as the harvest changed them (rule: Core HarvestObstacles); called every tick.</summary>
        public void AdjustObstacles(List<Circle> circles, double x0, double z0, double x1, double z1, WorldOverlay overlay, long now)
        {
            nearBuffer.Clear();
            Near((x0 + x1) / 2, (z0 + z1) / 2, Math.Max(x1 - x0, z1 - z0) / 2 + 3, nearBuffer);
            HarvestObstacles.Adjust(circles, nearBuffer, overlay, now, x0, z0, x1, z1);
        }
    }
}
