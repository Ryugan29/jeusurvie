// The game save: one JSON file per world (seed). Written whole each time (the store replaces the old file only once the
// new one is complete, and keeps the previous one as a backup). Read defensively: unknown objects are skipped, wear,
// counts and progress brought back in range, what would not fit is put on the ground — never lost — and each repair is
// reported. A save from a newer version of the game, or of another world, is refused and must never be written over.
// Numbers are written the same whatever the language of the PC (invariant culture).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Items;

namespace JeuSurvie.Core.Storage
{
    /// <summary>Where the save lives (a file in the game, memory in the tests).</summary>
    public interface ISaveStore
    {
        /// <summary>The main save (backup = false) or the previous one; null if absent or unreadable.</summary>
        string Read(bool backup);
        /// <summary>Replaces the main save at once; the old main becomes the backup.</summary>
        void WriteAtomic(string text);
        /// <summary>Moves an unreadable main save aside (kept for inspection, never deleted).</summary>
        void Quarantine();
    }

    public sealed class SaveData
    {
        public readonly uint Seed;
        public readonly long WorldTicks, PlayTicks;
        public readonly double X, Y, Z, Heading;
        public readonly GameplayState State;
        /// <summary>Where the starting camp is (kept, so it never moves even if the start position changes).</summary>
        public readonly CampSite Camp;

        public SaveData(uint seed, long worldTicks, long playTicks, double x, double y, double z, double heading, GameplayState state, CampSite camp = null)
        {
            Seed = seed; WorldTicks = worldTicks; PlayTicks = playTicks; X = x; Y = y; Z = z; Heading = heading; State = state; Camp = camp;
        }
    }

    public enum RefusalKind { None, Newer, OtherWorld, Unreadable }

    public sealed class LoadResult
    {
        public readonly SaveData Data;
        /// <summary>Why nothing was loaded (null when Data is set or there was simply no save).</summary>
        public readonly string Refusal;
        public readonly RefusalKind Kind;
        public readonly IReadOnlyList<string> Repairs;

        public LoadResult(SaveData data, string refusal, IReadOnlyList<string> repairs, RefusalKind kind = RefusalKind.None)
        {
            Data = data; Refusal = refusal; Repairs = repairs; Kind = kind;
        }

        /// <summary>False when the file belongs to another world or a newer game: this run must not write over it.</summary>
        public bool MaySaveOver => Kind != RefusalKind.Newer && Kind != RefusalKind.OtherWorld;
    }

    public static class GameSave
    {
        public const string Format = "jeusurvie.save";
        public const int Version = 1;
        private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        // ------------------------------------------------------------------------------------------------- writing

