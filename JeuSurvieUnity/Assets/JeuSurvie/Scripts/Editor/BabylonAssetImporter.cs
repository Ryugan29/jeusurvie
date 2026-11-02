// Copies the original Babylon project assets (assets/: CC0 glTF models, textures — git-ignored in both projects) into
// StreamingAssets/assets, where the game loads them at runtime with glTFast, exactly like the browser loaded /assets/models/.
using System.IO;
using UnityEditor;
using UnityEngine;

namespace JeuSurvie.EditorTools
{
    public static class BabylonAssetImporter
    {
        [MenuItem("Jeu Survie/Importer les assets du projet Babylon…")]
        public static void Import()
        {
            string guess = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "assets"));
            string from = Directory.Exists(guess) ? guess : EditorUtility.OpenFolderPanel("Dossier assets du projet Babylon (contient models/)", "", "assets");
            if (string.IsNullOrEmpty(from) || !Directory.Exists(Path.Combine(from, "models")))
            {
                EditorUtility.DisplayDialog("Jeu Survie", "Dossier invalide : il doit contenir models/ (nature/, characters/, creatures/).", "OK");
                return;
            }
            string to = Path.Combine(Application.streamingAssetsPath, "assets");
            int copied = 0;
            foreach (string file in Directory.GetFiles(from, "*", SearchOption.AllDirectories))
            {
                string rel = file.Substring(from.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string dest = Path.Combine(to, rel);
                Directory.CreateDirectory(Path.GetDirectoryName(dest));
                File.Copy(file, dest, true);
                copied++;
            }
            AssetDatabase.Refresh();
            EditorUtility.DisplayDialog("Jeu Survie", $"{copied} fichiers copiés dans StreamingAssets/assets.", "OK");
        }
    }
}
