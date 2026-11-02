// Ports of babylon/vegetation-renderer, ground-cover-renderer and shadow-proxies with GPU instancing (Graphics.RenderMeshInstanced):
//   - vegetation: one instance buffer per model, the batches of loaded chunks in range (range per kind × profile) and in the
//     camera view sector, rebuilt only when something changes; one draw per model part;
//   - near shadows: the shadow casters (trees, pines, bushes, rocks) cast shadows only within the shadow range + 40 m — drawn a
//     second time in ShadowsOnly mode (the Unity-native form of the original « shadow proxies »); grass never casts;
//   - ground cover: instances within the profile radius, shrunk toward its edge, thinned by density, rebuilt every 2.5 m.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.World;
using UnityEngine;
using UnityEngine.Rendering;

namespace JeuSurvie.Vegetation
{
    internal static class Instancing
    {
        /// <summary>16 floats in Babylon layout = Unity's column-major storage (see Core/RenderData/Instances.cs).</summary>
        public static Matrix4x4 FromBabylon(float[] a, int o)
        {
            var m = new Matrix4x4();
            m.m00 = a[o]; m.m10 = a[o + 1]; m.m20 = a[o + 2]; m.m30 = a[o + 3];
            m.m01 = a[o + 4]; m.m11 = a[o + 5]; m.m21 = a[o + 6]; m.m31 = a[o + 7];
            m.m02 = a[o + 8]; m.m12 = a[o + 9]; m.m22 = a[o + 10]; m.m32 = a[o + 11];
            m.m03 = a[o + 12]; m.m13 = a[o + 13]; m.m23 = a[o + 14]; m.m33 = a[o + 15];
            return m;
        }

        public static void Draw(IReadOnlyList<ModelPart> parts, Matrix4x4[] matrices, int count, Bounds bounds, ShadowCastingMode shadows)
        {
            if (count <= 0) return;
            foreach (ModelPart part in parts)
            {
                var rp = new RenderParams(part.Material)
                {
                    shadowCastingMode = shadows,
                    receiveShadows = true,
                    worldBounds = bounds,
                    lightProbeUsage = LightProbeUsage.Off,
                    reflectionProbeUsage = ReflectionProbeUsage.BlendProbesAndSkybox,
                };
                Graphics.RenderMeshInstanced(rp, part.Mesh, part.SubMesh, matrices, count);
            }
        }

        public static Bounds BoundsOf(Matrix4x4[] m, int count, float pad)
        {
            if (count == 0) return new Bounds(Vector3.zero, Vector3.one);
            Vector3 min = new Vector3(float.MaxValue, float.MaxValue, float.MaxValue), max = -min;
            for (int i = 0; i < count; i++)
            {
                Vector3 p = new Vector3(m[i].m03, m[i].m13, m[i].m23);
                min = Vector3.Min(min, p);
                max = Vector3.Max(max, p);
            }
            var b = new Bounds();
            b.SetMinMax(min - Vector3.one * pad, max + Vector3.one * pad);
            return b;
        }
    }

    public sealed class VegetationRenderer
    {
        private const float ChunkViewRadiusM = Chunk.Size * 1.41421356f / 2 + 6;
        private const double ShadowStepM = 8;

        private sealed class Batch { public float[] Matrices; public double RangeM; public bool Shown; }
        private sealed class ChunkVegetation { public int Cx, Cz; public Dictionary<string, Batch> Batches; }
        private sealed class ModelBuffers
        {
            public Matrix4x4[] Shown = new Matrix4x4[0];
            public int ShownCount;
            public Bounds ShownBounds;
            public Matrix4x4[] Near = new Matrix4x4[0];
            public int NearCount;
            public Bounds NearBounds;
        }

        private readonly ModelLibrary library;
        private readonly Dictionary<string, ChunkVegetation> chunks = new Dictionary<string, ChunkVegetation>();
        private readonly Dictionary<string, ModelBuffers> models = new Dictionary<string, ModelBuffers>();
        private readonly HashSet<string> dirty = new HashSet<string>();
        private double rangeScale = 1;
        private double shadowRadiusM;
        private double lastShadowX = double.NaN, lastShadowZ = double.NaN;
        private bool shadowsDirty = true;

        public VegetationRenderer(ModelLibrary library, double shadowRadiusM)
        {
            this.library = library;
            this.shadowRadiusM = shadowRadiusM;
        }

        public int Size => chunks.Count;

        public void SetRangeScale(double k) => rangeScale = k > 0 && !double.IsNaN(k) && !double.IsInfinity(k) ? k : 1;

        /// <summary>Radius (m) of the near shadow casters: shadow range + margin (0 = no shadows).</summary>
        public void SetShadowRadius(double radiusM)
        {
            shadowRadiusM = radiusM;
            shadowsDirty = true;
        }

