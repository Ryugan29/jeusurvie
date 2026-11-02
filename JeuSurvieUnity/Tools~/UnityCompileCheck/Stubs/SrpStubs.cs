// COMPILE-CHECK STUBS ONLY (never shipped): signatures of the Unity 6 package APIs the runtime uses, as documented for 6000.6.
// They let `dotnet build` type-check the game code against the real UnityEngine reference assemblies outside Unity.
#pragma warning disable
using System;
using System.Collections.Generic;
using UnityEngine;

namespace UnityEngine.Rendering
{
    public class VolumeComponent : ScriptableObject { public bool active = true; }
    public class VolumeParameter<T> { public T value; public void Override(T x) { value = x; } }
    public sealed class ClampedFloatParameter : VolumeParameter<float> { }
    public sealed class MinFloatParameter : VolumeParameter<float> { }
    public sealed class FloatParameter : VolumeParameter<float> { }
    public sealed class ColorParameter : VolumeParameter<Color> { }
    public sealed class BoolParameter : VolumeParameter<bool> { }
    public sealed class VolumeProfile : ScriptableObject { public T Add<T>(bool overrides = false) where T : VolumeComponent => null; }
    public sealed class Volume : MonoBehaviour { public bool isGlobal; public float priority; public VolumeProfile sharedProfile; }
    public static class CoreUtils
    {
        public static Material CreateEngineMaterial(Shader shader) => null;
        public static void Destroy(UnityEngine.Object o) { }
        public static void SetKeyword(Material m, string k, bool on) { }
    }
    public static class Blitter { public static void BlitTexture(RasterCommandBuffer cmd, RTHandle source, Vector4 scaleBias, Material material, int pass) { } }
    public class RTHandle { }
    public enum MSAASamples { None = 1, MSAA2x = 2, MSAA4x = 4, MSAA8x = 8 }
    public class RasterCommandBuffer { }
    public class ContextContainer { public T Get<T>() where T : class, new() => null; }
}

namespace UnityEngine.Rendering.RenderGraphModule
{
    using UnityEngine.Rendering;
    public struct TextureHandle
    {
        public bool IsValid() => true;
        public static implicit operator RTHandle(TextureHandle h) => null;
    }
    public struct TextureDesc { public string name; public bool clearBuffer; public MSAASamples msaaSamples; }
    public enum AccessFlags { Read = 1, Write = 2, ReadWrite = 3, WriteAll = 6 }
    public class RasterGraphContext { public RasterCommandBuffer cmd; }
    public delegate void BaseRenderFunc<PassData, ContextType>(PassData data, ContextType context);
    public interface IRasterRenderGraphBuilder : IDisposable
    {
        void UseTexture(in TextureHandle input, AccessFlags flags = AccessFlags.Read);
        void UseAllGlobalTextures(bool enable);
        void SetRenderAttachment(TextureHandle tex, int index, AccessFlags flags = AccessFlags.Write);
        void SetRenderFunc<PassData>(BaseRenderFunc<PassData, RasterGraphContext> renderFunc) where PassData : class, new();
    }
    public class RenderGraph
    {
        public TextureDesc GetTextureDesc(TextureHandle h) => default;
        public TextureHandle CreateTexture(in TextureDesc d) => default;
        public IRasterRenderGraphBuilder AddRasterRenderPass<PassData>(string passName, out PassData passData) where PassData : class, new() { passData = null; return null; }
    }
}

