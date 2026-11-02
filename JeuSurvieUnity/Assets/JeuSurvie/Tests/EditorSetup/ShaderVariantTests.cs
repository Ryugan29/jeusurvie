// Every material of the game is created at runtime, so a build sees none of them: Unity's build stripping must not drop the
// variants they switch on (GPU instancing for vegetation, exponential fog, keywords toggled by the graphics profiles).
// Kept outside Tests/EditMode: these tests need UnityEditor, which the dotnet harness (Tools~/CoreTests) does not have.
using System.IO;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace JeuSurvie.Tests
{
    public class ShaderVariantTests
    {
        private const int KeepAllInstancingVariants = 2;
        private const int CustomFogStripping = 1;

        [Test]
        public void BuildsKeepInstancingAndFogVariants()
        {
            var settings = new SerializedObject(GraphicsSettings.GetGraphicsSettings());
            Assert.AreEqual(KeepAllInstancingVariants, settings.FindProperty("m_InstancingStripping").intValue, "vegetation is drawn with RenderMeshInstanced");
            Assert.AreEqual(CustomFogStripping, settings.FindProperty("m_FogStripping").intValue, "fog is switched on at runtime, never in the scene");
            Assert.IsTrue(settings.FindProperty("m_FogKeepExp").boolValue, "SceneLighting uses FogMode.Exponential");
        }

        [Test]
        public void NoShaderUsesStrippableKeywords()
        {
            string dir = Path.Combine(Application.dataPath, "JeuSurvie", "Shaders");
            string[] offenders = Directory.GetFiles(dir, "*.shader")
                .Where(f => File.ReadAllText(f).Contains("shader_feature"))
                .Select(Path.GetFileName)
                .ToArray();
            Assert.IsEmpty(offenders, "keywords toggled from scripts must be multi_compile: no material in a build enables a shader_feature");
        }
    }
}
