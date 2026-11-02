// LeafCloth: how the elf's leaf outfit (Unity Cloth in the game) takes the game's wind, gusts and rain. The simulation itself
// runs in the game; here the tuning it receives must be progressive, bounded and continuous from dry to soaked.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;
using NUnit.Framework;

namespace JeuSurvie.Tests
{
    public class LeafClothTests
    {
        private static readonly LeafClothTuning Tuning = new LeafClothTuning();

        private static double Horizontal(LeafClothState s) => Math.Sqrt(s.Push.X * s.Push.X + s.Push.Z * s.Push.Z);

        [Test]
        public void NoWindNoPush()
        {
            LeafClothState s = LeafCloth.For(Tuning, 0, 1, 0);
            Assert.AreEqual(0, Horizontal(s), 1e-9);
            Assert.AreEqual(0, s.Flutter.X, 1e-9);
        }

        [Test]
        public void LightWindIsSubtleAndGustsLiftTheLeaves()
        {
            double calm = Horizontal(LeafCloth.For(Tuning, 0.4, 0.25, 0)); // the game's calm wind, between gusts
            double storm = Horizontal(LeafCloth.For(Tuning, 1.6, 1.0, 0)); // the game's strongest wind, at a gust's peak
            Assert.Greater(calm, 0);
            Assert.Less(calm, 1.5, "un vent faible ne doit faire que frémir les feuilles");
            Assert.Greater(storm, 5.0, "une rafale forte doit soulever les pans libres");
            Assert.Less(storm, LeafCloth.Gravity * 1.2, "même en tempête, les feuilles ne doivent pas se mettre à l'horizontale d'un coup");
        }

        [Test]
        public void PushGrowsWithWindAndGusts()
        {
            double previous = -1;
            for (int i = 0; i <= 10; i++)
            {
                double push = Horizontal(LeafCloth.For(Tuning, 1.0, i / 10.0, 0));
                Assert.Greater(push, previous);
                previous = push;
            }
            Assert.Less(Horizontal(LeafCloth.For(Tuning, 0.5, 0.5, 0)), Horizontal(LeafCloth.For(Tuning, 1.0, 0.5, 0)));
        }

        [Test]
        public void WindBlowsLikeTheGrass()
        {
            LeafClothState s = LeafCloth.For(Tuning, 1.0, 0.5, 0);
            double h = Horizontal(s);
            Assert.AreEqual(Foliage.WindDirX, s.Push.X / h, 1e-6);
            Assert.AreEqual(Foliage.WindDirZ, s.Push.Z / h, 1e-6);
        }

        [Test]
        public void SoakedLeavesAreHeavierCalmerAndCatchLessWind()
        {
            LeafClothState dry = LeafCloth.For(Tuning, 1.2, 0.8, 0), wet = LeafCloth.For(Tuning, 1.2, 0.8, 1);
            Assert.Less(Horizontal(wet), Horizontal(dry) * 0.6, "mouillées, elles prennent moins le vent");
            Assert.Less(wet.Push.Y, dry.Push.Y - 2, "mouillées, elles pèsent plus lourd");
            Assert.Greater(wet.Damping, dry.Damping, "mouillées, elles s'agitent moins");
            Assert.Less(wet.Flutter.X, dry.Flutter.X);
            Assert.Less(wet.BendingStiffness, dry.BendingStiffness, "mouillées, elles épousent davantage");
        }

        [Test]
        public void WetnessChangesWithoutJumps()
        {
            LeafClothState previous = LeafCloth.For(Tuning, 1.2, 0.8, 0);
            for (int i = 1; i <= 100; i++)
            {
                LeafClothState s = LeafCloth.For(Tuning, 1.2, 0.8, i / 100.0);
                Assert.Less(Math.Abs(Horizontal(s) - Horizontal(previous)), 0.1);
                Assert.Less(Math.Abs(s.Push.Y - previous.Push.Y), 0.1);
                Assert.Less(Math.Abs(s.Damping - previous.Damping), 0.01);
                Assert.Less(Math.Abs(s.BendingStiffness - previous.BendingStiffness), 0.01);
                previous = s;
            }
        }