namespace UnityEngine.Rendering.Universal
{
    using UnityEngine.Rendering;
    using UnityEngine.Rendering.RenderGraphModule;
    public enum RenderPassEvent { BeforeRenderingPostProcessing = 550, AfterRenderingPostProcessing = 600 }
    [Flags] public enum ScriptableRenderPassInput { None = 0, Depth = 1, Normal = 2, Color = 4, Motion = 8 }
    public struct RenderingData { }
    public class ScriptableRenderer { public void EnqueuePass(ScriptableRenderPass pass) { } }
    public abstract class ScriptableRenderPass
    {
        public RenderPassEvent renderPassEvent { get; set; }
        public void ConfigureInput(ScriptableRenderPassInput passInput) { }
        public virtual void RecordRenderGraph(RenderGraph renderGraph, ContextContainer frameData) { }
    }
    public abstract class ScriptableRendererFeature : ScriptableObject, IDisposable
    {
        public abstract void Create();
        public abstract void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData);
        public void SetActive(bool active) { }
        public void Dispose() { }
        protected virtual void Dispose(bool disposing) { }
    }
    public sealed class ScreenSpaceAmbientOcclusion : ScriptableRendererFeature
    {
        public override void Create() { }
        public override void AddRenderPasses(ScriptableRenderer r, ref RenderingData d) { }
    }
    public class ScriptableRendererData : ScriptableObject { public List<ScriptableRendererFeature> rendererFeatures { get; } = new List<ScriptableRendererFeature>(); }
    public class UniversalRendererData : ScriptableRendererData { }
    public class UniversalRenderPipelineAsset : RenderPipelineAsset
    {
        public static UniversalRenderPipelineAsset Create(ScriptableRendererData rendererData = null) => null;
        public override RenderPipeline CreatePipeline() => null;
        public bool supportsHDR { get; set; }
        public float renderScale { get; set; }
        public int msaaSampleCount { get; set; }
        public float shadowDistance { get; set; }
        public int shadowCascadeCount { get; set; }
        public float cascade2Split { get; set; }
        public Vector2 cascade3Split { get; set; }
        public Vector3 cascade4Split { get; set; }
        public bool supportsCameraDepthTexture { get; set; }
        public bool supportsCameraOpaqueTexture { get; set; }
    }
    public class UniversalResourceData : ContextItemStub
    {
        public TextureHandle activeColorTexture => default;
        public TextureHandle cameraColor { get; set; }
        public TextureHandle cameraDepthTexture => default;
        public TextureHandle cameraNormalsTexture => default;
        public bool isActiveTargetBackBuffer => false;
    }
    public class UniversalCameraData : ContextItemStub { public CameraType cameraType; }
    public class ContextItemStub { }
    public enum AntialiasingMode { None, FastApproximateAntialiasing, SubpixelMorphologicalAntiAliasing, TemporalAntiAliasing }
    public class UniversalAdditionalCameraData : MonoBehaviour { public bool renderPostProcessing; public AntialiasingMode antialiasing; public bool requiresDepthTexture; }
    public static class CameraExtensions { public static UniversalAdditionalCameraData GetUniversalAdditionalCameraData(this Camera c) => null; }
    public enum TonemappingMode { None, Neutral, ACES }
    public sealed class TonemappingModeParameter : VolumeParameter<TonemappingMode> { }
    public enum FilmGrainLookup { Thin1, Thin2, Medium1 }
    public sealed class FilmGrainLookupParameter : VolumeParameter<FilmGrainLookup> { }
    public enum MotionBlurMode { CameraOnly, CameraAndObjects }
    public enum MotionBlurQuality { Low, Medium, High }
    public sealed class MotionBlurModeParameter : VolumeParameter<MotionBlurMode> { }
    public sealed class MotionBlurQualityParameter : VolumeParameter<MotionBlurQuality> { }
    public sealed class Bloom : VolumeComponent { public MinFloatParameter threshold; public MinFloatParameter intensity; public ClampedFloatParameter scatter; }
    public sealed class Tonemapping : VolumeComponent { public TonemappingModeParameter mode; }
    public sealed class ColorAdjustments : VolumeComponent { public FloatParameter postExposure; public ClampedFloatParameter contrast; public ColorParameter colorFilter; public ClampedFloatParameter saturation; }
    public sealed class Vignette : VolumeComponent { public ColorParameter color; public ClampedFloatParameter intensity; public ClampedFloatParameter smoothness; }
    public sealed class FilmGrain : VolumeComponent { public FilmGrainLookupParameter type; public ClampedFloatParameter intensity; }
    public sealed class MotionBlur : VolumeComponent { public MotionBlurModeParameter mode; public MotionBlurQualityParameter quality; public ClampedFloatParameter intensity; }
}
