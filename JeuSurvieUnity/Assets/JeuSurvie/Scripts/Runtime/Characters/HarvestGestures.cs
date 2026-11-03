// The tool in the heroine's right hand and the harvest gestures. The tool hangs on her hand bone, so it follows every
// animation; its grip is computed from her own hand (the handle runs across the knuckles, head on the index side, edge
// toward where the fist points). The gestures are her own clips (ClipLibrary): the harvest drives their time, bent so the
// blow lands in the animation exactly when the game applies it; her fists close on the handles (hand-only clips) and, for
// the axe, pickaxe and hoe, her left hand joins the right on the handle (HandIk reads LeftHandOnHandle).
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Items;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Vegetation;
using UnityEngine;
using UnityEngine.Rendering;

namespace JeuSurvie.Characters
{
    public sealed class ToolInHand
    {
        private readonly Transform hand;
        private readonly ModelLibrary objects;
        private readonly Vector3 gripPosition;
        private readonly Quaternion gripRotation;
        private GameObject current;
        private string shown;

        /// <summary>The tool shown in her hand (null: empty hand); its +Y runs up the handle, 1 unit = 1 m.</summary>
        public Transform Current => current != null ? current.transform : null;
        public ToolType? CurrentType { get; private set; }

        public ToolInHand(AnimatedModel heroine, ModelLibrary objects)
        {
            this.objects = objects;
            heroine.Nodes.TryGetValue("hand_r", out hand);
            if (hand == null) { Debug.LogWarning("[JeuSurvie] Main droite introuvable : les outils ne seront pas tenus."); return; }
            Vector3 Local(string bone) => heroine.Nodes.TryGetValue(bone, out Transform t) ? hand.InverseTransformPoint(t.position) : Vector3.zero;
            Vector3 index = Local("index_01_r"), pinky = Local("pinky_01_r"), middle = Local("middle_01_r"), thumb = Local("thumb_01_r");
            Vector3 handle = (index - pinky).normalized;                          // the handle crosses the fist, head on the index side
            Vector3 forward = Vector3.ProjectOnPlane(middle, handle).normalized;   // the edge points where the fist points
            gripRotation = Quaternion.LookRotation(Vector3.Cross(-forward, handle), handle); // tool +Y = handle, tool −X = edge
            // Inside the closed fist: under the knuckles, toward the palm (the thumb's side), not on the back of the hand.
            Vector3 palm = Vector3.ProjectOnPlane(Vector3.ProjectOnPlane(thumb, handle), forward).normalized;
            gripPosition = middle * 0.85f + palm * (middle.magnitude * 0.3f);
        }

        /// <summary>Shows this item's model in the hand (null: empty hand).</summary>
        public void Show(string itemId)
        {
            if (itemId == shown || hand == null) return;
            shown = itemId;
            if (current != null) UnityEngine.Object.Destroy(current);
            current = null;
            CurrentType = null;
            if (itemId == null) return;
            ItemDef def = ItemCatalog.Get(itemId);
            IReadOnlyList<ModelPart> parts = objects.PartsOf(def.Model);
            if (parts.Count == 0) { Debug.LogWarning("[JeuSurvie] Modèle d'outil absent : " + def.Model); return; }
            current = new GameObject("Outil en main : " + def.Model);
            current.transform.SetParent(hand, false);
            current.transform.localPosition = gripPosition;
            current.transform.localRotation = gripRotation;
            Vector3 s = hand.lossyScale;
            current.transform.localScale = new Vector3(1 / s.x, 1 / s.y, 1 / s.z);
            CurrentType = def.Tool?.Type;
            var byMesh = new Dictionary<Mesh, Material[]>(); // one renderer per mesh, its materials in sub-mesh order
            foreach (ModelPart p in parts)
            {
                if (!byMesh.TryGetValue(p.Mesh, out Material[] mats)) byMesh[p.Mesh] = mats = new Material[p.Mesh.subMeshCount];
                mats[p.SubMesh] = p.Material;
            }
            foreach (var kv in byMesh)
            {
                var go = new GameObject(kv.Key.name);
                go.transform.SetParent(current.transform, false);
                go.AddComponent<MeshFilter>().sharedMesh = kv.Key;
                var r = go.AddComponent<MeshRenderer>();
                r.sharedMaterials = kv.Value;
                r.shadowCastingMode = ShadowCastingMode.On;
            }
        }
    }

    public sealed class GestureLayer
    {
        private const double FadeInS = 0.08, FadeOutS = 0.18;

