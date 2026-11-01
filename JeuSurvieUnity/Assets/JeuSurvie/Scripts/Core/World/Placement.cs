// Port of src/core/world/placement.ts — resources on a GLOBAL 8 m grid: at most one per cell, stable id « r:gx:gz ».
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.World
{
    public enum ResourceKind { Tree, Pine, Bush, Rock, Grass, Flowers }

    public sealed class Resource
    {
        public readonly int Gx, Gz;
        public readonly ResourceKind Kind;
        /// <summary>Model variant, 0 to VariantCount − 1.</summary>
        public readonly int Variant;
        public readonly double X, Z;
        /// <summary>Rotation around the vertical, in turns ([0, 1)).</summary>
        public readonly double Rotation;
        public readonly double Scale;
        public Resource(int gx, int gz, ResourceKind kind, int variant, double x, double z, double rotation, double scale)
        {
            Gx = gx; Gz = gz; Kind = kind; Variant = variant; X = x; Z = z; Rotation = rotation; Scale = scale;
        }
        /// <summary>Stable identifier « r:{gx}:{gz} ».</summary>
        public string Id => "r:" + Gx + ":" + Gz;
    }

    public static class Placement
    {
        public const int ResourceCellM = 8;
        private const int CellsPerChunk = Chunk.Size / ResourceCellM;
        public const double PathClearThreshold = 0.3;
        public const double SpawnClearRadiusM = 3;
        public const double TreeMaxSlope = 0.6;
        private const double BushMaxSlope = 0.75, PlantMaxSlope = 0.9, RockMaxSlope = 1.4;
        public const int VariantCount = 16;
        public const double ResourceScaleMin = 0.8;
        private const double ResourceScaleSpan = 0.45;
        public const double ResourceScaleMax = ResourceScaleMin + ResourceScaleSpan;

        private static readonly NoiseLayer Forest = new NoiseLayer(1.0 / 90, 2, 2, 0.5, 71);
        private const double ForestStretch = 2.2, ForestFloor = 0.05, ForestSpan = 2.4, ForestFrom = -0.15, ForestTo = 0.35;
        public const double ForestFactorMax = ForestFloor + ForestSpan;
        private const double MaxOccupancy = 0.8;
        private const int SaltKind = 51, SaltSpot = 52, SaltLook = 53;
        private const double Unit = 1.0 / 65536;

        /// <summary>Tree line (m): lower in the cold.</summary>
        public static double TreeLineAt(double cold) => 150 - 60 * cold;

        /// <summary>Relative forest density (groves and clearings), ≈ 0.1 to 2.4, mean ≈ 1.</summary>
        public static double ForestFactorAt(uint seed, double x, double z)
        {
            double n = ForestStretch * Noise.Fbm2(seed, x * Forest.Frequency, z * Forest.Frequency, Forest, Forest.Salt);
            return ForestFloor + ForestSpan * MathUtil.Smoothstep(ForestFrom, ForestTo, n);
        }

        /// <summary>Resources of cells [gx0, gx1) × [gz0, gz1), in cell order (z then x).</summary>
        public static List<Resource> InCells(uint seed, int gx0, int gz0, int gx1, int gz1)
        {
            var output = new List<Resource>();
            for (int gz = gz0; gz < gz1; gz++)
                for (int gx = gx0; gx < gx1; gx++)
                {
                    Resource r = InCell(seed, gx, gz);
                    if (r != null) output.Add(r);
                }
            return output;
        }

        public static List<Resource> InChunk(uint seed, int cx, int cz) =>
            InCells(seed, cx * CellsPerChunk, cz * CellsPerChunk, (cx + 1) * CellsPerChunk, (cz + 1) * CellsPerChunk);

        public static Resource InCell(uint seed, int gx, int gz)
        {
            uint kindHash = Hash.Hash2(seed, gx, gz, SaltKind);
            double roll = (kindHash & 0xffff) * Unit;
            if (roll >= MaxOccupancy) return null;
            uint spot = Hash.Hash2(seed, gx, gz, SaltSpot);
            double x = (gx + 0.15 + 0.7 * (spot & 0xffff) * Unit) * ResourceCellM;
            double z = (gz + 0.15 + 0.7 * (spot >> 16) * Unit) * ResourceCellM;
            BiomeSample biome = Biome.At(seed, x, z);
            double cold = biome.Cold, humidity = biome.Humidity;
            bool forest = cold < 0.5;
            double grove = ForestFactorAt(seed, x, z);
            double treeP = (0.1 + 0.08 * humidity) * grove;
            // Cumulative probabilities per kind, in the TS order.
            ResourceKind? kind = null;
            double acc = 0;
            ResourceKind[] kinds = { forest ? ResourceKind.Tree : ResourceKind.Pine, ResourceKind.Bush, ResourceKind.Rock, ResourceKind.Grass, ResourceKind.Flowers };
            double[] probs = { treeP, 0.03 + 0.02 * grove, 0.03 + 0.05 * cold, 0.12 * (1 - 0.5 * cold), forest ? 0.05 : 0 };
            for (int i = 0; i < kinds.Length; i++)
            {
                acc += probs[i];
                if (roll < acc)
                {
                    kind = kinds[i];
                    break;
                }
            }
            if (kind == null) return null;
            ResourceKind k = kind.Value;
            if (x * x + z * z < SpawnClearRadiusM * SpawnClearRadiusM) return null;
            double h = Terrain.HeightAt(seed, x, z);
            double slope = Math.Max(Math.Abs(Terrain.HeightAt(seed, x + 1, z) - h), Math.Abs(Terrain.HeightAt(seed, x, z + 1) - h));
            double maxSlope = k == ResourceKind.Tree || k == ResourceKind.Pine ? TreeMaxSlope
                : k == ResourceKind.Bush ? BushMaxSlope : k == ResourceKind.Rock ? RockMaxSlope : PlantMaxSlope;
            if (slope > maxSlope) return null;
            if (k != ResourceKind.Rock && h >= TreeLineAt(cold)) return null;
            if (Paths.PathAt(seed, x, z) > PathClearThreshold) return null;
            uint look = Hash.Hash2(seed, gx, gz, SaltLook);
            return new Resource(gx, gz, k, (int)(((kindHash >> 16) & 0xffff) % VariantCount), x, z,
                (look & 0xffff) * Unit, ResourceScaleMin + ResourceScaleSpan * (look >> 16) * Unit);
        }
    }
}
