// Bit-exact parity of the world generator (genVersion 1) with the original TypeScript (fixtures) and its golden values.
using System;
using System.Collections.Generic;
using System.Linq;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;
using JeuSurvie.Core.World;
using JeuSurvie.Core.Physics;
using NUnit.Framework;
using static JeuSurvie.Tests.Fixture;

namespace JeuSurvie.Tests
{
    public class WorldParityTests
    {
        [Test]
        public void Hash2MatchesTypeScript()
        {
            foreach (object row in List("hash"))
            {
                var r = L(row);
                Assert.AreEqual((uint)D(r[4]), Hash.Hash2((uint)D(r[0]), (int)D(r[1]), (int)D(r[2]), (int)D(r[3])));
            }
        }

        [Test]
        public void NoiseFunctionsAreBitExact()
        {
            var p = new FbmParams(5, 2, 0.5);
            foreach (object row in List("noise"))
            {
                var r = L(row);
                uint seed = (uint)D(r[0]);
                double u = D(r[1]), v = D(r[2]);
                Assert.AreEqual(D(r[3]), Noise.GradientNoise2(seed, u, v, 3));
                Assert.AreEqual(D(r[4]), Noise.Fbm2(seed, u, v, p, 7));
                Assert.AreEqual(D(r[5]), Noise.RidgedFbm2(seed, u, v, p, 8));
                Assert.AreEqual(D(r[6]), Noise.RidgedMultifractal2(seed, u, v, p, 9));
                Assert.AreEqual(D(r[7]), Noise.ErodedFbm2(seed, u, v, p, 10));
            }
        }

        [Test]
        public void TerrainBiomeSurfacePathForestAreBitExact()
        {
            foreach (object row in List("world"))
            {
                var r = L(row);
                uint seed = (uint)D(r[0]);
                double x = D(r[1]), z = D(r[2]);
                Assert.AreEqual(D(r[3]), Terrain.HeightAt(seed, x, z), $"height {seed} {x} {z}");
                TerrainRegions reg = Terrain.RegionsAt(seed, x, z);
                Assert.AreEqual(D(r[4]), reg.Hills);
                Assert.AreEqual(D(r[5]), reg.Mountains);
                BiomeSample b = Biome.At(seed, x, z);
                Assert.AreEqual(D(r[6]), b.Cold);
                Assert.AreEqual(D(r[7]), b.Humidity);
                SurfaceVariation s = Surface.VariationAt(seed, x, z);
                Assert.AreEqual(D(r[8]), s.Patch);
                Assert.AreEqual(D(r[9]), s.SnowJitter);
                Assert.AreEqual(D(r[10]), Paths.PathAt(seed, x, z));
                Assert.AreEqual(D(r[11]), Placement.ForestFactorAt(seed, x, z));
            }
            int onPath = 0;
            foreach (object row in List("paths"))
            {
                var r = L(row);
                double p = Paths.PathAt(12345, D(r[0]), D(r[1]));
                Assert.AreEqual(D(r[2]), p);
                if (p > 0) onPath++;
            }
            Assert.Greater(onPath, 0, "the dense path sample must cross at least one path");
        }

