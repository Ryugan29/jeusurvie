// What moves in the world because of the harvest, drawn each frame outside the static vegetation batches: the thing being
// struck sways (plants bend, trunks shudder), what grows back rises from the ground, a felled tree falls over its stump
// (it tips slowly, then faster, bounces a little, rests, and sinks away), and the objects lying on the ground.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Shared;
using JeuSurvie.Vegetation;
using UnityEngine;
using UnityEngine.Rendering;

namespace JeuSurvie.Gameplay
{
    public sealed class WorldVisuals
    {
        private const float Gravity = 9.81f, RestS = 2.2f, SinkS = 1.6f, LootSpin = 0.5f;

        private sealed class Fall
        {
            public Harvestable Tree;
            public Vector3 Foot, Axis;
            public float Length, Angle, Speed, Bounced, RestLeft = RestS, Sink;
            public bool Landed;
            public Action OnLanded;
        }

        private readonly ModelLibrary nature, objects;
        private readonly Func<double, double, double?> ground;
        private readonly List<Fall> falls = new List<Fall>();
        private readonly Dictionary<string, List<Matrix4x4>> frame = new Dictionary<string, List<Matrix4x4>>();
        private readonly Dictionary<string, bool> fromObjects = new Dictionary<string, bool>();
        private Matrix4x4[] buffer = new Matrix4x4[16];

        public WorldVisuals(ModelLibrary nature, ModelLibrary objects, Func<double, double, double?> ground)
        {
            this.nature = nature;
            this.objects = objects;
            this.ground = ground;
        }

        /// <summary>A felled tree starts falling away from the player (`heading`: direction of the fall).</summary>
        public void StartFall(Harvestable tree, double heading, Action onLanded)
        {
            var foot = new Vector3((float)tree.X, (float)(ground(tree.X, tree.Z) ?? 0), (float)tree.Z);
            var dir = new Vector3((float)Math.Sin(heading), 0, (float)Math.Cos(heading));
            falls.Add(new Fall
            {
                Tree = tree, Foot = foot, Axis = Vector3.Cross(Vector3.up, dir).normalized,
                Length = Mathf.Max(3, (float)((tree.Collider?.Height ?? 6) * 0.55)), Angle = 0.04f, OnLanded = onLanded,
            });
        }

        public void Draw(GameplayState s, HarvestWorld world, long now, IReadOnlyDictionary<long, (double until, Vector3 from)> wobbles, double clock,
            double dt, Vec3 player)
        {
            foreach (var list in frame.Values) list.Clear();
            foreach (var kv in wobbles)
            {
                NodeId id = NodeId.Unpack(kv.Key);
                if (!world.TryGet(id, out Harvestable h)) continue;
                NodeView v = NodeViews.Of(h, s.World[id], now);
                if (!v.Shown) continue;
                Matrix4x4 m = Placed(h, v.Model, v.Scale);
                float left = (float)Math.Max(0, kv.Value.until - clock);
                bool plant = h.Collider == null;
                float amplitude = (plant ? 14f : 1.6f) * left / 0.35f;
                float angle = amplitude * Mathf.Sin((0.35f - left) * (plant ? 30f : 55f));
                Vector3 away = new Vector3(m.m03 - kv.Value.from.x, 0, m.m23 - kv.Value.from.z).normalized;
                Vector3 axis = Vector3.Cross(Vector3.up, away == Vector3.zero ? Vector3.forward : away);
                Add(v.Model, Pivoted(m, new Vector3(m.m03, m.m13, m.m23), Quaternion.AngleAxis(angle, axis)), false);
            }
            foreach (var kv in s.World.Entries)
            {
                if (kv.Value.Phase != NodePhase.Regrowing || !world.TryGet(kv.Key, out Harvestable h)) continue;
                NodeView v = NodeViews.Of(h, kv.Value, now);
                float g = (float)v.Growth;
                Add(v.Model, Placed(h, v.Model, h.Scale * (1 - (1 - g) * (1 - g))), false); // eases out of the ground
            }
            UpdateFalls((float)dt);
            foreach (Fall f in falls)
            {
                Matrix4x4 m = Placed(f.Tree, f.Tree.Model, f.Tree.Scale);
                m = Matrix4x4.Translate(Vector3.down * f.Sink) * Pivoted(m, f.Foot, Quaternion.AngleAxis(f.Angle * Mathf.Rad2Deg, f.Axis));
                Add(f.Tree.Model, m, false);
            }
            foreach (LootDrop d in s.Loot.Near(player.X, player.Z, 60)) Add(d.Stack.Def.Model, LootMatrix(d, clock), true);
            foreach (var kv in frame)
            {
                if (kv.Value.Count == 0) continue;
                IReadOnlyList<ModelPart> parts = (fromObjects.TryGetValue(kv.Key, out bool obj) && obj ? objects : nature).PartsOf(kv.Key);
                if (parts.Count == 0) continue;
                if (buffer.Length < kv.Value.Count) buffer = new Matrix4x4[Mathf.NextPowerOfTwo(kv.Value.Count)];
                kv.Value.CopyTo(buffer);
                Instancing.Draw(parts, buffer, kv.Value.Count, Instancing.BoundsOf(buffer, kv.Value.Count, 20), ShadowCastingMode.On);
            }
        }

