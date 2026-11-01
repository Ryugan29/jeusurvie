// Text storage of the player's preferences (browser localStorage in the original → PlayerPrefs). Never throws to the caller:
// GraphicsPreferencesStore already catches and falls back to the defaults.
using JeuSurvie.Core.Storage;
using UnityEngine;

namespace JeuSurvie.Storage
{
    public sealed class PlayerPrefsStorage : ITextStorage
    {
        public string GetItem(string key) => PlayerPrefs.HasKey(key) ? PlayerPrefs.GetString(key) : null;

        public void SetItem(string key, string value)
        {
            PlayerPrefs.SetString(key, value);
            PlayerPrefs.Save();
        }

        public void RemoveItem(string key)
        {
            PlayerPrefs.DeleteKey(key);
            PlayerPrefs.Save();
        }
    }
}
