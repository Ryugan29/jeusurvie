// The heroine's animation rules (no Unity): gesture time (the blow lands on the game's impact), locomotion weights and
// playback rate, the two-bone reach of her left arm onto a handle, and which clip and gesture each harvest uses.
using System;
using System.Linq;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Items;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;
using NUnit.Framework;

namespace JeuSurvie.Tests
{
    public class CharacterAnimationTests
    {
        [Test]
        public void GestureTimeStartsAndEndsWithTheClipAndPutsTheImpactOnTheContactFrame()
        {
            Assert.AreEqual(0, CharacterAnimation.ClipFraction(0, 0.58, 0.48), 1e-9);
            Assert.AreEqual(1, CharacterAnimation.ClipFraction(1, 0.58, 0.48), 1e-9);
            Assert.AreEqual(0.48, CharacterAnimation.ClipFraction(0.58, 0.58, 0.48), 1e-9);
        }

        [Test]
        public void GestureTimeNeverGoesBackwardAndStaysInTheClip()
        {
            double previous = -1;
            for (int i = 0; i <= 100; i++)
            {
                double t = CharacterAnimation.ClipFraction(i / 100.0, 0.3, 0.7);
                Assert.GreaterOrEqual(t, previous);
                previous = t;
            }
            Assert.AreEqual(1, CharacterAnimation.ClipFraction(1.5, 0.5, 0.5), 1e-9);
            Assert.AreEqual(0, CharacterAnimation.ClipFraction(-0.2, 0.5, 0.5), 1e-9);
        }

        [Test]
        public void LocomotionWeightsSplitTheGaitBetweenEmptyHandsAndToolInHand()
        {
            double[] w = CharacterAnimation.LocomotionWeights(new[] { 0.2, 0.8, 0 }, 0.25);
            Assert.AreEqual(6, w.Length);
            Assert.AreEqual(1, w.Sum(), 1e-9);
            Assert.AreEqual(0.8 * 0.75, w[1], 1e-9);
            Assert.AreEqual(0.8 * 0.25, w[4], 1e-9);
        }

        [Test]
        public void PlaybackFollowsTheGroundSpeedWithinLimits()
        {
            Assert.AreEqual(1, CharacterAnimation.PlaybackRate(0, 3.7), 1e-9);
            Assert.AreEqual(1, CharacterAnimation.PlaybackRate(3.7, 3.7), 1e-9);
            Assert.AreEqual(CharacterAnimation.MaxPlayback, CharacterAnimation.PlaybackRate(9, 3.7), 1e-9);
            Assert.AreEqual(CharacterAnimation.MinPlayback, CharacterAnimation.PlaybackRate(0.5, 3.7), 1e-9);
            Assert.AreEqual(1, CharacterAnimation.PlaybackRate(2, 0), 1e-9, "a clip that does not travel plays as it is");
        }

        [Test]
        public void ApproachMovesTowardTheTargetAtTheFadeRate()
        {
            Assert.AreEqual(0.5, CharacterAnimation.Approach(0, 1, 0.1, 0.2), 1e-9);
            Assert.AreEqual(1, CharacterAnimation.Approach(0.9, 1, 0.1, 0.2), 1e-9);
            Assert.AreEqual(0, CharacterAnimation.Approach(0.3, 0, 1, 0.2), 1e-9);
        }

        private static double Dist(Vec3 a, Vec3 b) => Math.Sqrt((a.X - b.X) * (a.X - b.X) + (a.Y - b.Y) * (a.Y - b.Y) + (a.Z - b.Z) * (a.Z - b.Z));

        [Test]
        public void ArmReachKeepsTheBoneLengthsAndReachesAReachableTarget()
        {
            var shoulder = new Vec3(0, 1.4, 0);
            var hint = new Vec3(0.1, 1.2, 0.1);
            var target = new Vec3(0.15, 1.05, 0.2); // 0.43 m away: within the 0.49 m arm
            var (elbow, wrist) = ArmReach.Solve(shoulder, hint, target, 0.24, 0.25);
            Assert.AreEqual(0.24, Dist(shoulder, elbow), 1e-6);
            Assert.AreEqual(0.25, Dist(elbow, wrist), 1e-6);
            Assert.AreEqual(0, Dist(wrist, target), 1e-6);
        }

        [Test]
        public void ArmReachKeepsTheElbowOnItsSideAndStopsShortOfAnUnreachableTarget()
        {
            var shoulder = new Vec3(0, 1.4, 0);
            var (elbow, _) = ArmReach.Solve(shoulder, new Vec3(0.3, 1.3, 0), new Vec3(0, 1.4, 0.4), 0.24, 0.25);
            Assert.Greater(elbow.X, 0, "elbow stays on the side it was");
            var (_, far) = ArmReach.Solve(shoulder, new Vec3(0.3, 1.3, 0), new Vec3(0, 1.4, 3), 0.24, 0.25);
            Assert.Less(Dist(shoulder, far), 0.49);
            Assert.Greater(Dist(shoulder, far), 0.48);
        }

