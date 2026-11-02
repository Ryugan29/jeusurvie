// The Core meshes (ground chunks, far relief) come from the Babylon port: their triangles must be turned to Unity's front-face
// order, otherwise the ground is seen from below and culled (the near ground showed the sky through it).
using JeuSurvie.Core.World;
using JeuSurvie.World;
using NUnit.Framework;
using UnityEngine;

namespace JeuSurvie.Tests
{
    public class UnityWindingTests
    {
        private const int Verts = 4;

        [Test]
        public void FlatCoreGridFacesUpInUnity()
        {
            var core = new int[(Verts - 1) * (Verts - 1) * 6];
            int k = 0;
            for (int row = 0; row < Verts - 1; row++)
                for (int col = 0; col < Verts - 1; col++, k += 6)
                    Triangulation.QuadTriangles(col, row, Verts, core, k);

            int[] unity = UnityWinding.FromCore(core);

            Vector3 P(int i) => new Vector3(i % Verts, 0, i / Verts); // MeshData layout: col → x, row → z
            for (int t = 0; t < unity.Length; t += 3)
            {
                // Unity draws the side from which the corners turn clockwise: there, Cross(b − a, c − a) points to the viewer.
                Vector3 facing = Vector3.Cross(P(unity[t + 1]) - P(unity[t]), P(unity[t + 2]) - P(unity[t]));
                Assert.Greater(facing.y, 0, $"triangle {t / 3} tourné vers le bas");
            }
        }

        [Test]
        public void ConversionKeepsTheCoreArrayUntouched()
        {
            int[] core = { 0, 3, 2, 0, 1, 3 };
            int[] unity = UnityWinding.FromCore(core);
            CollectionAssert.AreEqual(new[] { 0, 3, 2, 0, 1, 3 }, core);
            CollectionAssert.AreEqual(new[] { 0, 2, 3, 0, 3, 1 }, unity);
        }
    }
}
