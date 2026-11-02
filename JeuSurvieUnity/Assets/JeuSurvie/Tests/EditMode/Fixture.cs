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
                if (data == null) data = (Dictionary<string, object>)new MiniJson(File.ReadAllText(Locate())).ParseDocument();
                return data;
            }
        }

        private static string Locate()
        {
            const string rel = "Assets/JeuSurvie/Tests/EditMode/Fixtures/parity.json";
            // Unity: the working directory is the project root. dotnet test: walk up from the test binaries.
            if (File.Exists(rel)) return rel;
            string dir = AppContext.BaseDirectory;
            while (dir != null)
            {
                string candidate = Path.Combine(dir, rel);
                if (File.Exists(candidate)) return candidate;
                dir = Path.GetDirectoryName(dir);
            }
            throw new FileNotFoundException(rel);
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
