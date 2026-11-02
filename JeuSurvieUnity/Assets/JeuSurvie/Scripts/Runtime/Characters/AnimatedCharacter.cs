// Ports of babylon/animated-model, locomotion-animator and capsule:
//   - an animated model (character, creature) loaded from glTF (glTFast, legacy animation clips), fitted to a height with its
//     feet on the origin of its « pivot » (position = feet, yaw = heading), materials converted to NaturePBR (surfaces by name,
//     tints such as the heroine hair);
//   - animation retargeting from another file with the same skeleton (hero → heroine): bones paired by name, rotations copied,
//     the pelvis keeps its stride translation shifted by the rest-pose difference (moveBones);
//   - locomotion: Idle / Walk / Run always playing, weights faded by the real ground speed (render-data/character-motion).
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
            var gltf = new GltfImport();
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
            // Rest-pose measure, then fit: pivot (scale) > fit (offset) > roots.
            float minY = float.MaxValue, maxY = float.MinValue;
            foreach (Renderer r in model.Renderers)
            {
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

    /// <summary>
    /// Hero animations replayed on the heroine (retargetAnimations): the hidden hero skeleton is animated (Idle, Walk, Run blended
    /// by the locomotion weights) and, after animation, its bone rotations are copied to the heroine bones of the same name; the
    /// pelvis also takes its translation, shifted by the rest-pose difference.
    /// </summary>
    public sealed class RetargetedLocomotion : MonoBehaviour
    {
        private static readonly string[] Clips = { "Idle", "Walk", "Run" };
        private AnimatedModel source, target;
        private readonly List<(Transform from, Transform to)> bones = new List<(Transform, Transform)>();
        private readonly List<(Transform from, Transform to, Vector3 delta)> movedBones = new List<(Transform, Transform, Vector3)>();
        private double[] weights = { 1, 0, 0 };
        public readonly List<string> MissingBones = new List<string>();

        public static RetargetedLocomotion Create(AnimatedModel source, AnimatedModel target, string[] moveBones)
        {
            if (source.Animation == null) throw new InvalidOperationException("le héros n'a pas d'animations");
            foreach (string clip in Clips) if (source.Animation[clip] == null) throw new InvalidOperationException("animation absente de la source : " + clip);
            RetargetedLocomotion r = target.Pivot.gameObject.AddComponent<RetargetedLocomotion>();
            r.source = source;
            r.target = target;
            var moved = new HashSet<string>(moveBones);
            foreach (var kv in source.Nodes)
            {
                if (kv.Value.GetComponent<Renderer>() != null || kv.Value == source.Pivot) continue;
                if (!target.Nodes.TryGetValue(kv.Key, out Transform to)) { r.MissingBones.Add(kv.Key); continue; }
                r.bones.Add((kv.Value, to));
                if (moved.Contains(kv.Key)) r.movedBones.Add((kv.Value, to, to.localPosition - kv.Value.localPosition));
            }
            foreach (string clip in Clips)
            {
                AnimationState s = source.Animation[clip];
                s.wrapMode = WrapMode.Loop;
                s.layer = 0;
                s.enabled = true;
                s.weight = clip == "Idle" ? 1 : 0;
            }
            return r;
        }

        /// <summary>Every frame: `speedMps` is the character ground speed.</summary>
        public void UpdateLocomotion(double dtSeconds, double speedMps)
        {
            weights = CharacterMotion.FadeWeights(weights, CharacterMotion.For(speedMps), dtSeconds, CharacterMotion.FadeSeconds);
            for (int i = 0; i < Clips.Length; i++) source.Animation[Clips[i]].weight = (float)weights[i];
        }

        private void LateUpdate()
        {
            if (source == null || target == null) return;
            foreach (var (from, to) in bones) to.localRotation = from.localRotation;
            foreach (var (from, to, delta) in movedBones) to.localPosition = from.localPosition + delta;
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