        [Test]
        public void SettingsStayInTheClothRanges()
        {
            var extreme = new LeafClothTuning { Softness = 5, Damping = -1, FollowMovement = 3 };
            foreach (double wet in new[] { 0.0, 0.5, 1.0 })
            {
                LeafClothState s = LeafCloth.For(extreme, 1.6, 1, wet);
                Assert.That(s.Damping, Is.InRange(0.0, 1.0));
                Assert.That(s.BendingStiffness, Is.InRange(0.0, 1.0));
                Assert.That(s.MovementShare, Is.InRange(0.0, 1.0));
            }
        }

        [Test]
        public void OutOfRangeWeatherIsClamped()
        {
            LeafClothState over = LeafCloth.For(Tuning, 1.0, 3.0, 5.0), top = LeafCloth.For(Tuning, 1.0, 1.0, 1.0);
            Assert.AreEqual(Horizontal(top), Horizontal(over), 1e-9);
            Assert.AreEqual(top.Push.Y, over.Push.Y, 1e-9);
            Assert.AreEqual(0, Horizontal(LeafCloth.For(Tuning, -2.0, 1.0, 0)), 1e-9);
            double strongest = Horizontal(LeafCloth.For(Tuning, LeafCloth.MaxWindStrength, 1, 0));
            Assert.AreEqual(strongest, Horizontal(LeafCloth.For(Tuning, double.PositiveInfinity, 1, 0)), 1e-9, "un vent démesuré est plafonné");
            Assert.GreaterOrEqual(LeafCloth.MaxWindStrength, 1.6, "le vent le plus fort du jeu ne doit pas être rogné");
        }

        // A NaN handed to Unity Cloth stops its simulation for good: broken weather numbers count as calm and dry.
        [Test]
        public void BrokenWeatherNumbersCountAsCalmAndDry()
        {
            LeafClothState broken = LeafCloth.For(Tuning, double.NaN, double.NaN, double.NaN), calm = LeafCloth.For(Tuning, 0, 0, 0);
            Assert.AreEqual(calm.Push.X, broken.Push.X);
            Assert.AreEqual(calm.Push.Y, broken.Push.Y);
            Assert.AreEqual(calm.Push.Z, broken.Push.Z);
            Assert.AreEqual(calm.Flutter.X, broken.Flutter.X);
            Assert.AreEqual(calm.Damping, broken.Damping);
            Assert.AreEqual(calm.BendingStiffness, broken.BendingStiffness);
            Assert.AreEqual(0, LeafCloth.MaxDistance(Tuning.TipFreedomM, double.NaN));
            Assert.AreEqual(0, LeafCloth.MaxDistance(Tuning.TipFreedomM, -1));
        }

        [Test]
        public void TheTiedTopOfALeafNeverMoves()
        {
            foreach (double v in new[] { 0.0, LeafCloth.AttachedV / 2, LeafCloth.AttachedV })
                Assert.AreEqual(0, LeafCloth.MaxDistance(Tuning.TipFreedomM, v), 1e-9, $"v = {v} : nouée sur la ceinture, elle ne bouge pas");
        }

        [Test]
        public void BelowTheKnotTheLeafGetsFreerToItsTip()
        {
            double previous = 0;
            for (int i = 2; i <= 10; i++)
            {
                double d = LeafCloth.MaxDistance(Tuning.TipFreedomM, i / 10.0);
                Assert.Greater(d, previous);
                previous = d;
            }
            Assert.GreaterOrEqual(LeafCloth.MaxDistance(Tuning.TipFreedomM, 0.5), 0.4 * Tuning.TipFreedomM, "le milieu de la feuille doit pouvoir s'écarter d'une cuisse qui avance");
            Assert.AreEqual(Tuning.TipFreedomM, LeafCloth.MaxDistance(Tuning.TipFreedomM, 1), 1e-9);
            Assert.AreEqual(Tuning.TipFreedomM, LeafCloth.MaxDistance(Tuning.TipFreedomM, 2), 1e-9);
        }

