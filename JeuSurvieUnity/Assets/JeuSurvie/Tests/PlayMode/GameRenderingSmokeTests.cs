// Starts the game exactly like the Play button (GameBootstrap creates itself), waits for the world, then checks what is drawn:
// every material of the game must use a JeuSurvie shader that compiled without error for this graphics API (an error shader is
// drawn magenta), the near ground must exist, and the vegetation library must have loaded. Writes a picture and a report to
// Builds/Capture (git-ignored) so a failure can be looked at. Editor only: it reads the shader compiler messages.
#if UNITY_EDITOR
using System.Collections;
using System.IO;
using System.Linq;
using System.Text;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.Rendering;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.TestTools;

namespace JeuSurvie.Tests
{
    public class GameRenderingSmokeTests
    {
        private const float WorldLoadSeconds = 30;
        private const int PictureWidth = 1600, PictureHeight = 900;

        [UnityTest]
        public IEnumerator GameDrawsWithValidShaders()
        {
            LogAssert.ignoreFailingMessages = true; // the report below says what went wrong
            yield return new WaitForSecondsRealtime(WorldLoadSeconds);

            string outDir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Builds", "Capture"));
            Directory.CreateDirectory(outDir);
            var report = new StringBuilder();
            report.AppendLine($"API graphique : {SystemInfo.graphicsDeviceType} · pipeline : {GraphicsSettings.currentRenderPipeline?.name ?? "aucun"}");

            var broken = Resources.FindObjectsOfTypeAll<Shader>()
                .Where(s => s.name.Contains("JeuSurvie"))
                .OrderBy(s => s.name)
                .Where(s => Describe(s, report))
                .Select(s => s.name)
                .ToList();

            var renderers = Object.FindObjectsByType<Renderer>(FindObjectsInactive.Exclude);
            report.AppendLine($"\n{renderers.Length} objets dessinés (renderers actifs) :");
            foreach (var group in renderers.GroupBy(r => (r.GetType().Name, r.sharedMaterial != null ? r.sharedMaterial.shader.name : "(aucun matériau)")))
                report.AppendLine($"  {group.Count(),4} × {group.Key.Item1} · {group.Key.Item2}");
            int nearGround = renderers.Count(r => r.sharedMaterial != null && r.sharedMaterial.shader.name == "JeuSurvie/Terrain");

            var materials = Resources.FindObjectsOfTypeAll<Material>().Where(m => m.shader != null && m.shader.name.Contains("JeuSurvie")).ToList();
            report.AppendLine($"\n{materials.Count} matériaux JeuSurvie en mémoire (végétation comprise) :");
            foreach (var group in materials.GroupBy(m => m.shader.name)) report.AppendLine($"  {group.Count(),4} × {group.Key}");
            int foliage = materials.Count(m => m.shader.name == "JeuSurvie/Foliage");

            Material terrain = materials.FirstOrDefault(m => m.shader.name == "JeuSurvie/Terrain");
            report.AppendLine("\nTextures du sol proche (générées au démarrage) :");
            int whiteGround = 0;
            foreach (string layer in new[] { "Grass", "Soil", "Rock", "Snow" })
            {
                Texture tex = terrain != null ? terrain.GetTexture("_TsColor" + layer) : null;
                Color mean = tex is RenderTexture rt ? MeanColor(rt, Path.Combine(outDir, $"sol-{layer}.png")) : Color.white;
                if (mean.r > 0.95f && mean.g > 0.95f && mean.b > 0.95f) whiteGround++;
                report.AppendLine($"  {layer} : {(tex != null ? tex.name : "aucune")} · couleur moyenne {mean}");
            }

            SavePicture(Path.Combine(outDir, "editor-play.png"));
            File.WriteAllText(Path.Combine(outDir, "editor-play.txt"), report.ToString());
            Debug.Log(report.ToString());

            Assert.IsEmpty(broken, "shaders en erreur (dessinés en rose) — voir Builds/Capture/editor-play.txt");
            Assert.Greater(nearGround, 0, "aucun morceau de sol proche (JeuSurvie/Terrain) n'est dessiné");
            Assert.Greater(foliage, 0, "aucun matériau de végétation : la bibliothèque de modèles n'a rien chargé");
            Assert.AreEqual(0, whiteGround, "textures du sol blanches : le sol proche est dessiné blanc");
        }

        /// <summary>Average colour of a render texture (read on the CPU); also saved as a PNG to be looked at.</summary>
        private static Color MeanColor(RenderTexture rt, string path)
        {
            RenderTexture.active = rt;
            var tex = new Texture2D(rt.width, rt.height, TextureFormat.RGBA32, false, true);
            tex.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0);
            RenderTexture.active = null;
            Color[] pixels = tex.GetPixels();
            Color sum = Color.clear;
            foreach (Color c in pixels) sum += c;
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Object.Destroy(tex);
            return sum / pixels.Length;
        }

        /// <summary>Appends the shader state to the report; true if it is broken.</summary>
        private static bool Describe(Shader shader, StringBuilder report)
        {
            ShaderMessage[] messages = ShaderUtil.GetShaderMessages(shader);
            bool error = !shader.isSupported || ShaderUtil.ShaderHasError(shader) || messages.Any(m => m.severity == ShaderCompilerMessageSeverity.Error);
            report.AppendLine($"{(error ? "ERREUR" : "ok    ")} {shader.name} (supporté : {shader.isSupported})");
            foreach (ShaderMessage m in messages) report.AppendLine($"         {m.severity} [{m.platform}] {m.message} ({m.file}:{m.line})");
            return error;
        }

        private static void SavePicture(string path)
        {
            Camera cam = Camera.main;
            if (cam == null) return;
            var rt = new RenderTexture(PictureWidth, PictureHeight, 24);
            RenderTexture previous = cam.targetTexture;
            cam.targetTexture = rt;
            cam.Render();
            cam.targetTexture = previous;
            RenderTexture.active = rt;
            var tex = new Texture2D(PictureWidth, PictureHeight, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, PictureWidth, PictureHeight), 0, 0);
            RenderTexture.active = null;
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Object.Destroy(tex);
            rt.Release();
        }
    }
}
#endif
