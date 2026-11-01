// Port of render-data/instance-matrices.ts, vegetation-instances.ts, ground-cover-instances.ts, shadow-casters.ts.
// Matrices are 16 floats in the Babylon row-major layout (translation at 12..14). That memory layout is EXACTLY Unity's
// column-major Matrix4x4 storage (m00, m10, m20, m30, m01, …): the runtime copies them as is.
using System;
using System.Collections.Generic;
using System.Linq;
using JeuSurvie.Core.Physics;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.World;

namespace JeuSurvie.Core.RenderData
{
    public static class InstanceMatrices
    {
        /// <summary>One matrix per item, grouped by model (list order): Y rotation, uniform scale, on the chunk ground, sunk.</summary>
        public static Dictionary<string, float[]> Build<T>(IReadOnlyList<T> items, Func<T, string> modelOf, Func<T, (double x, double z, double rotation, double scale)> placed,
            ChunkData chunk, double sinkM, Func<string, double> heightScaleOf = null)
        {
            var counts = new Dictionary<string, int>();
            var order = new List<string>();
            foreach (T item in items)
            {
                string m = modelOf(item);
                if (!counts.ContainsKey(m)) { counts[m] = 0; order.Add(m); }
                counts[m]++;
            }
            var output = new Dictionary<string, float[]>();
            foreach (string m in order) output[m] = new float[counts[m] * 16];
            var filled = new Dictionary<string, int>();
            double ox = chunk.Cx * (double)Chunk.Size, oz = chunk.Cz * (double)Chunk.Size;
            foreach (T item in items)
            {
                string model = modelOf(item);
                filled.TryGetValue(model, out int k);
                filled[model] = k + 1;
                var p = placed(item);
                double angle = p.rotation * 2 * Math.PI, c = Math.Cos(angle), s = Math.Sin(angle), sc = p.scale;
                double sy = sc * (heightScaleOf?.Invoke(model) ?? 1);
                double y = (Ground.HeightIn(chunk.Heights, ox, oz, p.x, p.z) ?? 0) - sinkM * sy;
                float[] a = output[model];
                int o = k * 16;
                a[o] = (float)(c * sc); a[o + 1] = 0; a[o + 2] = (float)(-s * sc); a[o + 3] = 0;
                a[o + 4] = 0; a[o + 5] = (float)sy; a[o + 6] = 0; a[o + 7] = 0;
                a[o + 8] = (float)(s * sc); a[o + 9] = 0; a[o + 10] = (float)(c * sc); a[o + 11] = 0;
                a[o + 12] = (float)p.x; a[o + 13] = (float)y; a[o + 14] = (float)p.z; a[o + 15] = 1;
            }
            return output;
        }
    }

    public static class VegetationInstances
    {
        public const double SinkM = 0.15;

        private static double RangeOfKind(ResourceKind k)
        {
            switch (k)
            {
                case ResourceKind.Tree:
                case ResourceKind.Pine: return 600;
                case ResourceKind.Bush:
                case ResourceKind.Rock: return 280;
                default: return 110;
            }
        }

        private static readonly Dictionary<string, double> RangeByModel = BuildRanges();

        private static Dictionary<string, double> BuildRanges()
        {
            var d = new Dictionary<string, double>();
            foreach (var kv in ResourceModels.VegetationModels)
                foreach (string m in kv.Value) d[m] = RangeOfKind(kv.Key);
            return d;
        }

        public static double RangeM(string modelKey)
        {
            if (!RangeByModel.TryGetValue(modelKey, out double r)) throw new ArgumentException("modèle de végétation inconnu : " + modelKey);
            return r;
        }

        /// <summary>A chunk batch is drawn if the nearest edge of chunk (cx, cz) is within range of the player.</summary>
        public static bool Visible(int cx, int cz, double px, double pz, double rangeM)
        {
            double dx = Math.Max(Math.Max(cx * (double)Chunk.Size - px, 0), px - (cx + 1) * (double)Chunk.Size);
            double dz = Math.Max(Math.Max(cz * (double)Chunk.Size - pz, 0), pz - (cz + 1) * (double)Chunk.Size);
            return MathUtil.Hypot(dx, dz) <= rangeM;
        }

