// Port of babylon/asset-library: each nature model (glTF from the original Babylon assets) is loaded once with glTFast, its
// transforms baked into the vertices, and its materials converted — foliage (leaves, grass, flowers…) to the instanced Foliage
// shader (wind, tints, translucency), solid matters (rocks, bark, mushrooms) to the NaturePBR shader (surface roughness, normal
// maps attached by material name, wetness, night glow). Missing or unreadable models are skipped (the game continues without
// them), exactly like the original.
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using JeuSurvie.Core.RenderData;
using UnityEngine;
using UnityEngine.Rendering;
#if JEUSURVIE_GLTFAST
using GLTFast;
#endif

namespace JeuSurvie.Vegetation
{
    /// <summary>One drawable part of a model: a sub-mesh and its converted material.</summary>
    public sealed class ModelPart
    {
        public Mesh Mesh;
        public int SubMesh;
        public Material Material;
        public string MaterialName;
        public int Triangles;
    }

    public sealed class ModelLibrary
    {
        private const float NormalMapAnisotropy = 4;
        private readonly string baseDir;
        private readonly Shader foliageShader, pbrShader;
        private readonly Dictionary<string, List<ModelPart>> parts = new Dictionary<string, List<ModelPart>>();
        private readonly Dictionary<string, Texture2D> normalMaps = new Dictionary<string, Texture2D>();
        private readonly Transform hidden;
        public readonly List<Material> GlowingMaterials = new List<Material>();

        public ModelLibrary(string baseDir, Shader foliageShader, Shader pbrShader)
        {
            this.baseDir = baseDir;
            this.foliageShader = foliageShader;
            this.pbrShader = pbrShader;
            var go = new GameObject("Bibliothèque de modèles (cachée)");
            go.SetActive(false);
            hidden = go.transform;
        }

        public IReadOnlyList<ModelPart> PartsOf(string key) => parts.TryGetValue(key, out var p) ? p : (IReadOnlyList<ModelPart>)Array.Empty<ModelPart>();

        /// <summary>Loads the `key.gltf` models; the others load even if one fails; then throws naming the missing ones.</summary>
        public async Task LoadAsync(IEnumerable<string> keys)
        {
            var failed = new List<string>();
            var tasks = new List<(string key, Task task)>();
            foreach (string key in keys) tasks.Add((key, LoadOne(key)));
            foreach (var (key, task) in tasks)
            {
                try { await task; }
                catch (Exception e)
                {
                    failed.Add(key);
                    Debug.LogWarning($"Modèle « {key} » illisible : {e.Message}");
                }
            }
            if (failed.Count > 0) throw new IOException("modèles illisibles : " + string.Join(", ", failed));
        }

