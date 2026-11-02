// Development build for diagnosing what only goes wrong in a built game: strict shader variant matching makes the player log
// every variant it asks for and does not find (instead of silently picking another), and the development player logs every
// exception with its stack trace. Output: Builds/Diagnostic (git-ignored). Run it, then the game with -capture and -logFile.
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace JeuSurvie.EditorTools
{
    public static class DiagnosticBuild
    {
        [MenuItem("Jeu Survie/Fabriquer une version de diagnostic")]
        public static void Build()
        {
            string exe = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "Builds", "Diagnostic", "JeuSurvie.exe"));
            bool strict = PlayerSettings.strictShaderVariantMatching;
            PlayerSettings.strictShaderVariantMatching = true;
            try
            {
                var options = new BuildPlayerOptions
                {
                    scenes = new[] { "Assets/JeuSurvie/Scenes/Main.unity" },
                    locationPathName = exe,
                    target = BuildTarget.StandaloneWindows64,
                    options = BuildOptions.Development,
                };
                BuildReport report = BuildPipeline.BuildPlayer(options);
                Debug.Log($"[JeuSurvie] Version de diagnostic : {report.summary.result} → {exe}");
                if (Application.isBatchMode && report.summary.result != BuildResult.Succeeded) EditorApplication.Exit(1);
            }
            finally
            {
                PlayerSettings.strictShaderVariantMatching = strict;
            }
        }
    }
}
