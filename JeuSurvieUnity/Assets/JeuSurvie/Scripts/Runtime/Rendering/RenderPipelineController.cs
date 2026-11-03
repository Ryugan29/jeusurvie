// Port of babylon/render-pipeline + post-processing + sun-shadows + ambient-occlusion: the graphics profile drives the URP asset
// (shadows, cascades, filtering, MSAA, render scale = pixel density), the SSAO and atmosphere renderer features, the camera
// (FXAA, HDR) and a runtime post-processing Volume (bloom, ACES, exposure/saturation/tint of the hour, vignette, motion blur;
// no film grain: see PostQuality). `Apply(profile)` rebuilds live; `UpdateFrame` sets what follows light, weather and hour
// (no allocation).
using System;
using System.Reflection;
using JeuSurvie.Core.RenderData;
using JeuSurvie.Core.Shared;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using QualitySettings = JeuSurvie.Core.RenderData.QualitySettings;

namespace JeuSurvie.Rendering
{
    /// <summary>What changes every frame (RenderFrame of the original).</summary>
    public struct RenderFrameState
    {
        public Lighting Light;
        public Grade Grade;
        public AerialState Aerial;
        public double Wetness;
        public double LensWetness;
        public double TimeS;
    }

    /// <summary>The air of the frame for the aerial perspective (SceneLighting.aerialState).</summary>
    public struct AerialState
    {
        public double DistanceDensity, HeightDensity, HeightThicknessM, HeightBaseY;
        public Rgb Haze;
        public Vec3 SunDirection;
        public Rgb SunScatter;
    }

    public sealed class RenderPipelineController
    {
        // post-processing.ts COLOR_GRADE
        private const float Contrast = 6f;            // Babylon 1.06
        private const float BloomThresholdLinear = 2f;
        private const float BloomWeight = 0.28f;
        private const float VignetteIntensity = 0.22f; // Babylon weight 0.55 on its own vignette curve
        private const double SsrOnWetness = 0.08, SsrOffWetness = 0.03;
        private const float AerialMieG = 0.72f;
        private const double CascadeLambda = 0.85;

        private readonly Camera camera;
        private readonly Light sun;
        private readonly RenderSetup setup;
        private readonly Volume volume;
        private readonly Bloom bloom;
        private readonly Tonemapping tonemapping;
        private readonly ColorAdjustments color;
        private readonly Vignette vignette;
        private readonly MotionBlur motionBlur;
        private QualitySettings quality;
        private bool ssrActive = true;
        private bool grading = true;
        private bool lensDrops = true;
        private static bool warnedReflection;

        public QualitySettings Current => quality;
        public int MsaaSamples { get; private set; } = 1;
        public bool HasAtmosphereFeature => setup != null && setup.atmosphere != null;

        public RenderPipelineController(Camera camera, Light sun, RenderSetup setup, ToneMappingChoice toneMapping, bool grading, bool lensDrops)
        {
            this.camera = camera;
            this.sun = sun;
            this.setup = setup;
            this.grading = grading;
            this.lensDrops = lensDrops;
            var go = new GameObject("Post-traitement (volume global)");
            UnityEngine.Object.DontDestroyOnLoad(go);
            volume = go.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = 10;
            VolumeProfile profile = ScriptableObject.CreateInstance<VolumeProfile>();
            volume.sharedProfile = profile;
            bloom = profile.Add<Bloom>(true);
            tonemapping = profile.Add<Tonemapping>(true);
            color = profile.Add<ColorAdjustments>(true);
            vignette = profile.Add<Vignette>(true);
            motionBlur = profile.Add<MotionBlur>(true);
            tonemapping.mode.Override(toneMapping == ToneMappingChoice.Neutral ? TonemappingMode.Neutral : toneMapping == ToneMappingChoice.None ? TonemappingMode.None : TonemappingMode.ACES);
            bloom.threshold.Override(Mathf.Pow(BloomThresholdLinear, 1f / 2.2f));
            bloom.intensity.Override(BloomWeight);
            color.contrast.Override(Contrast);
            vignette.intensity.Override(VignetteIntensity);
            vignette.smoothness.Override(0.45f);
            vignette.color.Override(Color.black);
            motionBlur.mode.Override(MotionBlurMode.CameraOnly);
            volume.enabled = grading;
        }

