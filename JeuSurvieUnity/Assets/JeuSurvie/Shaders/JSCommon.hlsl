// Shared HLSL for the Jeu Survie shaders (URP). Globals are set every frame by C# (Rendering/ShaderGlobals.cs) as LINEAR
// vectors (SetGlobalVector, never SetGlobalColor which would apply an sRGB conversion).
#ifndef JEUSURVIE_COMMON_INCLUDED
#define JEUSURVIE_COMMON_INCLUDED

#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

float4 _JS_Wind;        // x: wind clock (s), y: wind strength
float4 _JS_SunToward;   // xyz: toward the light body (unit), w: body strength (shadowIntensity)
float4 _JS_SunColor;    // rgb: body colour (linear)
float4 _JS_Wet;         // x: ground wetness, y: rain, z: ripple clock (s)
float4 _JS_HeightFog;   // x: height-fog density at base (per m, 0 when the aerial pass handles it), y: 1/thickness, z: base altitude
float4 _JS_Haze;        // rgb: haze colour (linear)
float4 _JS_NightGlow;   // rgb: mushroom bioluminescence

// Babylon's approximate gamma (LinearEncodePowerApprox): palette colours are written in sRGB.
float3 JS_ToLinear(float3 c) { return pow(max(c, 0.0), 2.2); }

float JS_Hash12(float2 p)
{
    float3 p3 = frac(float3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return frac((p3.x + p3.y) * p3.z);
}

float JS_ValueNoise(float2 p)
{
    float2 i = floor(p);
    float2 t = p - i;
    float2 u = t * t * (3.0 - 2.0 * t);
    float a = JS_Hash12(i), b = JS_Hash12(i + float2(1, 0)), c = JS_Hash12(i + float2(0, 1)), d = JS_Hash12(i + float2(1, 1));
    return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}

// Height fog of the material path (LOW profile): ∫ density·exp(−k·(y − base)) along the view ray, like height-fog-plugin.
float3 JS_ApplyHeightFog(float3 color, float3 positionWS)
{
    if (_JS_HeightFog.x <= 0.0) return color;
    float d = distance(positionWS, _WorldSpaceCameraPos);
    float amount = (1.0 - exp(-d * _JS_HeightFog.x)) * exp(-max(0.0, positionWS.y - _JS_HeightFog.z) * _JS_HeightFog.y);
    return lerp(color, _JS_Haze.rgb, saturate(amount));
}

// Physically based lighting shared by terrain, far terrain and solid nature/character materials: URP BRDF, main light with
// cascaded shadows, SSAO, spherical-harmonics ambient (the hemispheric sky/ground light of the hour) and the sky reflection
// probe scaled by envIntensity (Babylon environmentIntensity: only part of the sky reflection reaches these surfaces).
// screenAO scales the SSAO: 0 for characters (on moving smooth skin its noisy samples crawl as dark blotches).
half3 JS_LightPBR(float3 positionWS, float3 normalWS, half3 albedo, half metallic, half roughness, half occlusion, half envIntensity, float4 positionCS, half screenAO)
{
    float3 viewDirWS = GetWorldSpaceNormalizeViewDir(positionWS);
    float2 screenUV = GetNormalizedScreenSpaceUV(positionCS);
    BRDFData brdf;
    half alpha = 1.0h;
    InitializeBRDFData(albedo, metallic, half3(0, 0, 0), 1.0h - roughness, alpha, brdf);

    float4 shadowCoord = TransformWorldToShadowCoord(positionWS);
    Light mainLight = GetMainLight(shadowCoord, positionWS, half4(1, 1, 1, 1));
#if defined(_SCREEN_SPACE_OCCLUSION)
    AmbientOcclusionFactor ao = GetScreenSpaceAmbientOcclusion(screenUV);
    occlusion = min(occlusion, lerp(1.0h, ao.indirectAmbientOcclusion, screenAO));
    mainLight.color *= lerp(1.0h, ao.directAmbientOcclusion, screenAO);
#endif
    half3 bakedGI = SampleSH(normalWS);
    half3 indirectDiffuse = bakedGI * occlusion;
    half3 reflectVector = reflect(-viewDirWS, normalWS);
    half3 indirectSpecular = GlossyEnvironmentReflection(reflectVector, positionWS, brdf.perceptualRoughness, occlusion, screenUV) * envIntensity;
    half fresnelTerm = Pow4(1.0 - saturate(dot(normalWS, viewDirWS)));
    half3 color = EnvironmentBRDF(brdf, indirectDiffuse, indirectSpecular, fresnelTerm);
    color += LightingPhysicallyBased(brdf, mainLight, normalWS, viewDirWS);
    return color;
}

// Shadow caster helpers (ShadowCaster passes).
float3 _LightDirection;
float3 _LightPosition;

float4 JS_ShadowPositionCS(float3 positionWS, float3 normalWS)
{
#if _CASTING_PUNCTUAL_LIGHT_SHADOW
    float3 lightDirectionWS = normalize(_LightPosition - positionWS);
#else
    float3 lightDirectionWS = _LightDirection;
#endif
    float4 positionCS = TransformWorldToHClip(ApplyShadowBias(positionWS, normalWS, lightDirectionWS));
#if UNITY_REVERSED_Z
    positionCS.z = min(positionCS.z, UNITY_NEAR_CLIP_VALUE);
#else
    positionCS.z = max(positionCS.z, UNITY_NEAR_CLIP_VALUE);
#endif
    return positionCS;
}

#endif
