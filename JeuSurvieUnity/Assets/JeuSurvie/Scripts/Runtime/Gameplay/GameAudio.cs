// The harvest's sounds (Kenney « Impact Sounds » and « RPG Audio », CC0, in Resources/Audio): the blow on wood, stone,
// soil or plants, the tree that creaks and lands, picking up, dropping, taking a tool, a refusal, a broken tool. Played in
// 3D from where they happen, through a small pool of sources; several takes per sound, never the same twice in a row.
using System.Collections.Generic;
using JeuSurvie.Core.Gameplay;
using UnityEngine;

namespace JeuSurvie.Gameplay
{
    public enum Cue { Wood, Stone, Soil, Plant, Whoosh, Pickup, Drop, Equip, Refused, Broken, Creak, TreeLands, Interface }

    public sealed class GameAudio
    {
        private static readonly Dictionary<Cue, (string[] clips, float volume, bool spatial)> Table = new Dictionary<Cue, (string[], float, bool)>
        {
            { Cue.Wood, (new[] { "impactWood_heavy_000", "impactWood_heavy_001", "impactWood_heavy_002", "chop" }, 0.8f, true) },
            { Cue.Stone, (new[] { "impactMining_000", "impactMining_001", "impactMining_002", "impactMining_003" }, 0.75f, true) },
            { Cue.Soil, (new[] { "impactSoft_heavy_000", "impactSoft_heavy_001", "footstep_grass_000" }, 0.8f, true) },
            { Cue.Plant, (new[] { "impactSoft_medium_000", "impactSoft_medium_002", "footstep_grass_003", "knifeSlice" }, 0.6f, true) },
            { Cue.Whoosh, (new[] { "cloth1", "cloth3" }, 0.25f, true) },
            { Cue.Pickup, (new[] { "handleSmallLeather", "handleSmallLeather2" }, 0.55f, false) },
            { Cue.Drop, (new[] { "dropLeather" }, 0.6f, true) },
            { Cue.Equip, (new[] { "beltHandle1", "drawKnife2" }, 0.45f, false) },
            { Cue.Refused, (new[] { "metalLatch" }, 0.3f, false) },
            { Cue.Broken, (new[] { "impactPlate_heavy_000" }, 0.6f, false) },
            { Cue.Creak, (new[] { "creak1", "creak3" }, 0.8f, true) },
            { Cue.TreeLands, (new[] { "impactPunch_heavy_001", "impactWood_medium_003" }, 1f, true) },
            { Cue.Interface, (new[] { "cloth4", "bookFlip2", "impactGeneric_light_002" }, 0.35f, false) },
        };

        private const int Voices = 8;
        private readonly AudioSource[] sources = new AudioSource[Voices];
        private readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        private readonly Dictionary<Cue, int> lastTake = new Dictionary<Cue, int>();
        private int next;

        public GameAudio()
        {
            var root = new GameObject("Sons de récolte");
            for (int i = 0; i < Voices; i++)
            {
                var go = new GameObject("Voix " + (i + 1));
                go.transform.SetParent(root.transform, false);
                AudioSource s = go.AddComponent<AudioSource>();
                s.playOnAwake = false;
                s.rolloffMode = AudioRolloffMode.Linear;
                s.minDistance = 2;
                s.maxDistance = 40;
                s.dopplerLevel = 0;
                sources[i] = s;
            }
            foreach (var entry in Table.Values)
                foreach (string name in entry.clips)
                {
                    AudioClip c = Resources.Load<AudioClip>("Audio/" + name);
                    if (c != null) clips[name] = c;
                    else Debug.LogWarning("[JeuSurvie] Son absent : " + name);
                }
        }

        public static Cue ImpactOf(HarvestKind k)
        {
            switch (k)
            {
                case HarvestKind.Tree:
                case HarvestKind.Pine:
                case HarvestKind.DeadTree:
                case HarvestKind.Stump:
                case HarvestKind.Branch: return Cue.Wood;
                case HarvestKind.Rock:
                case HarvestKind.CopperOre:
                case HarvestKind.IronOre: return Cue.Stone;
                case HarvestKind.Soil: return Cue.Soil;
                default: return Cue.Plant;
            }
        }

        public void Play(Cue cue, Vector3 at)
        {
            if (!Table.TryGetValue(cue, out var entry)) return;
            int take = Random.Range(0, entry.clips.Length);
            if (entry.clips.Length > 1 && lastTake.TryGetValue(cue, out int last) && last == take) take = (take + 1) % entry.clips.Length;
            lastTake[cue] = take;
            if (!clips.TryGetValue(entry.clips[take], out AudioClip clip)) return;
            AudioSource s = sources[next];
            next = (next + 1) % Voices;
            s.transform.position = at;
            s.spatialBlend = entry.spatial ? 1 : 0;
            s.pitch = Random.Range(0.93f, 1.07f);
            s.volume = entry.volume;
            s.clip = clip;
            s.Play();
        }
    }
}
