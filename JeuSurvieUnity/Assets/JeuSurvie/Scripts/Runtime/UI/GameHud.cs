// Ports of the DOM interface (spike.html + ui/settings/graphics-settings-panel + ui/dom/set-if-changed) with UI Toolkit: the demo
// panel (fps, hour, weather, chunks, cover, quality — key F), the pause / resume overlay with its « Réglages graphiques » button,
// and Réglages → Graphismes: LOW / MEDIUM / HIGH / ULTRA as a radio group (click, Enter, arrows, Home/End), description card,
// hover preview, live application, status line, « Rétablir par défaut », « ← Retour » and Escape. Presentation only: it reports
// choices through callbacks; the composition root applies and saves. Text is set as plain text only.
using System;
using System.Collections.Generic;
using JeuSurvie.Core.RenderData;
using UnityEngine;
using UnityEngine.UIElements;
using QualityLevel = JeuSurvie.Core.RenderData.QualityLevel;

namespace JeuSurvie.UI
{
    public sealed class GameHud
    {
        public readonly VisualElement Root;
        private readonly VisualElement panel, overlay, settings;
        private readonly Label fps, info, cover, seed, overlayText;
        private readonly Dictionary<QualityLevel, Button> choices = new Dictionary<QualityLevel, Button>();
        private readonly Label cardTitle, cardSummary, status;
        private readonly VisualElement cardDetails;
        private QualityLevel active = Quality.DefaultLevel;

        public event Action OverlayClicked;
        public event Action<QualityLevel> PresetSelected;
        public event Action ResetRequested;

        public bool SettingsOpen => settings.style.display == DisplayStyle.Flex;
        public bool PanelVisible => panel.style.display == DisplayStyle.Flex;

        public GameHud(UIDocument document)
        {
            Root = document.rootVisualElement;
            Root.Clear();
            var sheet = Resources.Load<StyleSheet>("UI/JeuSurvie");
            if (sheet != null) Root.styleSheets.Add(sheet);
            Root.AddToClassList("racine");
            Root.pickingMode = PickingMode.Ignore;

            panel = El("panneau");
            panel.pickingMode = PickingMode.Ignore;
            panel.style.display = DisplayStyle.Flex; // explicit: PanelVisible compares against it (the panel shows by default, F hides it)
            fps = Text(panel, "— images/s");
            info = Text(panel, "");
            cover = Text(panel, "");
            seed = Text(panel, "");
            Text(panel, "1 matin · 2 midi · 3 crépuscule · 4 nuit · 5 cycle ×60 · 6 météo · O réglages graphiques · Maj marcher · F masquer · Échap pause").AddToClassList("touches");
            Root.Add(panel);

            overlay = El("voile-pause");
            overlay.style.display = DisplayStyle.Flex;
            overlayText = Text(overlay, "Cliquer pour jouer");
            overlayText.AddToClassList("texte");
            var open = new Button(() => OpenSettings()) { text = "Réglages graphiques" };
            open.AddToClassList("bouton-voile");
            open.RegisterCallback<ClickEvent>(e => e.StopPropagation());
            overlay.Add(open);
            overlay.RegisterCallback<ClickEvent>(e => { if (!SettingsOpen) OverlayClicked?.Invoke(); });
            Root.Add(overlay);

            settings = El("reglages-voile");
            var window = El("reglages-fenetre");
            var nav = El("reglages-nav");
            Text(nav, "Réglages").AddToClassList("reglages-titre");
            var tab = new Button { text = "Graphismes" };
            tab.AddToClassList("reglages-onglet");
            nav.Add(tab);
            var foot = El("reglages-nav-pied");
            var reset = new Button(() => ResetRequested?.Invoke()) { text = "Rétablir par défaut" };
            reset.AddToClassList("reglages-lien");
            var back = new Button(CloseSettings) { text = "← Retour" };
            back.AddToClassList("reglages-bouton");
            foot.Add(reset);
            foot.Add(back);
            Text(foot, "Échap : retour").AddToClassList("reglages-aide");
            nav.Add(foot);
            var content = El("reglages-contenu");
            var row = El("reglages-ligne");
            Text(row, "Qualité graphique").AddToClassList("reglages-libelle");
            var group = El("reglages-selecteur");
            foreach (QualityLevel level in Quality.Levels)
            {
                QualityLevel l = level;
                var b = new Button(() => Choose(l)) { text = Quality.Describe(l).Label };
                b.AddToClassList("reglages-choix");
                b.focusable = true;
                b.RegisterCallback<FocusInEvent>(_ => Preview(l));
                b.RegisterCallback<MouseEnterEvent>(_ => Preview(l));
                b.RegisterCallback<MouseLeaveEvent>(_ => Preview(active));
                b.RegisterCallback<KeyDownEvent>(e => OnChoiceKey(e, l));
                choices[l] = b;
                group.Add(b);
            }
            row.Add(group);
            var card = El("reglages-carte");
            cardTitle = Text(card, "");
            cardTitle.AddToClassList("reglages-carte-titre");
            cardSummary = Text(card, "");
            cardSummary.AddToClassList("reglages-resume");
            cardDetails = new VisualElement();
            card.Add(cardDetails);
            status = new Label();
            status.AddToClassList("reglages-etat");
            content.Add(row);
            content.Add(card);
            content.Add(status);
            window.Add(nav);
            window.Add(content);
            window.RegisterCallback<ClickEvent>(e => e.StopPropagation());
            settings.Add(window);
            settings.RegisterCallback<ClickEvent>(_ => CloseSettings());
            settings.RegisterCallback<KeyDownEvent>(e =>
            {
                if (e.keyCode != KeyCode.Escape) return;
                e.StopPropagation();
                CloseSettings();
            });
            settings.style.display = DisplayStyle.None;
            Root.Add(settings);
            SetActive(active, "");
        }

