// COMPILE-CHECK STUBS ONLY: the few UnityEditor members used by Editor/ProjectSetup.cs and BabylonAssetImporter.cs.
#pragma warning disable
using System;
using UnityEngine;
using UnityEngine.Rendering;

namespace UnityEditor
{
    [AttributeUsage(AttributeTargets.Class)] public sealed class InitializeOnLoadAttribute : Attribute { }
    [AttributeUsage(AttributeTargets.Method)] public sealed class MenuItemAttribute : Attribute { public MenuItemAttribute(string path) { } }
    public static class EditorApplication { public static Action delayCall; public static bool isPlayingOrWillChangePlaymode => false; }
    public static class AssetDatabase
    {
        public static T LoadAssetAtPath<T>(string path) where T : UnityEngine.Object => null;
        public static void CreateAsset(UnityEngine.Object o, string path) { }
        public static void AddObjectToAsset(UnityEngine.Object o, UnityEngine.Object asset) { }
        public static void SaveAssets() { }
        public static void Refresh() { }
        public static bool TryGetGUIDAndLocalFileIdentifier(UnityEngine.Object o, out string guid, out long localId) { guid = null; localId = 0; return false; }
    }
    public static class EditorUtility
    {
        public static void SetDirty(UnityEngine.Object o) { }
        public static string OpenFolderPanel(string t, string f, string d) => null;
        public static bool DisplayDialog(string t, string m, string ok) => true;
    }
    public sealed class SceneAsset : UnityEngine.Object { }
    public enum SerializedPropertyType { Integer, Boolean, Enum }
    public class SerializedProperty
    {
        public SerializedPropertyType propertyType; public int intValue; public bool boolValue; public int enumValueIndex; public long longValue;
        public void ClearArray() { }
        public void InsertArrayElementAtIndex(int i) { }
        public SerializedProperty GetArrayElementAtIndex(int i) => null;
    }
    public class SerializedObject
    {
        public SerializedObject(UnityEngine.Object o) { }
        public SerializedProperty FindProperty(string p) => null;
        public bool ApplyModifiedPropertiesWithoutUndo() => true;
    }
    public static class PlayerSettings { public static ColorSpace colorSpace; public static bool enableFrameTimingStats; }
    public sealed class EditorBuildSettingsScene { public string path; public EditorBuildSettingsScene(string p, bool e) { path = p; } }
    public static class EditorBuildSettings { public static EditorBuildSettingsScene[] scenes; }
    public static class UnityStats { public static int drawCalls => 0; }
}

namespace UnityEditor.SceneManagement
{
    public enum NewSceneSetup { EmptyScene, DefaultGameObjects }
    public enum NewSceneMode { Single, Additive }
    public static class EditorSceneManager
    {
        public static UnityEngine.SceneManagement.Scene NewScene(NewSceneSetup s, NewSceneMode m) => default;
        public static bool SaveScene(UnityEngine.SceneManagement.Scene s, string path) => true;
        public static UnityEngine.SceneManagement.Scene OpenScene(string path) => default;
    }
}
