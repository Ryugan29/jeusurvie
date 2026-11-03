// Every item of the game: the only place to tune names, stacks and tools. Ids are saved: never rename one, add instead.
using System.Collections.Generic;
using JeuSurvie.Core.Items;

namespace JeuSurvie.Core.Config
{
    public static class ItemData
    {
        /// <summary>Tool qualities: tier, efficiency (hits of work per blow) and durability (valid blows before breaking).</summary>
        private static readonly (string id, string label, string model, int tier, double efficiency, int durability)[] Qualities =
        {
            ("stone", "en pierre", "Pierre", 1, 1.0, 40),
            ("copper", "en cuivre", "Cuivre", 2, 1.5, 90),
            ("iron", "en fer", "Fer", 3, 2.0, 180),
        };

        private static readonly (ToolType type, string id, string name, string model, string use)[] Tools =
        {
            (ToolType.Axe, "axe", "Hache", "Hache", "Abat les arbres et fend les souches."),
            (ToolType.Pickaxe, "pickaxe", "Pioche", "Pioche", "Casse la pierre et extrait les minerais."),
            (ToolType.Hoe, "hoe", "Houe", "Houe", "Retourne la terre meuble et déterre les racines."),
            (ToolType.Sickle, "sickle", "Faucille", "Faucille", "Fauche les hautes herbes et cueille les herbes sauvages."),
        };

        public static readonly IReadOnlyList<ItemDef> All = Build();

        private static List<ItemDef> Build()
        {
            var list = new List<ItemDef>
            {
                new ItemDef("wood", "Bûche", "Un tronçon de bois franc, sec et lourd.", ItemCategory.Resource, 50, "Objet_Buche"),
                new ItemDef("branch", "Branche", "Une branche tombée, souple et légère.", ItemCategory.Resource, 50, "Objet_Branche"),
                new ItemDef("stone", "Pierre", "Un éclat de roche taillé par la pioche.", ItemCategory.Resource, 50, "Objet_Pierre"),
                new ItemDef("copper_ore", "Minerai de cuivre", "Une roche veinée de pépites orangées.", ItemCategory.Ore, 40, "Objet_Minerai_Cuivre", plural: "Minerais de cuivre"),
                new ItemDef("iron_ore", "Minerai de fer", "Une roche lourde, rouillée en surface.", ItemCategory.Ore, 40, "Objet_Minerai_Fer", plural: "Minerais de fer"),
                new ItemDef("fibre", "Fibres végétales", "Une gerbe de hautes herbes fauchées.", ItemCategory.Plant, 99, "Objet_Fibres"),
                new ItemDef("herb", "Herbes sauvages", "Des tiges de sauge argentée aux fleurs mauves.", ItemCategory.Plant, 50, "Objet_Herbes"),
                new ItemDef("root", "Racine", "Une racine charnue, déterrée à la houe.", ItemCategory.Plant, 50, "Objet_Racine"),
                new ItemDef("flower_rose", "Rose des clairières", "Une fleur rose aux longues feuilles.", ItemCategory.Plant, 30, "Objet_Fleur_3", plural: "Roses des clairières"),
                new ItemDef("flower_gold", "Épi doré", "Une grappe de clochettes dorées.", ItemCategory.Plant, 30, "Objet_Fleur_4", plural: "Épis dorés"),
            };
            foreach (var t in Tools)
                foreach (var q in Qualities)
                    list.Add(new ItemDef($"{t.id}_{q.id}", $"{t.name} {q.label}", t.use, ItemCategory.Tool, 1, $"Outil_{t.model}_{q.model}",
                        new ToolDef(t.type, q.tier, q.efficiency, q.durability), plural: $"{t.name}s {q.label}")); // « Haches en pierre »
            return list;
        }
    }
}
