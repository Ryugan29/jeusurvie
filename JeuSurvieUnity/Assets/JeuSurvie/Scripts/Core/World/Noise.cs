// Port of src/core/world/noise.ts — home-made 2D gradient noise and fractal sums (ADR 0004).
// Only + - * floor and the integer hash: bit-identical to the TypeScript implementation.
using System;
using JeuSurvie.Core.Shared;

namespace JeuSurvie.Core.World
{
    /// <summary>Fractal parameters (FbmParams).</summary>
    public class FbmParams
    {
        public readonly int Octaves;
        public readonly double Lacunarity;
        public readonly double Gain;
        public FbmParams(int octaves, double lacunarity, double gain) { Octaves = octaves; Lacunarity = lacunarity; Gain = gain; }
    }

    /// <summary>A fBm at a given scale (NoiseLayer): first-octave frequency (cycles per metre) and salt.</summary>
    public class NoiseLayer : FbmParams
    {
        public readonly double Frequency;
        public readonly int Salt;
        public NoiseLayer(double frequency, int octaves, double lacunarity, double gain, int salt) : base(octaves, lacunarity, gain)
        {
            Frequency = frequency;
            Salt = salt;
        }
    }

    public readonly struct NoiseSample
    {
        public readonly double Value, Dx, Dz;
        public NoiseSample(double value, double dx, double dz) { Value = value; Dx = dx; Dz = dz; }
    }

    public static class Noise
    {
        public const int MaxOctaves = 64;
        private const int OffsetSalt = 0x0ff5e7;
        private const double OffsetUnit = 1.0 / 131072;
        private static readonly int[] GradX = { 1, -1, 1, -1, 1, -1, 0, 0 };
        private static readonly int[] GradZ = { 1, 1, -1, -1, 0, 0, 1, -1 };

        private static double Fade(double t) => t * t * t * (t * (t * 6 - 15) + 10);

        private static double FadeDerivative(double t)
        {
            double s = t * (t - 1);
            return 30 * s * s;
        }

        private static double GradDot(uint seed, int ix, int iz, int salt, double dx, double dz)
        {
            switch (Hash.Hash2(seed, ix, iz, salt) & 7)
            {
                case 0: return dx + dz;
                case 1: return -dx + dz;
                case 2: return dx - dz;
                case 3: return -dx - dz;
                case 4: return dx;
                case 5: return -dx;
                case 6: return dz;
                default: return -dz;
            }
        }

        /// <summary>Gradient noise in (x, z); 0 on integer nodes, within [-1, 1].</summary>
        public static double GradientNoise2(uint seed, double x, double z, int salt)
        {
            double fx0 = Math.Floor(x), fz0 = Math.Floor(z);
            int ix = (int)fx0, iz = (int)fz0;
            double fx = x - fx0, fz = z - fz0;
            double n00 = GradDot(seed, ix, iz, salt, fx, fz);
            double n10 = GradDot(seed, ix + 1, iz, salt, fx - 1, fz);
            double n01 = GradDot(seed, ix, iz + 1, salt, fx, fz - 1);
            double n11 = GradDot(seed, ix + 1, iz + 1, salt, fx - 1, fz - 1);
            double u = Fade(fx), v = Fade(fz);
            double nx0 = n00 + u * (n10 - n00);
            double nx1 = n01 + u * (n11 - n01);
            return nx0 + v * (nx1 - nx0) + 0.0;
        }

        /// <summary>Gradient noise with analytic derivatives; value identical to GradientNoise2.</summary>
        public static NoiseSample GradientNoise2D(uint seed, double x, double z, int salt)
        {
            double fx0 = Math.Floor(x), fz0 = Math.Floor(z);
            int ix = (int)fx0, iz = (int)fz0;
            double fx = x - fx0, fz = z - fz0;
            uint h00 = Hash.Hash2(seed, ix, iz, salt) & 7, h10 = Hash.Hash2(seed, ix + 1, iz, salt) & 7;
            uint h01 = Hash.Hash2(seed, ix, iz + 1, salt) & 7, h11 = Hash.Hash2(seed, ix + 1, iz + 1, salt) & 7;
            double n00 = GradDot(seed, ix, iz, salt, fx, fz);
            double n10 = GradDot(seed, ix + 1, iz, salt, fx - 1, fz);
            double n01 = GradDot(seed, ix, iz + 1, salt, fx, fz - 1);
            double n11 = GradDot(seed, ix + 1, iz + 1, salt, fx - 1, fz - 1);
            double u = Fade(fx), v = Fade(fz), du = FadeDerivative(fx), dv = FadeDerivative(fz);
            double nx0 = n00 + u * (n10 - n00);
            double nx1 = n01 + u * (n11 - n01);
            double nx0dx = GradX[h00] + du * (n10 - n00) + u * (GradX[h10] - GradX[h00]);
            double nx0dz = GradZ[h00] + u * (GradZ[h10] - GradZ[h00]);
            double nx1dx = GradX[h01] + du * (n11 - n01) + u * (GradX[h11] - GradX[h01]);
            double nx1dz = GradZ[h01] + u * (GradZ[h11] - GradZ[h01]);
            return new NoiseSample(
                nx0 + v * (nx1 - nx0) + 0.0,
                nx0dx + v * (nx1dx - nx0dx) + 0.0,
                nx0dz + dv * (nx1 - nx0) + v * (nx1dz - nx0dz) + 0.0);
        }