        private readonly Animation anim;
        private readonly IReadOnlyDictionary<string, ClipInfo> clips;
        private readonly AnimationState rightGrip, leftGrip;
        private AnimationState playing, fading;
        private ClipInfo playingInfo;
        private double weight, fadingWeight, lastProgress;
        private const string Twin = " (bis)";

        /// <summary>0–1: how much her left hand is on the handle now (faded in and out: no jerk of the arm, of the cloth).</summary>
        public float LeftHandOnHandle { get; private set; }

        public GestureLayer(AnimatedModel heroine, IReadOnlyDictionary<string, ClipInfo> clips)
        {
            anim = heroine.Animation;
            this.clips = clips;
            if (anim == null) return;
            foreach (Gesture g in Enum.GetValues(typeof(Gesture)))
            {
                string clip = AnimationData.ClipOf(g);
                if (anim[clip] == null) { Debug.LogWarning("[JeuSurvie] Geste absent de l'héroïne : " + clip + " (relancer Tools~/Blender/animations.py)"); continue; }
                Prepare(anim[clip], 1);
                if (anim[clip + Twin] == null) anim.AddClip(anim[clip].clip, clip + Twin); // a second copy: blow after blow crossfade
                Prepare(anim[clip + Twin], 1);
            }
            rightGrip = Grip(heroine, AnimationData.RightGrip, "hand_r");
            leftGrip = Grip(heroine, AnimationData.LeftGrip, "hand_l");
        }

        private AnimationState Grip(AnimatedModel heroine, string clip, string handBone)
        {
            if (anim[clip] == null || !heroine.Nodes.TryGetValue(handBone, out Transform hand)) return null;
            AnimationState s = anim[clip];
            Prepare(s, 2);
            foreach (Transform finger in hand) s.AddMixingTransform(finger, true); // the fingers only: the wrist keeps its turn
            s.wrapMode = WrapMode.Loop;
            return s;
        }

        private static void Prepare(AnimationState s, int layer)
        {
            s.layer = layer;
            s.wrapMode = WrapMode.ClampForever;
            s.enabled = true;
            s.speed = 0;
            s.weight = 0;
        }

        /// <summary>Each frame: the gesture in progress (null: none) at `progress` (0–1) of its course.</summary>
        public void Show(Gesture? gesture, double progress, bool holdingTool, double dt)
        {
            if (anim == null) return;
            if (rightGrip != null) rightGrip.weight = Mathf.MoveTowards(rightGrip.weight, holdingTool ? 1 : 0, (float)(dt / FadeInS));
            bool twoHands = gesture != null && holdingTool && AnimationData.TwoHanded(gesture.Value);
            LeftHandOnHandle = (float)CharacterAnimation.Approach(LeftHandOnHandle, twoHands ? 1 : 0, dt, CharacterAnimation.GripFadeSeconds);
            if (leftGrip != null) leftGrip.weight = LeftHandOnHandle;
            string clip = gesture != null ? AnimationData.ClipOf(gesture.Value) : null;
            AnimationState wanted = clip != null ? anim[clip] : null;
            if (wanted != null && playing != null && playing.name.Replace(Twin, "") == clip)
            {
                // The same gesture again (the button held): the next blow starts on the other copy while this one fades out
                // from where it ended — no snap of the arm from the last pose to the first.
                if (progress < lastProgress - 0.3)
                {
                    if (fading != null) fading.weight = 0;
                    fading = playing;
                    fadingWeight = weight;
                    playing = anim[playing.name.EndsWith(Twin) ? clip : clip + Twin] ?? playing;
                    weight = 0;
                }
                wanted = playing;
            }
            else if (wanted != null && wanted != playing)
            {
                if (playing != null) playing.weight = 0;
                playing = wanted;
                clips.TryGetValue(clip, out playingInfo);
                weight = 0;
            }
            lastProgress = progress;
            if (fading != null)
            {
                fadingWeight = Math.Max(0, fadingWeight - dt / FadeOutS);
                fading.weight = (float)fadingWeight;
                if (fadingWeight <= 0) fading = null;
            }
            if (playing == null) return;
            weight = wanted != null ? Math.Min(1, weight + dt / FadeInS) : Math.Max(0, weight - dt / FadeOutS);
            playing.weight = (float)weight;
            if (wanted != null)
            {
                GestureTiming timing = HarvestData.Gestures[gesture.Value];
                double contact = playingInfo != null && playingInfo.contact >= 0 ? playingInfo.contact : timing.ImpactAt;
                playing.normalizedTime = (float)CharacterAnimation.ClipFraction(progress, timing.ImpactAt, contact);
            }
            if (weight <= 0) { playing.weight = 0; playing = null; }
        }
    }
}