        private async Task LoadOne(string key)
        {
#if JEUSURVIE_GLTFAST
            string path = Path.Combine(baseDir, key + ".gltf");
            if (!File.Exists(path)) throw new FileNotFoundException(path);
            var gltf = new GltfImport(null, null, new SourceMaterialGenerator(pbrShader), new GLTFast.Logging.ConsoleLogger());
            var settings = new ImportSettings { AnimationMethod = AnimationMethod.None, GenerateMipMaps = true, AnisotropicFilterLevel = 4 };
            if (!await gltf.Load(new Uri(Path.GetFullPath(path)).AbsoluteUri, settings)) throw new IOException("chargement glTF refusé : " + path);
            var holder = new GameObject(key);
            holder.transform.SetParent(hidden, false);
            if (!await gltf.InstantiateMainSceneAsync(holder.transform)) throw new IOException("instanciation glTF refusée : " + path);
            var sourceByMaterial = new Dictionary<Material, GLTFast.Schema.MaterialBase>();
            for (int i = 0; i < gltf.MaterialCount; i++)
            {
                Material m = gltf.GetMaterial(i);
                if (m != null) sourceByMaterial[m] = gltf.GetSourceMaterial(i);
            }
            var list = new List<ModelPart>();
            var converted = new Dictionary<Material, Material>();
            Matrix4x4 toModel = holder.transform.worldToLocalMatrix;
            foreach (MeshFilter filter in holder.GetComponentsInChildren<MeshFilter>(true))
            {
                Mesh source = filter.sharedMesh;
                if (source == null || source.vertexCount == 0) continue;
                MeshRenderer renderer = filter.GetComponent<MeshRenderer>();
                Mesh mesh = Bake(source, toModel * filter.transform.localToWorldMatrix);
                Material[] materials = renderer != null ? renderer.sharedMaterials : Array.Empty<Material>();
                for (int s = 0; s < mesh.subMeshCount; s++)
                {
                    Material src = s < materials.Length ? materials[s] : null;
                    if (src == null) continue;
                    if (!converted.TryGetValue(src, out Material mat))
                    {
                        sourceByMaterial.TryGetValue(src, out GLTFast.Schema.MaterialBase schema);
                        mat = Convert(src, schema, mesh.HasVertexAttribute(VertexAttribute.Color));
                        converted[src] = mat;
                    }
                    list.Add(new ModelPart { Mesh = mesh, SubMesh = s, Material = mat, MaterialName = MaterialNameOf(src), Triangles = (int)(mesh.GetIndexCount(s) / 3) });
                }
            }
            UnityEngine.Object.Destroy(holder);
            parts[key] = list;
#else
            await Task.Yield();
            throw new NotSupportedException("glTFast (com.unity.cloud.gltfast) n'est pas installé : modèles 3D indisponibles.");
#endif
        }

        /// <summary>glTFast names Unity materials after the glTF material.</summary>
        private static string MaterialNameOf(Material m) => m.name.Replace(" (Instance)", "");

