// Ports of babylon/animated-model and capsule:
//   - an animated model (character, creature) loaded from glTF (glTFast, legacy animation clips), fitted to a height with its
//     feet on the origin of its « pivot » (position = feet, yaw = heading), materials converted to NaturePBR (surfaces by name,
//     optional tints, PBR maps and LOD copies carried over from the glTF).
// The heroine's animations are her own clips (ClipLibrary, CharacterAnimator): no other skeleton is copied any more.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using JeuSurvie.Core.RenderData;
using UnityEngine;
using UnityEngine.Rendering;
#if JEUSURVIE_GLTFAST
using GLTFast;
#endif

namespace JeuSurvie.Characters
{
    public sealed class AnimatedModel
    {
        /// <summary>Node to move: position = feet, rotation = heading. Its scale fits the model to its height: do not touch.</summary>
        public Transform Pivot;
        public readonly List<Renderer> Renderers = new List<Renderer>();
        public readonly Dictionary<string, Transform> Nodes = new Dictionary<string, Transform>();
        public Animation Animation;

        public void SetVisible(bool visible) => Pivot.gameObject.SetActive(visible);
    }

    public static class CharacterLoader
    {
        /// <summary>Loads `path`, fits it to `heightM`, converts its materials; `tints` multiply a material colour by name.</summary>
        public static async Task<AnimatedModel> LoadAsync(string path, double heightM, Shader pbrShader, IReadOnlyDictionary<string, Color> tints = null, bool render = true)
        {
#if JEUSURVIE_GLTFAST
            if (!File.Exists(path)) throw new FileNotFoundException(path);
            var gltf = new GltfImport(null, null, new Vegetation.SourceMaterialGenerator(pbrShader), new GLTFast.Logging.ConsoleLogger());
            var settings = new ImportSettings { AnimationMethod = AnimationMethod.Legacy, GenerateMipMaps = true };
            if (!await gltf.Load(new Uri(Path.GetFullPath(path)).AbsoluteUri, settings)) throw new IOException("chargement glTF refusé : " + path);
            var pivot = new GameObject("pivot " + Path.GetFileNameWithoutExtension(path)).transform;
            var fit = new GameObject("fit").transform;
            fit.SetParent(pivot, false);
            if (!await gltf.InstantiateMainSceneAsync(fit)) throw new IOException("instanciation glTF refusée : " + path);
            var model = new AnimatedModel { Pivot = pivot };
            foreach (Transform t in fit.GetComponentsInChildren<Transform>(true)) if (!model.Nodes.ContainsKey(t.name)) model.Nodes[t.name] = t;
            model.Animation = fit.GetComponentInChildren<Animation>(true);
            if (model.Animation != null)
            {
                model.Animation.cullingType = AnimationCullingType.AlwaysAnimate;
                model.Animation.playAutomatically = false;
                model.Animation.Stop();
            }
            var converted = new Dictionary<Material, Material>();
            foreach (Renderer r in fit.GetComponentsInChildren<Renderer>(true))
            {
                if (r is SkinnedMeshRenderer smr) smr.updateWhenOffscreen = true; // skinned: its rest box does not say where it is drawn
                Material[] mats = r.sharedMaterials;
                for (int i = 0; i < mats.Length; i++)
                {
                    if (mats[i] == null) continue;
                    if (!converted.TryGetValue(mats[i], out Material m))
                    {
                        string name = mats[i].name.Replace(" (Instance)", "");
                        m = new Material(pbrShader) { name = name };
                        Texture tex = Vegetation.ModelLibrary.TextureOf(mats[i]);
                        if (tex != null) m.SetTexture("_BaseMap", tex);
                        Color c = Vegetation.ModelLibrary.ColorOf(mats[i]);
                        if (tints != null && tints.TryGetValue(name, out Color tint)) c *= tint;
                        m.SetVector("_BaseColor", c);
                        SurfaceSpec s = Surfaces.For(name);
                        m.SetFloat("_Metallic", (float)s.Metallic);
                        m.SetFloat("_Roughness", (float)s.Roughness);
                        m.SetFloat("_EnvIntensity", (float)s.EnvironmentIntensity);
                        m.SetFloat("_UseVertexColor", 0);
                        CopyMaps(mats[i], m);
                        converted[mats[i]] = m;
                    }
                    mats[i] = m;
                }
                r.sharedMaterials = mats;
                r.shadowCastingMode = render ? ShadowCastingMode.On : ShadowCastingMode.Off;
                r.receiveShadows = true;
                r.enabled = render;
                model.Renderers.Add(r);
            }
            AddLods(fit.gameObject, model.Renderers);
            // Rest-pose measure (body pieces only: not the crown, not the LOD copies), then fit: pivot (scale) > fit (offset) > roots.
            float minY = float.MaxValue, maxY = float.MinValue;
            foreach (Renderer r in model.Renderers)
            {
                if (!CharacterLods.CountsForHeight(r.name)) continue;
                Bounds b = r.bounds;
                minY = Mathf.Min(minY, b.min.y);
                maxY = Mathf.Max(maxY, b.max.y);
            }
            if (maxY > minY)
            {
                fit.localPosition = new Vector3(0, -minY, 0);
                pivot.localScale = Vector3.one * (float)(heightM / (maxY - minY));
            }
            return model;
#else
            await Task.Yield();
            throw new NotSupportedException("glTFast (com.unity.cloud.gltfast) n'est pas installé : personnages indisponibles.");
#endif
        }

