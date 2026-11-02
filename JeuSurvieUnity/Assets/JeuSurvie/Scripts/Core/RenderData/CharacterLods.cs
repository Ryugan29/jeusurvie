// Levels of detail of a character glTF: a mesh named « X_LOD1 » / « X_LOD2 » is a lighter copy of « X », shown further away.
// Pieces without such copies (eyes, leaves, belt…) stay visible at every level. Pure name logic, testable without Unity.
using System;
using System.Collections.Generic;
using System.Linq;

namespace JeuSurvie.Core.RenderData
{
    public static class CharacterLods
    {
        private const string Suffix = "_LOD";

        /// <summary>Share of the screen height under which each level takes over (level 0 first); the last is culling.</summary>
        public static readonly double[] ScreenHeights = { 0.30, 0.10, 0.015 };

        public static int LevelOf(string name)
        {
            int at = name == null ? -1 : name.LastIndexOf(Suffix, StringComparison.Ordinal);
            if (at < 0) return 0;
            return int.TryParse(name.Substring(at + Suffix.Length), out int level) && level > 0 ? level : 0;
        }

        public static string BaseOf(string name) => LevelOf(name) == 0 ? name : name.Substring(0, name.LastIndexOf(Suffix, StringComparison.Ordinal));

        /// <summary>The crown and its leaves rise above the head: they must not count when a character is scaled to its height.</summary>
        public static bool CountsForHeight(string name) => LevelOf(name) == 0 && (name == null || name.IndexOf("Couronne", StringComparison.OrdinalIgnoreCase) < 0);

        /// <summary>Per level, the mesh names to show: each piece at its best copy for that level (its own LOD when it has one,
        /// otherwise the closest lower level, down to the piece itself). One level only when nothing carries a LOD suffix.</summary>
        public static IReadOnlyList<IReadOnlyList<string>> Plan(IEnumerable<string> names)
        {
            var all = names.Where(n => !string.IsNullOrEmpty(n)).Distinct().ToList();
            int levels = all.Count == 0 ? 0 : all.Max(LevelOf);
            var byBase = all.GroupBy(BaseOf).ToDictionary(g => g.Key, g => g.ToDictionary(LevelOf, n => n));
            var plan = new List<IReadOnlyList<string>>();
            for (int level = 0; level <= levels; level++)
            {
                var shown = new List<string>();
                foreach (var piece in byBase.Values)
                {
                    for (int l = level; l >= 0; l--)
                    {
                        if (!piece.TryGetValue(l, out string name)) continue;
                        shown.Add(name);
                        break;
                    }
                }
                plan.Add(shown);
            }
            return plan;
        }
    }
}