        public void Add(string key, int cx, int cz, Dictionary<string, float[]> batches)
        {
            Remove(key);
            var made = new Dictionary<string, Batch>();
            foreach (var kv in batches)
            {
                if (library.PartsOf(kv.Key).Count == 0) continue;
                made[kv.Key] = new Batch { Matrices = kv.Value, RangeM = VegetationInstances.RangeM(kv.Key) };
            }
            chunks[key] = new ChunkVegetation { Cx = cx, Cz = cz, Batches = made };
            shadowsDirty = true;
        }

        public void Remove(string key)
        {
            if (!chunks.TryGetValue(key, out ChunkVegetation chunk)) return;
            foreach (var kv in chunk.Batches) if (kv.Value.Shown) dirty.Add(kv.Key);
            chunks.Remove(key);
            shadowsDirty = true;
        }

        /// <summary>Every frame: rebuilds what changed (range, view sector) then draws (one instanced draw per model part).</summary>
        public void Update(double playerX, double playerZ, ViewCull? view)
        {
            foreach (ChunkVegetation chunk in chunks.Values)
            {
                bool inView = view == null || ViewSectors.InSector(view.Value.Sector, view.Value.X, view.Value.Z, (chunk.Cx + 0.5) * Chunk.Size, (chunk.Cz + 0.5) * Chunk.Size, ChunkViewRadiusM);
                foreach (var kv in chunk.Batches)
                {
                    bool visible = inView && VegetationInstances.Visible(chunk.Cx, chunk.Cz, playerX, playerZ, kv.Value.RangeM * rangeScale);
                    if (visible == kv.Value.Shown) continue;
                    kv.Value.Shown = visible;
                    dirty.Add(kv.Key);
                }
            }
            foreach (string model in dirty) RebuildShown(model);
            dirty.Clear();
            double moved = Math.Sqrt((playerX - lastShadowX) * (playerX - lastShadowX) + (playerZ - lastShadowZ) * (playerZ - lastShadowZ));
            if (shadowsDirty || double.IsNaN(moved) || moved >= ShadowStepM)
            {
                lastShadowX = playerX;
                lastShadowZ = playerZ;
                shadowsDirty = false;
                foreach (string model in ShadowCasters.Models) RebuildNear(model, playerX, playerZ);
            }
            foreach (var kv in models)
            {
                IReadOnlyList<ModelPart> parts = library.PartsOf(kv.Key);
                Instancing.Draw(parts, kv.Value.Shown, kv.Value.ShownCount, kv.Value.ShownBounds, ShadowCastingMode.Off);
                Instancing.Draw(parts, kv.Value.Near, kv.Value.NearCount, kv.Value.NearBounds, ShadowCastingMode.ShadowsOnly);
            }
        }

        private ModelBuffers BuffersOf(string model)
        {
            if (!models.TryGetValue(model, out ModelBuffers b)) models[model] = b = new ModelBuffers();
            return b;
        }

        private void RebuildShown(string model)
        {
            ModelBuffers b = BuffersOf(model);
            int count = 0;
            foreach (ChunkVegetation chunk in chunks.Values)
                if (chunk.Batches.TryGetValue(model, out Batch batch) && batch.Shown) count += batch.Matrices.Length / 16;
            if (b.Shown.Length < count) b.Shown = new Matrix4x4[Mathf.NextPowerOfTwo(count)];
            int n = 0;
            foreach (ChunkVegetation chunk in chunks.Values)
            {
                if (!chunk.Batches.TryGetValue(model, out Batch batch) || !batch.Shown) continue;
                for (int o = 0; o < batch.Matrices.Length; o += 16) b.Shown[n++] = Instancing.FromBabylon(batch.Matrices, o);
            }
            b.ShownCount = n;
            b.ShownBounds = Instancing.BoundsOf(b.Shown, n, 20);
        }

        private void RebuildNear(string model, double x, double z)
        {
            if (library.PartsOf(model).Count == 0) return;
            ModelBuffers b = BuffersOf(model);
            b.NearCount = 0;
            if (shadowRadiusM <= 0) return;
            var near = new List<float>();
            foreach (ChunkVegetation chunk in chunks.Values)
            {
                if (!chunk.Batches.TryGetValue(model, out Batch batch) || !VegetationInstances.Visible(chunk.Cx, chunk.Cz, x, z, shadowRadiusM)) continue;
                VegetationInstances.CopyWithin(batch.Matrices, x, z, shadowRadiusM, near);
            }
            int count = near.Count / 16;
            if (b.Near.Length < count) b.Near = new Matrix4x4[Mathf.NextPowerOfTwo(count)];
            float[] flat = near.ToArray();
            for (int i = 0; i < count; i++) b.Near[i] = Instancing.FromBabylon(flat, i * 16);
            b.NearCount = count;
            b.NearBounds = Instancing.BoundsOf(b.Near, count, 20);
        }
    }