        // A thigh is not round around its bone: the leaves' obstacle is fitted on the skin points around the bone line.
        [Test]
        public void ALimbIsFittedOnItsSkinNotOnItsBone()
        {
            var skin = new List<Vec3>();
            for (int ring = 0; ring < 40; ring++)
                for (int k = 0; k < 24; k++)
                {
                    double a = 2 * Math.PI * k / 24, y = -0.005 - 0.01 * ring; // rings between, never on, the slice's edges
                    skin.Add(new Vec3(0.02 + 0.07 * Math.Cos(a), y, 0.07 * Math.Sin(a))); // the thigh, off its bone
                    skin.Add(new Vec3(0.30 + 0.07 * Math.Cos(a), y, 0.07 * Math.Sin(a))); // the other leg: ignored
                }
            Assert.IsTrue(LeafCloth.FitSphere(skin, new Vec3(0, 0, 0), new Vec3(0, -0.4, 0), 0.5, out Vec3 centre, out double radius));
            Assert.AreEqual(0.02, centre.X, 1e-3, "au centre de la cuisse, pas sur l'os");
            Assert.AreEqual(-0.2, centre.Y, 1e-3);
            Assert.AreEqual(0.0, centre.Z, 1e-3);
            Assert.AreEqual(0.07 - LeafCloth.FitMarginM, radius, 1e-3, "juste à l'intérieur de la peau");
        }

        [Test]
        public void NoSkinAroundGivesNoObstacle()
        {
            var skin = new List<Vec3>();
            for (int k = 0; k < 24; k++) skin.Add(new Vec3(0.07 * Math.Cos(k), -0.02, 0.07 * Math.Sin(k)));
            Assert.IsFalse(LeafCloth.FitSphere(skin, new Vec3(0, 0, 0), new Vec3(0, -0.4, 0), 0.9, out _, out _));
        }

        [Test]
        public void SkirtSwingsMoreThanTheShoulderLeaves()
        {
            LeafPiece[] pieces = LeafCloth.Pieces(Tuning);
            LeafPiece skirt = Array.Find(pieces, p => p.Mesh == "Elfe_Jupe"), pads = Array.Find(pieces, p => p.Mesh == "Elfe_Epaulettes");
            Assert.AreEqual(Tuning.TipFreedomM, skirt.TipFreedomM, 1e-9);
            Assert.AreEqual(Tuning.ShoulderTipFreedomM, pads.TipFreedomM, 1e-9);
            Assert.Less(pads.TipFreedomM, skirt.TipFreedomM, "posées sur l'épaule, elles ne doivent pas s'envoler comme la jupe");
        }

        [Test]
        public void EveryPieceCollidesWithMirroredLimbs()
        {
            foreach (LeafPiece piece in LeafCloth.Pieces(Tuning))
            {
                Assert.IsNotEmpty(piece.Capsules, piece.Mesh);
                foreach (BoneCapsule c in piece.Capsules)
                {
                    foreach (BoneSphere s in new[] { c.A, c.B }) Assert.That(s.T, Is.InRange(0.0, 1.0), $"{piece.Mesh} : {s.Bone}");
                    if (!c.A.Bone.EndsWith("_l")) continue;
                    Assert.IsTrue(Array.Exists(piece.Capsules, m => m.A.Bone == c.A.Bone.Replace("_l", "_r") && m.A.Toward == c.A.Toward.Replace("_l", "_r")
                        && m.B.Bone == c.B.Bone.Replace("_l", "_r") && m.A.T == c.A.T && m.B.T == c.B.T), $"{piece.Mesh} : pas de pendant à droite pour {c.A.Bone}");
                }
            }
        }

        // One cloth particle per point of the leaves (tenue.py shares the points between a leaf's rows).
        [Test]
        public void EachPointGetsItsLeafFreedom()
        {
            double[] freedom = LeafCloth.ParticleFreedoms(new[] { 0.0, 0.5, 1.0 }, 3);
            CollectionAssert.AreEqual(new[] { 0.0, 0.5, 1.0 }, freedom);
        }

        // Unity merges points that sit at the same place, in an order it does not document: rather than guess which particle is
        // which (and pin the wrong ones), such a mesh is refused.
        [Test]
        public void AnyOtherParticleLayoutIsRefused()
        {
            Assert.IsNull(LeafCloth.ParticleFreedoms(new[] { 0.3, 0.5, 0.0, 1.0 }, 3), "mieux vaut une tenue sans tissu qu'une tenue mal attachée");
            Assert.IsNull(LeafCloth.ParticleFreedoms(new[] { 0.0, 0.5, 1.0 }, 4));
        }
    }
}
