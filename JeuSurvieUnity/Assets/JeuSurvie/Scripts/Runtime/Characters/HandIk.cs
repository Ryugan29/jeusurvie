// Her left hand on the tool's handle while she swings an axe, a pickaxe or a hoe. Her clips already hold the handle with
// both hands (Tools~/Blender/anim/two_hands.py); after the animation, this keeps the middle of her left fist exactly on
// the handle (blends, other tools' sizes): the fist turned the shorter way so the handle runs across it, the left arm bent
// (two-bone reach, the elbow keeping its side) so the fist's middle meets its place on the handle. Faded in and out by
// GestureLayer.LeftHandOnHandle: no jerk of the arm, nor of the leaf cloth on it.
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Shared;
using UnityEngine;

namespace JeuSurvie.Characters
{
    [DefaultExecutionOrder(100)]
    public sealed class HandIk : MonoBehaviour
    {
        private Transform upper, lower, hand;
        private Fist fist;
        private ToolInHand tool;
        private GestureLayer gestures;

        public static HandIk Attach(AnimatedModel heroine, ToolInHand tool, GestureLayer gestures)
        {
            var n = heroine.Nodes;
            if (!n.TryGetValue("upperarm_l", out Transform u) || !n.TryGetValue("lowerarm_l", out Transform l) || !Fist.TryOf(heroine, "l", out Transform h, out Fist f))
            {
                Debug.LogWarning("[JeuSurvie] Bras gauche incomplet : la main gauche ne prendra pas les manches.");
                return null;
            }
            HandIk ik = heroine.Pivot.gameObject.AddComponent<HandIk>();
            ik.upper = u; ik.lower = l; ik.hand = h; ik.fist = f;
            ik.tool = tool;
            ik.gestures = gestures;
            return ik;
        }

        private void LateUpdate()
        {
            float w = gestures != null ? gestures.LeftHandOnHandle : 0;
            Transform held = tool?.Current;
            if (w <= 0.001f || held == null || tool.CurrentType == null) return;
            Quaternion upper0 = upper.localRotation, lower0 = lower.localRotation, hand0 = hand.localRotation;
            Vector3 grip = held.TransformPoint(new Vector3(0, (float)AnimationData.SecondGripAlongHandleM(tool.CurrentType.Value), 0));
            Vector3 across = hand.TransformDirection(fist.Handle), along = held.up;
            if (Vector3.Dot(across, along) < 0) along = -along;
            Quaternion fisted = Quaternion.FromToRotation(across, along) * hand.rotation;
            Vector3 toMiddle = hand.TransformPoint(fist.Centre) - hand.position;
            Vector3 wristAim = grip - fisted * (Quaternion.Inverse(hand.rotation) * toMiddle);
            Vector3 shoulder = upper.position, elbow0 = lower.position, wrist0 = hand.position;
            var (elbow, wrist) = ArmReach.Solve(V(shoulder), V(elbow0), V(wristAim), Vector3.Distance(shoulder, elbow0), Vector3.Distance(elbow0, wrist0));
            upper.rotation = Quaternion.FromToRotation(elbow0 - shoulder, U(elbow) - shoulder) * upper.rotation;
            Vector3 e = lower.position;
            lower.rotation = Quaternion.FromToRotation(hand.position - e, U(wrist) - e) * lower.rotation;
            hand.rotation = fisted;
            if (w >= 1) return;
            upper.localRotation = Quaternion.Slerp(upper0, upper.localRotation, w);
            lower.localRotation = Quaternion.Slerp(lower0, lower.localRotation, w);
            hand.localRotation = Quaternion.Slerp(hand0, hand.localRotation, w);
        }

        private static Vec3 V(Vector3 v) => new Vec3(v.x, v.y, v.z);
        private static Vector3 U(Vec3 v) => new Vector3((float)v.X, (float)v.Y, (float)v.Z);
    }
}
