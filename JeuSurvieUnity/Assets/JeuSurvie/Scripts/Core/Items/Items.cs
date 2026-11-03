// What an item is: a stable id (saved, never renamed), what the player reads (French name, description, category) and,
// for tools, what they can do. The values themselves live in Config/ItemData.cs.
using System;
using System.Collections.Generic;
using System.Linq;

namespace JeuSurvie.Core.Items
{
    public enum ItemCategory { Resource, Plant, Ore, Tool }

    public enum ToolType { Axe, Pickaxe, Hoe, Sickle }

    public sealed class ToolDef
    {
        public readonly ToolType Type;
        /// <summary>1 stone, 2 copper, 3 iron: a resource needing tier N accepts tools of tier ≥ N.</summary>
        public readonly int Tier;
        /// <summary>Work done per valid hit, in hits (1 = one hit of a stone tool).</summary>
        public readonly double Efficiency;
        public readonly int MaxDurability;

        public ToolDef(ToolType type, int tier, double efficiency, int maxDurability)
        {
            if (tier < 1) throw new ArgumentOutOfRangeException(nameof(tier));
            if (!(efficiency > 0)) throw new ArgumentOutOfRangeException(nameof(efficiency));
            if (maxDurability < 1) throw new ArgumentOutOfRangeException(nameof(maxDurability));
            Type = type; Tier = tier; Efficiency = efficiency; MaxDurability = maxDurability;
        }

        /// <summary>Work per hit in hundredths of a hit (integer, so progress never drifts).</summary>
        public int WorkPerHit => (int)Math.Round(Efficiency * 100);
    }

    public sealed class ItemDef
    {
        public readonly string Id, Name, Description;
        public readonly ItemCategory Category;
        public readonly int MaxStack;
        /// <summary>Model (models/objets) and icon (Resources/UI/Icones) name.</summary>
        public readonly string Model;
        public readonly ToolDef Tool;
        /// <summary>Name for several (« Bûches », « Minerais de cuivre »).</summary>
        public readonly string Plural;

        public ItemDef(string id, string name, string description, ItemCategory category, int maxStack, string model, ToolDef tool = null, string plural = null)
        {
            if (string.IsNullOrEmpty(id)) throw new ArgumentException("id vide");
            if (maxStack < 1) throw new ArgumentOutOfRangeException(nameof(maxStack));
            if (tool != null && maxStack != 1) throw new ArgumentException("un outil ne s'empile pas : " + id);
            Id = id; Name = name; Description = description; Category = category; MaxStack = maxStack; Model = model; Tool = tool;
            Plural = plural ?? (name.EndsWith("s", StringComparison.Ordinal) ? name : name + "s");
        }

        public bool IsTool => Tool != null;
    }

    public static class ItemCatalog
    {
        private static readonly Dictionary<string, ItemDef> ById = Config.ItemData.All.ToDictionary(d => d.Id);

        public static IReadOnlyList<ItemDef> All => Config.ItemData.All;

        public static bool TryGet(string id, out ItemDef def) => ById.TryGetValue(id ?? "", out def);

        public static ItemDef Get(string id) =>
            TryGet(id, out ItemDef def) ? def : throw new KeyNotFoundException("objet inconnu : " + id);

        /// <summary>The tool of this type and tier, if the catalog has one.</summary>
        public static ItemDef ToolOf(ToolType type, int tier) =>
            All.FirstOrDefault(d => d.IsTool && d.Tool.Type == type && d.Tool.Tier == tier);

        public static string CategoryLabel(ItemCategory c)
        {
            switch (c)
            {
                case ItemCategory.Resource: return "Ressource";
                case ItemCategory.Plant: return "Plante";
                case ItemCategory.Ore: return "Minerai";
                default: return "Outil";
            }
        }

        public static string ToolLabel(ToolType t)
        {
            switch (t)
            {
                case ToolType.Axe: return "Hache";
                case ToolType.Pickaxe: return "Pioche";
                case ToolType.Hoe: return "Houe";
                default: return "Faucille";
            }
        }

        public static string QualityLabel(int tier) => tier <= 1 ? "pierre" : tier == 2 ? "cuivre" : "fer";
    }
}