        /// <summary>Golden values of terrain.golden.test.ts (sealed generator, genVersion 1).</summary>
        [TestCase(0u, new[] { -7.089770546816561, -4.472260853513685, 0.38529909957669384, 9.462717425926446, -15.043161117065214, -0.23850733309575656 }, new[] { 0.16633982956409454, -1.324257731437683, -4.867537975311279 })]
        [TestCase(1u, new[] { -3.5195856704796444, -4.965818244809317, -5.666144307348208, -9.128015757871069, -8.680048656550014, 71.29448890353167 }, new[] { 1.2445087432861328, -2.62094783782959, -2.6459624767303467 })]
        [TestCase(12345u, new[] { -12.051923931045327, -9.234180239007442, 14.993175426057595, 3.23839730201535, 3.754101219158828, 249.77565363458513 }, new[] { -9.606366157531738, -8.029662132263184, -8.961307525634766 })]
        [TestCase(3735928559u, new[] { -5.940550941688452, -5.8012885353859485, 0.46785671966876086, -15.38920729207813, -2.1845842508881983, -1.2604914395109028 }, new[] { 2.214306354522705, 7.682145595550537, 12.299897193908691 })]
        public void GoldenHeights(uint seed, double[] heights, double[] chunk3m2)
        {
            double[,] points = { { 0, 0 }, { 10, 20 }, { -1234.5, 777.25 }, { 5000, -6000 }, { -7999.75, 3.125 }, { 3961, 2711 } };
            for (int i = 0; i < 6; i++) Assert.AreEqual(heights[i], Terrain.HeightAt(seed, points[i, 0], points[i, 1]));
            ChunkData chunk = Chunk.Generate(seed, 3, -2);
            Assert.AreEqual(chunk3m2[0], (double)chunk.Heights[0]);
            Assert.AreEqual(chunk3m2[1], (double)chunk.Heights[544]);
            Assert.AreEqual(chunk3m2[2], (double)chunk.Heights[1088]);
        }

        [Test]
        public void ChunksResourcesCoverAndMeshesMatch()
        {
            foreach (object co in List("chunks"))
            {
                var c = O(co);
                uint seed = (uint)D(c["seed"]);
                int cx = (int)D(c["cx"]), cz = (int)D(c["cz"]);
                ChunkData chunk = Chunk.Generate(seed, cx, cz);
                var heights = L(c["heights"]);
                for (int i = 0; i < heights.Count; i++) Assert.AreEqual(D(heights[i]), (double)chunk.Heights[i]);

                List<Resource> resources = Placement.InChunk(seed, cx, cz);
                var expected = L(c["resources"]);
                var colliders = L(c["colliders"]);
                Assert.AreEqual(expected.Count, resources.Count, $"resources of {cx},{cz}");
                for (int i = 0; i < expected.Count; i++)
                {
                    var e = L(expected[i]);
                    Resource r = resources[i];
                    Assert.AreEqual((string)e[0], r.Id);
                    Assert.AreEqual((string)e[1], r.Kind.ToString().ToLowerInvariant());
                    Assert.AreEqual((int)D(e[2]), r.Variant);
                    Assert.AreEqual(D(e[3]), r.X);
                    Assert.AreEqual(D(e[4]), r.Z);
                    Assert.AreEqual(D(e[5]), r.Rotation);
                    Assert.AreEqual(D(e[6]), r.Scale);
                    Assert.AreEqual((string)e[7], ResourceModels.ModelKeyFor(r));
                    Circle? col = Colliders.ColliderOf(r);
                    if (colliders[i] == null) Assert.IsNull(col);
                    else
                    {
                        var ec = L(colliders[i]);
                        Assert.AreEqual(D(ec[0]), col.Value.X, 1e-9);
                        Assert.AreEqual(D(ec[1]), col.Value.Z, 1e-9);
                        Assert.AreEqual(D(ec[2]), col.Value.R, 1e-12);
                        Assert.AreEqual(D(ec[3]), col.Value.Height, 1e-12);
                    }
                }

                List<CoverItem> cover = GroundCover.InChunk(seed, chunk);
                var ce = O(c["cover"]);
                Assert.AreEqual((int)D(ce["count"]), cover.Count, $"cover count {cx},{cz}");
                Assert.AreEqual(D(ce["models"]), Digest(cover.Select(i => (double)(i.Model.Length + i.Model[i.Model.Length - 1])).ToList()));
                Assert.AreEqual(D(ce["x"]), Digest(cover.Select(i => i.X).ToList()));
                Assert.AreEqual(D(ce["z"]), Digest(cover.Select(i => i.Z).ToList()));
                Assert.AreEqual(D(ce["rotation"]), Digest(cover.Select(i => i.Rotation).ToList()));
                Assert.AreEqual(D(ce["scale"]), Digest(cover.Select(i => i.Scale).ToList()));
                var first = L(ce["first"]);
                for (int i = 0; i < first.Count; i++)
                {
                    var e = L(first[i]);
                    Assert.AreEqual((string)e[0], cover[i].Kind.ToString().ToLowerInvariant());
                    Assert.AreEqual((string)e[1], cover[i].Model);
                    Assert.AreEqual(D(e[2]), cover[i].X);
                }

                ChunkMeshData mesh = MeshData.Build(chunk, new WorldSamplers(seed, cx, cz));
                var me = O(c["mesh"]);
                Assert.AreEqual(D(me["positions"]), Digest(mesh.Positions));
                Assert.AreEqual(D(me["normals"]), Digest(mesh.Normals), Math.Abs(D(me["normals"])) * 1e-12);
                Assert.AreEqual(D(me["colors"]), Digest(mesh.Colors), Math.Abs(D(me["colors"])) * 1e-12);
                Assert.AreEqual(D(me["layers"]), Digest(mesh.Layers), Math.Abs(D(me["layers"])) * 1e-12);
                Assert.AreEqual(D(me["indices"]), Digest(mesh.Indices));

                AssertBatches(L(c["vegetation"]), VegetationInstances.Build(resources, chunk));
                AssertBatches(L(c["coverInstances"]), GroundCoverInstances.Build(cover, chunk));
            }
        }

