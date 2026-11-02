// Port of babylon/terrain-renderer: one Unity mesh per chunk (vertex palette colours + layer weights in UV0), one shared
// physical ground material fed by the GPU-generated matters; texture size, filtering and matter maps follow the profile.
using System.Collections.Generic;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.World;
using JeuSurvie.Rendering;
using UnityEngine;
using UnityEngine.Rendering;

namespace JeuSurvie.World
{
    public sealed class TerrainRenderer
    {
        public const float EnvironmentIntensity = 0.3f;
        private readonly Dictionary<string, GameObject> chunks = new Dictionary<string, GameObject>();
        private readonly Transform root;
        private readonly Material generator;
        public readonly Material Material;
        private GroundTextures textures;
        private TerrainQuality quality;
        private static readonly int Tiles = Shader.PropertyToID("_TerrainTiles");
        private static readonly int DefaultRough = Shader.PropertyToID("_DefaultRough");

        public TerrainRenderer(Shader terrainShader, Shader matterShader, TerrainQuality quality)
        {
            root = new GameObject("Terrain (chunks)").transform;
            Material = new Material(terrainShader) { name = "terrain" };
            Material.SetFloat("_EnvIntensity", EnvironmentIntensity);
            var t = new Vector4();
            var r = new Vector4();
            for (int i = 0; i < 4; i++)
            {
                SurfaceLayerSpec spec = Surfaces.Layer(GroundTextures.Layers[i]);
                t[i] = (float)(1 / spec.TileM);
                r[i] = (float)spec.Roughness;
            }
            Material.SetVector(Tiles, t);
            Material.SetVector(DefaultRough, r);
            generator = matterShader != null ? new Material(matterShader) { name = "generateur-sol" } : null;
            this.quality = quality;
            Rebuild();
        }

        public int Size => chunks.Count;

        private void Rebuild()
        {
            textures?.Dispose();
            textures = generator != null ? new GroundTextures(generator, quality.TextureSize, quality.Anisotropy) : null;
            textures?.Bind(Material);
            if (quality.NormalMaps) Material.EnableKeyword("_TSNORMALS"); else Material.DisableKeyword("_TSNORMALS");
        }

        public void SetQuality(TerrainQuality q)
        {
            bool sizeChanged = q.TextureSize != quality.TextureSize;
            quality = q;
            if (sizeChanged) Rebuild();
            else
            {
                textures?.SetAnisotropy(q.Anisotropy);
                if (q.NormalMaps) Material.EnableKeyword("_TSNORMALS"); else Material.DisableKeyword("_TSNORMALS");
            }
        }

        public void Add(string key, int cx, int cz, ChunkMeshData data)
        {
            Remove(key);
            int n = data.Positions.Length / 3;
            var vertices = new Vector3[n];
            var normals = new Vector3[n];
            var colors = new Color[n];
            var layers = new List<Vector3>(n);
            for (int i = 0; i < n; i++)
            {
                vertices[i] = new Vector3(data.Positions[i * 3], data.Positions[i * 3 + 1], data.Positions[i * 3 + 2]);
                normals[i] = new Vector3(data.Normals[i * 3], data.Normals[i * 3 + 1], data.Normals[i * 3 + 2]);
                colors[i] = new Color(data.Colors[i * 4], data.Colors[i * 4 + 1], data.Colors[i * 4 + 2], data.Colors[i * 4 + 3]);
                layers.Add(new Vector3(data.Layers[i * 3], data.Layers[i * 3 + 1], data.Layers[i * 3 + 2]));
            }
            var mesh = new Mesh { name = "chunk " + key };
            mesh.vertices = vertices;
            mesh.normals = normals;
            mesh.colors = colors;
            mesh.SetUVs(0, layers);
            mesh.SetIndices(UnityWinding.FromCore(data.Indices), MeshTopology.Triangles, 0, true);
            mesh.UploadMeshData(true);
            var go = new GameObject("chunk " + key);
            go.transform.SetParent(root, false);
            go.transform.position = new Vector3(cx * Chunk.Size, 0, cz * Chunk.Size);
            go.isStatic = false;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = Material;
            renderer.shadowCastingMode = ShadowCastingMode.Off; // like the original: the ground receives, vegetation and characters cast
            renderer.receiveShadows = true;
            renderer.lightProbeUsage = LightProbeUsage.Off;
            renderer.reflectionProbeUsage = ReflectionProbeUsage.BlendProbesAndSkybox;
            chunks[key] = go;
        }

        public void Remove(string key)
        {
            if (!chunks.TryGetValue(key, out GameObject go)) return;
            Object.Destroy(go.GetComponent<MeshFilter>().sharedMesh);
            Object.Destroy(go);
            chunks.Remove(key);
        }
    }
}
