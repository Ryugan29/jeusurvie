// Where the game save lives on the player's PC: one file per world in the game's data folder. Writing goes to a temporary
// file first, which then replaces the save in one step (the previous save is kept as « .bak »): a crash while saving never
// leaves a half-written save. Nothing is ever deleted: an unreadable save is renamed aside. MemorySaveStore is for runs
// that must not touch the player's save (tests, automated captures).
using System;
using System.IO;
using System.Text;
using JeuSurvie.Core.Storage;
using UnityEngine;

namespace JeuSurvie.Gameplay
{
    public sealed class FileSaveStore : ISaveStore
    {
        private readonly string main, backup, temp;

        public FileSaveStore(uint seed)
        {
            string dir = Path.Combine(Application.persistentDataPath, "sauvegardes");
            Directory.CreateDirectory(dir);
            main = Path.Combine(dir, $"monde-{seed}.json");
            backup = main + ".bak";
            temp = main + ".tmp";
        }

        public string Location => main;

        public string Read(bool fromBackup)
        {
            string path = fromBackup ? backup : main;
            try { return File.Exists(path) ? File.ReadAllText(path, Encoding.UTF8) : null; }
            catch (Exception e) // locked, no rights, damaged disk: as if there were none, the file itself is left alone
            {
                Debug.LogWarning("[JeuSurvie] Sauvegarde illisible : " + e.Message);
                return null;
            }
        }

        public void WriteAtomic(string text)
        {
            using (var f = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                byte[] bytes = new UTF8Encoding(false).GetBytes(text);
                f.Write(bytes, 0, bytes.Length);
                f.Flush(true);
            }
            if (File.Exists(main)) File.Replace(temp, main, backup);
            else File.Move(temp, main);
        }

        public void Quarantine()
        {
            if (File.Exists(main)) File.Move(main, Aside(main, "illisible"));
        }

        /// <summary>« Nouvelle partie »: the current save is kept aside under a dated name, never deleted.</summary>
        public void SetAside()
        {
            string stamp = Aside(main, "ancienne");
            if (File.Exists(main)) File.Move(main, stamp);
            if (File.Exists(backup)) File.Move(backup, stamp + ".bak"); // or the old game would come back from the backup
        }

        /// <summary>A free dated name next to `path` (never an existing file).</summary>
        private static string Aside(string path, string why)
        {
            string baseName = path + "." + why + "-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff");
            string name = baseName;
            for (int i = 2; File.Exists(name); i++) name = baseName + "-" + i;
            return name;
        }
    }

    public sealed class MemorySaveStore : ISaveStore
    {
        private string main, backup;
        public string Read(bool fromBackup) => fromBackup ? backup : main;
        public void WriteAtomic(string text) { backup = main; main = text; }
        public void Quarantine() { main = null; }
    }
}
