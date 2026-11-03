// Her left hand on the tool's handle while she swings an axe, a pickaxe or a hoe: after the animation, the left arm is bent
// (two-bone reach, the elbow keeping its side) so the wrist meets a point up or down the handle, and the fist turns so the
// handle runs through it. Faded by GestureLayer.LeftHandOnHandle: no jerk of the arm, nor of the leaf cloth on it.
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Shared;
using UnityEngine;

namespace JeuSurvie.Characters
{
    [DefaultExecutionOrder(100)]
    public sealed class HandIk : MonoBehaviour
    {
        private Transform upper, lower, hand, index, pinky;
        private ToolInHand tool;
        private GestureLayer gestures;

        public static HandIk Attach(AnimatedModel heroine, ToolInHand tool, GestureLayer gestures)
        {
            var n = heroine.Nodes;
            if (!n.TryGetValue("upperarm_l", out Transform u) || !n.TryGetValue("lowerarm_l", out Transform l) || !n.TryGetValue("hand_l", out Transform h)
                || !n.TryGetValue("index_01_l", out Transform i) || !n.TryGetValue("pinky_01_l", out Transform p))
            {
                Debug.LogWarning("[JeuSurvie] Bras gauche incomplet : la main gauche ne prendra pas les manches.");
                return null;
            }
            HandIk ik = heroine.Pivot.gameObject.AddComponent<HandIk>();
            ik.upper = u; ik.lower = l; ik.hand = h; ik.index = i; ik.pinky = p;
            ik.tool = tool;
            ik.gestures = gestures;
            return ik;
        }

        private void LateUpdate()
        {
            float w = gestures != null ? gestures.LeftHandOnHandle : 0;
            Transform held = tool?.Current;
            if (w <= 0.001f || held == null || tool.CurrentType == null) return;
            Vector3 grip = held.TransformPoint(new Vector3(0, (float)AnimationData.SecondGripAlongHandleM(tool.CurrentType.Value), 0));
            Vector3 shoulder = upper.position, elbow0 = lower.position, wrist0 = hand.position;
            Vector3 target = Vector3.Lerp(wrist0, grip, w);
            var (elbow, wrist) = ArmReach.Solve(V(shoulder), V(elbow0), V(target), Vector3.Distance(shoulder, elbow0), Vector3.Distance(elbow0, wrist0));
            upper.rotation = Quaternion.FromToRotation(elbow0 - shoulder, U(elbow) - shoulder) * upper.rotation;
            Vector3 e = lower.position;
            lower.rotation = Quaternion.FromToRotation(hand.position - e, U(wrist) - e) * lower.rotation;
            // The fist around the handle: knuckles (index → pinky) along the handle, whichever way is the shorter turn.
            Vector3 knuckles = pinky.position - index.position, along = held.up;
            if (Vector3.Dot(knuckles, along) < 0) along = -along;
            hand.rotation = Quaternion.Slerp(Quaternion.identity, Quaternion.FromToRotation(knuckles, along), w) * hand.rotation;
        }

        private static Vec3 V(Vector3 v) => new Vec3(v.x, v.y, v.z);
        private static Vector3 U(Vec3 v) => new Vector3((float)v.X, (float)v.Y, (float)v.Z);
    }
}
