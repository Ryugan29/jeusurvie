// glTFast's own shaders are never in a build (nothing references them): a model loaded with them gets null materials there —
// characters drawn magenta, vegetation without parts. The loaders must therefore never create a glTFast-shader material.
#if UNITY_EDITOR
using System.Collections;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using JeuSurvie.Characters;
using JeuSurvie.Vegetation;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace JeuSurvie.Tests
{
    public class GltfMaterialTests
    {
        private static string ModelsDir => Path.Combine(Application.streamingAssetsPath, "assets", "models");

        private static int GltfShaderMaterials() =>
            Resources.FindObjectsOfTypeAll<Material>().Count(m => m.shader != null && m.shader.name.Contains("glTF"));

        [UnityTest]
        public IEnumerator ModelsLoadWithoutGltfastShaders()
        {
            Assume.That(Directory.Exists(ModelsDir), "modèles absents (menu Jeu Survie → Importer les assets)");
            Shader pbr = Shader.Find("JeuSurvie/NaturePBR"), foliage = Shader.Find("JeuSurvie/Foliage");
            int before = GltfShaderMaterials();

            var library = new ModelLibrary(Path.Combine(ModelsDir, "nature"), foliage, pbr);
            Task vegetation = library.LoadAsync(new[] { "CommonTree_2", "Grass_Common_Short" });
            Task<AnimatedModel> demon = CharacterLoader.LoadAsync(Path.Combine(ModelsDir, "creatures", "Demon.gltf"), 2.0, pbr);
            yield return new WaitUntil(() => vegetation.IsCompleted && demon.IsCompleted);

            Assert.IsTrue(vegetation.Status == TaskStatus.RanToCompletion, vegetation.Exception?.GetBaseException().Message);
            Assert.IsTrue(demon.Status == TaskStatus.RanToCompletion, demon.Exception?.GetBaseException().Message);
            Assert.AreEqual(before, GltfShaderMaterials(), "le chargement a créé des matériaux aux shaders glTFast (absents du jeu fabriqué)");
            Assert.IsNotEmpty(library.PartsOf("CommonTree_2"), "l'arbre n'a aucune pièce à dessiner");
            Assert.IsTrue(demon.Result.Renderers.All(r => r.sharedMaterials.All(m => m != null && m.shader == pbr)), "le démon a un matériau vide ou étranger");
            Object.Destroy(demon.Result.Pivot.gameObject);
        }
    }
}
#endif