        public static string Write(SaveData d)
        {
            var w = new StringBuilder(4096);
            GameplayState s = d.State;
            w.Append("{\"format\":\"").Append(Format).Append("\",\"version\":").Append(I(Version));
            w.Append(",\"seed\":").Append(I(d.Seed));
            w.Append(",\"clock\":{\"world\":").Append(I(d.WorldTicks)).Append(",\"play\":").Append(I(d.PlayTicks)).Append('}');
            w.Append(",\"player\":{\"x\":").Append(Num(d.X)).Append(",\"y\":").Append(Num(d.Y)).Append(",\"z\":").Append(Num(d.Z))
                .Append(",\"heading\":").Append(Num(d.Heading)).Append('}');
            if (d.Camp != null)
                w.Append(",\"camp\":{\"x\":").Append(Num(d.Camp.X)).Append(",\"z\":").Append(Num(d.Camp.Z)).Append(",\"toward\":").Append(Num(d.Camp.TowardSpawn))
                    .Append(",\"layout\":").Append(I(CampSite.LayoutVersion)).Append('}');
            PlayerItems items = s.Items;
            w.Append(",\"items\":{\"nextTool\":").Append(I(items.NextToolId)).Append(",\"equipped\":").Append(I(items.Equipped)).Append(",\"slots\":[");
            for (int i = 0; i < items.Inventory.Size; i++)
            {
                if (i > 0) w.Append(',');
                Stack(w, items.Inventory[i]);
            }
            w.Append("],\"hotbar\":[");
            for (int i = 0; i < Hotbar.Size; i++) w.Append(i > 0 ? "," : "").Append(I(items.Hotbar[i].ToolId));
            w.Append("]},\"nodes\":[");
            bool first = true;
            foreach (var kv in s.World.Entries)
            {
                NodeState n = kv.Value;
                w.Append(first ? "" : ",").Append("{\"id\":\"").Append(kv.Key).Append("\",\"phase\":\"").Append(n.Phase.ToString().ToLowerInvariant())
                    .Append("\",\"stage\":").Append(I(n.Stage)).Append(",\"work\":").Append(I(n.Work)).Append(",\"hits\":").Append(I(n.Hits))
                    .Append(",\"gen\":").Append(I(n.Generation)).Append(",\"respawnAt\":").Append(I(n.RespawnAt)).Append(",\"since\":").Append(I(n.Since)).Append('}');
                first = false;
            }
            w.Append("],\"loot\":{\"next\":").Append(I(s.NextLootId)).Append(",\"drops\":[");
            first = true;
            foreach (LootDrop l in s.Loot.All)
            {
                w.Append(first ? "" : ",").Append("{\"id\":").Append(I(l.Id)).Append(",\"x\":").Append(Num(l.X)).Append(",\"y\":").Append(Num(l.Y))
                    .Append(",\"z\":").Append(Num(l.Z)).Append(",\"stack\":");
                Stack(w, l.Stack);
                w.Append('}');
                first = false;
            }
            w.Append("]}}");
            return w.ToString();
        }

        private static void Stack(StringBuilder w, ItemStack s)
        {
            if (s == null) { w.Append("null"); return; }
            w.Append("{\"item\":\"").Append(s.ItemId).Append('"');
            if (s.IsTool) w.Append(",\"tool\":").Append(I(s.ToolId)).Append(",\"wear\":").Append(I(s.Durability));
            else w.Append(",\"count\":").Append(I(s.Count));
            w.Append('}');
        }

        private static string I(long v) => v.ToString(Inv);

        private static string Num(double v) => double.IsNaN(v) || double.IsInfinity(v) ? "0" : v.ToString("R", Inv);

        // ------------------------------------------------------------------------------------------------- reading

