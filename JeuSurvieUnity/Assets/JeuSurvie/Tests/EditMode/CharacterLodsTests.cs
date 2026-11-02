// CharacterLods: the name rules that turn « X », « X_LOD1 », « X_LOD2 » into levels of detail for the character loader.
using System.Linq;
using JeuSurvie.Core.RenderData;
using NUnit.Framework;

namespace JeuSurvie.Tests
{
    public class CharacterLodsTests
    {
        [TestCase("Superhero_Female", 0)]
        [TestCase("Superhero_Female_LOD1", 1)]
        [TestCase("Elfe_Couronne_LOD2", 2)]
        [TestCase("Elfe_LODGE", 0)]
        [TestCase(null, 0)]
        public void LevelComesFromTheSuffix(string name, int level) => Assert.AreEqual(level, CharacterLods.LevelOf(name));

        [Test]
        public void BaseNameDropsTheSuffix()
        {
            Assert.AreEqual("Superhero_Female", CharacterLods.BaseOf("Superhero_Female_LOD2"));
            Assert.AreEqual("Eyes", CharacterLods.BaseOf("Eyes"));
        }

        [Test]
        public void PlanShowsEachPieceAtItsBestCopyPerLevel()
        {
            var plan = CharacterLods.Plan(new[] { "Corps", "Corps_LOD1", "Corps_LOD2", "Cheveux", "Cheveux_LOD1", "Eyes" });
            Assert.AreEqual(3, plan.Count);
            CollectionAssert.AreEquivalent(new[] { "Corps", "Cheveux", "Eyes" }, plan[0]);
            CollectionAssert.AreEquivalent(new[] { "Corps_LOD1", "Cheveux_LOD1", "Eyes" }, plan[1]);
            CollectionAssert.AreEquivalent(new[] { "Corps_LOD2", "Cheveux_LOD1", "Eyes" }, plan[2]);
        }

        [Test]
        public void ModelsWithoutLodsGetOneLevel()
        {
            var plan = CharacterLods.Plan(new[] { "Demon", "Eyes" });
            Assert.AreEqual(1, plan.Count);
            CollectionAssert.AreEquivalent(new[] { "Demon", "Eyes" }, plan[0]);
            Assert.AreEqual(1, CharacterLods.Plan(new string[0]).Count, "no names: one empty level, never a crash");
        }

        [Test]
        public void HeightIgnoresTheCrownAndTheLodCopies()
        {
            Assert.IsTrue(CharacterLods.CountsForHeight("Superhero_Female"));
            Assert.IsTrue(CharacterLods.CountsForHeight("Elfe_Cheveux_Longs"));
            Assert.IsFalse(CharacterLods.CountsForHeight("Elfe_Couronne"));
            Assert.IsFalse(CharacterLods.CountsForHeight("Elfe_Couronne_Feuilles"));
            Assert.IsFalse(CharacterLods.CountsForHeight("Superhero_Female_LOD1"));
        }

        [Test]
        public void ScreenHeightsShrinkPerLevel()
        {
            Assert.IsTrue(CharacterLods.ScreenHeights.Zip(CharacterLods.ScreenHeights.Skip(1), (a, b) => a > b).All(x => x));
        }
    }
}