    public sealed class GroundCoverRenderer
    {
        private const double DefaultStepM = 2.5, Growth = 1.25;
        private sealed class ChunkCover { public int Cx, Cz; public Dictionary<string, float[]> Batches; }
        private sealed class ModelState { public float[] Buffer = new float[0]; public Matrix4x4[] Matrices = new Matrix4x4[0]; public int Count; public Bounds Bounds; }

        private readonly ModelLibrary library;
        private readonly Dictionary<string, ChunkCover> chunks = new Dictionary<string, ChunkCover>();
        private readonly Dictionary<string, ModelState> models = new Dictionary<string, ModelState>();
        private double radiusM, density;
        private readonly double fadeM = GroundCoverInstances.CoverFadeM;
        private double lastX = double.NaN, lastZ = double.NaN;
        private ViewSector? lastSector;
        private bool dirty = true;
        public int Rebuilds { get; private set; }

        public GroundCoverRenderer(ModelLibrary library, double radiusM, double density)
        {
            this.library = library;
            this.radiusM = radiusM;
            this.density = density;
        }

        public double Radius => radiusM;

        public void SetReach(double radius, double densityShare)
        {
            if (radius > fadeM && !double.IsNaN(radius)) radiusM = radius;
            density = double.IsNaN(densityShare) ? 1 : Math.Min(1, Math.Max(0.05, densityShare));
            dirty = true;
        }

        public void Add(string key, int cx, int cz, Dictionary<string, float[]> batches)
        {
            var made = new Dictionary<string, float[]>();
            foreach (var kv in batches) if (library.PartsOf(kv.Key).Count > 0) made[kv.Key] = kv.Value;
            chunks[key] = new ChunkCover { Cx = cx, Cz = cz, Batches = made };
            dirty = true;
        }

        public void Remove(string key)
        {
            if (chunks.Remove(key)) dirty = true;
        }

        public void Update(double px, double pz, ViewCull? view)
        {
            double moved = Math.Sqrt((px - lastX) * (px - lastX) + (pz - lastZ) * (pz - lastZ));
            bool turned = !ViewSectors.Same(view?.Sector, lastSector);
            if (dirty || double.IsNaN(moved) || moved >= DefaultStepM || turned)
            {
                lastX = px;
                lastZ = pz;
                lastSector = view?.Sector;
                dirty = false;
                Rebuild(px, pz, view);
            }
            foreach (var kv in models)
                Instancing.Draw(library.PartsOf(kv.Key), kv.Value.Matrices, kv.Value.Count, kv.Value.Bounds, ShadowCastingMode.Off);
        }

        private void Rebuild(double px, double pz, ViewCull? view)
        {
            Rebuilds++;
            var near = new List<ChunkCover>();
            foreach (ChunkCover c in chunks.Values)
                if (VegetationInstances.Visible(c.Cx, c.Cz, px, pz, radiusM)) near.Add(c);
            var keys = new HashSet<string>(models.Keys);
            foreach (ChunkCover c in near) foreach (string k in c.Batches.Keys) keys.Add(k);
            foreach (string model in keys)
            {
                if (!models.TryGetValue(model, out ModelState state)) models[model] = state = new ModelState();
                int needed = 0;
                foreach (ChunkCover c in near) if (c.Batches.TryGetValue(model, out float[] b)) needed += b.Length / 16;
                if (state.Buffer.Length < needed * 16) state.Buffer = new float[(int)Math.Ceiling(needed * Growth) * 16];
                int count = 0;
                foreach (ChunkCover c in near)
                    if (c.Batches.TryGetValue(model, out float[] b)) count = GroundCoverInstances.Shrink(b, px, pz, count, radiusM, fadeM, state.Buffer, density, view);
                if (state.Matrices.Length < count) state.Matrices = new Matrix4x4[Mathf.NextPowerOfTwo(count)];
                for (int i = 0; i < count; i++) state.Matrices[i] = Instancing.FromBabylon(state.Buffer, i * 16);
                state.Count = count;
                state.Bounds = Instancing.BoundsOf(state.Matrices, count, 5);
            }
        }

        /// <summary>Instances, triangles and draw calls (debug panel line « Couvre-sol »).</summary>
        public (int instances, long triangles, int drawCalls, int chunks) Stats()
        {
            int instances = 0, calls = 0;
            long triangles = 0;
            foreach (var kv in models)
            {
                if (kv.Value.Count == 0) continue;
                instances += kv.Value.Count;
                foreach (ModelPart p in library.PartsOf(kv.Key))
                {
                    triangles += (long)p.Triangles * kv.Value.Count;
                    calls++;
                }
            }
            return (instances, triangles, calls, chunks.Count);
        }
    }
}