        /// <summary>Reads a save of world `seed`. Throws FormatException if the text is not a save at all.</summary>
        public static LoadResult Read(string text, uint seed)
        {
            var repairs = new List<string>();
            if (!(new MiniJson(text).ParseDocument() is Dictionary<string, object> root) || Str(root, "format") != Format)
                throw new FormatException("pas une sauvegarde");
            if (Long(root, "version") > Version)
                return new LoadResult(null, "sauvegarde d'une version plus récente du jeu : elle est gardée intacte", repairs, RefusalKind.Newer);
            if ((uint)Long(root, "seed") != seed)
                return new LoadResult(null, "sauvegarde d'un autre monde : elle est gardée intacte", repairs, RefusalKind.OtherWorld);
            var clock = Obj(root, "clock");
            var player = Obj(root, "player");
            double px = Dbl(player, "x"), py = Dbl(player, "y"), pz = Dbl(player, "z");

            CampSite camp = null;
            bool campKept = true;
            if (root.ContainsKey("camp"))
            {
                var c = Obj(root, "camp");
                camp = CampSite.Restore(Dbl(c, "x"), Dbl(c, "z"), Dbl(c, "toward"));
                campKept = Long(c, "layout") == CampSite.LayoutVersion;
                if (!campKept) repairs.Add("le camp a changé de plan : ses ressources repartent à neuf");
            }

            var itemsObj = Obj(root, "items");
            var toolIds = new HashSet<long>();
            long nextTool = Math.Max(1, Long(itemsObj, "nextTool"));
            var overflow = new List<ItemStack>();
            var slots = new ItemStack[Inventory.DefaultSize];
            List<object> slotList = List(itemsObj, "slots");
            for (int i = 0; i < slotList.Count; i++)
            {
                ItemStack st = ReadStack(slotList[i] as Dictionary<string, object>, toolIds, ref nextTool, repairs, overflow);
                if (st == null) continue;
                if (i < slots.Length) slots[i] = st;
                else overflow.Add(st);
            }
            List<object> bar = List(itemsObj, "hotbar");
            var refs = new HotbarRef[Hotbar.Size];
            for (int i = 0; i < refs.Length && i < bar.Count; i++) refs[i] = HotbarRef.Tool(AsLong(bar[i]));

            WorldOverlay overlay = ReadNodes(List(root, "nodes"), campKept, repairs);

            // Objects on the ground: ids unique, stacks never truncated (the extra lies beside them).
            var lootObj = Obj(root, "loot");
            var read = new List<(long id, ItemStack stack, double x, double y, double z)>();
            foreach (object o in List(lootObj, "drops"))
            {
                var d = o as Dictionary<string, object>;
                var extra = new List<ItemStack>();
                ItemStack st = ReadStack(d == null ? null : Obj(d, "stack"), toolIds, ref nextTool, repairs, extra);
                if (st == null) continue;
                double x = Dbl(d, "x"), y = Dbl(d, "y"), z = Dbl(d, "z");
                read.Add((Long(d, "id"), st, x, y, z));
                foreach (ItemStack e in extra) read.Add((0, e, x, y, z));
            }
            long nextLoot = Math.Max(1, Long(lootObj, "next"));
            foreach (var r in read) nextLoot = Math.Max(nextLoot, r.id + 1);
            var drops = new List<LootDrop>();
            var lootIds = new HashSet<long>();
            foreach (var r in read)
            {
                long id = r.id > 0 && lootIds.Add(r.id) ? r.id : nextLoot++;
                lootIds.Add(id);
                drops.Add(new LootDrop(id, r.stack, r.x, r.y, r.z));
            }
            foreach (ItemStack st in overflow) // never lost: what does not fit the bag waits at the player's feet
            {
                drops.Add(new LootDrop(nextLoot++, st, px, py + 0.05, pz));
                repairs.Add(PromptText.Quantity(st.ItemId, st.Count) + " posé(s) au sol");
            }
            PlayerItems items = PlayerItems.Restore(Inventory.FromSlots(slots), Hotbar.FromRefs(refs), Long(itemsObj, "equipped"), nextTool);
            var state = new GameplayState(items, overlay, LootList.Of(drops), ActionState.Idle, Target.None, nextLoot, 1);
            var data = new SaveData(seed, Long(clock, "world"), Math.Max(0, Long(clock, "play")), px, py, pz, Dbl(player, "heading"), state, camp);
            return new LoadResult(data, null, repairs);
        }

        /// <summary>The worked things; unknown phases skipped, progress never negative (a bad number must not crash every frame).</summary>
        private static WorldOverlay ReadNodes(List<object> nodes, bool campKept, List<string> repairs)
        {
            WorldOverlay overlay = WorldOverlay.Empty;
            foreach (object o in nodes)
            {
                var n = o as Dictionary<string, object>;
                string phaseText = Str(n, "phase");
                if (n == null || !NodeId.TryParse(Str(n, "id"), out NodeId id) || string.IsNullOrEmpty(phaseText) || !char.IsLetter(phaseText[0])
                    || !Enum.TryParse(phaseText, true, out NodePhase phase) || !Enum.IsDefined(typeof(NodePhase), phase))
                {
                    repairs.Add("un élément du monde illisible a été ignoré");
                    continue;
                }
                if (id.Layer == NodeLayer.Camp && !campKept) continue;
                long[] v = { Long(n, "stage"), Long(n, "work"), Long(n, "hits"), Long(n, "gen") };
                if (v.Any(x => x < 0)) repairs.Add("une valeur négative du monde a été corrigée");
                overlay = overlay.With(id, new NodeState(phase, Clamp(v[0]), Clamp(v[1]), Clamp(v[2]), Clamp(v[3]),
                    Math.Max(0, Long(n, "respawnAt")), Math.Max(0, Long(n, "since"))));
            }
            return overlay;
        }

