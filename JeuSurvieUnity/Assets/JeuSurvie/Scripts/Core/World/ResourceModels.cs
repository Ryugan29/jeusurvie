// Port of src/core/world/resource-models.ts — which 3D model (key of assets/models/nature) represents a resource.
using System.Collections.Generic;
using System.Linq;

namespace JeuSurvie.Core.World
{
    public static class ResourceModels
    {
        private static string[] Variants(params (string model, int n)[] counts)
        {
            var list = new List<string>();
            foreach (var (model, n) in counts) for (int i = 0; i < n; i++) list.Add(model);
            return list.ToArray();
        }

        public static readonly IReadOnlyDictionary<ResourceKind, string[]> VegetationVariants = new Dictionary<ResourceKind, string[]>
        {
            { ResourceKind.Tree, Variants(("CommonTree_2", 3), ("CommonTree_3", 4), ("CommonTree_4", 3), ("CommonTree_5", 4), ("DeadTree_3", 1), ("DeadTree_5", 1)) },
            { ResourceKind.Pine, Variants(("Pine_1", 3), ("Pine_2", 3), ("Pine_3", 3), ("Pine_4", 3), ("Pine_5", 3), ("DeadTree_4", 1)) },
            { ResourceKind.Bush, Variants(("Bush_Common", 10), ("Bush_Common_Flowers", 6)) },
            { ResourceKind.Rock, Variants(("Rock_Medium_1", 5), ("Rock_Medium_2", 5), ("Rock_Medium_3", 6)) },
            { ResourceKind.Grass, Variants(("Grass_Common_Tall", Placement.VariantCount)) },
            { ResourceKind.Flowers, Variants(("Flower_3_Group", Placement.VariantCount)) },
        };

        /// <summary>Distinct models per kind, in first-appearance order.</summary>
        public static readonly IReadOnlyDictionary<ResourceKind, string[]> VegetationModels =
            VegetationVariants.ToDictionary(kv => kv.Key, kv => kv.Value.Distinct().ToArray());

        public static string ModelKeyFor(Resource r) => VegetationVariants[r.Kind][r.Variant % Placement.VariantCount];

        /// <summary>Every vegetation model key, without duplicates.</summary>
        public static IEnumerable<string> AllVegetationModels() => VegetationModels.Values.SelectMany(v => v).Distinct();
    }
}