        /// <summary>Copy of the mesh with the node transform baked into vertices and normals (bakeCurrentTransformIntoVertices).</summary>
        private static Mesh Bake(Mesh source, Matrix4x4 m)
        {
            Mesh mesh = UnityEngine.Object.Instantiate(source);
            mesh.name = source.name;
            var v = mesh.vertices;
            for (int i = 0; i < v.Length; i++) v[i] = m.MultiplyPoint3x4(v[i]);
            mesh.vertices = v;
            var n = mesh.normals;
            if (n != null && n.Length == v.Length)
            {
                Matrix4x4 nm = m.inverse.transpose;
                for (int i = 0; i < n.Length; i++) n[i] = nm.MultiplyVector(n[i]).normalized;
                mesh.normals = n;
            }
            if (m.determinant < 0)
            {
                for (int s = 0; s < mesh.subMeshCount; s++)
                {
                    int[] tri = mesh.GetTriangles(s);
                    for (int i = 0; i < tri.Length; i += 3) (tri[i + 1], tri[i + 2]) = (tri[i + 2], tri[i + 1]);
                    mesh.SetTriangles(tri, s);
                }
            }
            mesh.RecalculateBounds();
            mesh.UploadMeshData(false);
            return mesh;
        }

#if JEUSURVIE_GLTFAST
        private Material Convert(Material src, GLTFast.Schema.MaterialBase schema, bool hasVertexColors)
        {
            string name = MaterialNameOf(src);
            Texture tex = TextureOf(src);
            Color baseColor = ColorOf(src);
            bool doubleSided = schema != null && schema.doubleSided;
            var alphaMode = schema != null ? schema.GetAlphaMode() : GLTFast.Schema.MaterialBase.AlphaMode.Opaque;
            float cutoff = alphaMode == GLTFast.Schema.MaterialBase.AlphaMode.Mask ? schema.alphaCutoff : alphaMode == GLTFast.Schema.MaterialBase.AlphaMode.Blend ? 0.5f : 0f;
            bool baked = hasVertexColors && Foliage.UsesBakedShading(name);
            if (Foliage.IsFoliageMaterial(name))
            {
                var m = new Material(foliageShader) { name = name, enableInstancing = true };
                if (tex != null) m.SetTexture("_BaseMap", tex);
                m.SetVector("_BaseColor", baseColor);
                m.SetFloat("_Cutoff", cutoff > 0 ? cutoff : 0.5f);
                m.SetFloat("_Cull", doubleSided ? (float)CullMode.Off : (float)CullMode.Back);
                m.SetFloat("_UseVertexColor", baked ? 1 : 0);
                FoliageProfile? profile = Foliage.ProfileFor(name);
                if (profile != null)
                {
                    FoliageProfile p = profile.Value;
                    var (saturation, value) = Foliage.Albedo(p.Kind);
                    m.SetVector("_FoliageParams", new Vector4((float)p.HeightRefM, (float)p.WindM, (float)p.Gradient, Foliage.Mode(p.Kind)));
                    m.SetVector("_FoliageAlbedo", new Vector4((float)saturation, (float)value, (float)Foliage.UpNormal(p.Kind), (float)Foliage.Translucency(p.Kind)));
                }
                else
                {
                    m.SetVector("_FoliageParams", new Vector4(1, 0, 0, 0));
                    m.SetVector("_FoliageAlbedo", new Vector4(1, 1, 0, 0));
                }
                return m;
            }
            var pbr = new Material(pbrShader) { name = name, enableInstancing = true };
            SurfaceSpec surface = Surfaces.For(name);
            if (tex != null) pbr.SetTexture("_BaseMap", tex);
            pbr.SetVector("_BaseColor", baseColor);
            pbr.SetFloat("_Metallic", (float)surface.Metallic);
            pbr.SetFloat("_Roughness", (float)surface.Roughness);
            pbr.SetFloat("_EnvIntensity", (float)surface.EnvironmentIntensity);
            pbr.SetFloat("_UseVertexColor", baked ? 1 : 0);
            pbr.SetFloat("_Cutoff", cutoff);
            pbr.SetFloat("_Cull", doubleSided ? (float)CullMode.Off : (float)CullMode.Back);
            NormalMapSpec? normal = Surfaces.NormalMapFor(name);
            if (normal != null)
            {
                Texture2D map = NormalMap(normal.Value.File);
                if (map != null)
                {
                    pbr.SetTexture("_BumpMap", map);
                    pbr.SetFloat("_BumpScale", (float)normal.Value.Level);
                }
            }
            if (name.IndexOf("mushroom", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                pbr.SetFloat("_Glow", 1);
                GlowingMaterials.Add(pbr);
            }
            return pbr;
        }
#endif

        public static Texture TextureOf(Material m)
        {
            foreach (string p in new[] { "baseColorTexture", "_BaseMap", "_MainTex" })
                if (m.HasProperty(p) && m.GetTexture(p) != null) return m.GetTexture(p);
            return null;
        }

        public static Color ColorOf(Material m)
        {
            foreach (string p in new[] { "baseColorFactor", "_BaseColor", "_Color" })
                if (m.HasProperty(p)) return m.GetColor(p).linear;
            return Color.white;
        }

        /// <summary>Normal map PNG next to the models (loaded once, linear, anisotropic).</summary>
        private Texture2D NormalMap(string file)
        {
            if (normalMaps.TryGetValue(file, out Texture2D t)) return t;
            string path = Path.Combine(baseDir, file);
            Texture2D tex = null;
            if (File.Exists(path))
            {
                tex = new Texture2D(2, 2, TextureFormat.RGBA32, true, true) { name = file, anisoLevel = (int)NormalMapAnisotropy, wrapMode = TextureWrapMode.Repeat };
                if (!tex.LoadImage(File.ReadAllBytes(path), false)) tex = null;
            }
            normalMaps[file] = tex;
            return tex;
        }
    }
}
