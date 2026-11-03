// The harvest's interface, in the game's style (gold on dark ink, like the settings): what is aimed at and how to work it,
// the messages (« +3 Bûches », « Inventaire plein »…), the hotbar (keys 1–8, wear of each tool, the one in hand outlined),
// and the bag (Tab): a grid of slots with icons and counts, tooltips, filters and sorting, drag and drop to move, merge or
// swap, right click to split a stack in two, drag onto the hotbar to make a shortcut, drag out of the bag to drop on the
// ground, buttons to take in hand, put away or drop. Presentation only: it sends commands, the gameplay applies them.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.Gameplay;
using JeuSurvie.Core.Items;
using UnityEngine;
using UnityEngine.UIElements;

namespace JeuSurvie.UI
{
    public enum ToastKind { Gain, Warning, Info }

    public sealed class GameplayHud
    {
        private const int Columns = 6;
        private const double ToastS = 2.6, MergeGainS = 1.5;

        public event Action<InventoryCommand> CommandIssued;

        private readonly VisualElement root, prompt, toasts, hotbar, bag, grid, tooltip, ghost;
        private readonly Label promptTitle, promptAction, tooltipTitle, tooltipBody, bagHint;
        private readonly Button equipButton, dropButton;
        private readonly VisualElement[] slots = new VisualElement[Inventory.DefaultSize];
        private readonly VisualElement[] cells = new VisualElement[Hotbar.Size];
        private readonly List<(ItemCategory? category, Button button)> filters = new List<(ItemCategory?, Button)>(); // « Tout » is null
        private readonly Dictionary<string, Texture2D> icons = new Dictionary<string, Texture2D>();
        private readonly List<(VisualElement element, double until, string itemId, int count)> shownToasts = new List<(VisualElement, double, string, int)>();
        private GameplayState state;
        private PlayerItems drawnItems;
        private ItemCategory? filter;
        private int selected = -1, dragFrom = -1;
        private double clock;

        public bool InventoryOpen => bag.style.display == DisplayStyle.Flex;

        public GameplayHud(VisualElement hudRoot)
        {
            root = new VisualElement { name = "jeu" };
            root.AddToClassList("jeu");
            root.pickingMode = PickingMode.Ignore;
            var sheet = Resources.Load<StyleSheet>("UI/JeuSurvieJeu");
            if (sheet != null) root.styleSheets.Add(sheet);
            hudRoot.Insert(Math.Min(1, hudRoot.childCount), root); // above the demo panel, below the pause overlay

            prompt = Box(root, "visee");
            promptTitle = Text(prompt, "visee-nom");
            promptAction = Text(prompt, "visee-action");
            toasts = Box(root, "messages");
            prompt.pickingMode = toasts.pickingMode = PickingMode.Ignore; // never in the way of the game

            hotbar = Box(root, "barre");
            hotbar.pickingMode = PickingMode.Ignore;
            for (int i = 0; i < Hotbar.Size; i++)
            {
                VisualElement cell = Box(hotbar, "case-barre");
                Text(cell, "case-touche").text = (i + 1).ToString();
                cells[i] = cell;
                int index = i;
                cell.RegisterCallback<PointerEnterEvent>(e => ShowTooltipForCell(index, e.position));
                cell.RegisterCallback<PointerLeaveEvent>(e => HideTooltip());
            }

            bag = Box(root, "sac");
            bag.style.display = DisplayStyle.None;
            VisualElement head = Box(bag, "sac-entete");
            Text(head, "sac-titre").text = "Sac";
            VisualElement tabs = Box(head, "sac-filtres");
            foreach (var (label, cat) in new (string, ItemCategory?)[] { ("Tout", null), ("Ressources", ItemCategory.Resource), ("Plantes", ItemCategory.Plant), ("Minerais", ItemCategory.Ore), ("Outils", ItemCategory.Tool) })
            {
                var b = new Button(() => { filter = cat; drawnItems = null; }) { text = label };
                b.AddToClassList("sac-filtre");
                tabs.Add(b);
                filters.Add((cat, b));
            }
            var sort = new Button(() => CommandIssued?.Invoke(InventoryCommand.Sort())) { text = "Trier" };
            sort.AddToClassList("sac-bouton");
            head.Add(sort);
            grid = Box(bag, "sac-grille");
            for (int i = 0; i < slots.Length; i++)
            {
                VisualElement slot = Box(grid, "case");
                slots[i] = slot;
                int index = i;
                slot.RegisterCallback<PointerDownEvent>(e => OnSlotDown(index, e));
                slot.RegisterCallback<PointerEnterEvent>(e => ShowTooltipForSlot(index, e.position));
                slot.RegisterCallback<PointerLeaveEvent>(e => HideTooltip());
            }
            VisualElement foot = Box(bag, "sac-pied");
            equipButton = new Button(EquipSelected) { text = "Prendre en main" };
            equipButton.AddToClassList("sac-bouton");
            foot.Add(equipButton);
            dropButton = new Button(() => { if (selected >= 0) CommandIssued?.Invoke(InventoryCommand.Drop(selected)); }) { text = "Déposer au sol" };
            dropButton.AddToClassList("sac-bouton");
            foot.Add(dropButton);
            bagHint = Text(bag, "sac-aide");
            bagHint.text = "Glisser : déplacer, empiler ou échanger · Clic droit : diviser une pile · Glisser sur la barre : raccourci · Glisser hors du sac : déposer · Tab ou Échap : fermer";

            tooltip = Box(root, "bulle");
            tooltip.pickingMode = PickingMode.Ignore;
            tooltip.style.display = DisplayStyle.None;
            tooltipTitle = Text(tooltip, "bulle-titre");
            tooltipBody = Text(tooltip, "bulle-texte");

            ghost = Box(root, "fantome");
            ghost.pickingMode = PickingMode.Ignore;
            ghost.style.display = DisplayStyle.None;
            root.RegisterCallback<PointerMoveEvent>(OnPointerMove, TrickleDown.TrickleDown);
            root.RegisterCallback<PointerUpEvent>(OnPointerUp, TrickleDown.TrickleDown);
        }

