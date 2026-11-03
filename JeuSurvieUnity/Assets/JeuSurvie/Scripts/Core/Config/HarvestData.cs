// How each thing of the world is harvested: tool, work, what it gives, how long it takes to grow back. The only place
// to tune the harvest. Work is counted in blows of a stone tool (a copper tool does 1.5 of them per blow, iron 2).
using System.Collections.Generic;
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Items;

namespace JeuSurvie.Core.Config
{
    public static class HarvestData
    {
        /// <summary>Horizontal reach from the player's centre to the surface of what is worked (m).</summary>
        public const double StrikeReachM = 1.35, GatherReachM = 1.25;

        public static readonly IReadOnlyDictionary<HarvestKind, HarvestRule> Rules = new Dictionary<HarvestKind, HarvestRule>
        {
            { HarvestKind.Tree, Tree("Arbre", 6) },
            { HarvestKind.Pine, Tree("Pin", 6) },
            { HarvestKind.DeadTree, new HarvestRule("Arbre mort", "Abattre", ToolType.Axe, 1, 4, 1, new Yield("wood", 3, 4), 1200, AfterHarvest.Stump, Gesture.Chop) },
            { HarvestKind.Stump, new HarvestRule("Souche", "Fendre", ToolType.Axe, 1, 3, 1, new Yield("wood", 2, 3), 1200, AfterHarvest.Remove, Gesture.Chop) },
            { HarvestKind.Rock, new HarvestRule("Rocher", "Casser", ToolType.Pickaxe, 1, 3, 3, new Yield("stone", 2, 3), 1800, AfterHarvest.Remove, Gesture.Overhead) },
            { HarvestKind.CopperOre, new HarvestRule("Gisement de cuivre", "Extraire", ToolType.Pickaxe, 1, 4, 2, new Yield("copper_ore", 1, 2), 2400, AfterHarvest.Remove, Gesture.Overhead) },
            { HarvestKind.IronOre, new HarvestRule("Gisement de fer", "Extraire", ToolType.Pickaxe, 2, 5, 2, new Yield("iron_ore", 1, 2), 3600, AfterHarvest.Remove, Gesture.Overhead) },
            { HarvestKind.TallGrass, new HarvestRule("Hautes herbes", "Faucher", ToolType.Sickle, 1, 1, 1, new Yield("fibre", 2, 4), 300, AfterHarvest.Remove, Gesture.Sweep) },
            { HarvestKind.Herb, new HarvestRule("Herbes sauvages", "Cueillir", null, 1, 1, 1, new Yield("herb", 1, 2), 600, AfterHarvest.Remove, Gesture.Pull, ToolType.Sickle, 1) },
            { HarvestKind.FlowerRose, new HarvestRule("Rose des clairières", "Cueillir", null, 1, 1, 1, new Yield("flower_rose", 1, 3), 600, AfterHarvest.Remove, Gesture.Gather) },
            { HarvestKind.FlowerGold, new HarvestRule("Épi doré", "Cueillir", null, 1, 1, 1, new Yield("flower_gold", 1, 2), 600, AfterHarvest.Remove, Gesture.Gather) },
            { HarvestKind.Branch, new HarvestRule("Branche tombée", "Ramasser", null, 1, 1, 1, new Yield("branch", 1, 2), 600, AfterHarvest.Remove, Gesture.Pickup) },
            { HarvestKind.Soil, new HarvestRule("Terre meuble", "Bêcher", ToolType.Hoe, 1, 2, 1, new Yield("root", 1, 3), 0, AfterHarvest.Till, Gesture.Dig) },
        };

        private static HarvestRule Tree(string name, int work) =>
            new HarvestRule(name, "Abattre", ToolType.Axe, 1, work, 1, new Yield("wood", 4, 6), 1200, AfterHarvest.Stump, Gesture.Chop);

        /// <summary>Gestures: duration (s) and the moment of the impact (fraction of the gesture), set from the heroine's clips
        /// (models/characters/heroine/animations.json: clip length ÷ playback speed, contact frame). Tuning them stays safe:
        /// the game bends the clip's time so the blow always lands on ImpactAt (CharacterAnimation.ClipFraction).</summary>
        public static readonly IReadOnlyDictionary<Gesture, GestureTiming> Gestures = new Dictionary<Gesture, GestureTiming>
        {
            { Gesture.Chop, new GestureTiming(0.97, 0.48) },
            { Gesture.Overhead, new GestureTiming(1.25, 0.53) },
            { Gesture.Sweep, new GestureTiming(1.6, 0.45) },
            { Gesture.Gather, new GestureTiming(2.55, 0.33) },
            { Gesture.Pickup, new GestureTiming(2.0, 0.35) },
            { Gesture.Dig, new GestureTiming(1.35, 0.55) },
            { Gesture.Pull, new GestureTiming(2.25, 0.41) },
        };

        /// <summary>Respawn: never in sight closer than this, never closer than this even out of sight (m); retry delay (s).</summary>
        public const double RespawnHiddenM = 15, RespawnFarM = 45, RespawnRetryS = 10;
        /// <summary>Growing back: trees and rocks take longer than plants (s).</summary>
        public const double RegrowBigS = 4, RegrowSmallS = 1.5;
        /// <summary>A felled tree's stump, relative to the tree's scale (dead trees have thicker trunks).</summary>
        public const double StumpScale = 1.15, DeadStumpScale = 1.7;
        /// <summary>Rock stages: what is left of the rock after each stage.</summary>
        public static readonly double[] RockStageScales = { 1, 0.78, 0.55 };
        /// <summary>Loot: identical items dropped this close merge (m).</summary>
        public const double LootMergeM = 1.2;
    }
}
