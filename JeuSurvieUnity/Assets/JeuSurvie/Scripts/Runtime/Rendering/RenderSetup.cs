// References created by the editor setup (Editor/ProjectSetup.cs) and loaded at runtime from Resources: the URP asset tuned
// live by the graphics profiles, its renderer, and the two renderer features the profiles switch on and off.
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace JeuSurvie.Rendering
{
    [CreateAssetMenu(menuName = "Jeu Survie/Render Setup", fileName = "JeuSurvieRenderSetup")]
    public sealed class RenderSetup : ScriptableObject
    {
        public const string ResourcePath = "JeuSurvieRenderSetup";

        public UniversalRenderPipelineAsset pipeline;
        public UniversalRendererData renderer;
        /// <summary>URP Screen Space Ambient Occlusion feature (profiles MEDIUM and up).</summary>
        public ScriptableRendererFeature ambientOcclusion;
        /// <summary>Aerial perspective, distance blur, sun rays, wet reflections, lens drops + sharpen.</summary>
        public AtmosphereFeature atmosphere;
        public Shader skyShader;
        public Shader terrainShader;
        public Shader farTerrainShader;
        public Shader foliageShader;
        public Shader naturePbrShader;
        public Shader particleShader;
        public Shader groundMatterShader;
        public Shader atmosphereShader;

        public static RenderSetup Load() => Resources.Load<RenderSetup>(ResourcePath);
    }
}