        public void OpenInventory()
        {
            bag.style.display = DisplayStyle.Flex;
            root.pickingMode = PickingMode.Position; // a click anywhere belongs to the interface while the bag is open
            drawnItems = null;
        }

        public void CloseInventory()
        {
            CancelDrag();
            HideTooltip();
            bag.style.display = DisplayStyle.None;
            root.pickingMode = PickingMode.Ignore;
            selected = -1;
        }

        // --- each frame ----------------------------------------------------------------------------------------------------

        public void Render(GameplayState s, bool aiming)
        {
            clock += Time.unscaledDeltaTime;
            state = s;
            var (title, action, possible) = aiming ? PromptText.For(s.Target, s) : (null, null, false);
            prompt.style.display = title == null ? DisplayStyle.None : DisplayStyle.Flex;
            if (title != null)
            {
                promptTitle.text = title;
                promptAction.text = action;
                promptAction.EnableInClassList("impossible", !possible);
            }
            if (s.Items != drawnItems) Redraw(s.Items);
            ExpireToasts();
        }

        private void Redraw(PlayerItems items)
        {
            drawnItems = items;
            HashSet<int> shown = new HashSet<int>(items.Inventory.Matching(filter));
            for (int i = 0; i < slots.Length; i++)
            {
                ItemStack st = i < items.Inventory.Size ? items.Inventory[i] : null;
                Fill(slots[i], st, items.Equipped);
                slots[i].EnableInClassList("estompee", st != null && !shown.Contains(i));
                slots[i].EnableInClassList("choisie", i == selected);
            }
            for (int i = 0; i < cells.Length; i++)
            {
                ItemStack st = items.Inventory.Tool(items.Hotbar[i].ToolId);
                Fill(cells[i], st, items.Equipped, keepKey: true);
            }
            foreach (var (category, button) in filters) button.EnableInClassList("actif", category == filter);
            ItemStack sel = selected >= 0 ? items.Inventory[selected] : null;
            equipButton.SetEnabled(sel != null && sel.IsTool);
            equipButton.text = sel != null && sel.IsTool && sel.ToolId == items.Equipped ? "Ranger l'outil" : "Prendre en main";
            dropButton.SetEnabled(sel != null);
        }

