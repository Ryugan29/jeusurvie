// Starts the game exactly like the Play button (GameBootstrap creates itself), waits for the world, then checks what is drawn:
// every JeuSurvie shader compiled without error for this graphics API (an error shader is drawn magenta), the near ground and
// the vegetation are there, and the ground really covers the lower half of the view (seen through, it showed the sky).
// Writes a picture and a report to Builds/Capture (git-ignored) so a failure can be looked at. Editor only: it reads the
// shader compiler messages.
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
        private const float WorldLoadTimeoutSeconds = 90, SettleSeconds = 5;
        private const int LoadedChunks = 20;
        private const int PictureWidth = 1600, PictureHeight = 900;
        private const float MaxBackgroundShareUnderHorizon = 0.05f;

        [UnityTest]
        public IEnumerator GameDrawsWithValidShaders()
        {
            LogAssert.ignoreFailingMessages = true; // the report below says what went wrong
            float started = Time.realtimeSinceStartup;
            yield return new WaitUntil(() => TerrainChunkCount() > LoadedChunks || Time.realtimeSinceStartup - started > WorldLoadTimeoutSeconds);
            yield return new WaitForSecondsRealtime(SettleSeconds); // vegetation and ground cover follow the chunks
            Camera cam = Camera.main;
            Assert.IsNotNull(cam, "pas de caméra principale : le jeu n'a pas démarré");

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

            Texture2D picture = Render(cam);
            File.WriteAllBytes(Path.Combine(outDir, "editor-play.png"), picture.EncodeToPNG());
            Object.Destroy(picture);
            float background = BackgroundShareUnderHorizon(cam);
            report.AppendLine($"\nFond visible sous l'horizon : {background:P1}");

            File.WriteAllText(Path.Combine(outDir, "editor-play.txt"), report.ToString());
            Debug.Log(report.ToString());

            Assert.IsEmpty(broken, "shaders en erreur (dessinés en rose) — voir Builds/Capture/editor-play.txt");
            Assert.Greater(nearGround, 0, "aucun morceau de sol proche (JeuSurvie/Terrain) n'est dessiné");
            Assert.Greater(foliage, 0, "aucun matériau de végétation : la bibliothèque de modèles n'a rien chargé");
            Assert.Less(background, MaxBackgroundShareUnderHorizon, "on voit le fond à travers le sol (triangles du sol retournés ?)");
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

        /// <summary>Share of the lower half of the view where nothing is drawn: the sky is replaced by a pure blue background.</summary>
        private static float BackgroundShareUnderHorizon(Camera cam)
        {
            Material sky = RenderSettings.skybox;
            CameraClearFlags flags = cam.clearFlags;
            Color previous = cam.backgroundColor;
            Texture2D tex;
            try
            {
                RenderSettings.skybox = null;
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = Color.blue;
                tex = Render(cam);
            }
            finally
            {
                RenderSettings.skybox = sky;
                cam.clearFlags = flags;
                cam.backgroundColor = previous;
            }
            Color[] lower = tex.GetPixels(0, 0, tex.width, tex.height / 2); // texture rows start at the bottom
            Object.Destroy(tex);
            // "Blue dominant" rather than pure blue: haze and post effects tint the cleared background.
            return (float)lower.Count(c => c.b > 0.5f && c.b > c.r + 0.25f && c.b > c.g + 0.25f) / lower.Length;
        }

        private static int TerrainChunkCount() =>
            Object.FindObjectsByType<MeshRenderer>(FindObjectsInactive.Exclude).Count(r => r.sharedMaterial != null && r.sharedMaterial.shader.name == "JeuSurvie/Terrain");

        private static Texture2D Render(Camera cam)
        {
            var rt = new RenderTexture(PictureWidth, PictureHeight, 24);
            RenderTexture previous = cam.targetTexture;
            cam.targetTexture = rt;
            cam.Render();
            cam.targetTexture = previous;
            RenderTexture.active = rt;
            var tex = new Texture2D(PictureWidth, PictureHeight, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, PictureWidth, PictureHeight), 0, 0);
            RenderTexture.active = null;
            rt.Release();
            Object.Destroy(rt);
            return tex;
        }
    }
}
#endif