        /// <summary>Meshes named « X_LOD1 / X_LOD2 » become levels of detail (CharacterLods); models without them are untouched.</summary>
        private static void AddLods(GameObject root, List<Renderer> renderers)
        {
            var plan = CharacterLods.Plan(renderers.ConvertAll(r => r.name));
            if (plan.Count < 2) return;
            if (plan.Count != CharacterLods.ScreenHeights.Length)
            {
                Debug.LogWarning($"{root.name} : {plan.Count - 1} niveau(x) de détail, le jeu en attend {CharacterLods.ScreenHeights.Length - 1} : LOD ignorés.");
                return;
            }
            var byName = new Dictionary<string, List<Renderer>>();
            foreach (Renderer r in renderers)
            {
                if (!byName.TryGetValue(r.name, out List<Renderer> list)) byName[r.name] = list = new List<Renderer>();
                list.Add(r);
            }
            var lods = new LOD[plan.Count];
            for (int level = 0; level < plan.Count; level++)
            {
                var shown = new List<Renderer>();
                foreach (string name in plan[level]) if (byName.TryGetValue(name, out List<Renderer> list)) shown.AddRange(list);
                lods[level] = new LOD((float)CharacterLods.ScreenHeights[level], shown.ToArray());
            }
            var group = root.AddComponent<LODGroup>();
            group.SetLODs(lods);
            group.RecalculateBounds();
        }

        // What a glTF material may bring beyond its colour (SourceMaterialGenerator stores it on the source material): relief,
        // roughness map, night-glow map, alpha cutout and double-sided drawing. Models without them keep the shader defaults.
        private static readonly string[] MapProperties = { "_BumpMap", "_RoughnessMap", "_GlowMap" };
        private static readonly string[] MapSettings = { "_BumpScale", "_UseRoughnessMap", "_UseGlowMap", "_UseMetallicMap", "_Glow" };
        private static readonly string[] AlphaSettings = { "_Cutoff", "_Cull" };

        /// <summary>The maps a glTF material brought (SourceMaterialGenerator) onto the converted material; its metal factor too
        /// when its metal comes from the map (the copper and iron tools), otherwise the target keeps its surface's value.
        /// alpha: also its cutout and double-sided drawing (characters; the model library sets those itself).</summary>
        public static void CopyMaps(Material source, Material target, bool alpha = true)
        {
            foreach (string p in MapProperties)
                if (source.HasProperty(p) && target.HasProperty(p) && source.GetTexture(p) != null) target.SetTexture(p, source.GetTexture(p));
            foreach (string p in alpha ? MapSettings.Concat(AlphaSettings) : MapSettings)
                if (source.HasProperty(p) && target.HasProperty(p)) target.SetFloat(p, source.GetFloat(p));
            if (source.HasProperty("_UseMetallicMap") && source.GetFloat("_UseMetallicMap") > 0.5f && target.HasProperty("_Metallic"))
                target.SetFloat("_Metallic", source.GetFloat("_Metallic"));
        }

        /// <summary>Plays `name` looping (the demon's Idle).</summary>
        public static bool PlayLoop(AnimatedModel model, string name)
        {
            if (model.Animation == null || model.Animation[name] == null) return false;
            AnimationState s = model.Animation[name];
            s.wrapMode = WrapMode.Loop;
            model.Animation.Play(name);
            return true;
        }
    }

    /// <summary>Provisional player capsule (CAPSULE_OPTIONS: 1.8 m, radius 0.35), kept when the heroine cannot be loaded.</summary>
    public static class PlayerCapsule
    {
        public const float Height = 1.8f, Radius = 0.35f;

        public static GameObject Create(Shader pbrShader)
        {
            GameObject capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            capsule.name = "perso (capsule)";
            UnityEngine.Object.Destroy(capsule.GetComponent<Collider>());
            capsule.transform.localScale = new Vector3(Radius * 2, Height / 2, Radius * 2);
            var m = new Material(pbrShader) { name = "perso" };
            m.SetVector("_BaseColor", new Color(0.95f, 0.45f, 0.25f).linear);
            m.SetFloat("_Roughness", 0.6f);
            m.SetFloat("_UseVertexColor", 0);
            capsule.GetComponent<MeshRenderer>().sharedMaterial = m;
            return capsule;
        }

        /// <summary>Lowest point of the capsule relative to its origin (meshPositionForFeet).</summary>
        public static float MinY => -Height / 2;
    }
}