        private void Fill(VisualElement slot, ItemStack st, long equipped, bool keepKey = false)
        {
            for (int c = slot.childCount - 1; c >= 0; c--)
                if (!(keepKey && slot[c].ClassListContains("case-touche"))) slot.RemoveAt(c);
            slot.EnableInClassList("en-main", st != null && st.IsTool && st.ToolId == equipped);
            slot.EnableInClassList("cassee", st != null && st.IsBroken);
            if (st == null) return;
            var icon = new VisualElement();
            icon.AddToClassList("icone");
            icon.pickingMode = PickingMode.Ignore;
            Texture2D tex = Icon(st.Def.Model);
            if (tex != null) icon.style.backgroundImage = new StyleBackground(tex);
            slot.Add(icon);
            if (st.IsTool)
            {
                var bar = Box(slot, "usure");
                bar.pickingMode = PickingMode.Ignore;
                var fill = Box(bar, "usure-niveau");
                float share = (float)st.Durability / st.Def.Tool.MaxDurability;
                fill.style.width = Length.Percent(share * 100);
                fill.EnableInClassList("faible", share < 0.25f);
            }
            else if (st.Count > 1)
            {
                Label n = Text(slot, "quantite");
                n.text = st.Count.ToString();
                n.pickingMode = PickingMode.Ignore;
            }
        }

        private Texture2D Icon(string model)
        {
            if (!icons.TryGetValue(model, out Texture2D t)) icons[model] = t = Resources.Load<Texture2D>("UI/Icones/" + model);
            return t;
        }

        // --- messages ------------------------------------------------------------------------------------------------------

        /// <summary>A message on the side; repeated gains of the same item add up (« +3 Bûches » then « +5 Bûches »).</summary>
        public void Toast(string text, ToastKind kind, string itemId = null)
        {
            if (kind == ToastKind.Gain && itemId != null)
            {
                int count = 0;
                for (int i = shownToasts.Count - 1; i >= 0; i--)
                {
                    var t = shownToasts[i];
                    if (t.itemId != itemId || t.until - ToastS + MergeGainS < clock) continue;
                    count = t.count;
                    t.element.RemoveFromHierarchy();
                    shownToasts.RemoveAt(i);
                    break;
                }
                int added = ParseGain(text);
                text = PromptText.Gain(itemId, count + added);
                var e = Toasted(text, kind, itemId);
                shownToasts.Add((e, clock + ToastS, itemId, count + added));
                return;
            }
            shownToasts.Add((Toasted(text, kind, null), clock + ToastS, null, 0));
        }

        private static int ParseGain(string text)
        {
            int end = text.IndexOf(' ');
            return end > 1 && int.TryParse(text.Substring(1, end - 1), out int n) ? n : 0;
        }

        private VisualElement Toasted(string text, ToastKind kind, string itemId)
        {
            VisualElement e = Box(toasts, "message");
            e.pickingMode = PickingMode.Ignore;
            e.AddToClassList(kind == ToastKind.Gain ? "gain" : kind == ToastKind.Warning ? "alerte" : "info");
            if (itemId != null && ItemCatalog.TryGet(itemId, out ItemDef def))
            {
                var icon = Box(e, "message-icone");
                Texture2D tex = Icon(def.Model);
                if (tex != null) icon.style.backgroundImage = new StyleBackground(tex);
            }
            Text(e, "message-texte").text = text;
            while (toasts.childCount > 5) toasts.RemoveAt(0);
            return e;
        }

        private void ExpireToasts()
        {
            for (int i = shownToasts.Count - 1; i >= 0; i--)
            {
                var t = shownToasts[i];
                double left = t.until - clock;
                t.element.style.opacity = (float)Math.Min(1, Math.Max(0, left / 0.5));
                if (left > 0) continue;
                t.element.RemoveFromHierarchy();
                shownToasts.RemoveAt(i);
            }
        }

        // --- bag interactions ----------------------------------------------------------------------------------------------

        private void OnSlotDown(int index, PointerDownEvent e)
        {
            if (state == null || !InventoryOpen) return;
            ItemStack st = state.Items.Inventory[index];
            selected = index;
            drawnItems = null;
            if (st == null) return;
            if (e.button == 1)
            {
                int empty = FirstEmpty();
                if (!st.IsTool && st.Count > 1 && empty >= 0) CommandIssued?.Invoke(InventoryCommand.SplitHalf(index, empty));
                e.StopPropagation();
                return;
            }
            if (e.button != 0) return;
            dragFrom = index;
            ghost.style.backgroundImage = new StyleBackground(Icon(st.Def.Model));
            MoveGhost(e.position);
            ghost.style.display = DisplayStyle.Flex;
            root.CapturePointer(e.pointerId);
            HideTooltip();
            e.StopPropagation();
        }

