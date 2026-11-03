// Everything the harvest says to the player, in French: what is aimed at and which key works it, why it cannot be done,
// and what was gained (« +3 Bûches »).
using System;
using JeuSurvie.Core.Config;
using JeuSurvie.Core.Items;

namespace JeuSurvie.Core.Gameplay
{
    public static class PromptText
    {
        public const string Full = "Inventaire plein";
        public const string UseKey = "Clic gauche", GatherKey = "E";

        /// <summary>The two lines shown under the aim: the thing's name, then the key and action (or what prevents it).</summary>
        public static (string title, string action, bool possible) For(Target t, GameplayState state)
        {
            if (t.IsNone) return (null, null, false);
            if (t.Type == TargetType.Loot)
            {
                LootDrop d = state.Loot.Get(t.LootId);
                if (d == null) return (null, null, false);
                string title = d.Stack.IsTool ? d.Stack.Def.Name : Quantity(d.Stack.ItemId, d.Stack.Count);
                return t.Status == TargetStatus.Ok ? (title, $"[{GatherKey}] Ramasser", true) : (title, Refusal(t, state.Items), false);
            }
            HarvestRule rule = HarvestData.Rules[t.Kind];
            string verb = t.WithAltTool ? "Faucher" : rule.Verb;
            string key = t.Input == TargetInput.Use ? UseKey : GatherKey;
            return t.Status == TargetStatus.Ok ? (rule.Name, $"[{key}] {verb}", true) : (rule.Name, Refusal(t, state.Items), false);
        }

        public static string Refusal(Target t, PlayerItems items)
        {
            switch (t.Status)
            {
                case TargetStatus.TooFar: return "Approche-toi";
                case TargetStatus.Blocked: return "Quelque chose te barre le passage";
                case TargetStatus.InventoryFull: return Full;
                case TargetStatus.ToolBroken: return Broken(items.EquippedStack) + " : prends un autre outil";
                case TargetStatus.NeedsTool:
                {
                    HarvestRule rule = HarvestData.Rules[t.Kind];
                    string tool = ItemCatalog.ToolLabel(rule.Tool.Value).ToLowerInvariant();
                    return rule.MinTier > 1 ? $"Il faut une {tool} en {ItemCatalog.QualityLabel(rule.MinTier)} ou mieux" : $"Il faut une {tool}";
                }
                default: return "";
            }
        }

        public static string Broken(ItemStack tool) =>
            tool == null ? "Cet outil est cassé" : "Ta " + Lower(tool.Def.Name) + " est cassée";

        /// <summary>« 3 Bûches », « 1 Bûche ».</summary>
        public static string Quantity(string itemId, int count)
        {
            ItemDef d = ItemCatalog.Get(itemId);
            return count + " " + (count > 1 ? d.Plural : d.Name);
        }

        /// <summary>« +3 Bûches ».</summary>
        public static string Gain(string itemId, int count) => "+" + Quantity(itemId, count);

        private static string Lower(string s) => string.IsNullOrEmpty(s) ? s : char.ToLowerInvariant(s[0]) + s.Substring(1);

        /// <summary>Tooltip lines of an item: category, then what is useful to know.</summary>
        public static string[] Tooltip(ItemStack s)
        {
            ItemDef d = s.Def;
            if (!d.IsTool) return new[] { ItemCatalog.CategoryLabel(d.Category), d.Description, $"Pile de {d.MaxStack} au plus" };
            string wear = s.IsBroken ? "Cassé : inutilisable" : $"Usure : {s.Durability} / {d.Tool.MaxDurability} coups";
            return new[]
            {
                $"Outil · qualité {ItemCatalog.QualityLabel(d.Tool.Tier)}", d.Description, wear,
                $"Efficacité : ×{d.Tool.Efficiency.ToString("0.#", System.Globalization.CultureInfo.InvariantCulture).Replace('.', ',')}",
            };
        }
    }
}
