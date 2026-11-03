// Parity fixtures produced by Tools~/parity/generate-fixtures.test.ts from the ORIGINAL TypeScript code.
using System;
using System.Collections.Generic;
using System.IO;
using JeuSurvie.Core.Storage;

namespace JeuSurvie.Tests
{
    internal static class Fixture
    {
        private static Dictionary<string, object> data;

        public static Dictionary<string, object> Data
        {
            get
            {
                if (data == null) data = Json("Assets/JeuSurvie/Tests/EditMode/Fixtures/parity.json");
                return data;
            }
        }

        /// <summary>A JSON file of the Unity project, by its path from the project root.</summary>
        public static Dictionary<string, object> Json(string rel) => (Dictionary<string, object>)new MiniJson(File.ReadAllText(Locate(rel))).ParseDocument();

        /// <summary>Whether the project has this file (made files are not versioned: absent from a fresh copy).</summary>
        public static bool Has(string rel) => Find(rel) != null;

        private static string Locate(string rel) => Find(rel) ?? throw new FileNotFoundException(rel);

        private static string Find(string rel)
        {
            // Unity: the working directory is the project root. dotnet test: walk up from the test binaries.
            if (File.Exists(rel)) return rel;
            string dir = AppContext.BaseDirectory;
            while (dir != null)
            {
                string candidate = Path.Combine(dir, rel);
                if (File.Exists(candidate)) return candidate;
                dir = Path.GetDirectoryName(dir);
            }
            return null;
        }

        public static List<object> List(string key) => (List<object>)Data[key];
        public static List<object> L(object o) => (List<object>)o;
        public static Dictionary<string, object> O(object o) => (Dictionary<string, object>)o;
        public static double D(object o) => Convert.ToDouble(o);

        /// <summary>Same order-sensitive checksum as the generator.</summary>
        public static double Digest(IList<double> values)
        {
            double s = 0;
            for (int i = 0; i < values.Count; i++) s = s * 1.000001 + values[i] * ((i % 7) + 1);
            return s;
        }

        public static double Digest(float[] values)
        {
            double s = 0;
            for (int i = 0; i < values.Length; i++) s = s * 1.000001 + (double)values[i] * ((i % 7) + 1);
            return s;
        }

        public static double Digest(int[] values)
        {
            double s = 0;
            for (int i = 0; i < values.Length; i++) s = s * 1.000001 + (double)values[i] * ((i % 7) + 1);
            return s;
        }
    }
}