        private static void AssertBatches(List<object> expected, Dictionary<string, float[]> actual)
        {
            Assert.AreEqual(expected.Count, actual.Count);
            var keys = actual.Keys.ToList();
            for (int i = 0; i < expected.Count; i++)
            {
                var e = L(expected[i]);
                Assert.AreEqual((string)e[0], keys[i], "batch order");
                Assert.AreEqual((int)D(e[1]), actual[keys[i]].Length);
                // Matrices go through cos/sin (1 ulp freedom between JS engines and .NET): relative tolerance.
                Assert.AreEqual(D(e[2]), Digest(actual[keys[i]]), Math.Abs(D(e[2])) * 1e-6 + 1e-6);
            }
        }

        [Test]
        public void WeatherMatches()
        {
            foreach (object row in List("weather"))
            {
                var r = L(row);
                uint seed = (uint)D(r[0]);
                double t = D(r[1]);
                Assert.AreEqual((string)r[2], Weather.IdOf(Weather.KindAt(seed, t)));
                WeatherState w = Weather.At(seed, t);
                Assert.AreEqual(D(r[3]), w.CloudCover);
                Assert.AreEqual(D(r[4]), w.Rain);
                Assert.AreEqual(D(r[5]), w.Storm);
                Assert.AreEqual(D(r[6]), w.Fog);
                Assert.AreEqual(D(r[7]), w.Wind);
                Assert.AreEqual(D(r[8]), w.Wetness);
            }
        }

        [Test]
        public void SummitMatches()
        {
            var e = List("summit");
            Summit s = SummitSearch.Find(12345, 1500, 250);
            Assert.AreEqual(D(e[0]), s.X);
            Assert.AreEqual(D(e[1]), s.Z);
            Assert.AreEqual(D(e[2]), s.Height);
        }

        [Test]
        public void FarTerrainMatches()
        {
            var e = List("far");
            FarTerrainMesh far = FarTerrain.Build(12345, 500, -500, 400, 40);
            Assert.AreEqual(D(e[0]), Digest(far.Positions));
            Assert.AreEqual(D(e[1]), Digest(far.Normals), Math.Abs(D(e[1])) * 1e-12);
            Assert.AreEqual(D(e[2]), Digest(far.Colors), Math.Abs(D(e[2])) * 1e-12);
            Assert.AreEqual(D(e[3]), Digest(far.Indices));
        }

        [Test]
        public void NeighbouringChunksShareTheirEdge()
        {
            ChunkData a = Chunk.Generate(12345, 2, 5), b = Chunk.Generate(12345, 3, 5);
            for (int row = 0; row < Chunk.Verts; row++)
                Assert.AreEqual(a.Heights[row * Chunk.Verts + Chunk.Verts - 1], b.Heights[row * Chunk.Verts]);
        }
    }
}