        private static VisualElement El(string cls)
        {
            var v = new VisualElement();
            v.AddToClassList(cls);
            return v;
        }

        private static Label Text(VisualElement parent, string text)
        {
            var l = new Label(text);
            parent.Add(l);
            return l;
        }

        /// <summary>setTextIfChanged: the label is only touched when its text changes (no relayout for nothing).</summary>
        private static void SetText(Label l, string text)
        {
            if (l.text != text) l.text = text;
        }

        private void OnChoiceKey(KeyDownEvent e, QualityLevel current)
        {
            string key = e.keyCode == KeyCode.RightArrow ? "ArrowRight" : e.keyCode == KeyCode.LeftArrow ? "ArrowLeft" : e.keyCode == KeyCode.UpArrow ? "ArrowUp"
                : e.keyCode == KeyCode.DownArrow ? "ArrowDown" : e.keyCode == KeyCode.Home ? "Home" : e.keyCode == KeyCode.End ? "End" : null;
            if (key == null) return;
            QualityLevel? target = Quality.Neighbour(current, key);
            if (target == null) return;
            e.StopPropagation();
            choices[target.Value].Focus();
            Choose(target.Value);
        }

        private void Choose(QualityLevel l) => PresetSelected?.Invoke(l);

        private void Preview(QualityLevel l)
        {
            QualityDescription d = Quality.Describe(l);
            SetText(cardTitle, d.Label + (l == active ? " (actif)" : ""));
            SetText(cardSummary, d.Summary);
            cardDetails.Clear();
            foreach (string detail in d.Details)
            {
                var item = new Label("• " + detail);
                item.AddToClassList("reglages-detail");
                cardDetails.Add(item);
            }
        }

        /// <summary>Active profile and status line (set by the composition root after applying / saving).</summary>
        public void SetActive(QualityLevel l, string message)
        {
            active = l;
            foreach (var kv in choices)
            {
                kv.Value.EnableInClassList("actif", kv.Key == l);
                kv.Value.tooltip = kv.Key == l ? "profil actif" : "";
            }
            Preview(l);
            SetText(status, message ?? "");
        }

        public void OpenSettings()
        {
            settings.style.display = DisplayStyle.Flex;
            choices[active].Focus();
        }

        public void CloseSettings() => settings.style.display = DisplayStyle.None;

        public void TogglePanel() => panel.style.display = PanelVisible ? DisplayStyle.None : DisplayStyle.Flex;

        public void ShowMode(bool playing, bool paused)
        {
            overlay.style.display = playing ? DisplayStyle.None : DisplayStyle.Flex;
            SetText(overlayText, paused ? "Pause — cliquer pour reprendre" : "Cliquer pour jouer (ZQSD pour marcher, souris pour regarder)");
        }

        public void SetLoading(string text)
        {
            overlay.style.display = DisplayStyle.Flex;
            SetText(overlayText, text);
        }

        public void SetPanel(string fpsLine, string infoLine, string coverLine)
        {
            SetText(fps, fpsLine);
            SetText(info, infoLine);
            SetText(cover, coverLine);
        }

        public void SetSeedLine(string line) => SetText(seed, line);
    }
}
