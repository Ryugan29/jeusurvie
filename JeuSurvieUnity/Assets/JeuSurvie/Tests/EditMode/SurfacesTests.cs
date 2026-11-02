// The elf's materials carry French names (MI_Elfe_Bois, MI_Elfe_Cheveux…): Surfaces must give them the same look as their
// English counterparts, and unknown names must keep falling back on the default.
using JeuSurvie.Core.RenderData;
using NUnit.Framework;

namespace JeuSurvie.Tests
{
    public class SurfacesTests
    {
        [TestCase("MI_Elfe_Bois", "Bark_NormalTree")]
        [TestCase("MI_Elfe_Cheveux", "MI_Hair_2")]
        [TestCase("MI_Elfe_Sourcils", "MI_Hair_2")]
        [TestCase("MI_Elfe_Cils", "MI_Hair_2")]
        [TestCase("MI_Elfe_Yeux", "MI_Eyes")]
        public void FrenchElfMaterialsMatchTheirEnglishKind(string french, string english)
        {
            Assert.AreEqual(Surfaces.For(english).Roughness, Surfaces.For(french).Roughness, 1e-9);
            Assert.AreEqual(Surfaces.For(english).EnvironmentIntensity, Surfaces.For(french).EnvironmentIntensity, 1e-9);
        }

        [Test]
        public void LeavesAndLeatherAreMatteButNotAsRoughAsBark()
        {
            Assert.Less(Surfaces.For("MI_Elfe_Feuilles").Roughness, Surfaces.For("MI_Elfe_Bois").Roughness);
            Assert.Less(Surfaces.For("MI_Elfe_Tenue_Cuir").Roughness, Surfaces.For("MI_Elfe_Bois").Roughness);
            Assert.Greater(Surfaces.For("MI_Elfe_Feuilles").Roughness, Surfaces.Default.Roughness);
        }

        [Test]
        public void UnknownNamesKeepTheDefault()
        {
            Assert.AreEqual(Surfaces.Default.Roughness, Surfaces.For("quelque_chose").Roughness, 1e-9);
            Assert.AreEqual(Surfaces.Default.Roughness, Surfaces.For(null).Roughness, 1e-9);
        }
    }
}