        private static int Clamp(long v) => (int)Math.Max(0, Math.Min(int.MaxValue / 2, v));

        private static ItemStack ReadStack(Dictionary<string, object> o, HashSet<long> toolIds, ref long nextTool, List<string> repairs, List<ItemStack> overflow)
        {
            if (o == null) return null;
            string id = Str(o, "item");
            if (!ItemCatalog.TryGet(id, out ItemDef def))
            {
                repairs.Add($"objet inconnu « {id} » ignoré");
                return null;
            }
            if (def.IsTool)
            {
                long tool = Long(o, "tool");
                if (tool <= 0 || !toolIds.Add(tool))
                {
                    tool = nextTool++;
                    toolIds.Add(tool);
                    repairs.Add("un outil en double a reçu un nouveau numéro");
                }
                nextTool = Math.Max(nextTool, tool + 1);
                long wear = Long(o, "wear");
                if (wear < 0 || wear > def.Tool.MaxDurability) repairs.Add("usure d'un outil corrigée");
                return ItemStack.NewTool(id, tool, (int)Math.Max(0, Math.Min(def.Tool.MaxDurability, wear)));
            }
            long count = Long(o, "count");
            if (count < 1) return null;
            if (count > def.MaxStack)
            {
                for (long extra = count - def.MaxStack; extra > 0; extra -= def.MaxStack) overflow.Add(ItemStack.Of(id, (int)Math.Min(extra, def.MaxStack)));
                count = def.MaxStack;
            }
            return ItemStack.Of(id, (int)count);
        }

        private static Dictionary<string, object> Obj(Dictionary<string, object> o, string k) =>
            o != null && o.TryGetValue(k, out object v) && v is Dictionary<string, object> d ? d : new Dictionary<string, object>();

        private static List<object> List(Dictionary<string, object> o, string k) =>
            o != null && o.TryGetValue(k, out object v) && v is List<object> l ? l : new List<object>();

        private static string Str(Dictionary<string, object> o, string k) => o != null && o.TryGetValue(k, out object v) ? v as string : null;

        private static double Dbl(Dictionary<string, object> o, string k) =>
            o != null && o.TryGetValue(k, out object v) && v is double d && !double.IsNaN(d) && !double.IsInfinity(d) ? d : 0;

        private static long Long(Dictionary<string, object> o, string k) => o != null && o.TryGetValue(k, out object v) ? AsLong(v) : 0;

        private static long AsLong(object v) => v is double d && !double.IsNaN(d) && Math.Abs(d) < 9e15 ? (long)Math.Round(d) : 0;
    }

    /// <summary>Loading with fallbacks: the main save, else the backup, else a new game (the unreadable file is kept aside).</summary>
    public static class SaveService
    {
        public static LoadResult Load(ISaveStore store, uint seed)
        {
            string main = store.Read(false);
            if (main == null) return Try(store.Read(true), seed) ?? new LoadResult(null, null, Array.Empty<string>());
            LoadResult r = Try(main, seed);
            if (r != null) return r;
            store.Quarantine();
            LoadResult backup = Try(store.Read(true), seed);
            if (backup != null && backup.Data != null)
                return new LoadResult(backup.Data, null, backup.Repairs.Concat(new[] { "sauvegarde abîmée : la précédente a été reprise" }).ToList());
            if (backup != null && !backup.MaySaveOver) return backup;
            return new LoadResult(null, "sauvegarde illisible, mise de côté : nouvelle partie", Array.Empty<string>(), RefusalKind.Unreadable);
        }

        /// <summary>Any failure while reading counts as unreadable: a damaged file must never stop the game from starting.</summary>
        private static LoadResult Try(string text, uint seed)
        {
            if (text == null) return null;
            try { return GameSave.Read(text, seed); }
            catch (Exception) { return null; }
        }
    }
}
