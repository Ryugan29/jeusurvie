// Port of src/core/world/ground-cover.ts — grass, clover, flowers, ferns, mushrooms and pebbles of a chunk. PURELY VISUAL.
// Deterministic (basic operations only): same seed and chunk, same list, in the same order as the TypeScript.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.World
{
    public enum CoverKind { Grass, Clover, Flower, Fern, Mushroom, Pebble }

    public readonly struct CoverItem
    {
        public readonly CoverKind Kind;
        public readonly string Model;
        public readonly double X, Z, Rotation, Scale;
        public CoverItem(CoverKind kind, string model, double x, double z, double rotation, double scale)
        {
            Kind = kind; Model = model; X = x; Z = z; Rotation = rotation; Scale = scale;
        }
    }

    public static class GroundCover
    {
        public static readonly IReadOnlyDictionary<CoverKind, string[]> Models = new Dictionary<CoverKind, string[]>
        {
            { CoverKind.Grass, new[] { "Grass_Common_Short", "Grass_Common_Tall" } },
            { CoverKind.Clover, new[] { "Clover_1", "Clover_2" } },
            { CoverKind.Flower, new[] { "Petal_1", "Petal_2", "Petal_4", "Flower_3_Single", "Flower_4_Single" } },
            { CoverKind.Fern, new[] { "Fern_1", "Plant_1", "Plant_7", "Plant_7_Big" } },
            { CoverKind.Mushroom, new[] { "Mushroom_Common" } },
            { CoverKind.Pebble, new[] { "Pebble_Round_1", "Pebble_Round_2", "Pebble_Square_2", "Pebble_Square_4", "RockPath_Square_Small_2" } },
        };

        public const int CoverCellM = 1;
        private const int Cells = Chunk.Size / CoverCellM;
        private const double Step = Chunk.Step;
        private const int BiomeBlockM = 8;
        private const int BiomeBlocks = Chunk.Size / BiomeBlockM;
        private const double SlopeFrom = 0.3;
        public const double CoverMaxSlope = 0.62;
        private const double PathTaperFrom = 0.15;
        public const double CoverPathMax = 0.6;
        private const double PebbleBandFrom = 0.3, PebbleBandTo = 0.7;
        private const double AltitudeFadeBelowM = 10, AltitudeFadeAboveM = 20;
        private const double NoiseStretch = 2.2;
        private static readonly NoiseLayer Carpet = new NoiseLayer(1.0 / 30, 2, 2, 0.5, 72);
        private static readonly NoiseLayer Tuft = new NoiseLayer(1.0 / 4.5, 2, 2, 0.5, 73);
        private static readonly NoiseLayer CloverN = new NoiseLayer(1.0 / 10, 1, 2, 0.5, 74);
        private static readonly NoiseLayer FlowersN = new NoiseLayer(1.0 / 13, 1, 2, 0.5, 75);
        private const double GrassPerCell = 6, CloverPerCell = 1, FlowerPerCell = 1.2, FernPerCell = 0.25;
        private const int PebbleTries = 3;
        private const double PebbleEdgeChance = 0.5, PebbleScatter = 0.004;
        private const double MushroomChanceTree = 0.7, MushroomChancePine = 0.45;
        private const double MushroomRingMin = 1.2, MushroomRingMax = 2, MushroomSpreadM = 0.25;
        private const int MushroomRingTries = 8;
        private const double TrunkClearMin = 0.2, TrunkClearFromM = 1.2, TrunkClearToM = 3.2;
        private const double TreeReachM = 8;
        private const int SaltGrass = 300, SaltClover = 330, SaltFlower = 360, SaltFern = 390, SaltPebble = 420, SaltPebbleScatter = 450, SaltMushroom = 480;
        private const int CountOffset = 29;
        private const double Unit = 1.0 / 65536;

        private static double Low(uint h) => (h & 0xffff) * Unit;
        private static double High(uint h) => (h >> 16) * Unit;

        private readonly struct Draw
        {
            public readonly uint Pos, Look;
            public readonly double Roll;
            public Draw(uint pos, uint look, double roll) { Pos = pos; Look = look; Roll = roll; }
        }

        private static Draw DrawOf(uint seed, int gx, int gz, int salt, int k) =>
            new Draw(Hash.Hash2(seed, gx, gz, salt + 3 * k), Hash.Hash2(seed, gx, gz, salt + 3 * k + 1), Low(Hash.Hash2(seed, gx, gz, salt + 3 * k + 2)));

        /// <summary>Weighted pick: roll ∈ [0, 1[ designates one of the weights.</summary>
        private static int Pick(double roll, double[] weights)
        {
            double total = 0;
            foreach (double w in weights) total += w;
            double acc = 0;
            for (int i = 0; i < weights.Length; i++)
            {
                acc += weights[i] / total;
                if (roll < acc) return i;
            }
            return weights.Length - 1;
        }

        private static readonly double[] CloverWeights = { 5, 1 };
        private static readonly double[] FlowerWeights = { 1.4, 1.4, 1.4, 0.9, 0.5 };
        private static readonly double[] FernWeights = { 11, 3, 3, 3 };
        private static readonly double[] PebbleWeights = { 30, 25, 20, 15, 10 };

        private static float[] TreeDistances(List<Resource> trees, double ox, double oz)
        {
            var output = new float[Cells * Cells];
            for (int i = 0; i < output.Length; i++) output[i] = (float)TreeReachM;
            int reach = (int)Math.Ceiling(TreeReachM / CoverCellM);
            foreach (Resource t in trees)
            {
                int tcx = (int)Math.Floor((t.X - ox) / CoverCellM), tcz = (int)Math.Floor((t.Z - oz) / CoverCellM);
                for (int cz = Math.Max(0, tcz - reach); cz <= Math.Min(Cells - 1, tcz + reach); cz++)
                {
                    for (int cx = Math.Max(0, tcx - reach); cx <= Math.Min(Cells - 1, tcx + reach); cx++)
                    {
                        double dx = ox + (cx + 0.5) * CoverCellM - t.X, dz = oz + (cz + 0.5) * CoverCellM - t.Z;
                        double d = Math.Sqrt(dx * dx + dz * dz);
                        if (d < output[cz * Cells + cx]) output[cz * Cells + cx] = (float)d;
                    }
                }
            }
            return output;
        }

        /// <summary>Ground cover of the chunk, in cell order (z then x), mushrooms at the end.</summary>
        public static List<CoverItem> InChunk(uint seed, ChunkData chunk)
        {
            double ox = chunk.Cx * Chunk.Size, oz = chunk.Cz * Chunk.Size;
            var output = new List<CoverItem>();
            float[] H = chunk.Heights;
            const int V = Chunk.Verts;

            int gx0 = chunk.Cx * (Chunk.Size / Placement.ResourceCellM), gz0 = chunk.Cz * (Chunk.Size / Placement.ResourceCellM);
            const int span = Chunk.Size / Placement.ResourceCellM;
            var trees = Placement.InCells(seed, gx0 - 1, gz0 - 1, gx0 + span + 1, gz0 + span + 1)
                .FindAll(r => r.Kind == ResourceKind.Tree || r.Kind == ResourceKind.Pine);
            float[] treeDist = TreeDistances(trees, ox, oz);

            var cold = new float[BiomeBlocks * BiomeBlocks];
            for (int bz = 0; bz < BiomeBlocks; bz++)
                for (int bx = 0; bx < BiomeBlocks; bx++)
                    cold[bz * BiomeBlocks + bx] = (float)Biome.At(seed, ox + (bx + 0.5) * BiomeBlockM, oz + (bz + 0.5) * BiomeBlockM).Cold;

            for (int cz = 0; cz < Cells; cz++)
            {
                for (int cx = 0; cx < Cells; cx++)
                {
                    int col = (int)Math.Floor((cx * CoverCellM) / Step), row = (int)Math.Floor((cz * CoverCellM) / Step);
                    double fx = ((cx + 0.5) * CoverCellM - col * Step) / Step, fz = ((cz + 0.5) * CoverCellM - row * Step) / Step;
                    int i = row * V + col;
                    double h00 = H[i], h10 = H[i + 1], h01 = H[i + V], h11 = H[i + V + 1];
                    bool upper = fx >= fz;
                    double gradX = upper ? (h10 - h00) / Step : (h11 - h01) / Step;
                    double gradZ = upper ? (h11 - h10) / Step : (h01 - h00) / Step;
                    double slopeK = 1 - MathUtil.Smoothstep(SlopeFrom, CoverMaxSlope, Math.Sqrt(gradX * gradX + gradZ * gradZ));
                    if (slopeK <= 0) continue;
                    double mx = ox + (cx + 0.5) * CoverCellM, mz = oz + (cz + 0.5) * CoverCellM;
                    double coldHere = cold[(int)Math.Floor((double)(cz * CoverCellM) / BiomeBlockM) * BiomeBlocks + (int)Math.Floor((double)(cx * CoverCellM) / BiomeBlockM)];
                    double line = Placement.TreeLineAt(coldHere);
                    double altK = 1 - MathUtil.Smoothstep(line - AltitudeFadeBelowM, line + AltitudeFadeAboveM, Triangulation.HeightInQuad(h00, h10, h01, h11, fx, fz));
                    double terrainK = slopeK * altK;
                    if (terrainK <= 0) continue;

                    double pathHere = Paths.PathAt(seed, mx, mz);
                    bool nearPath = pathHere > 0;
                    double pathK = 1 - MathUtil.Smoothstep(PathTaperFrom, CoverPathMax, pathHere);
                    int gcx = chunk.Cx * Cells + cx, gcz = chunk.Cz * Cells + cz;
                    double x0 = ox + cx * CoverCellM, z0 = oz + cz * CoverCellM;

                    bool Free(double x, double z) => !nearPath || Paths.PathAt(seed, x, z) < CoverPathMax;
                    void Emit(CoverKind kind, string model, Draw d, double scaleMin, double scaleSpan)
                    {
                        double x = x0 + Low(d.Pos) * CoverCellM, z = z0 + High(d.Pos) * CoverCellM;
                        if (!Free(x, z)) return;
                        output.Add(new CoverItem(kind, model, x, z, Low(d.Look), scaleMin + scaleSpan * High(d.Look)));
                    }
                    int Count(double density, double perCell, int salt) =>
                        (int)Math.Floor(density * perCell + Low(Hash.Hash2(seed, gcx, gcz, salt + CountOffset)));

                    double forest = Placement.ForestFactorAt(seed, mx, mz);
                    double carpet = MathUtil.Smoothstep(-0.3, 0.3, NoiseStretch * Noise.Fbm2(seed, mx * Carpet.Frequency, mz * Carpet.Frequency, Carpet, Carpet.Salt));
                    double tuft = MathUtil.Smoothstep(-0.15, 0.35, NoiseStretch * Noise.Fbm2(seed, mx * Tuft.Frequency, mz * Tuft.Frequency, Tuft, Tuft.Salt));
                    double cloverK = terrainK * pathK * (1 - coldHere) * MathUtil.Smoothstep(0.25, 0.6, NoiseStretch * Noise.Fbm2(seed, mx * CloverN.Frequency, mz * CloverN.Frequency, CloverN, CloverN.Salt));
                    double flowerK = terrainK * pathK * (1 - coldHere) * MathUtil.Smoothstep(0.25, 0.55, NoiseStretch * Noise.Fbm2(seed, mx * FlowersN.Frequency, mz * FlowersN.Frequency, FlowersN, FlowersN.Salt));

                    double trunkDistance = treeDist[cz * Cells + cx];
                    double trunkK = TrunkClearMin + (1 - TrunkClearMin) * MathUtil.Smoothstep(TrunkClearFromM, TrunkClearToM, trunkDistance);
                    double grassK = terrainK * pathK * (0.3 + 0.7 * carpet) * (0.2 + 0.8 * tuft) * (1 - 0.5 * coldHere) * (1 - 0.6 * cloverK) * trunkK;
                    for (int k = 0, n = Count(grassK, GrassPerCell, SaltGrass); k < n; k++)
                    {
                        Draw d = DrawOf(seed, gcx, gcz, SaltGrass, k);
                        bool tall = tuft > 0.6 && d.Roll < 0.4;
                        Emit(CoverKind.Grass, Models[CoverKind.Grass][tall ? 1 : 0], d, tall ? 0.5 : 0.6, tall ? 0.3 : 0.35);
                    }
                    for (int k = 0, n = Count(cloverK, CloverPerCell, SaltClover); k < n; k++)
                    {
                        Draw d = DrawOf(seed, gcx, gcz, SaltClover, k);
                        Emit(CoverKind.Clover, Models[CoverKind.Clover][Pick(d.Roll, CloverWeights)], d, 0.3, 0.2);
                    }
                    for (int k = 0, n = Count(flowerK, FlowerPerCell, SaltFlower); k < n; k++)
                    {
                        Draw d = DrawOf(seed, gcx, gcz, SaltFlower, k);
                        int which = Pick(d.Roll, FlowerWeights);
                        bool single = which >= 3;
                        Emit(CoverKind.Flower, Models[CoverKind.Flower][which], d, single ? 0.28 : 0.55, single ? 0.12 : 0.4);
                    }

                    double near = 1 - MathUtil.Smoothstep(1.5, TreeReachM, trunkDistance);
                    double fernK = terrainK * pathK * (0.25 + 0.75 * MathUtil.Smoothstep(0.5, 1.8, forest)) * (0.2 + 0.8 * near) * (1 - 0.6 * coldHere);
                    for (int k = 0, n = Count(fernK, FernPerCell, SaltFern); k < n; k++)
                    {
                        Draw d = DrawOf(seed, gcx, gcz, SaltFern, k);
                        int which = Pick(d.Roll, FernWeights);
                        Emit(CoverKind.Fern, Models[CoverKind.Fern][which], d, which == 0 ? 0.45 : which == 1 ? 0.5 : 0.7, which == 0 ? 0.35 : which == 1 ? 0.4 : 0.6);
                    }

                    if (nearPath)
                    {
                        for (int k = 0; k < PebbleTries; k++)
                        {
                            Draw d = DrawOf(seed, gcx, gcz, SaltPebble, k);
                            if (d.Roll >= PebbleEdgeChance) continue;
                            double x = x0 + Low(d.Pos) * CoverCellM, z = z0 + High(d.Pos) * CoverCellM;
                            double p = Paths.PathAt(seed, x, z);
                            if (p >= PebbleBandFrom && p <= PebbleBandTo) output.Add(Pebble(x, z, d, d.Roll / PebbleEdgeChance));
                        }
                    }
                    else
                    {
                        Draw d = DrawOf(seed, gcx, gcz, SaltPebbleScatter, 0);
                        if (d.Roll < PebbleScatter * terrainK)
                            output.Add(Pebble(x0 + Low(d.Pos) * CoverCellM, z0 + High(d.Pos) * CoverCellM, d, d.Roll / (PebbleScatter * terrainK)));
                    }
                }
            }

            foreach (Resource t in trees)
            {
                int gx = (int)Math.Floor(t.X / Placement.ResourceCellM), gz = (int)Math.Floor(t.Z / Placement.ResourceCellM);
                if (Low(Hash.Hash2(seed, gx, gz, SaltMushroom)) >= (t.Kind == ResourceKind.Pine ? MushroomChancePine : MushroomChanceTree)) continue;
                double ringX = MushroomRingMin, ringZ = 0;
                for (int a = 0; a < MushroomRingTries; a++)
                {
                    uint h = Hash.Hash2(seed, gx, gz, SaltMushroom + 1 + a);
                    double dx = (2 * Low(h) - 1) * MushroomRingMax, dz = (2 * High(h) - 1) * MushroomRingMax;
                    double r2 = dx * dx + dz * dz;
                    if (r2 >= MushroomRingMin * MushroomRingMin && r2 <= MushroomRingMax * MushroomRingMax)
                    {
                        ringX = dx;
                        ringZ = dz;
                        break;
                    }
                }
                int n = 1 + (int)Math.Floor(Low(Hash.Hash2(seed, gx, gz, SaltMushroom + 20)) * 3);
                for (int k = 0; k < n; k++)
                {
                    uint h = Hash.Hash2(seed, gx, gz, SaltMushroom + 21 + 2 * k), look = Hash.Hash2(seed, gx, gz, SaltMushroom + 22 + 2 * k);
                    double x = t.X + ringX + (2 * Low(h) - 1) * MushroomSpreadM, z = t.Z + ringZ + (2 * High(h) - 1) * MushroomSpreadM;
                    if (x < ox || x >= ox + Chunk.Size || z < oz || z >= oz + Chunk.Size) continue;
                    if (Paths.PathAt(seed, x, z) >= CoverPathMax) continue;
                    output.Add(new CoverItem(CoverKind.Mushroom, Models[CoverKind.Mushroom][0], x, z, Low(look), 0.9 + 0.6 * High(look)));
                }
            }
            return output;
        }

        private static CoverItem Pebble(double x, double z, Draw d, double choice)
        {
            int which = Pick(choice, PebbleWeights);
            bool slab = which == 4;
            return new CoverItem(CoverKind.Pebble, Models[CoverKind.Pebble][which], x, z, Low(d.Look), (slab ? 0.5 : 0.6) + (slab ? 0.4 : 0.7) * High(d.Look));
        }
    }
}
