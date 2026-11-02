// How the elf's leaf outfit (skirt, shoulder leaves: Unity Cloth in the game) takes the game's wind, gusts and rain, and her
// own movements. All the tuning sits in LeafClothTuning, named for what it does; LeafCloth turns it and the weather into the
// cloth's settings. Pure numbers, so the tests can check the behaviour (progressive, bounded, no jump from dry to soaked)
// without running a simulation.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.RenderData
{
    /// <summary>The outfit's controls (decision-2026-11-02-tenue-souple-et-lianes).</summary>
    public sealed class LeafClothTuning
    {
        /// <summary>Push of the wind on a leaf (m/s²) per unit of the game's wind strength, at the peak of a gust.</summary>
        public double WindForce = 5.0;
        /// <summary>Where the wind blows to, in degrees from +x towards +z: by default the grass's wind.</summary>
        public double WindDirectionDeg = Math.Atan2(Foliage.WindDirZ, Foliage.WindDirX) * 180 / Math.PI;
        /// <summary>Share of the push that comes and goes with the gusts (the rest blows steadily).</summary>
        public double GustShare = 0.75;
        /// <summary>Random flutter, as a share of the push.</summary>
        public double Flutter = 0.35;
        /// <summary>0: stiff leaves; 1: limp ones.</summary>
        public double Softness = 0.4;
        /// <summary>0: lively, they swing on; 1: sluggish.</summary>
        public double Damping = 0.15;
        /// <summary>How much heavier a soaked leaf hangs (extra gravity, as a share of gravity).</summary>
        public double WetWeight = 0.6;
        /// <summary>Share of the wind a soaked leaf no longer catches.</summary>
        public double WetWindShelter = 0.65;
        /// <summary>How far a skirt leaf's tip may stray from its rest shape (metres); the attached base never moves.</summary>
        public double TipFreedomM = 0.08;
        /// <summary>Unity's « surface penetration » for the leaves (metres): how far a point may go behind its place on her,
        /// against its outer side. The leaves are laid outside her skin and follow her limbs; measured on 2026-11-02, this halved
        /// the leaf points pressed into her thighs by gravity when she stands (143 → 77, before the leaves followed her skin).</summary>
        public double SinkM = 0.003;
        /// <summary>The same for the leaves lying over the shoulders: they rest on the arm, so they only lift a little.</summary>
        public double ShoulderTipFreedomM = 0.03;
        /// <summary>How much her own moves (starts, stops, turns) swing the leaves.</summary>
        public double FollowMovement = 0.7;
        /// <summary>A move of the whole character longer than this in one frame (metres) is a jump, not a run (a teleport, her
        /// snap onto the ground once it is loaded): the leaves are carried along instead of flung against their limits.</summary>
        public double JumpM = 2.0;
        /// <summary>Cloth steps per second: her legs sweep fast when she runs, and twice Unity's 120 keeps them from slipping
        /// through the leaves between two steps (about 840 leaf points: a small cost).</summary>
        public double SolverStepsPerSecond = 240;
    }

    public readonly struct LeafClothState
    {
        /// <summary>Steady push on every leaf (m/s², world): wind, plus extra weight when wet (negative Y).</summary>
        public readonly Vec3 Push;
        /// <summary>Random flutter added on top (m/s², each axis).</summary>
        public readonly Vec3 Flutter;
        /// <summary>Damping and bending stiffness (0..1); MovementShare: how much of her own moves (speed and its changes)
        /// reaches the leaves, Unity's world velocity and acceleration scales.</summary>
        public readonly double Damping, BendingStiffness, MovementShare;

        public LeafClothState(Vec3 push, Vec3 flutter, double damping, double bendingStiffness, double movementShare)
        {
            Push = push; Flutter = flutter; Damping = damping; BendingStiffness = bendingStiffness; MovementShare = movementShare;
        }
    }

    /// <summary>A sphere the leaves cannot enter, carried by a bone of the rig, around T (0..1) of the way from Bone to its
    /// child Toward: fitted on her skin there (LeafCloth.FitSphere).</summary>
    public readonly struct BoneSphere
    {
        public readonly string Bone, Toward;
        public readonly double T;

        public BoneSphere(string bone, string toward, double t) { Bone = bone; Toward = toward; T = t; }
    }

    /// <summary>A tapered capsule between two spheres (a limb).</summary>
    public readonly struct BoneCapsule
    {
        public readonly BoneSphere A, B;

        public BoneCapsule(BoneSphere a, BoneSphere b) { A = a; B = b; }
    }

    /// <summary>A leaf piece of the outfit moved by the cloth: its mesh, how far its tips may stray, the limbs it slides on.</summary>
    public readonly struct LeafPiece
    {
        public readonly string Mesh;
        public readonly double TipFreedomM;
        public readonly BoneCapsule[] Capsules;

        public LeafPiece(string mesh, double tipFreedomM, BoneCapsule[] capsules) { Mesh = mesh; TipFreedomM = tipFreedomM; Capsules = capsules; }
    }

    public static class LeafCloth
    {
        public const double Gravity = 9.81;
        /// <summary>Strongest wind the leaves take (the game's own tops out at 1.6): anything above is clamped.</summary>
        public const double MaxWindStrength = 2.0;

        /// <summary>The cloth's settings for this weather: the game's wind strength (0.4 calm .. 1.6 storm), the gust at her
        /// place (0..1, Foliage.WindGust) and how wet she is (0 dry .. 1 soaked). Out-of-range inputs are clamped.</summary>
        public static LeafClothState For(LeafClothTuning t, double windStrength, double gust, double wetness)
        {
            double wet = Clamp01(wetness), wind = windStrength > 0 ? Math.Min(windStrength, MaxWindStrength) : 0; // NaN: calm
            double push = t.WindForce * wind * (1 - t.GustShare + t.GustShare * Clamp01(gust)) * (1 - t.WetWindShelter * wet);
            double a = t.WindDirectionDeg * Math.PI / 180;
            double flutter = push * t.Flutter * (1 - 0.6 * wet);
            return new LeafClothState(
                new Vec3(Math.Cos(a) * push, -Gravity * t.WetWeight * wet, Math.Sin(a) * push),
                new Vec3(flutter, flutter * 0.3, flutter),
                Clamp01(t.Damping + (0.5 - t.Damping) * 0.6 * wet),
                Clamp01(1 - t.Softness * (1 + 0.5 * wet)),
                Clamp01(t.FollowMovement));
        }

        /// <summary>The top of a leaf (its UV v, by length from the top) that is held and never moves: under the belt for the
        /// skirt, on the shoulder for the shoulder leaves (tenue.py ATTACHED_V).</summary>
        public const double AttachedV = 0.15;

        /// <summary>How far a point of a leaf may stray from its rest shape: nothing where it is held (v up to AttachedV), then
        /// quickly more below it (half the tip's freedom by mid-leaf: room to get out of a lifted thigh's way), up to the
        /// piece's tipFreedomM at the tip (v = 1).</summary>
        public static double MaxDistance(double tipFreedomM, double v) => tipFreedomM * Math.Pow(Clamp01((v - AttachedV) / (1 - AttachedV)), 0.75);

        // Fitting a limb's obstacle on her skin: the skin points within FitSliceM along the bone line around the wanted place
        // and within FitReachM of the line (not the other leg), their centre, and their mean distance from it (a limb is
        // oval: its narrowest side would let the leaves into its broad side), at most FitLeafGapM past the nearest of them,
        // less FitMarginM.
        public const double FitSliceM = 0.04, FitReachM = 0.15, FitMarginM = 0.003;
        /// <summary>The leaves rest at least this far off her skin (tenue.py): an obstacle never reaches further than this past
        /// the nearest skin, or it would push them off their place.</summary>
        public const double FitLeafGapM = 0.007;
        private const int FitMinPoints = 8;

        /// <summary>A limb's cross-section around T (0..1) of the way from `from` to `to` (bone line, same space as the skin
        /// points): its centre and its mean radius, never past the leaves resting by its narrowest side. False where there is
        /// no skin around.</summary>
        public static bool FitSphere(IReadOnlyList<Vec3> skin, Vec3 from, Vec3 to, double t, out Vec3 centre, out double radius)
        {
            double ax = to.X - from.X, ay = to.Y - from.Y, az = to.Z - from.Z, length = Math.Sqrt(ax * ax + ay * ay + az * az);
            centre = default;
            radius = 0;
            if (length <= 0) return false;
            ax /= length; ay /= length; az /= length;
            double at = t * length, sx = 0, sy = 0, sz = 0;
            var slice = new List<Vec3>();
            foreach (Vec3 p in skin)
            {
                double dx = p.X - from.X, dy = p.Y - from.Y, dz = p.Z - from.Z, along = dx * ax + dy * ay + dz * az;
                if (Math.Abs(along - at) > FitSliceM / 2) continue;
                double rx = dx - along * ax, ry = dy - along * ay, rz = dz - along * az;
                if (rx * rx + ry * ry + rz * rz > FitReachM * FitReachM) continue;
                slice.Add(p);
                sx += p.X; sy += p.Y; sz += p.Z;
            }
            if (slice.Count < FitMinPoints) return false;
            centre = new Vec3(sx / slice.Count, sy / slice.Count, sz / slice.Count);
            double sum = 0, nearest = double.MaxValue;
            foreach (Vec3 p in slice)
            {
                double dx = p.X - centre.X, dy = p.Y - centre.Y, dz = p.Z - centre.Z, along = dx * ax + dy * ay + dz * az;
                double r = Math.Sqrt(Math.Max(0, dx * dx + dy * dy + dz * dz - along * along));
                sum += r;
                nearest = Math.Min(nearest, r);
            }
            radius = Math.Min(sum / slice.Count, nearest + FitLeafGapM) - FitMarginM;
            return radius > 0;
        }

        /// <summary>The outfit's leaf pieces (meshes written by Tools~/Blender/tenue.py) and the limbs they slide on: the skirt on
        /// the thighs and the hanging forearms, the shoulder leaves on the upper arms.</summary>
        public static LeafPiece[] Pieces(LeafClothTuning t) => new[]
        {
            new LeafPiece("Elfe_Jupe", t.TipFreedomM, BothSides(s => new[]
            {
                new BoneCapsule(Hip(s), MidThigh(s)), new BoneCapsule(MidThigh(s), Knee(s)), new BoneCapsule(Elbow(s), Wrist(s)),
            })),
            new LeafPiece("Elfe_Epaulettes", t.ShoulderTipFreedomM, BothSides(s => new[]
            {
                new BoneCapsule(Shoulder(s), MidUpperArm(s)), new BoneCapsule(MidUpperArm(s), Elbow(s)),
            })),
        };

        // Where the obstacles sit along her limbs (fitted on the skin there). The hip one is a little down the thigh: at the
        // joint itself the slice would cut through the pelvis.
        private static BoneSphere Hip(string s) => new BoneSphere("thigh" + s, "calf" + s, 0.12);
        private static BoneSphere MidThigh(string s) => new BoneSphere("thigh" + s, "calf" + s, 0.5);
        private static BoneSphere Knee(string s) => new BoneSphere("thigh" + s, "calf" + s, 0.92);
        private static BoneSphere Shoulder(string s) => new BoneSphere("upperarm" + s, "lowerarm" + s, 0.1);
        private static BoneSphere MidUpperArm(string s) => new BoneSphere("upperarm" + s, "lowerarm" + s, 0.5);
        private static BoneSphere Elbow(string s) => new BoneSphere("lowerarm" + s, "hand" + s, 0.05);
        private static BoneSphere Wrist(string s) => new BoneSphere("lowerarm" + s, "hand" + s, 0.95);

        private static BoneCapsule[] BothSides(Func<string, BoneCapsule[]> limb)
        {
            BoneCapsule[] left = limb("_l"), right = limb("_r"), both = new BoneCapsule[left.Length + right.Length];
            left.CopyTo(both, 0);
            right.CopyTo(both, left.Length);
            return both;
        }

        /// <summary>Freedom of each cloth particle: one particle per point of the leaves (tenue.py shares the points between a
        /// leaf's rows, so Unity merges none). Null for any other layout: Unity merges points that sit at the same place in an
        /// undocumented order, and guessing it could pin the wrong particles.</summary>
        public static double[] ParticleFreedoms(IReadOnlyList<double> freedoms, int particleCount)
        {
            if (particleCount != freedoms.Count) return null;
            var own = new double[particleCount];
            for (int i = 0; i < own.Length; i++) own[i] = freedoms[i];
            return own;
        }

        /// <summary>Into 0..1, NaN to 0: a NaN handed to Unity Cloth would stop its simulation for good.</summary>
        private static double Clamp01(double x) => x > 0 ? (x < 1 ? x : 1) : 0;
    }
}