        private static void CheckOctaves(int octaves)
        {
            if (octaves < 1 || octaves > MaxOctaves)
                throw new ArgumentOutOfRangeException(nameof(octaves), $"octaves doit être un entier de 1 à {MaxOctaves} (reçu {octaves})");
        }

        private static void OctaveOffset(uint seed, int o, int salt, out int octaveSalt, out double ox, out double oz)
        {
            octaveSalt = unchecked(salt * 256 + o);
            uint h = Hash.Hash2(seed, o, octaveSalt, OffsetSalt);
            ox = ((h & 0xffff) * 2 + 1) * OffsetUnit;
            oz = ((h >> 16) * 2 + 1) * OffsetUnit;
        }

        private static double OctaveNoise(uint seed, double x, double z, int o, double frequency, int salt)
        {
            OctaveOffset(seed, o, salt, out int octaveSalt, out double ox, out double oz);
            return GradientNoise2(seed, x * frequency + ox, z * frequency + oz, octaveSalt);
        }

        private static NoiseSample OctaveNoiseD(uint seed, double x, double z, int o, double frequency, int salt)
        {
            OctaveOffset(seed, o, salt, out int octaveSalt, out double ox, out double oz);
            return GradientNoise2D(seed, x * frequency + ox, z * frequency + oz, octaveSalt);
        }

        /// <summary>fBm normalised to [-1, 1].</summary>
        public static double Fbm2(uint seed, double x, double z, FbmParams p, int salt)
        {
            CheckOctaves(p.Octaves);
            double sum = 0, amplitude = 1, frequency = 1, norm = 0;
            for (int o = 0; o < p.Octaves; o++)
            {
                sum += amplitude * OctaveNoise(seed, x, z, o, frequency, salt);
                norm += amplitude;
                amplitude *= p.Gain;
                frequency *= p.Lacunarity;
            }
            return sum / norm;
        }

        /// <summary>Ridged noise, weighted average of (1 − |n|)² → [0, 1].</summary>
        public static double RidgedFbm2(uint seed, double x, double z, FbmParams p, int salt)
        {
            CheckOctaves(p.Octaves);
            double sum = 0, amplitude = 1, frequency = 1, norm = 0;
            for (int o = 0; o < p.Octaves; o++)
            {
                double ridge = 1 - Math.Abs(OctaveNoise(seed, x, z, o, frequency, salt));
                sum += amplitude * ridge * ridge;
                norm += amplitude;
                amplitude *= p.Gain;
                frequency *= p.Lacunarity;
            }
            return sum / norm;
        }

        /// <summary>Musgrave weighted ridged multifractal → [0, 1].</summary>
        public static double RidgedMultifractal2(uint seed, double x, double z, FbmParams p, int salt)
        {
            CheckOctaves(p.Octaves);
            double sum = 0, amplitude = 1, frequency = 1, norm = 0, weight = 1;
            for (int o = 0; o < p.Octaves; o++)
            {
                double ridge = 1 - Math.Abs(OctaveNoise(seed, x, z, o, frequency, salt));
                double signal = ridge * ridge * weight;
                sum += amplitude * signal;
                norm += amplitude;
                weight = signal;
                amplitude *= p.Gain;
                frequency *= p.Lacunarity;
            }
            return sum / norm;
        }

        /// <summary>"Eroded" fBm: each octave damped by the accumulated slope → [-1, 1].</summary>
        public static double ErodedFbm2(uint seed, double x, double z, FbmParams p, int salt)
        {
            CheckOctaves(p.Octaves);
            double sum = 0, amplitude = 1, frequency = 1, norm = 0, slopeX = 0, slopeZ = 0;
            for (int o = 0; o < p.Octaves; o++)
            {
                NoiseSample n = OctaveNoiseD(seed, x, z, o, frequency, salt);
                slopeX += n.Dx;
                slopeZ += n.Dz;
                sum += (amplitude * n.Value) / (1 + slopeX * slopeX + slopeZ * slopeZ);
                norm += amplitude;
                amplitude *= p.Gain;
                frequency *= p.Lacunarity;
            }
            return sum / norm + 0.0;
        }
    }
}
