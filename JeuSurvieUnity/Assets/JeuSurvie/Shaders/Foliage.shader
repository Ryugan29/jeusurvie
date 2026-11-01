// Living vegetation (port of babylon/foliage-plugin + the StandardMaterial conversion of asset-library): GPU instanced (one draw
// per model part), wind gusts travelling across the meadow + flutter, foot → tip gradient, per-instance tint from the instance
// world position (dry golden grass patches, autumn broadleaf groups, brightness), realistic albedo (texture back to linear,
// desaturated and scaled), normal pulled upward for grass, back-light translucency toward the sun, alpha-to-coverage edges.
// Wind moves only what the camera sees (shadows keep the rest pose), like the original.
Shader "JeuSurvie/Foliage"
{
    Properties
    {
        _BaseMap ("Texture", 2D) = "white" {}
        _BaseColor ("Colour", Color) = (1, 1, 1, 1)
        _Cutoff ("Alpha cutoff", Range(0, 1)) = 0.5
        _FoliageParams ("Height ref, wind m, gradient, mode", Vector) = (1, 0, 0, 0)
        _FoliageAlbedo ("Saturation, value, up-normal, translucency", Vector) = (1, 1, 0, 0)
        _UseVertexColor ("Baked vertex shading", Float) = 1
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 0
        [Toggle(_ALPHATEST_ON)] _AlphaClip ("Alpha clip", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType" = "TransparentCutout" "RenderPipeline" = "UniversalPipeline" "Queue" = "AlphaTest" }
        Cull [_Cull]

        HLSLINCLUDE
        #include "JSCommon.hlsl"
        TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
        CBUFFER_START(UnityPerMaterial)
            float4 _BaseMap_ST;
            float4 _BaseColor;
            float _Cutoff;
            float4 _FoliageParams;
            float4 _FoliageAlbedo;
            float _UseVertexColor;
            float _Cull;
            float _AlphaClip;
        CBUFFER_END

        static const float3 SHADE_FOOT = float3(0.55, 0.62, 0.58);
        static const float3 SHADE_TIP = float3(1.12, 1.06, 0.8);
        static const float SHADE_TOP = 0.75;
        static const float2 WIND_DIR = float2(0.8, 0.6);
        static const float WIND_SPEED = 4.0, GUST_SPACING = 24.0, GUST_FLOOR = 0.25, FLUTTER_SHARE = 0.15, FLUTTER_RAD_S = 2.6;

        float FolGust(float2 p, float t)
        {
            float a = (dot(p, WIND_DIR) - WIND_SPEED * t) * 6.2831853 / GUST_SPACING;
            return (0.5 + 0.5 * sin(a)) * (0.6 + 0.4 * sin(a * 0.37 + 1.3));
        }

        struct FoliageVertex
        {
            float3 positionWS;
            float h;          // relative height (0 foot, 1 tip)
            float4 tint;      // rgb target, a amount
            float bright;
        };

        // World position (wind applied when `wind`), relative height and per-instance tint, computed from the instance position.
        FoliageVertex FoliageWorld(float3 positionOS, bool wind)
        {
            FoliageVertex o;
            float3 world = TransformObjectToWorld(positionOS);
            float2 at = float2(UNITY_MATRIX_M._m03, UNITY_MATRIX_M._m23);
            float scale = length(float3(UNITY_MATRIX_M._m01, UNITY_MATRIX_M._m11, UNITY_MATRIX_M._m21));
            o.h = saturate(positionOS.y / _FoliageParams.x);
            o.tint = float4(0, 0, 0, 0);
            o.bright = 1.0;
            float mode = _FoliageParams.w;
            if (mode > 0.5 && mode < 1.5)
            {
                float patch = JS_ValueNoise(at / 9.0) + 0.12 * (JS_Hash12(at + float2(31.7, -11.3)) - 0.5);
                float stray = JS_Hash12(at + float2(-7.1, 23.9)) < 0.03 ? 0.8 : 0.0;
                o.tint = float4(0.86, 0.66, 0.2, max(smoothstep(0.72, 0.82, patch), stray));
                o.bright = 0.88 + 0.24 * JS_Hash12(at + float2(5.3, 17.9));
            }
            else if (mode > 1.5 && mode < 2.5)
            {
                float autumn = smoothstep(0.67, 0.71, JS_ValueNoise(at / 90.0 + float2(0.37, -0.61)));
                float hue = JS_Hash12(at + float2(13.1, -3.7));
                float3 fall = hue < 0.5 ? lerp(float3(0.95, 0.74, 0.16), float3(0.96, 0.48, 0.1), hue * 2.0) : lerp(float3(0.96, 0.48, 0.1), float3(0.86, 0.2, 0.08), hue * 2.0 - 1.0);
                float spring = 0.3 * JS_Hash12(at + float2(-41.3, 9.7));
                o.tint = float4(lerp(float3(0.6, 0.78, 0.18), fall, smoothstep(0.3, 0.5, autumn)), max(spring, autumn));
                o.bright = 0.86 + 0.28 * JS_Hash12(at + float2(2.9, 61.1));
            }
            else if (mode > 2.5)
            {
                o.bright = 0.88 + 0.24 * JS_Hash12(at + float2(2.9, 61.1));
            }
            float bend = _FoliageParams.y * _JS_Wind.y * scale * o.h * o.h;
            if (wind && bend > 0.0)
            {
                float sway = bend * (GUST_FLOOR + (1.0 - GUST_FLOOR) * FolGust(at, _JS_Wind.x));
                float local = dot(positionOS.xz, float2(1.7, 1.3)) * 2.0;
                float flutter = bend * FLUTTER_SHARE * sin(_JS_Wind.x * FLUTTER_RAD_S + local + at.x * 1.3 + at.y * 1.7);
                world.xz += WIND_DIR * sway + float2(-WIND_DIR.y, WIND_DIR.x) * flutter;
            }
            o.positionWS = world;
            return o;
        }
        ENDHLSL

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            AlphaToMask On
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
                float4 tint : TEXCOORD4;
                float2 hb : TEXCOORD5;   // x: relative height, y: brightness
                float fogCoord : TEXCOORD6;
            };

            Varyings vert(Attributes v)
            {
                UNITY_SETUP_INSTANCE_ID(v);
                Varyings o;
                FoliageVertex f = FoliageWorld(v.positionOS.xyz, true);
                o.positionWS = f.positionWS;
                o.positionCS = TransformWorldToHClip(f.positionWS);
                o.normalWS = TransformObjectToWorldNormal(v.normalOS);
                o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                o.color = _UseVertexColor > 0.5 ? v.color : float4(1, 1, 1, 1);
                o.tint = f.tint;
                o.hb = float2(f.h, f.bright);
                o.fogCoord = ComputeFogFactor(o.positionCS.z);
                return o;
            }

            half4 frag(Varyings i, bool frontFace : SV_IsFrontFace) : SV_Target
            {
                float4 tex = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv);
                // Alpha-to-coverage: alpha sharpened around the cutoff (one pixel wide), then used as MSAA coverage.
                float coverage = saturate((tex.a - _Cutoff) / max(fwidth(tex.a), 0.0001) + 0.5);
                clip(coverage - 0.001);
                // Realistic albedo: texture (sRGB, decoded by the sampler) desaturated and scaled to a real leaf.
                float3 base = tex.rgb * _BaseColor.rgb * i.color.rgb;
                float luma = dot(base, float3(0.2126, 0.7152, 0.0722));
                base = lerp(luma.xxx, base, _FoliageAlbedo.x) * _FoliageAlbedo.y;
                base *= lerp(float3(1, 1, 1), lerp(SHADE_FOOT, SHADE_TIP, smoothstep(0.0, SHADE_TOP, i.hb.x)), _FoliageParams.z);
                float3 toward = i.tint.rgb * (dot(base, float3(0.2126, 0.7152, 0.0722)) / max(dot(i.tint.rgb, float3(0.2126, 0.7152, 0.0722)), 0.001));
                base = lerp(base, toward, i.tint.a) * i.hb.y;

                float3 N = normalize(i.normalWS) * (frontFace ? 1.0 : -1.0);
                N = normalize(lerp(N, float3(0, 1, 0), _FoliageAlbedo.z));
                float3 V = GetWorldSpaceNormalizeViewDir(i.positionWS);
                float2 screenUV = GetNormalizedScreenSpaceUV(i.positionCS);
                Light light = GetMainLight(TransformWorldToShadowCoord(i.positionWS), i.positionWS, half4(1, 1, 1, 1));
                float ambientOcclusion = 1.0;
            #if defined(_SCREEN_SPACE_OCCLUSION)
                AmbientOcclusionFactor ao = GetScreenSpaceAmbientOcclusion(screenUV);
                ambientOcclusion = ao.indirectAmbientOcclusion;
                light.color *= ao.directAmbientOcclusion;
            #endif
                float3 lightCol = light.color * light.shadowAttenuation * light.distanceAttenuation;
                float ndl = saturate(dot(N, light.direction));
                float3 H = normalize(light.direction + V);
                float3 color = base * (SampleSH(N) * ambientOcclusion + lightCol * ndl);
                color += float3(0.045, 0.05, 0.04) * pow(saturate(dot(N, H)), 18.0) * lightCol * ndl;
                color += base * float3(0.02, 0.024, 0.014) * 2.0;
                // Back light: facing the body, light crosses leaves and blades (more toward the tip).
                float back = pow(saturate(dot(-V, _JS_SunToward.xyz)), 5.0);
                color += base * _JS_SunColor.rgb * _JS_SunToward.w * _FoliageAlbedo.w * (0.1 + 0.9 * back) * lerp(0.35, 1.0, i.hb.x);
                color = MixFog(color, i.fogCoord);
                return half4(color, coverage);
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
            Varyings vert(Attributes v)
            {
                UNITY_SETUP_INSTANCE_ID(v);
                Varyings o;
                o.positionCS = TransformWorldToHClip(FoliageWorld(v.positionOS.xyz, true).positionWS);
                o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                return o;
            }
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
            Varyings vert(Attributes v)
            {
                UNITY_SETUP_INSTANCE_ID(v);
                Varyings o;
                o.positionCS = TransformWorldToHClip(FoliageWorld(v.positionOS.xyz, true).positionWS);
                o.uv = TRANSFORM_TEX(v.uv, _BaseMap);
                o.normalWS = normalize(lerp(TransformObjectToWorldNormal(v.normalOS), float3(0, 1, 0), _FoliageAlbedo.z));
                return o;
            }
            half4 frag(Varyings i) : SV_Target { clip(SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv).a - _Cutoff); return half4(normalize(i.normalWS), 0); }
            ENDHLSL
        }
    }
    FallBack Off
}