        [Test]
        public void EveryGestureHasAClipAndATiming()
        {
            foreach (Gesture g in Enum.GetValues(typeof(Gesture)))
            {
                Assert.IsFalse(string.IsNullOrEmpty(AnimationData.ClipOf(g)), g.ToString());
                Assert.IsTrue(HarvestData.Gestures.ContainsKey(g), g.ToString());
            }
        }

        // Remade clips (Tools~/Blender/animations.py) must come with their timings: a gesture lasts its clip's length ÷ its
        // playback speed (else she plays it faster or slower than filmed) and its impact sits on the clip's contact frame
        // (else her time is bent to move the blow), as the clips' sheet animations.json gives them.
        private const string ClipSheet = "Assets/StreamingAssets/assets/models/characters/heroine/animations.json";
        private const double DurationToleranceShare = 0.02, ImpactTolerance = 0.01;

        private static System.Collections.Generic.Dictionary<string, System.Collections.Generic.Dictionary<string, object>> Clips()
        {
            if (!Fixture.Has(ClipSheet)) Assert.Ignore("animations de l'héroïne absentes (fabriquées par Tools~/Blender/animations.py, non versionnées)");
            return Fixture.L(Fixture.Json(ClipSheet)["clips"]).Select(Fixture.O).ToDictionary(c => (string)c["name"]);
        }

        [Test]
        public void GestureTimingsFollowTheHeroineClips()
        {
            var clips = Clips();
            foreach (var kv in HarvestData.Gestures)
            {
                string clip = AnimationData.ClipOf(kv.Key);
                Assert.IsTrue(clips.TryGetValue(clip, out var c), $"{clip} absente de animations.json");
                double duration = Fixture.D(c["seconds"]) / Fixture.D(c["speed"]), contact = Fixture.D(c["contact"]);
                Assert.AreEqual(duration, kv.Value.DurationS, DurationToleranceShare * duration,
                    $"{kv.Key} : durée de HarvestData.Gestures à remettre à {duration:0.00} s (animation {clip})");
                Assert.AreEqual(contact, kv.Value.ImpactAt, ImpactTolerance,
                    $"{kv.Key} : moment du coup de HarvestData.Gestures à remettre à {contact:0.00} (animation {clip})");
                Assert.AreEqual(AnimationData.TwoHanded(kv.Key), (bool)c["two_hands"], $"{kv.Key} : à deux mains ou non, comme l'animation {clip}");
            }
        }

        // The clips are made with her left fist where the game keeps it (HandIk): else her left arm is yanked along the handle.
        [Test]
        public void TheLeftFistHoldsEachHandleWhereItsClipWasMade()
        {
            var clips = Clips();
            foreach (ToolType t in Enum.GetValues(typeof(ToolType)))
            {
                Gesture g = Targeting.GestureOf(t);
                if (!AnimationData.TwoHanded(g)) continue;
                var c = clips[AnimationData.ClipOf(g)];
                Assert.IsNotNull(c["left_grip"], $"{AnimationData.ClipOf(g)} : place de la main gauche absente");
                Assert.AreEqual(Fixture.D(c["left_grip"]), AnimationData.SecondGripAlongHandleM(t), 1e-6,
                    $"{t} : main gauche ailleurs que dans l'animation {AnimationData.ClipOf(g)}");
            }
        }

        [Test]
        public void TheHoeDigsHerbsArePulledAndBranchesPickedUp()
        {
            Assert.AreEqual(Gesture.Dig, Targeting.GestureOf(ToolType.Hoe));
            Assert.AreEqual(Gesture.Dig, HarvestData.Rules[HarvestKind.Soil].Gesture);
            Assert.AreEqual(Gesture.Pull, HarvestData.Rules[HarvestKind.Herb].Gesture);
            Assert.AreEqual(Gesture.Pickup, HarvestData.Rules[HarvestKind.Branch].Gesture);
            Assert.AreEqual(Gesture.Gather, HarvestData.Rules[HarvestKind.FlowerRose].Gesture);
        }

        [Test]
        public void ToolGesturesAreTwoHandedAndTheLeftHandHasAPlaceOnEveryHandle()
        {
            Assert.IsTrue(AnimationData.TwoHanded(Gesture.Chop));
            Assert.IsTrue(AnimationData.TwoHanded(Gesture.Overhead));
            Assert.IsTrue(AnimationData.TwoHanded(Gesture.Dig));
            Assert.IsFalse(AnimationData.TwoHanded(Gesture.Gather));
            foreach (ToolType t in Enum.GetValues(typeof(ToolType)))
                Assert.Less(Math.Abs(AnimationData.SecondGripAlongHandleM(t)), 0.6, t.ToString());
        }
    }
}
