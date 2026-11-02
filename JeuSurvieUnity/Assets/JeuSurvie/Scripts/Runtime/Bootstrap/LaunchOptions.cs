// The demo switches of the original page address (?seed=123&view=512&heure=nuit&x=-3500&qualite=ultra&ombres=0 …) become
// command-line arguments of the Unity player: `-seed 123 -heure nuit`, `--qualite=ultra` or `-ombres=0` are all accepted, with
// the SAME names and the same validation. In the editor, GameBootstrap.launchArguments plays the role of the address bar.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace JeuSurvie.Bootstrap
{
    public sealed class LaunchOptions
    {
        private readonly Dictionary<string, string> values = new Dictionary<string, string>(StringComparer.Ordinal);

        public static LaunchOptions Parse(IEnumerable<string> args)
        {
            var o = new LaunchOptions();
            string pending = null;
            foreach (string raw in args)
            {
                if (string.IsNullOrEmpty(raw)) continue;
                if (raw.StartsWith("-") && !Regex.IsMatch(raw, "^-\\d"))
                {
                    if (pending != null) o.values[pending] = "1";
                    string name = raw.TrimStart('-');
                    int eq = name.IndexOf('=');
                    if (eq >= 0) { o.values[name.Substring(0, eq)] = name.Substring(eq + 1); pending = null; }
                    else pending = name;
                }
                else if (pending != null)
                {
                    o.values[pending] = raw;
                    pending = null;
                }
            }
            if (pending != null) o.values[pending] = "1";
            return o;
        }

        /// <summary>Value of the switch, or null (URLSearchParams.get).</summary>
        public string Get(string name) => values.TryGetValue(name, out string v) ? v : null;

        public bool Off(string name) => Get(name) == "0";

        /// <summary>parseSeed: 1 to 10 digits ≤ 4 294 967 295, else 12345.</summary>
        public uint Seed()
        {
            string t = Get("seed");
            return t != null && Regex.IsMatch(t, "^\\d{1,10}$") && ulong.Parse(t, CultureInfo.InvariantCulture) <= 0xffffffffUL ? (uint)ulong.Parse(t, CultureInfo.InvariantCulture) : 12345u;
        }

        /// <summary>parseCoord: integer of at most 4 digits, clamped to ±7000; 0 otherwise.</summary>
        public double Coord(string name)
        {
            string t = Get(name);
            double n = t != null && Regex.IsMatch(t, "^-?\\d{1,4}$") ? double.Parse(t, CultureInfo.InvariantCulture) : 0;
            return Math.Min(7000, Math.Max(-7000, n));
        }

        /// <summary>clampInt: 1 to 5 digits clamped to [min, max]; fallback otherwise.</summary>
        public int ClampInt(string name, int min, int max, int fallback)
        {
            string t = Get(name);
            int n = t != null && Regex.IsMatch(t, "^\\d{1,5}$") ? int.Parse(t, CultureInfo.InvariantCulture) : fallback;
            return Math.Min(max, Math.Max(min, n));
        }

        public double Number(string name, double fallback)
        {
            string t = Get(name);
            return t != null && double.TryParse(t, NumberStyles.Float, CultureInfo.InvariantCulture, out double v) && !double.IsNaN(v) && !double.IsInfinity(v) ? v : fallback;
        }
    }
}