        private void Add(string model, Matrix4x4 m, bool isObject)
        {
            if (!frame.TryGetValue(model, out var list)) frame[model] = list = new List<Matrix4x4>();
            fromObjects[model] = isObject;
            list.Add(m);
        }

        /// <summary>Where the vegetation renderer puts this model (same ground, rotation, scale and sinking).</summary>
        private Matrix4x4 Placed(Harvestable h, string model, double scale)
        {
            double y = (ground(h.X, h.Z) ?? 0) - OverlayInstances.SinkOf(model) * scale;
            return Matrix4x4.TRS(new Vector3((float)h.X, (float)y, (float)h.Z), Quaternion.Euler(0, (float)(h.Rotation * 360), 0), Vector3.one * (float)scale);
        }

        private static Matrix4x4 Pivoted(Matrix4x4 m, Vector3 pivot, Quaternion r) =>
            Matrix4x4.Translate(pivot) * Matrix4x4.Rotate(r) * Matrix4x4.Translate(-pivot) * m;

        /// <summary>Objects lie on the ground; tools lie flat on their side.</summary>
        private static Matrix4x4 LootMatrix(LootDrop d, double clock)
        {
            float yaw = (float)((d.Id * 137.5) % 360);
            Quaternion r = Quaternion.Euler(0, yaw, 0) * (d.Stack.IsTool ? Quaternion.Euler(0, 0, 90) : Quaternion.identity);
            Vector3 lift = d.Stack.IsTool ? new Vector3(0, 0.03f, 0) : Vector3.zero;
            return Matrix4x4.TRS(new Vector3((float)d.X, (float)d.Y, (float)d.Z) + lift, r, Vector3.one);
        }

        /// <summary>A rigid trunk pivoting on its foot: θ'' = 1.5 g / L · sin θ, a small bounce on the ground, a rest, then it sinks.</summary>
        private void UpdateFalls(float dt)
        {
            for (int i = falls.Count - 1; i >= 0; i--)
            {
                Fall f = falls[i];
                const float groundAngle = 1.48f;
                if (!f.Landed)
                {
                    f.Speed += 1.5f * Gravity / f.Length * Mathf.Sin(f.Angle) * dt;
                    f.Angle += f.Speed * dt;
                    if (f.Angle >= groundAngle)
                    {
                        f.Angle = groundAngle;
                        if (f.Bounced < 1) { f.Speed = -f.Speed * 0.18f; f.Bounced++; }
                        else { f.Speed = 0; f.Landed = true; }
                        if (f.Bounced == 1 && f.OnLanded != null) { f.OnLanded(); f.OnLanded = null; }
                    }
                    continue;
                }
                if (f.RestLeft > 0) { f.RestLeft -= dt; continue; }
                f.Sink += dt / SinkS * 1.2f;
                if (f.Sink > 1.2f) falls.RemoveAt(i);
            }
        }
    }
}
