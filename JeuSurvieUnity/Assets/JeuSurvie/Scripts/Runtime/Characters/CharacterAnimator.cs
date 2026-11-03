// The heroine's locomotion on her own clips (ClipLibrary): idle / walk / run, empty-handed or carrying a tool (her right
// arm holds it), blended by her ground speed (render-data/character-motion), faded between empty and full hands; the
// travelling loops play at the rate that keeps her feet with the ground. Gestures play over it (GestureLayer, layer 1).
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.RenderData;
using UnityEngine;

namespace JeuSurvie.Characters
{
    public sealed class CharacterAnimator : MonoBehaviour
    {
        private AnimationState[] loops;
        private float[] clipMps;
        private double[] gait = { 1, 0, 0 };
        private double toolShare;

        public static CharacterAnimator Create(AnimatedModel heroine, IReadOnlyDictionary<string, ClipInfo> clips)
        {
            if (heroine.Animation == null) throw new InvalidOperationException("l'héroïne n'a pas d'animations");
            var states = new AnimationState[AnimationData.Locomotion.Length];
            var mps = new float[states.Length];
            for (int i = 0; i < states.Length; i++)
            {
                string name = AnimationData.Locomotion[i];
                AnimationState s = heroine.Animation[name];
                if (s == null || !clips.TryGetValue(name, out ClipInfo info)) throw new InvalidOperationException("animation absente : " + name);
                s.layer = 0;
                s.wrapMode = WrapMode.Loop;
                s.enabled = true;
                s.weight = i == 0 ? 1 : 0;
                mps[i] = info.speed_mps;
                states[i] = s;
            }
            CharacterAnimator a = heroine.Pivot.gameObject.AddComponent<CharacterAnimator>();
            a.loops = states;
            a.clipMps = mps;
            return a;
        }

        /// <summary>Every frame: her ground speed and whether a tool is in her hand.</summary>
        public void Tick(double dtSeconds, double speedMps, bool holdingTool)
        {
            gait = CharacterMotion.FadeWeights(gait, CharacterMotion.For(speedMps), dtSeconds, CharacterMotion.FadeSeconds);
            toolShare = CharacterAnimation.Approach(toolShare, holdingTool ? 1 : 0, dtSeconds, CharacterAnimation.ToolFadeSeconds);
            double[] w = CharacterAnimation.LocomotionWeights(gait, toolShare);
            for (int i = 0; i < loops.Length; i++)
            {
                loops[i].weight = (float)w[i];
                loops[i].speed = (float)CharacterAnimation.PlaybackRate(speedMps, clipMps[i]);
            }
            // The two copies of a gait (empty hands / carrying) keep step: the one that shows most leads.
            int half = loops.Length / 2;
            for (int i = 0; i < half; i++)
            {
                if (toolShare > 0.5) loops[i].normalizedTime = loops[i + half].normalizedTime;
                else loops[i + half].normalizedTime = loops[i].normalizedTime;
            }
        }
    }
}
