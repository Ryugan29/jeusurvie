// A click on a button of the interface is for the button, not a « click to play »: the game captured the mouse on the press,
// before the button's click (on release) could open the graphics settings.
#if UNITY_EDITOR
using System.Collections;
using System.Linq;
using JeuSurvie.UI;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace JeuSurvie.Tests
{
    public class GameHudTests
    {
        private GameObject host;

        [TearDown]
        public void Clean()
        {
            if (host != null) Object.Destroy(host);
        }

        private IEnumerator CreateHud(System.Action<GameHud> done)
        {
            host = new GameObject("Interface (test)");
            host.SetActive(false);
            var panelSettings = ScriptableObject.CreateInstance<PanelSettings>();
            panelSettings.themeStyleSheet = Resources.Load<ThemeStyleSheet>("UI/JeuSurvieTheme");
            var doc = host.AddComponent<UIDocument>();
            doc.panelSettings = panelSettings;
            host.SetActive(true);
            var hud = new GameHud(doc);
            yield return null; // layout
            yield return null;
            done(hud);
        }

        [UnityTest]
        public IEnumerator SettingsButtonIsAControlAndTheOverlayIsNot()
        {
            GameHud hud = null;
            yield return CreateHud(h => hud = h);
            Button open = hud.Root.Query<Button>().ToList().First(b => b.text == "Réglages graphiques");
            Rect button = open.worldBound;

            Assert.IsTrue(hud.IsOverControl(button.center), "le bouton « Réglages graphiques » doit garder son clic");
            Assert.IsFalse(hud.IsOverControl(new Vector2(button.center.x, button.yMax + 120)), "ailleurs sur le voile, un clic lance la partie");
        }
    }
}
#endif
