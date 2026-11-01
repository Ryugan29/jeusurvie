// Port of src/core/shared/hash.ts — deterministic integer hash (bit-identical to the TypeScript version).
namespace JeuSurvie.Core.Shared
{
    public static class Hash
    {
        /// <summary>lowbias32 avalanche (C. Wellons), same constants as the TS mix32.</summary>
        private static int Mix32(int h)
        {
            unchecked
            {
                h ^= (int)((uint)h >> 16);
                h *= 0x7feb352d;
                h ^= (int)((uint)h >> 15);
                h *= (int)0x846ca68b;
                h ^= (int)((uint)h >> 16);
                return h;
            }
        }

        /// <summary>
        /// Hash of (seed, x, z, salt) → uint32. Argument order matters; <paramref name="salt"/> separates usages.
        /// The world seed is an uint32 (JS `seed | 0` wraps it to int32, so does the cast here).
        /// </summary>
        public static uint Hash2(uint seed, int x, int z, int salt)
        {
            unchecked
            {
                int h = Mix32((int)seed ^ (int)0x9e3779b9);
                h = Mix32(h ^ (x * (int)0x85ebca6b));
                h = Mix32(h ^ (z * (int)0xc2b2ae35));
                h = Mix32(h ^ (salt * 0x27d4eb2f));
                return (uint)h;
            }
        }

        /// <summary>hash2 / 2^32 : uniform value in [0, 1).</summary>
        public static double Unit(uint seed, int x, int z, int salt) => Hash2(seed, x, z, salt) / 4294967296.0;
    }
}
