// Port of src/adapters/storage/graphics-preferences.ts — saved graphics preferences. UNTRUSTED data: everything is re-read and
// validated; a dubious value is ignored, reading never throws. Same key and same JSON format as the browser version.
using System;
using System.Collections.Generic;
using System.Text;
using JeuSurvie.Core.RenderData;

namespace JeuSurvie.Core.Storage
{
    public sealed class GraphicsPreferences
    {
        public readonly QualityLevel Level;
        public readonly IReadOnlyDictionary<QualityOverrideKey, bool> Overrides;
        public GraphicsPreferences(QualityLevel level, IReadOnlyDictionary<QualityOverrideKey, bool> overrides) { Level = level; Overrides = overrides; }
        public static readonly GraphicsPreferences Default = new GraphicsPreferences(Quality.DefaultLevel, new Dictionary<QualityOverrideKey, bool>());
        public GraphicsPreferences WithLevel(QualityLevel l) => new GraphicsPreferences(l, Overrides);
    }

    /// <summary>Text storage (PlayerPrefs at runtime, a fake in tests).</summary>
    public interface ITextStorage
    {
        string GetItem(string key);
        void SetItem(string key, string value);
        void RemoveItem(string key);
    }

    public static class GraphicsPreferencesCodec
    {
        public const string Key = "jeusurvie.graphismes.v1";
        private const int MaxLength = 2048;

        public static GraphicsPreferences Parse(string text)
        {
            if (text == null || text.Length > MaxLength) return GraphicsPreferences.Default;
            object data;
            try { data = new MiniJson(text).ParseDocument(); }
            catch (FormatException) { return GraphicsPreferences.Default; }
            if (!(data is Dictionary<string, object> record)) return GraphicsPreferences.Default;
            QualityLevel level = Quality.DefaultLevel;
            if (record.TryGetValue("level", out object rawLevel) && rawLevel is string s)
            {
                foreach (QualityLevel l in Quality.Levels) if (Quality.Id(l) == s) level = l;
            }
            var overrides = new Dictionary<QualityOverrideKey, bool>();
            if (record.TryGetValue("overrides", out object raw) && raw is Dictionary<string, object> o)
            {
                foreach (QualityOverrideKey k in Quality.OverrideKeys)
                    if (o.TryGetValue(Quality.OverrideId(k), out object v) && v is bool b && b == false) overrides[k] = false;
            }
            return new GraphicsPreferences(level, overrides);
        }

        public static string Serialize(GraphicsPreferences p)
        {
            var sb = new StringBuilder();
            sb.Append("{\"level\":\"").Append(Quality.Id(p.Level)).Append("\",\"overrides\":{");
            bool first = true;
            foreach (QualityOverrideKey k in Quality.OverrideKeys)
            {
                if (!(p.Overrides.TryGetValue(k, out bool v) && v == false)) continue;
                if (!first) sb.Append(',');
                sb.Append('"').Append(Quality.OverrideId(k)).Append("\":false");
                first = false;
            }
            return sb.Append("}}").ToString();
        }
    }

    public sealed class GraphicsPreferencesStore
    {
        private readonly ITextStorage storage;
        public GraphicsPreferencesStore(ITextStorage storage) { this.storage = storage; }

        public GraphicsPreferences Load()
        {
            try { return GraphicsPreferencesCodec.Parse(storage?.GetItem(GraphicsPreferencesCodec.Key)); }
            catch (Exception) { return GraphicsPreferences.Default; }
        }

        /// <summary>True if saved (false: storage unavailable; the preference lasts for this session only).</summary>
        public bool Save(GraphicsPreferences p)
        {
            try
            {
                storage?.SetItem(GraphicsPreferencesCodec.Key, GraphicsPreferencesCodec.Serialize(p));
                return storage != null;
            }
            catch (Exception) { return false; }
        }

        public GraphicsPreferences Reset()
        {
            try { storage?.RemoveItem(GraphicsPreferencesCodec.Key); }
            catch (Exception) { /* blocked storage: nothing to erase */ }
            return GraphicsPreferences.Default;
        }
    }

    /// <summary>Minimal strict JSON reader (objects, arrays, strings, numbers, booleans, null). Throws FormatException.</summary>
    public sealed class MiniJson
    {
        private readonly string s;
        private int i;
        private int depth;
        public MiniJson(string text) { s = text; }

        public object ParseDocument()
        {
            object v = Value();
            Ws();
            if (i != s.Length) throw new FormatException("trailing data");
            return v;
        }

        private void Ws() { while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++; }

        private object Value()
        {
            Ws();
            if (i >= s.Length) throw new FormatException("eof");
            char c = s[i];
            if (c == '{') return Obj();
            if (c == '[') return Arr();
            if (c == '"') return Str();
            if (Lit("true")) return true;
            if (Lit("false")) return false;
            if (Lit("null")) return null;
            return Num();
        }

        private bool Lit(string w)
        {
            if (string.CompareOrdinal(s, i, w, 0, w.Length) != 0) return false;
            i += w.Length;
            return true;
        }

        private Dictionary<string, object> Obj()
        {
            if (++depth > 32) throw new FormatException("too deep");
            var d = new Dictionary<string, object>();
            i++;
            Ws();
            if (i < s.Length && s[i] == '}') { i++; depth--; return d; }
            while (true)
            {
                Ws();
                if (i >= s.Length || s[i] != '"') throw new FormatException("key");
                string k = Str();
                Ws();
                if (i >= s.Length || s[i] != ':') throw new FormatException(":");
                i++;
                d[k] = Value();
                Ws();
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == '}') { i++; depth--; return d; }
                throw new FormatException("object");
            }
        }

        private List<object> Arr()
        {
            if (++depth > 32) throw new FormatException("too deep");
            var l = new List<object>();
            i++;
            Ws();
            if (i < s.Length && s[i] == ']') { i++; depth--; return l; }
            while (true)
            {
                l.Add(Value());
                Ws();
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == ']') { i++; depth--; return l; }
                throw new FormatException("array");
            }
        }

        private string Str()
        {
            var sb = new StringBuilder();
            i++;
            while (true)
            {
                if (i >= s.Length) throw new FormatException("string");
                char c = s[i++];
                if (c == '"') return sb.ToString();
                if (c < 0x20) throw new FormatException("control");
                if (c != '\\') { sb.Append(c); continue; }
                if (i >= s.Length) throw new FormatException("escape");
                char e = s[i++];
                switch (e)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        if (i + 4 > s.Length) throw new FormatException("unicode");
                        sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16));
                        i += 4;
                        break;
                    default: throw new FormatException("escape");
                }
            }
        }

        private double Num()
        {
            int start = i;
            if (i < s.Length && s[i] == '-') i++;
            while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '.' || s[i] == 'e' || s[i] == 'E' || s[i] == '+' || s[i] == '-')) i++;
            if (start == i) throw new FormatException("value");
            if (!double.TryParse(s.Substring(start, i - start), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double v))
                throw new FormatException("number");
            return v;
        }
    }
}
