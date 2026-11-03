// The heroine's own clips (Tools~/Blender/animations.py: her skeleton + the clips, retargeted from filmed and hand-animated
// sources) added to her Animation, with what animations.json says of each one: length, loop, the moment of the blow,
// playback speed, two-handed, ground speed. Replaces the hidden hero whose bones she used to copy.
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using UnityEngine;

namespace JeuSurvie.Characters
{
    [Serializable]
    public sealed class ClipInfo
    {
        public string name;
        public int frames;
        public float seconds;
        public bool loop;
        /// <summary>Fraction of the clip where the blow lands / the hand reaches the plant (−1: none).</summary>
        public float contact = -1;
        public float speed = 1;
        public bool two_hands;
        /// <summary>Ground speed the loop was filmed at (0: it does not travel).</summary>
        public float speed_mps;
    }

    [Serializable]
    internal sealed class ClipList
    {
        public int fps;
        public ClipInfo[] clips;
    }

    public static class ClipLibrary
    {
        /// <summary>Adds the clips of `gltfPath` to the heroine (an Animation is created where glTFast puts one: on the
        /// parent of her « Armature » node, so the bone paths match) and returns their descriptions by name.</summary>
        public static async Task<IReadOnlyDictionary<string, ClipInfo>> AddAsync(AnimatedModel heroine, string gltfPath, string jsonPath)
        {
#if JEUSURVIE_GLTFAST
            if (!File.Exists(gltfPath)) throw new FileNotFoundException(gltfPath);
            if (!File.Exists(jsonPath)) throw new FileNotFoundException(jsonPath);
            ClipList list = JsonUtility.FromJson<ClipList>(File.ReadAllText(jsonPath));
            if (list?.clips == null || list.clips.Length == 0) throw new InvalidDataException("aucune animation décrite : " + jsonPath);
            if (!heroine.Nodes.TryGetValue("Armature", out Transform armature) || armature.parent == null)
                throw new InvalidDataException("squelette « Armature » introuvable sur l'héroïne");
            Animation host = armature.parent.GetComponent<Animation>();
            if (host == null) host = armature.parent.gameObject.AddComponent<Animation>();
            host.playAutomatically = false;
            host.cullingType = AnimationCullingType.AlwaysAnimate;
            heroine.Animation = host;

            var gltf = new GLTFast.GltfImport();
            var settings = new GLTFast.ImportSettings { AnimationMethod = GLTFast.AnimationMethod.Legacy };
            if (!await gltf.Load(new Uri(Path.GetFullPath(gltfPath)).AbsoluteUri, settings)) throw new IOException("animations illisibles : " + gltfPath);
            var holder = new GameObject("animations (chargement)");
            holder.SetActive(false);
            try
            {
                if (!await gltf.InstantiateMainSceneAsync(holder.transform)) throw new IOException("animations non instanciées : " + gltfPath);
                Animation source = holder.GetComponentInChildren<Animation>(true);
                if (source == null) throw new InvalidDataException("aucune animation dans " + gltfPath);
                var found = new HashSet<string>();
                foreach (AnimationState s in source)
                {
                    if (s.clip == null) continue;
                    host.AddClip(s.clip, s.clip.name);
                    found.Add(s.clip.name);
                }
                var byName = new Dictionary<string, ClipInfo>();
                foreach (ClipInfo c in list.clips)
                {
                    if (!found.Contains(c.name)) throw new InvalidDataException($"animation « {c.name} » absente de {gltfPath}");
                    byName[c.name] = c;
                }
                return byName;
            }
            finally { UnityEngine.Object.Destroy(holder); }
#else
            await Task.Yield();
            throw new NotSupportedException("glTFast (com.unity.cloud.gltfast) n'est pas installé : animations indisponibles.");
#endif
        }
    }
}