        private void OnPointerMove(PointerMoveEvent e)
        {
            if (dragFrom >= 0) MoveGhost(e.position);
            else if (tooltip.style.display == DisplayStyle.Flex) PlaceTooltip(e.position);
        }

        private void OnPointerUp(PointerUpEvent e)
        {
            if (dragFrom < 0) return;
            int from = dragFrom;
            CancelDrag();
            root.ReleasePointer(e.pointerId);
            int to = Array.IndexOf(slots, Owner(e.position, slots));
            int cell = Array.IndexOf(cells, Owner(e.position, cells));
            if (to >= 0 && to != from) { CommandIssued?.Invoke(InventoryCommand.Move(from, to)); selected = to; }
            else if (cell >= 0) CommandIssued?.Invoke(InventoryCommand.AssignHotbar(from, cell));
            else if (to < 0 && !bag.worldBound.Contains(e.position)) CommandIssued?.Invoke(InventoryCommand.Drop(from));
            drawnItems = null;
        }

        private VisualElement Owner(Vector2 position, VisualElement[] candidates)
        {
            foreach (VisualElement c in candidates) if (c.worldBound.Contains(position)) return c;
            return null;
        }

        private void CancelDrag()
        {
            dragFrom = -1;
            ghost.style.display = DisplayStyle.None;
            if (root.HasPointerCapture(PointerId.mousePointerId)) root.ReleasePointer(PointerId.mousePointerId); // closed mid-drag
        }

        private void MoveGhost(Vector2 p)
        {
            Vector2 local = root.WorldToLocal(p);
            ghost.style.left = local.x - 28;
            ghost.style.top = local.y - 28;
        }

        private int FirstEmpty()
        {
            for (int i = 0; i < state.Items.Inventory.Size; i++) if (state.Items.Inventory[i] == null) return i;
            return -1;
        }

        private void EquipSelected()
        {
            if (state == null || selected < 0) return;
            ItemStack st = state.Items.Inventory[selected];
            if (st == null || !st.IsTool) return;
            CommandIssued?.Invoke(st.ToolId == state.Items.Equipped ? InventoryCommand.Unequip() : InventoryCommand.Equip(selected));
        }

        // --- tooltips ------------------------------------------------------------------------------------------------------

        private void ShowTooltipForSlot(int index, Vector2 at)
        {
            if (state == null || dragFrom >= 0 || !InventoryOpen) return;
            ShowTooltip(state.Items.Inventory[index], at);
        }

        private void ShowTooltipForCell(int index, Vector2 at)
        {
            if (state == null || dragFrom >= 0 || !InventoryOpen) return;
            ShowTooltip(state.Items.Inventory.Tool(state.Items.Hotbar[index].ToolId), at);
        }

        private void ShowTooltip(ItemStack st, Vector2 at)
        {
            if (st == null) { HideTooltip(); return; }
            tooltipTitle.text = st.Def.Name + (st.IsTool && st.ToolId == state.Items.Equipped ? " · en main" : "");
            tooltipBody.text = string.Join("\n", PromptText.Tooltip(st));
            tooltip.style.display = DisplayStyle.Flex;
            PlaceTooltip(at);
        }

        private void PlaceTooltip(Vector2 p)
        {
            Vector2 local = root.WorldToLocal(p);
            tooltip.style.left = local.x + 18;
            tooltip.style.top = local.y + 12;
        }

        private void HideTooltip() => tooltip.style.display = DisplayStyle.None;

        // --- helpers -------------------------------------------------------------------------------------------------------

        private static VisualElement Box(VisualElement parent, string cls)
        {
            var e = new VisualElement();
            e.AddToClassList(cls);
            parent.Add(e);
            return e;
        }

        private static Label Text(VisualElement parent, string cls)
        {
            var l = new Label { pickingMode = PickingMode.Ignore };
            l.AddToClassList(cls);
            parent.Add(l);
            return l;
        }
    }
}
