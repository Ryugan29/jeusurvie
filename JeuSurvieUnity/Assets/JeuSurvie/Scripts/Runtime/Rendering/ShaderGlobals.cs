// Global shader variables shared by the Jeu Survie shaders (Shaders/JSCommon.hlsl, Atmosphere.shader). Always LINEAR vectors:
// SetGlobalVector, never SetGlobalColor (which converts sRGB → linear in a linear-space project).
using JeuSurvie.Core.Shared;
using UnityEngine;

namespace JeuSurvie.Rendering
{
    public static class ShaderGlobals
    {
        public static readonly int Wind = Shader.PropertyToID("_JS_Wind");
        public static readonly int SunToward = Shader.PropertyToID("_JS_SunToward");
        public static readonly int SunColor = Shader.PropertyToID("_JS_SunColor");
        public static readonly int Wet = Shader.PropertyToID("_JS_Wet");
        public static readonly int HeightFog = Shader.PropertyToID("_JS_HeightFog");
        public static readonly int Haze = Shader.PropertyToID("_JS_Haze");
        public static readonly int NightGlow = Shader.PropertyToID("_JS_NightGlow");

        public static readonly int AerialFog = Shader.PropertyToID("_AerialFog");
        public static readonly int AerialHaze = Shader.PropertyToID("_AerialHaze");
        public static readonly int AerialSun = Shader.PropertyToID("_AerialSun");
        public static readonly int AerialScatter = Shader.PropertyToID("_AerialScatter");
        public static readonly int DofParams = Shader.PropertyToID("_DofParams");
        public static readonly int RaysParams = Shader.PropertyToID("_RaysParams");
        public static readonly int RaysColor = Shader.PropertyToID("_RaysColor");
        public static readonly int SsrParams = Shader.PropertyToID("_SsrParams");
        public static readonly int LensParams = Shader.PropertyToID("_LensParams");

        public static Vector4 V(Rgb c, float w = 0) => new Vector4((float)c.R, (float)c.G, (float)c.B, w);

        /// <summary>A linear colour for Unity APIs that expect sRGB-authored colours (Light.color, RenderSettings): converted back.</summary>
        public static Color ForUnityColor(Rgb linear) => new Color((float)linear.R, (float)linear.G, (float)linear.B, 1).gamma;
    }
}
