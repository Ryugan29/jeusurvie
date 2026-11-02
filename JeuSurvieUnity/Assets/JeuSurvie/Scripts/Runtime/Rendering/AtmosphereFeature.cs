// URP renderer feature (Render Graph) carrying the custom full-screen passes of the Babylon pipeline that URP lacks:
//   before post-processing: wet-ground reflections (SSR), aerial perspective, distance blur (ULTRA), sun rays;
//   after post-processing:  sharpen + rain drops on the lens (always last, like the original).
// Which passes run is decided every frame by the game (AtmosphereFrame, set by RenderPipelineController); their parameters
// are global shader variables (ShaderGlobals). A pass that is off costs nothing.
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.Universal;

namespace JeuSurvie.Rendering
{
    /// <summary>What the atmosphere passes must do this frame (written by the game, read by the renderer feature).</summary>
    public static class AtmosphereFrame
    {
        public static bool Aerial;
        public static bool DistanceBlur;
        public static bool SunRays;
        /// <summary>24, 32 or 48 samples along each ray.</summary>
        public static int RaySamples = 32;
        public static bool WetReflections;
        public static bool LensOrSharpen;
    }

    public sealed class AtmosphereFeature : ScriptableRendererFeature
    {
        public Shader shader;
        private Material material;
        private ChainPass beforePost;
        private ChainPass afterPost;

        public override void Create()
        {
            if (shader == null) shader = Shader.Find("Hidden/JeuSurvie/Atmosphere");
            if (shader == null) return;
            material = CoreUtils.CreateEngineMaterial(shader);
            beforePost = new ChainPass(material, false) { renderPassEvent = RenderPassEvent.BeforeRenderingPostProcessing };
            afterPost = new ChainPass(material, true) { renderPassEvent = RenderPassEvent.AfterRenderingPostProcessing };
        }

        public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        {
            if (material == null) return;
            bool before = AtmosphereFrame.Aerial || AtmosphereFrame.DistanceBlur || AtmosphereFrame.SunRays || AtmosphereFrame.WetReflections;
            if (before)
            {
                var input = ScriptableRenderPassInput.Depth;
                if (AtmosphereFrame.WetReflections) input |= ScriptableRenderPassInput.Normal;
                beforePost.ConfigureInput(input);
                renderer.EnqueuePass(beforePost);
            }
            if (AtmosphereFrame.LensOrSharpen) renderer.EnqueuePass(afterPost);
        }

        protected override void Dispose(bool disposing) => CoreUtils.Destroy(material);

        private sealed class ChainPass : ScriptableRenderPass
        {
            private readonly Material material;
            private readonly bool final;
            private readonly int aerialPass, blurPass, raysPass, ssrPass, lensPass;
            private static readonly string[] RayKeywords = { "_RAYS_24", "_RAYS_32", "_RAYS_48" };

            private sealed class PassData
            {
                public TextureHandle source;
                public Material material;
                public int pass;
            }

            public ChainPass(Material material, bool final)
            {
                this.material = material;
                this.final = final;
                aerialPass = material.FindPass("AerialPerspective");
                blurPass = material.FindPass("DistanceBlur");
                raysPass = material.FindPass("SunRays");
                ssrPass = material.FindPass("WetReflections");
                lensPass = material.FindPass("LensAndSharpen");
            }

            public override void RecordRenderGraph(RenderGraph renderGraph, ContextContainer frameData)
            {
                UniversalResourceData resources = frameData.Get<UniversalResourceData>();
                UniversalCameraData camera = frameData.Get<UniversalCameraData>();
                if (camera.cameraType != CameraType.Game) return; // the matrices and parameters are those of the game camera
                if (resources.isActiveTargetBackBuffer) return;
                if (final)
                {
                    Blit(renderGraph, resources, lensPass, "JeuSurvie Lens drops + sharpen", false);
                    return;
                }
                if (AtmosphereFrame.WetReflections) Blit(renderGraph, resources, ssrPass, "JeuSurvie Wet reflections", true);
                if (AtmosphereFrame.Aerial) Blit(renderGraph, resources, aerialPass, "JeuSurvie Aerial perspective", true);
                if (AtmosphereFrame.DistanceBlur) Blit(renderGraph, resources, blurPass, "JeuSurvie Distance blur", true);
                if (AtmosphereFrame.SunRays)
                {
                    string wanted = AtmosphereFrame.RaySamples >= 48 ? RayKeywords[2] : AtmosphereFrame.RaySamples >= 32 ? RayKeywords[1] : RayKeywords[0];
                    foreach (string k in RayKeywords) CoreUtils.SetKeyword(material, k, k == wanted);
                    Blit(renderGraph, resources, raysPass, "JeuSurvie Sun rays", true);
                }
            }

            /// <summary>Camera colour → new texture through `pass`, which becomes the camera colour.</summary>
            private void Blit(RenderGraph renderGraph, UniversalResourceData resources, int pass, string name, bool readsDepth)
            {
                if (pass < 0) return;
                TextureHandle source = resources.activeColorTexture;
                TextureDesc desc = renderGraph.GetTextureDesc(source);
                desc.name = name;
                desc.clearBuffer = false;
                desc.msaaSamples = MSAASamples.None; // full-screen passes work on the resolved image
                TextureHandle destination = renderGraph.CreateTexture(desc);
                using (var builder = renderGraph.AddRasterRenderPass<PassData>(name, out PassData data))
                {
                    data.source = source;
                    data.material = material;
                    data.pass = pass;
                    builder.UseTexture(source);
                    if (readsDepth && resources.cameraDepthTexture.IsValid()) builder.UseTexture(resources.cameraDepthTexture);
                    if (pass == ssrPass && resources.cameraNormalsTexture.IsValid()) builder.UseTexture(resources.cameraNormalsTexture);
                    builder.UseAllGlobalTextures(true);
                    builder.SetRenderAttachment(destination, 0);
                    builder.SetRenderFunc((PassData d, RasterGraphContext context) =>
                        Blitter.BlitTexture(context.cmd, d.source, new Vector4(1, 1, 0, 0), d.material, d.pass));
                }
                resources.cameraColor = destination;
            }
        }
    }
}