        /// <summary>Applies a profile: URP asset, features, camera and post-processing (live, like the original apply()).</summary>
        public void Apply(QualitySettings q)
        {
            quality = q;
            UniversalRenderPipelineAsset urp = setup != null ? setup.pipeline : GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            if (urp != null)
            {
                urp.supportsHDR = true;
                urp.renderScale = (float)Quality.PixelRatioFor(Screen.dpi > 0 ? Screen.dpi / 96f : 1, q.Image.MaxPixelRatio) / Mathf.Max(1f, Screen.dpi > 0 ? Screen.dpi / 96f : 1f);
                MsaaSamples = Quality.MsaaSamplesFor(q.Image.Msaa, 8);
                urp.msaaSampleCount = MsaaSamples;
                if (q.Shadows != null)
                {
                    urp.shadowDistance = (float)Math.Min(q.Shadows.RangeM, camera.farClipPlane);
                    urp.shadowCascadeCount = q.Shadows.Cascades;
                    ApplyCascadeSplits(urp, q.Shadows.Cascades);
                    TrySetField(urp, "m_MainLightShadowmapResolution", q.Shadows.MapSize);
                    TrySetField(urp, "m_SoftShadowsSupported", true);
                    // URP soft shadows Low/Medium/High (PCF); PCSS does not exist in URP: ULTRA takes High + a 4096 map.
                    int soft = q.Shadows.Filter == ShadowFilter.PcfLow ? 1 : q.Shadows.Filter == ShadowFilter.PcfMedium ? 2 : 3;
                    TrySetField(urp, "m_SoftShadowQuality", soft);
                    TrySetField(urp, "m_AnisotropicFilteringLevel", q.Terrain.Anisotropy);
                }
                else urp.shadowDistance = 0;
            }
            sun.shadows = q.Shadows != null ? LightShadows.Soft : LightShadows.None;
            if (setup != null && setup.ambientOcclusion != null)
            {
                setup.ambientOcclusion.SetActive(q.Ao != null);
                if (q.Ao != null) ConfigureAo(setup.ambientOcclusion, q.Ao);
            }
            var cameraData = camera.GetUniversalAdditionalCameraData();
            cameraData.renderPostProcessing = true;
            cameraData.antialiasing = q.Image.Fxaa ? AntialiasingMode.FastApproximateAntialiasing : AntialiasingMode.None;
            cameraData.requiresDepthTexture = true;
            camera.allowHDR = true;
            camera.allowMSAA = MsaaSamples > 1;
            bloom.active = q.Post.BloomKernel > 0;
            bloom.scatter.Override(Mathf.Clamp01(0.45f + q.Post.BloomKernel / 400f));
            motionBlur.active = q.Post.MotionBlur > 0;
            motionBlur.intensity.Override((float)q.Post.MotionBlur);
            motionBlur.quality.Override(MotionBlurQuality.Medium);
            ssrActive = true;
            AtmosphereFrame.Aerial = q.Post.AerialPerspective && HasAtmosphereFeature;
            AtmosphereFrame.DistanceBlur = q.Post.Dof != null && HasAtmosphereFeature;
            AtmosphereFrame.RaySamples = q.Rays?.Samples ?? 32;
            if (q.Post.Dof != null)
                Shader.SetGlobalVector(ShaderGlobals.DofParams, new Vector4((float)q.Post.Dof.FromM, (float)q.Post.Dof.FullM, (float)(q.Post.Dof.MaxBlurPx * Screen.height / 1080.0), 0));
        }

        /// <summary>Practical split (λ = 0.85: the first cascade stays very fine), as Babylon's CascadedShadowGenerator.lambda.</summary>
        private void ApplyCascadeSplits(UniversalRenderPipelineAsset urp, int cascades)
        {
            float near = Mathf.Max(0.1f, camera.nearClipPlane), far = Mathf.Max(near + 1, urp.shadowDistance);
            float Split(int i)
            {
                double p = (double)i / cascades;
                double log = near * Math.Pow(far / near, p), uni = near + (far - near) * p;
                return (float)((CascadeLambda * log + (1 - CascadeLambda) * uni) / far);
            }
            if (cascades == 2) urp.cascade2Split = Split(1);
            else if (cascades == 3) urp.cascade3Split = new Vector2(Split(1), Split(2));
            else if (cascades == 4) urp.cascade4Split = new Vector3(Split(1), Split(2), Split(3));
        }

        private static void ConfigureAo(ScriptableRendererFeature feature, AoQuality ao)
        {
            object settings = GetField(feature, "m_Settings");
            if (settings == null) return;
            TrySetField(settings, "Radius", (float)ao.RadiusM);
            TrySetField(settings, "Intensity", (float)(ao.Strength * 0.9));
            TrySetField(settings, "DirectLightingStrength", 0.25f);
            // URP sample count: Low (4) / Medium (8) / High (12) — the profile's 8, 12, 16 map to Medium, High, High.
            TrySetField(settings, "Samples", ao.Samples >= 12 ? 0 : ao.Samples >= 8 ? 1 : 2);
            TrySetField(settings, "Downsample", ao.Ratio < 1);
            TrySetField(settings, "BlurQuality", ao.ExpensiveBlur ? 0 : 1);
            TrySetField(settings, "Falloff", 60f);
        }