        /// <summary>Count of matrices (16 floats each) of `matrices` within `radiusM` (horizontal) of (x, z), copied into `into` from index `at`.</summary>
        public static int CopyWithin(float[] matrices, double x, double z, double radiusM, List<float> into)
        {
            int count = matrices.Length / 16, n = 0;
            double r2 = radiusM * radiusM;
            for (int i = 0; i < count; i++)
            {
                double dx = matrices[i * 16 + 12] - x, dz = matrices[i * 16 + 14] - z;
                if (dx * dx + dz * dz <= r2)
                {
                    for (int k = 0; k < 16; k++) into.Add(matrices[i * 16 + k]);
                    n++;
                }
            }
            return n;
        }

        public static Dictionary<string, float[]> Build(IReadOnlyList<Resource> resources, ChunkData chunk) =>
            InstanceMatrices.Build(resources, ResourceModels.ModelKeyFor, r => (r.X, r.Z, r.Rotation, r.Scale), chunk, SinkM);
    }

    public static class ShadowCasters
    {
        public static readonly ResourceKind[] Kinds = { ResourceKind.Tree, ResourceKind.Pine, ResourceKind.Bush, ResourceKind.Rock };
        public static readonly string[] Models = Kinds.SelectMany(k => ResourceModels.VegetationModels[k]).Distinct().ToArray();
        private static readonly HashSet<string> Casters = new HashSet<string>(Models);
        public static bool CastsShadow(string modelKey) => Casters.Contains(modelKey);
    }

    public static class GroundCoverInstances
    {
        public const double CoverRadiusM = 70, CoverFadeM = 25, SinkM = 0.03;
        private const double CoverViewRadiusM = 1, MinVisibleScale = 0.02;
        private static readonly int[] Scaled = { 0, 1, 2, 4, 5, 6, 8, 9, 10 };

        public static double GrassHeightScale(string model) => model == "Grass_Common_Short" ? 0.4 : model == "Grass_Common_Tall" ? 0.45 : 1;

        public static Dictionary<string, float[]> Build(IReadOnlyList<CoverItem> items, ChunkData chunk) =>
            InstanceMatrices.Build(items, i => i.Model, i => (i.X, i.Z, i.Rotation, i.Scale), chunk, SinkM, GrassHeightScale);

        public static double CoverScaleAt(double distanceM, double radiusM, double fadeM)
        {
            double t = Math.Min(1, Math.Max(0, (radiusM - distanceM) / fadeM));
            return t * t * (3 - 2 * t);
        }

        /// <summary>Fixed draw per position: is the item at (x, z) kept when only `density` of the cover is drawn?</summary>
        public static bool CoverKept(double x, double z, double density)
        {
            if (density >= 1) return true;
            unchecked
            {
                int h = (int)(long)MathUtil.JsRound(x * 64) * 0x27d4eb2d ^ (int)(long)MathUtil.JsRound(z * 64) * 0x165667b1;
                h = (h ^ (int)((uint)h >> 15)) * (int)0x85ebca6b;
                h ^= (int)((uint)h >> 13);
                return (uint)h / 4294967296.0 < density;
            }
        }

        /// <summary>Copies into `output` from instance `at` the in-range instances of `src`, scale × CoverScaleAt. Returns the new total.</summary>
        public static int Shrink(float[] src, double px, double pz, int at, double radiusM, double fadeM, float[] output, double density = 1, ViewCull? view = null)
        {
            int capacity = output.Length / 16;
            int n = at;
            for (int i = 0; i + 16 <= src.Length && n < capacity; i += 16)
            {
                double dx = src[i + 12] - px, dz = src[i + 14] - pz;
                double d2 = dx * dx + dz * dz;
                if (d2 >= radiusM * radiusM) continue;
                double f = CoverScaleAt(Math.Sqrt(d2), radiusM, fadeM);
                if (f < MinVisibleScale || !CoverKept(src[i + 12], src[i + 14], density)) continue;
                if (view != null && !ViewSectors.InSector(view.Value.Sector, view.Value.X, view.Value.Z, src[i + 12], src[i + 14], CoverViewRadiusM)) continue;
                int o = n * 16;
                for (int k = 0; k < 16; k++) output[o + k] = src[i + k];
                foreach (int k in Scaled) output[o + k] = (float)(src[i + k] * f);
                n++;
            }
            return n;
        }
    }
}
