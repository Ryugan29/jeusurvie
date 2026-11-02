// Port of babylon/far-terrain-renderer: one coarse mesh of the real terrain over kilometres (render-data/far-terrain), built on a
// background thread and re-centred when the player has moved away; drawn only beyond the loaded chunks, fading into the haze.
using System;
using System.Threading.Tasks;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;
using UnityEngine;
using UnityEngine.Rendering;

namespace JeuSurvie.World
{
    public sealed class FarTerrainRenderer
    {
        private const float Roughness = 0.9f;
        private const double FarWetDarken = Surfaces.WetAlbedoDarken * 0.75;
        private readonly uint seed;
        private readonly double halfSizeM, stepM, innerRadiusM, recenterM, sinkM;
        public readonly Material Material;
        private readonly GameObject go;
        private readonly MeshFilter filter;
        private Task<FarTerrainMesh> pending;
        private Vec2XZ? shown;
        private float albedoFactor = 1, roughness = Roughness;
        private static readonly int FarParams = Shader.PropertyToID("_FarParams"), FarCenter = Shader.PropertyToID("_FarCenter");

        public FarTerrainRenderer(Shader shader, uint seed, double halfSizeM, double stepM, double innerRadiusM, double recenterM, double sinkM)
        {
            this.seed = seed;
            this.halfSizeM = halfSizeM;
            this.stepM = stepM;
            this.innerRadiusM = innerRadiusM;
            this.recenterM = recenterM;
            this.sinkM = sinkM;
            Material = new Material(shader) { name = "relief-lointain" };
            Material.SetFloat("_EnvIntensity", 0.3f);
            go = new GameObject("Relief lointain");
            filter = go.AddComponent<MeshFilter>();
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = Material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = true;
            renderer.enabled = false;
        }

        public void SetWetness(double wetness)
        {
            double w = MathUtil.Clamp01(wetness);
            albedoFactor = (float)(1 - FarWetDarken * w);
            roughness = (float)(Roughness + (Surfaces.WetRoughness - Roughness) * w * 0.75);
        }

        public void Update(double playerX, double playerZ)
        {
            Vec2XZ c = shown ?? new Vec2XZ(0, 0);
            Material.SetVector(FarParams, new Vector4((float)playerX, (float)playerZ, (float)innerRadiusM, (float)halfSizeM));
            Material.SetVector(FarCenter, new Vector4((float)c.X, (float)c.Z, albedoFactor, roughness));
            if (pending != null)
            {
                if (!pending.IsCompleted) return;
                if (pending.Status == TaskStatus.RanToCompletion) Show(pending.Result);
                else Debug.LogError("Relief lointain illisible : " + pending.Exception);
                pending = null;
                return;
            }
            Vec2XZ wanted = FarTerrain.CenterFor(playerX, playerZ, recenterM);
            if (shown != null && shown.Value.X == wanted.X && shown.Value.Z == wanted.Z) return;
            double h = halfSizeM, s = stepM;
            uint sd = seed;
            pending = Task.Run(() => FarTerrain.Build(sd, wanted.X, wanted.Z, h, s));
        }

        private void Show(FarTerrainMesh m)
        {
            int n = m.Positions.Length / 3;
            var vertices = new Vector3[n];
            var normals = new Vector3[n];
            var colors = new Color[n];
            for (int i = 0; i < n; i++)
            {
                vertices[i] = new Vector3(m.Positions[i * 3], m.Positions[i * 3 + 1], m.Positions[i * 3 + 2]);
                normals[i] = new Vector3(m.Normals[i * 3], m.Normals[i * 3 + 1], m.Normals[i * 3 + 2]);
                colors[i] = new Color(m.Colors[i * 4], m.Colors[i * 4 + 1], m.Colors[i * 4 + 2], 1);
            }
            var mesh = new Mesh { name = "relief-lointain", indexFormat = IndexFormat.UInt32 };
            mesh.vertices = vertices;
            mesh.normals = normals;
            mesh.colors = colors;
            mesh.SetIndices(m.Indices, MeshTopology.Triangles, 0, true);
            mesh.UploadMeshData(true);
            if (filter.sharedMesh != null) UnityEngine.Object.Destroy(filter.sharedMesh);
            filter.sharedMesh = mesh;
            go.transform.position = new Vector3((float)m.CenterX, (float)-sinkM, (float)m.CenterZ);
            go.GetComponent<MeshRenderer>().enabled = true;
            shown = new Vec2XZ(m.CenterX, m.CenterZ);
        }

        public void Dispose()
        {
            if (filter.sharedMesh != null) UnityEngine.Object.Destroy(filter.sharedMesh);
            UnityEngine.Object.Destroy(go);
        }
    }
}
