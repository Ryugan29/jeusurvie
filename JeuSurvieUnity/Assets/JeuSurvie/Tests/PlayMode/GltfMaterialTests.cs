// glTFast's own shaders are never in a build (nothing references them): a model loaded with them gets null materials there —
// characters drawn magenta, vegetation without parts. The loaders must therefore never create a glTFast-shader material.
#if UNITY_EDITOR
using System.Collections;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using JeuSurvie.Characters;
using JeuSurvie.Core.RenderData;
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
            Assert.IsTrue(demon.Result.Renderers.All(r => r.sharedMaterials.All(m => m.GetFloat("_Cull") == (float)UnityEngine.Rendering.CullMode.Back)),
                "le démon (maillage fermé marqué double-face dans son glTF) doit garder l'élimination des faces arrière");
            Object.Destroy(demon.Result.Pivot.gameObject);
        }

        // The elf heroine brings PBR maps (relief, roughness, night glow), cut-out leaves and LOD copies: the loader must carry
        // them onto the game's materials, build the LOD group and measure her height without the crown. Her bark is grown in
        // her skin (part of the body mesh and its textures), never a separate piece laid on top.
        [UnityTest]
        public IEnumerator HeroineKeepsHerMapsLodsAndHeight()
        {
            string path = Path.Combine(ModelsDir, "characters", "heroine", "heroine.gltf");
            Assume.That(File.Exists(path), "héroïne absente");
            Shader pbr = Shader.Find("JeuSurvie/NaturePBR");
            Task<AnimatedModel> task = CharacterLoader.LoadAsync(path, 1.7, pbr);
            yield return new WaitUntil(() => task.IsCompleted);
            Assert.IsTrue(task.Status == TaskStatus.RanToCompletion, task.Exception?.GetBaseException().Message);
            AnimatedModel model = task.Result;
            yield return null;

            var materials = model.Renderers.SelectMany(r => r.sharedMaterials).Distinct().ToDictionary(m => m.name, m => m);
            Assert.IsTrue(materials.ContainsKey("MI_Elfe_Corps"), "matériaux : " + string.Join(", ", materials.Keys));
            Material body = materials["MI_Elfe_Corps"];
            Assert.IsNotNull(body.GetTexture("_BumpMap"), "le corps n'a pas de relief");
            Assert.Greater(body.GetFloat("_BumpScale"), 0f);
            Assert.AreEqual(1f, body.GetFloat("_UseRoughnessMap"), "le corps n'utilise pas sa carte de brillance");
            Assert.AreEqual(1f, body.GetFloat("_UseGlowMap"), "le corps n'a pas sa carte de lueur");
            Assert.IsNotNull(body.GetTexture("_GlowMap"));
            Material leaves = materials["MI_Elfe_Feuilles"];
            Assert.Greater(leaves.GetFloat("_Cutoff"), 0f, "les feuilles ne sont pas découpées");
            Assert.AreEqual((float)UnityEngine.Rendering.CullMode.Off, leaves.GetFloat("_Cull"), "les feuilles ne sont pas double-face");
            Assert.IsFalse(model.Renderers.Any(r => r.name.Contains("Ecorce")), "l'écorce doit pousser dans la peau, pas être une pièce posée dessus");

            LODGroup group = model.Pivot.GetComponentInChildren<LODGroup>();
            Assert.IsNotNull(group, "pas de groupe de LOD");
            Assert.AreEqual(3, group.lodCount);

            float minY = float.MaxValue, maxY = float.MinValue, topWithCrown = float.MinValue;
            foreach (Renderer r in model.Renderers)
            {
                topWithCrown = Mathf.Max(topWithCrown, r.bounds.max.y);
                if (!CharacterLods.CountsForHeight(r.name)) continue;
                minY = Mathf.Min(minY, r.bounds.min.y);
                maxY = Mathf.Max(maxY, r.bounds.max.y);
            }
            Assert.AreEqual(1.7f, maxY - minY, 0.03f, "la hauteur du corps (sans la couronne) doit faire 1,70 m");
            Assert.Greater(topWithCrown, maxY + 0.1f, "la couronne doit dépasser au-dessus des 1,70 m du corps");
            Object.Destroy(model.Pivot.gameObject);
        }

        // The screen's contact shading (SSAO) comes from noisy samples: on a moving character's smooth skin it shows as dark
        // blotches that crawl. Characters are drawn without it (the elf's outfit shading is painted in her skin); the
        // vegetation keeps it.
        [UnityTest]
        public IEnumerator CharactersAreDrawnWithoutScreenContactShading()
        {
            string path = Path.Combine(ModelsDir, "characters", "heroine", "heroine.gltf");
            Assume.That(File.Exists(path), "héroïne absente");
            Shader pbr = Shader.Find("JeuSurvie/NaturePBR"), foliage = Shader.Find("JeuSurvie/Foliage");
            var library = new ModelLibrary(Path.Combine(ModelsDir, "nature"), foliage, pbr);
            Task vegetation = library.LoadAsync(new[] { "CommonTree_2" });
            Task<AnimatedModel> heroine = CharacterLoader.LoadAsync(path, 1.7, pbr);
            yield return new WaitUntil(() => vegetation.IsCompleted && heroine.IsCompleted);
            Assert.IsTrue(vegetation.Status == TaskStatus.RanToCompletion, vegetation.Exception?.GetBaseException().Message);
            Assert.IsTrue(heroine.Status == TaskStatus.RanToCompletion, heroine.Exception?.GetBaseException().Message);

            var hers = heroine.Result.Renderers.SelectMany(r => r.sharedMaterials).Distinct().ToList();
            var trunk = library.PartsOf("CommonTree_2").Select(p => p.Material).Where(m => m.shader == pbr).ToList();
            Assert.IsNotEmpty(trunk, "l'arbre n'a aucune pièce au shader NaturePBR");
            Assert.IsNotEmpty(hers, "l'héroïne n'a aucun matériau");
            Assert.IsFalse(hers.Contains(null), "l'héroïne a un matériau vide");
            Assert.IsTrue(hers.All(m => m.HasProperty("_ScreenAO")), "le shader des personnages n'a pas de réglage _ScreenAO");
            Assert.IsTrue(hers.All(m => m.GetFloat("_ScreenAO") == 0f), "l'héroïne reçoit encore l'ombre de contact de l'écran (taches qui bougent sur sa peau)");
            Assert.IsTrue(trunk.All(m => m.GetFloat("_ScreenAO") == 1f), "la végétation doit garder l'ombre de contact de l'écran");
            Object.Destroy(heroine.Result.Pivot.gameObject);
        }
    }
}
#endif
