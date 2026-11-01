// MOCK of the URP/SRP shader library surface used by the Jeu Survie shaders (syntax/type check with glslang only).
#ifndef MOCK_CORE
#define MOCK_CORE
#define UNITY_REVERSED_Z 1
#define UNITY_UV_STARTS_AT_TOP 1
#define UNITY_NEAR_CLIP_VALUE 1.0
#define TEXTURE2D(t) Texture2D t
#define TEXTURE2D_X(t) Texture2D t
#define SAMPLER(s) SamplerState s
#define TEXTURE2D_PARAM(t, s) Texture2D t, SamplerState s
#define TEXTURE2D_ARGS(t, s) t, s
#define SAMPLE_TEXTURE2D(t, s, uv) t.Sample(s, uv)
#define SAMPLE_TEXTURE2D_X(t, s, uv) t.Sample(s, uv)
#define CBUFFER_START(n) cbuffer n {
#define CBUFFER_END };
#define TRANSFORM_TEX(uv, n) ((uv) * n##_ST.xy + n##_ST.zw)
#define UNITY_VERTEX_INPUT_INSTANCE_ID uint instanceID : SV_InstanceID;
#define UNITY_SETUP_INSTANCE_ID(v)
float4x4 unity_ObjectToWorld;
float4x4 unity_MatrixVP;
float4x4 unity_MatrixInvVP;
#define UNITY_MATRIX_M unity_ObjectToWorld
#define UNITY_MATRIX_I_VP unity_MatrixInvVP
float3 _WorldSpaceCameraPos;
float4 _ScreenParams;
float4 _ZBufferParams;
float3 TransformObjectToWorld(float3 p) { return mul(unity_ObjectToWorld, float4(p, 1)).xyz; }
float4 TransformWorldToHClip(float3 p) { return mul(unity_MatrixVP, float4(p, 1)); }
float4 TransformObjectToHClip(float3 p) { return TransformWorldToHClip(TransformObjectToWorld(p)); }
float3 TransformObjectToWorldNormal(float3 n) { return normalize(mul((float3x3)unity_ObjectToWorld, n)); }
struct VertexPositionInputs { float3 positionWS; float3 positionVS; float4 positionCS; float4 positionNDC; };
VertexPositionInputs GetVertexPositionInputs(float3 p) { VertexPositionInputs o; o.positionWS = TransformObjectToWorld(p); o.positionVS = p; o.positionCS = TransformWorldToHClip(o.positionWS); o.positionNDC = o.positionCS; return o; }
float ComputeFogFactor(float z) { return z; }
float3 MixFog(float3 c, float f) { return c * f; }
float3 GetWorldSpaceNormalizeViewDir(float3 p) { return normalize(_WorldSpaceCameraPos - p); }
float2 GetNormalizedScreenSpaceUV(float4 cs) { return cs.xy / _ScreenParams.xy; }
struct BRDFData { half3 albedo; half3 diffuse; half3 specular; half reflectivity; half perceptualRoughness; half roughness; half roughness2; half grazingTerm; half normalizationTerm; half roughness2MinusOne; };
void InitializeBRDFData(half3 albedo, half metallic, half3 specular, half smoothness, inout half alpha, out BRDFData o) { o = (BRDFData)0; o.albedo = albedo; o.perceptualRoughness = 1 - smoothness; }
struct Light { half3 direction; half3 color; float distanceAttenuation; half shadowAttenuation; uint layerMask; };
float4 TransformWorldToShadowCoord(float3 p) { return float4(p, 1); }
Light GetMainLight(float4 shadowCoord, float3 positionWS, half4 shadowMask) { Light l = (Light)0; l.direction = float3(0, 1, 0); return l; }
struct AmbientOcclusionFactor { half indirectAmbientOcclusion; half directAmbientOcclusion; };
AmbientOcclusionFactor GetScreenSpaceAmbientOcclusion(float2 uv) { AmbientOcclusionFactor a; a.indirectAmbientOcclusion = 1; a.directAmbientOcclusion = 1; return a; }
half3 SampleSH(half3 n) { return n; }
half3 GlossyEnvironmentReflection(half3 r, float3 p, half pr, half occ, float2 uv) { return r; }
half Pow4(half x) { return x * x * x * x; }
half3 EnvironmentBRDF(BRDFData b, half3 indirectDiffuse, half3 indirectSpecular, half fresnelTerm) { return indirectDiffuse + indirectSpecular * fresnelTerm; }
half3 LightingPhysicallyBased(BRDFData b, Light l, half3 n, half3 v) { return l.color * saturate(dot(n, l.direction)); }
float3 ApplyShadowBias(float3 p, float3 n, float3 l) { return p + n * 0.01; }
half3 NormalizeNormalPerPixel(half3 n) { return normalize(n); }
#endif