        /// <summary>Every frame: shadow strength, grading of the hour, the air, sun rays, wet reflections, lens drops.</summary>
        public void UpdateFrame(in RenderFrameState f)
        {
            sun.shadowStrength = (float)Lights.ShadowStrength(f.Light);
            if (grading)
            {
                color.postExposure.Override(Mathf.Log((float)Math.Max(1e-4, f.Grade.Exposure), 2f));
                color.saturation.Override((float)f.Grade.Saturation);
                Color hue = Color.HSVToRGB((float)(((f.Grade.Hue % 360) + 360) % 360 / 360.0), 1, 1);
                float lum = 0.2126f * hue.r + 0.7152f * hue.g + 0.0722f * hue.b;
                Color tinted = new Color(hue.r / lum, hue.g / lum, hue.b / lum) * 0.5f + Color.white * 0.5f;
                color.colorFilter.Override(Color.Lerp(Color.white, tinted, (float)(f.Grade.Tint / 100.0)));
            }
            // Camera matrices of this frame for the full-screen passes (GPU convention of a render texture, like URP's camera colour).
            Matrix4x4 viewProj = GL.GetGPUProjectionMatrix(camera.projectionMatrix, true) * camera.worldToCameraMatrix;
            Shader.SetGlobalMatrix(ShaderGlobals.ViewProj, viewProj);
            Shader.SetGlobalMatrix(ShaderGlobals.InvViewProj, viewProj.inverse);
            AerialState a = f.Aerial;
            Shader.SetGlobalVector(ShaderGlobals.AerialFog, new Vector4((float)Math.Max(0, a.DistanceDensity), (float)Math.Max(0, a.HeightDensity), 1f / (float)Math.Max(1, a.HeightThicknessM), (float)a.HeightBaseY));
            Shader.SetGlobalVector(ShaderGlobals.AerialHaze, ShaderGlobals.V(a.Haze));
            Shader.SetGlobalVector(ShaderGlobals.AerialSun, new Vector4((float)-a.SunDirection.X, (float)-a.SunDirection.Y, (float)-a.SunDirection.Z, AerialMieG));
            Shader.SetGlobalVector(ShaderGlobals.AerialScatter, ShaderGlobals.V(a.SunScatter));
            UpdateRays(f.Light);
            if (quality?.Ssr != null && HasAtmosphereFeature)
            {
                bool wanted = ssrActive ? f.Wetness > SsrOffWetness : f.Wetness > SsrOnWetness;
                ssrActive = wanted;
                AtmosphereFrame.WetReflections = wanted;
                Shader.SetGlobalVector(ShaderGlobals.SsrParams, new Vector4((float)f.Wetness, (float)quality.Ssr.MaxDistanceM, quality.Ssr.Steps, 0.9f));
            }
            else AtmosphereFrame.WetReflections = false;
            float lens = lensDrops ? (float)MathUtil.Clamp01(f.LensWetness) : 0f;
            float sharpen = grading && quality != null ? (float)quality.Post.Sharpen : 0f;
            AtmosphereFrame.LensOrSharpen = HasAtmosphereFeature && (lens > 0.01f || sharpen > 0f);
            Shader.SetGlobalVector(ShaderGlobals.LensParams, new Vector4(lens, (float)(f.TimeS % 600.0), camera.aspect, sharpen));
        }

        private void UpdateRays(Lighting l)
        {
            if (quality?.Rays == null || !HasAtmosphereFeature)
            {
                AtmosphereFrame.SunRays = false;
                return;
            }
            Transform t = camera.transform;
            var basis = new CameraBasis(ToVec(t.forward), ToVec(t.right), ToVec(t.up), Math.Tan(camera.fieldOfView * Mathf.Deg2Rad / 2), camera.aspect);
            var toSun = new Vec3(-l.SunDirection.X, -l.SunDirection.Y, -l.SunDirection.Z);
            if (!SunRays.ScreenUv(toSun, basis, out double u, out double v, out double facing))
            {
                AtmosphereFrame.SunRays = false;
                return;
            }
            double strength = SunRays.Intensity(l.RayStrength, facing);
            AtmosphereFrame.SunRays = strength > 0.001;
            Shader.SetGlobalVector(ShaderGlobals.RaysParams, new Vector4((float)u, (float)v, (float)strength, camera.aspect));
            Shader.SetGlobalVector(ShaderGlobals.RaysColor, ShaderGlobals.V(l.SunColor));
        }

        private static Vec3 ToVec(Vector3 v) => new Vec3(v.x, v.y, v.z);

        private static object GetField(object target, string name)
        {
            FieldInfo f = target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            return f?.GetValue(target);
        }

        /// <summary>Sets a (private) serialized field when it exists; warns once otherwise (URP internals may move between versions).</summary>
        private static void TrySetField(object target, string name, object value)
        {
            FieldInfo f = target.GetType().GetField(name, BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            if (f == null)
            {
                if (!warnedReflection) Debug.LogWarning($"[JeuSurvie] Réglage URP introuvable : {target.GetType().Name}.{name} (version d'URP différente ?). Valeur par défaut gardée.");
                warnedReflection = true;
                return;
            }
            try
            {
                Type t = f.FieldType;
                object v = t.IsEnum ? Enum.ToObject(t, Convert.ToInt32(value)) : Convert.ChangeType(value, t);
                f.SetValue(target, v);
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[JeuSurvie] Réglage URP {name} non appliqué : {e.Message}");
            }
        }
    }

    public enum ToneMappingChoice { Aces, Neutral, None }
}
