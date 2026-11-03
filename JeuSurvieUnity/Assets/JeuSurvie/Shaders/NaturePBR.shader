// Solid nature models and characters (port of asset-library toPhysical + render-data/surfaces + wet-surfaces + night magic):
// metallic/roughness per surface kind, optional normal map (derivative tangent frame: no mesh tangents needed), baked vertex
// shading, sky reflection share (environmentIntensity), rain wetness (smoother, darker: Surfaces.Wet), mushroom
// bioluminescence at night. GPU instancing for vegetation; works unchanged on skinned characters.
Shader "JeuSurvie/NaturePBR"
{
    Properties
    {
        _BaseMap ("Albedo", 2D) = "white" {}
        _BaseColor ("Colour", Color) = (1, 1, 1, 1)
        _BumpMap ("Normal map", 2D) = "bump" {}
        _BumpScale ("Normal strength", Float) = 0
        _Metallic ("Metallic", Range(0, 1)) = 0
        _Roughness ("Roughness", Range(0, 1)) = 0.62
        _EnvIntensity ("Sky reflection share", Float) = 0.55
        _UseVertexColor ("Baked vertex shading", Float) = 1
        _Glow ("Night glow (mushrooms)", Float) = 0
        _RoughnessMap ("Roughness map (glTF: green channel)", 2D) = "white" {}
        _UseRoughnessMap ("Roughness from map", Float) = 0
        _UseMetallicMap ("Metallic from map (glTF: blue channel, × Metallic)", Float) = 0
        _GlowMap ("Night glow colour map (glTF emissive)", 2D) = "black" {}
        _UseGlowMap ("Night glow from map", Float) = 0
        _Cutoff ("Alpha cutoff", Range(0, 1)) = 0
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 2
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }
        Cull [_Cull]

        HLSLINCLUDE
        #include "JSCommon.hlsl"
        TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
        TEXTURE2D(_BumpMap); SAMPLER(sampler_BumpMap);
        TEXTURE2D(_RoughnessMap); SAMPLER(sampler_RoughnessMap);
        TEXTURE2D(_GlowMap); SAMPLER(sampler_GlowMap);
        CBUFFER_START(UnityPerMaterial)
            float4 _BaseMap_ST;
            float4 _BaseColor;
            float _BumpScale;
            float _Metallic;
            float _Roughness;
            float _EnvIntensity;
            float _UseVertexColor;
            float _Glow;
            float _UseRoughnessMap;
            float _UseMetallicMap;
            float _UseGlowMap;
            float _Cutoff;
            float _Cull;
        CBUFFER_END
        ENDHLSL

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma target 4.5
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fragment _ _SCREEN_SPACE_OCCLUSION
            #pragma multi_compile_fog

            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; float2 uv : TEXCOORD0; float4 color : COLOR; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float3 normalWS : TEXCOORD1;
                float2 uv : TEXCOORD2;
                float4 color : TEXCOORD3;
                float fogCoord : TEXCOORD4;
            };

            Varyings vert(Attributes v)
            {
                UNITY_SETUP_INSTANCE_ID(v);
                Varyings o;
                VertexPositionInputs p = GetVertexPositionInputs(v.positionOS.xyz);
                o.positionCS = p.positionCS;
                o.positionWS = p.positionWS;
                o.normalWS = TransformObjectToWorldNormal(v.normalOS);
                o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                o.color = _UseVertexColor > 0.5 ? v.color : float4(1, 1, 1, 1);
                o.fogCoord = ComputeFogFactor(p.positionCS.z);
                return o;
            }

            // Normal map with a cotangent frame from screen derivatives (correct whatever the mesh mirroring).
            float3 PerturbNormal(float3 N, float3 p, float2 uv, float3 tn)
            {
                float3 dp1 = ddx(p), dp2 = ddy(p);
                float2 duv1 = ddx(uv), duv2 = ddy(uv);
                float3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
                float3 T = dp2perp * duv1.x + dp1perp * duv2.x;
                float3 B = dp2perp * duv1.y + dp1perp * duv2.y;
                float invmax = rsqrt(max(dot(T, T), dot(B, B)) + 1e-12);
                return normalize(T * invmax * tn.x + B * invmax * tn.y + N * tn.z);
            }

            half4 frag(Varyings i, bool frontFace : SV_IsFrontFace) : SV_Target
            {
                float4 tex = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv);
                clip(tex.a - _Cutoff);
                float3 albedo = tex.rgb * _BaseColor.rgb * i.color.rgb;
                float3 N = normalize(i.normalWS) * (frontFace ? 1.0 : -1.0);
                if (_BumpScale > 0.0)
                {
                    float3 tn = SAMPLE_TEXTURE2D(_BumpMap, sampler_BumpMap, i.uv).xyz * 2.0 - 1.0;
                    tn.xy *= _BumpScale;
                    N = PerturbNormal(N, i.positionWS, i.uv, normalize(tn));
                }
                // Rain: smoother (sharper sky rim) and darker, never more sky light (Surfaces.Wet).
                float w = saturate(_JS_Wet.x);
                // Characters and the tools carry their roughness in a map (glTF metallic-roughness, green channel), the metal
                // tools their metal too (blue channel); the rest uses one value each.
                float roughBase = _Roughness;
                float metallic = _Metallic;
                if (_UseRoughnessMap > 0.5 || _UseMetallicMap > 0.5)
                {
                    float4 mr = SAMPLE_TEXTURE2D(_RoughnessMap, sampler_RoughnessMap, i.uv);
                    if (_UseRoughnessMap > 0.5) roughBase = mr.g;
                    if (_UseMetallicMap > 0.5) metallic = _Metallic * mr.b;
                }
                float rough = min(roughBase, max(0.12, roughBase * (1.0 - 0.55 * w)));
                albedo *= 1.0 - 0.3 * w;
                half3 color = JS_LightPBR(i.positionWS, N, albedo, metallic, rough, 1, _EnvIntensity, i.positionCS);
                // Night glow: mushrooms tint their own texture with the magic colour; a glow map (glTF emissive, e.g. the
                // elf's veins) glows in its own colours, scaled by how deep the night is (the 1.6 brings it to the mushrooms' level),
                // and keeps a faint glow by day (about a sixth of the night's) so the veins never go out completely.
                float3 glow = tex.rgb * _JS_NightGlow.rgb;
                if (_UseGlowMap > 0.5)
                {
                    const float DayGlowFloor = 0.25;
                    float night = max(_JS_NightGlow.r, max(_JS_NightGlow.g, _JS_NightGlow.b));
                    glow = SAMPLE_TEXTURE2D(_GlowMap, sampler_GlowMap, i.uv).rgb * max(night * 1.6, DayGlowFloor);
                }
                color += glow * _Glow;
                color = MixFog(color, i.fogCoord);
                return half4(color, 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }
            ZWrite On ZTest LEqual ColorMask 0
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; };
            Varyings vert(Attributes v)
            {
                UNITY_SETUP_INSTANCE_ID(v);
                Varyings o;
                o.positionCS = JS_ShadowPositionCS(TransformObjectToWorld(v.positionOS.xyz), TransformObjectToWorldNormal(v.normalOS));
                o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                return o;
            }
            half4 frag(Varyings i) : SV_Target { clip(SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv).a - _Cutoff); return 0; }
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }
            ZWrite On ColorMask R
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            struct Attributes { float4 positionOS : POSITION; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; };
            Varyings vert(Attributes v) { UNITY_SETUP_INSTANCE_ID(v); Varyings o; o.positionCS = TransformObjectToHClip(v.positionOS.xyz); o.uv = TRANSFORM_TEX(v.uv, _BaseMap); return o; }
            half4 frag(Varyings i) : SV_Target { clip(SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv).a - _Cutoff); return 0; }
            ENDHLSL
        }

        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode" = "DepthNormals" }
            ZWrite On
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct Varyings { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; float3 normalWS : TEXCOORD1; };
            Varyings vert(Attributes v) { UNITY_SETUP_INSTANCE_ID(v); Varyings o; o.positionCS = TransformObjectToHClip(v.positionOS.xyz); o.uv = TRANSFORM_TEX(v.uv, _BaseMap); o.normalWS = TransformObjectToWorldNormal(v.normalOS); return o; }
            half4 frag(Varyings i) : SV_Target { clip(SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv).a - _Cutoff); return half4(normalize(i.normalWS), 0); }
            ENDHLSL
        }
    }
    FallBack Off
}
