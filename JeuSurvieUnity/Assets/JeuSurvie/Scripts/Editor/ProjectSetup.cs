// One-time project setup, run automatically the first time the project is opened (and from the menu Jeu Survie → Configurer
// le projet): creates the URP asset and its renderer with the two features the graphics profiles drive (SSAO, atmosphere
// passes), assigns them to Graphics and every Quality level, switches to linear colour space, creates the RenderSetup asset
// read at runtime, and the main scene with the game bootstrap (added to the build settings).
using System.Collections.Generic;
using System.IO;
using JeuSurvie.Bootstrap;
using JeuSurvie.Rendering;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace JeuSurvie.EditorTools
{
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        private const string SettingsDir = "Assets/JeuSurvie/Settings";
        private const string PipelinePath = SettingsDir + "/JeuSurvie-URP.asset";
        private const string RendererPath = SettingsDir + "/JeuSurvie-Renderer.asset";
        private const string SetupPath = "Assets/JeuSurvie/Resources/" + RenderSetup.ResourcePath + ".asset";
        private const string ScenePath = "Assets/JeuSurvie/Scenes/Main.unity";

        static ProjectSetup()
        {
            EditorApplication.delayCall += () =>
            {
                if (EditorApplication.isPlayingOrWillChangePlaymode) return;
                if (AssetDatabase.LoadAssetAtPath<RenderSetup>(SetupPath) == null || AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null) Run();
            };
        }

        [MenuItem("Jeu Survie/Configurer le projet")]
        public static void Run()
        {
            Directory.CreateDirectory(SettingsDir);
            Directory.CreateDirectory(Path.GetDirectoryName(SetupPath));
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));

            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
            if (renderer == null)
            {
                renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(renderer, RendererPath);
            }
            var ssao = FindFeature<ScreenSpaceAmbientOcclusion>(renderer);
            if (ssao == null)
            {
                ssao = ScriptableObject.CreateInstance<ScreenSpaceAmbientOcclusion>();
                ssao.name = "Occlusion ambiante (SSAO)";
                AddFeature(renderer, ssao);
            }
            var atmosphere = FindFeature<AtmosphereFeature>(renderer);
            if (atmosphere == null)
            {
                atmosphere = ScriptableObject.CreateInstance<AtmosphereFeature>();
                atmosphere.name = "Atmosphère (perspective, rayons, reflets, gouttes)";
                AddFeature(renderer, atmosphere);
            }
            atmosphere.shader = Shader.Find("Hidden/JeuSurvie/Atmosphere");
            EditorUtility.SetDirty(atmosphere);
            SyncFeatureMap(renderer);

            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            if (pipeline == null)
            {
                pipeline = UniversalRenderPipelineAsset.Create(renderer);
                AssetDatabase.CreateAsset(pipeline, PipelinePath);
            }
            pipeline.supportsHDR = true;
            pipeline.msaaSampleCount = 4;
            pipeline.shadowDistance = 150;
            pipeline.shadowCascadeCount = 4;
            pipeline.supportsCameraDepthTexture = true;
            pipeline.supportsCameraOpaqueTexture = false;
            var so = new SerializedObject(pipeline);
            Set(so, "m_MainLightShadowmapResolution", 2048);
            Set(so, "m_SoftShadowsSupported", true);
            Set(so, "m_MainLightShadowsSupported", true);
            Set(so, "m_AdditionalLightsRenderingMode", 0);
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(pipeline);

            GraphicsSettings.defaultRenderPipeline = pipeline;
            int current = QualitySettings.GetQualityLevel();
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = pipeline;
            }
            QualitySettings.SetQualityLevel(current, false);
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.enableFrameTimingStats = true;

            var setup = AssetDatabase.LoadAssetAtPath<RenderSetup>(SetupPath);
            if (setup == null)
            {
                setup = ScriptableObject.CreateInstance<RenderSetup>();
                AssetDatabase.CreateAsset(setup, SetupPath);
            }
            setup.pipeline = pipeline;
            setup.renderer = renderer;
            setup.ambientOcclusion = ssao;
            setup.atmosphere = atmosphere;
            setup.skyShader = Shader.Find("JeuSurvie/Sky");
            setup.terrainShader = Shader.Find("JeuSurvie/Terrain");
            setup.farTerrainShader = Shader.Find("JeuSurvie/FarTerrain");
            setup.foliageShader = Shader.Find("JeuSurvie/Foliage");
            setup.naturePbrShader = Shader.Find("JeuSurvie/NaturePBR");
            setup.particleShader = Shader.Find("JeuSurvie/Particle");
            setup.groundMatterShader = Shader.Find("Hidden/JeuSurvie/GroundMatter");
            setup.atmosphereShader = Shader.Find("Hidden/JeuSurvie/Atmosphere");
            EditorUtility.SetDirty(setup);
            AssetDatabase.SaveAssets();

            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null)
            {
                Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                new GameObject("Jeu Survie").AddComponent<GameBootstrap>();
                EditorSceneManager.SaveScene(scene, ScenePath);
            }
            var scenes = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            if (!scenes.Exists(s => s.path == ScenePath)) scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
            EditorBuildSettings.scenes = scenes.ToArray();
            if (SceneManager.GetActiveScene().path != ScenePath) EditorSceneManager.OpenScene(ScenePath);
            Debug.Log("[JeuSurvie] Projet configuré : URP, fonctionnalités de rendu, scène principale. Lancer avec Play.");
        }

        private static T FindFeature<T>(ScriptableRendererData data) where T : ScriptableRendererFeature
        {
            foreach (ScriptableRendererFeature f in data.rendererFeatures) if (f is T t) return t;
            return null;
        }

        private static void AddFeature(ScriptableRendererData data, ScriptableRendererFeature feature)
        {
            AssetDatabase.AddObjectToAsset(feature, data);
            data.rendererFeatures.Add(feature);
            EditorUtility.SetDirty(data);
        }

        /// <summary>The renderer keeps a map of its features' local ids (m_RendererFeatureMap): kept in step with the list.</summary>
        private static void SyncFeatureMap(ScriptableRendererData data)
        {
            AssetDatabase.SaveAssets();
            var so = new SerializedObject(data);
            SerializedProperty map = so.FindProperty("m_RendererFeatureMap");
            if (map == null) return;
            map.ClearArray();
            for (int i = 0; i < data.rendererFeatures.Count; i++)
            {
                AssetDatabase.TryGetGUIDAndLocalFileIdentifier(data.rendererFeatures[i], out string _, out long localId);
                map.InsertArrayElementAtIndex(i);
                map.GetArrayElementAtIndex(i).longValue = localId;
            }
            so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(data);
        }

        private static void Set(SerializedObject so, string name, int value)
        {
            SerializedProperty p = so.FindProperty(name);
            if (p == null) { Debug.LogWarning($"[JeuSurvie] Réglage URP introuvable : {name}"); return; }
            if (p.propertyType == SerializedPropertyType.Enum) p.enumValueIndex = value; else p.intValue = value;
        }

        private static void Set(SerializedObject so, string name, bool value)
        {
            SerializedProperty p = so.FindProperty(name);
            if (p == null) { Debug.LogWarning($"[JeuSurvie] Réglage URP introuvable : {name}"); return; }
            p.boolValue = value;
        }
    }
}
