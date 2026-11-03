// Physical ground (port of babylon/terrain-renderer + terrain-surface-plugin): four GPU-generated matters (grass, soil, rock,
// snow) blended per pixel by the vertex layer weights, world-space UVs (seamless across chunks), two-scale anti-tiling,
// triplanar rock, height blending, vertex palette colour (sRGB → linear) × matter factor, rain darkening, puddles in the
// matter cavities with rain ripples. Lit by the shared URP PBR lighting (JS_LightPBR).
Shader "JeuSurvie/Terrain"
{
    Properties
    {
        [NoScaleOffset] _TsColorGrass ("Grass colour", 2D) = "white" {}
        [NoScaleOffset] _TsMatterGrass ("Grass matter", 2D) = "bump" {}
        [NoScaleOffset] _TsColorSoil ("Soil colour", 2D) = "white" {}
        [NoScaleOffset] _TsMatterSoil ("Soil matter", 2D) = "bump" {}
        [NoScaleOffset] _TsColorRock ("Rock colour", 2D) = "white" {}
        [NoScaleOffset] _TsMatterRock ("Rock matter", 2D) = "bump" {}
        [NoScaleOffset] _TsColorSnow ("Snow colour", 2D) = "white" {}
        [NoScaleOffset] _TsMatterSnow ("Snow matter", 2D) = "bump" {}
        _TerrainTiles ("1 / tile size (grass, soil, rock, snow)", Vector) = (0.3333, 0.4, 0.1111, 0.1667)
        _DefaultRough ("Rough without matter maps", Vector) = (0.85, 0.88, 0.8, 0.55)
        _EnvIntensity ("Sky reflection share", Float) = 0.3
        [Toggle(_TSNORMALS)] _TsNormals ("Read matter maps (normals, roughness, cavity)", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }

        HLSLINCLUDE
        #include "JSCommon.hlsl"
        CBUFFER_START(UnityPerMaterial)
            float4 _TerrainTiles;
            float4 _DefaultRough;
            float _EnvIntensity;
            float _TsNormals;
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
            #pragma multi_compile_local _ _TSNORMALS
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fragment _ _SCREEN_SPACE_OCCLUSION
            #pragma multi_compile_fog

            TEXTURE2D(_TsColorGrass); TEXTURE2D(_TsMatterGrass);
            TEXTURE2D(_TsColorSoil); TEXTURE2D(_TsMatterSoil);
            TEXTURE2D(_TsColorRock); TEXTURE2D(_TsMatterRock);
            TEXTURE2D(_TsColorSnow); TEXTURE2D(_TsMatterSnow);
            SAMPLER(sampler_TsColorGrass);

            static const float MACRO_SHARE = 0.38, MACRO_SCALE = 0.31, HEIGHT_BLEND = 0.55, BLEND_WIDTH = 0.16, CAVITY_SHARE = 0.7;
            static const float WET_SLOPE_SHARE = 0.5, RIPPLE = 0.22, ALBEDO_FACTOR_MAX = 3.0;
            static const float WET_ALBEDO_DARKEN = 0.42, WET_ROUGHNESS = 0.32, PUDDLE_ROUGHNESS = 0.04;

            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; float4 color : COLOR; float3 layers : TEXCOORD0; };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float3 normalWS : TEXCOORD1;
                float4 color : TEXCOORD2;
                float3 layers : TEXCOORD3;
                float fogCoord : TEXCOORD4;
            };

            Varyings vert(Attributes v)
            {
                Varyings o;
                VertexPositionInputs p = GetVertexPositionInputs(v.positionOS.xyz);
                o.positionCS = p.positionCS;
                o.positionWS = p.positionWS;
                o.normalWS = TransformObjectToWorldNormal(v.normalOS);
                o.color = v.color;
                o.layers = v.layers;
                o.fogCoord = ComputeFogFactor(p.positionCS.z);
                return o;
            }

            float3 TsFactor(float3 code) { return code * code * ALBEDO_FACTOR_MAX; }

            // One matter read at two scales (anti-tiling). c: colour factor + height ; m: normal xy, roughness, cavity.
            void TsRead(TEXTURE2D_PARAM(C, sC), TEXTURE2D_PARAM(M, sM), float2 uv, out float4 c, out float4 m)
            {
                float2 uv2 = float2(uv.y, -uv.x) * MACRO_SCALE + float2(0.17, 0.43);
                float4 c1 = SAMPLE_TEXTURE2D(C, sC, uv), c2 = SAMPLE_TEXTURE2D(C, sC, uv2);
                c = float4(TsFactor(c1.rgb) * lerp(float3(1, 1, 1), TsFactor(c2.rgb), MACRO_SHARE), lerp(c1.a, c2.a, MACRO_SHARE));
            #if defined(_TSNORMALS)
                float4 m1 = SAMPLE_TEXTURE2D(M, sM, uv), m2 = SAMPLE_TEXTURE2D(M, sM, uv2);
                float2 n1 = m1.xy * 2.0 - 1.0, n2 = m2.xy * 2.0 - 1.0;
                m = float4(n1 + float2(-n2.y, n2.x) * MACRO_SHARE, lerp(m1.z, m2.z, 0.3), m1.w * lerp(1.0, m2.w, 0.5));
            #else
                m = float4(0.0, 0.0, -1.0, 1.0);
            #endif
            }

            float3 TsTop(float2 n, float3 N) { return normalize(float3(n.x + N.x, N.y, n.y + N.z)); }

            half4 frag(Varyings i) : SV_Target
            {
                float3 N = normalize(i.normalWS);
                float3 L = saturate(i.layers);
                float4 W = float4(max(0.0, 1.0 - L.x - L.y - L.z), L);
                float4 Cg = float4(1, 1, 1, 0.5), Cs = Cg, Cr = Cg, Cw = Cg;
                float4 Mg = float4(0, 0, -1, 1), Ms = Mg, Mr = Mg, Mw = Mg;
                float3 Ng = N, Ns = N, Nr = N, Nw = N;
                float3 P = i.positionWS;
                if (W.x > 0.001) { TsRead(TEXTURE2D_ARGS(_TsColorGrass, sampler_TsColorGrass), TEXTURE2D_ARGS(_TsMatterGrass, sampler_TsColorGrass), P.xz * _TerrainTiles.x, Cg, Mg); Ng = TsTop(Mg.xy, N); }
                if (W.y > 0.001) { TsRead(TEXTURE2D_ARGS(_TsColorSoil, sampler_TsColorGrass), TEXTURE2D_ARGS(_TsMatterSoil, sampler_TsColorGrass), P.xz * _TerrainTiles.y, Cs, Ms); Ns = TsTop(Ms.xy, N); }
                if (W.z > 0.001)
                {
                    // Triplanar rock: on vertical faces the texture "up" is the world up (horizontal strata).
                    float3 bw = pow(abs(N), 4.0);
                    bw /= bw.x + bw.y + bw.z;
                    float3 tp = P * _TerrainTiles.z;
                    float4 cx, mx, cy, my, cz, mz;
                    TsRead(TEXTURE2D_ARGS(_TsColorRock, sampler_TsColorGrass), TEXTURE2D_ARGS(_TsMatterRock, sampler_TsColorGrass), tp.zy, cx, mx);
                    TsRead(TEXTURE2D_ARGS(_TsColorRock, sampler_TsColorGrass), TEXTURE2D_ARGS(_TsMatterRock, sampler_TsColorGrass), tp.xz, cy, my);
                    TsRead(TEXTURE2D_ARGS(_TsColorRock, sampler_TsColorGrass), TEXTURE2D_ARGS(_TsMatterRock, sampler_TsColorGrass), tp.xy, cz, mz);
                    Cr = cx * bw.x + cy * bw.y + cz * bw.z;
                    Mr = mx * bw.x + my * bw.y + mz * bw.z;
                    float3 nX = float3(mx.xy + N.zy, abs(N.x));
                    float3 nY = float3(my.xy + N.xz, abs(N.y));
                    float3 nZ = float3(mz.xy + N.xy, abs(N.z));
                    nX.z *= sign(N.x); nY.z *= sign(N.y); nZ.z *= sign(N.z);
                    Nr = normalize(nX.zyx * bw.x + nY.xzy * bw.y + nZ.xyz * bw.z);
                }
                if (W.w > 0.001) { TsRead(TEXTURE2D_ARGS(_TsColorSnow, sampler_TsColorGrass), TEXTURE2D_ARGS(_TsMatterSnow, sampler_TsColorGrass), P.xz * _TerrainTiles.w, Cw, Mw); Nw = TsTop(Mw.xy, N); }

                // Height blend: an absent layer never pierces.
                float4 H = W + HEIGHT_BLEND * (float4(Cg.a, Cs.a, Cr.a, Cw.a) - 0.5);
                H = lerp(float4(-1, -1, -1, -1), H, step(0.001, W));
                float top = max(max(H.x, H.y), max(H.z, H.w)) - BLEND_WIDTH;
                float4 B = max(H - top, 0.0);
                B /= max(B.x + B.y + B.z + B.w, 0.0001);
                float3 fac = Cg.rgb * B.x + Cs.rgb * B.y + Cr.rgb * B.z + Cw.rgb * B.w;
                float height = Cg.a * B.x + Cs.a * B.y + Cr.a * B.z + Cw.a * B.w;
                float4 roughs = float4(Mg.z, Ms.z, Mr.z, Mw.z);
                roughs = lerp(_DefaultRough, roughs, step(0.0, roughs));
                float rough = dot(roughs, B);
                float cavity = dot(float4(Mg.w, Ms.w, Mr.w, Mw.w), B);
                float3 normalWS = normalize(Ng * B.x + Ns * B.y + Nr * B.z + Nw * B.w);
                float3 albedo = JS_ToLinear(i.color.rgb) * fac * lerp(1.0, cavity, CAVITY_SHARE);

                // Rain: the matter darkens and gets smoother, mostly on flat ground; snow does not change.
                float wet = _JS_Wet.x * (1.0 - B.w) * lerp(WET_SLOPE_SHARE, 1.0, saturate(N.y));
                albedo *= 1.0 - WET_ALBEDO_DARKEN * wet;
                rough = lerp(rough, min(rough, WET_ROUGHNESS), wet);
                if (wet > 0.001)
                {
                    float flatness = smoothstep(0.93, 0.99, N.y);
                    float level = _JS_Wet.x * (0.25 + 0.45 * smoothstep(0.35, 0.75, JS_ValueNoise(P.xz * 0.09) * 0.7 + JS_ValueNoise(P.xz * 0.41) * 0.3))
                                * (0.35 + 0.65 * B.y) * flatness;
                    float puddle = smoothstep(0.0, 0.06, level - height) * smoothstep(0.25, 0.7, _JS_Wet.x);
                    if (puddle > 0.001)
                    {
                        float3 water = float3(0, 1, 0);
                        if (_JS_Wet.y > 0.001)
                        {
                            // Rain rings: one drop per 50 cm cell, at its own instant; the ring widens and fades.
                            float2 cell = floor(P.xz * 2.0);
                            float2 local = frac(P.xz * 2.0) - 0.5 - (float2(JS_Hash12(cell + 3.1), JS_Hash12(cell + 7.7)) - 0.5) * 0.4;
                            float phase = frac(_JS_Wet.z * 0.9 + JS_Hash12(cell));
                            float dist = length(local);
                            float ring = sin((dist - phase * 0.3) * 50.0) * smoothstep(0.08, 0.0, abs(dist - phase * 0.3)) * (1.0 - phase);
                            water = normalize(water + float3(local.x, 0.0, local.y) / max(dist, 0.001) * ring * RIPPLE * _JS_Wet.y);
                        }
                        normalWS = normalize(lerp(normalWS, water, puddle));
                        rough = lerp(rough, PUDDLE_ROUGHNESS, puddle);
                        albedo *= 1.0 - 0.35 * puddle;
                    }
                }
                half3 color = JS_LightPBR(P, normalWS, albedo, 0, rough, 1, _EnvIntensity, i.positionCS, 1);
                color = JS_ApplyHeightFog(color, P);
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
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; };
            float4 vert(Attributes v) : SV_POSITION { return JS_ShadowPositionCS(TransformObjectToWorld(v.positionOS.xyz), TransformObjectToWorldNormal(v.normalOS)); }
            half4 frag() : SV_Target { return 0; }
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
            float4 vert(float4 positionOS : POSITION) : SV_POSITION { return TransformObjectToHClip(positionOS.xyz); }
            half4 frag() : SV_Target { return 0; }
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
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; };
            struct Varyings { float4 positionCS : SV_POSITION; float3 normalWS : TEXCOORD0; };
            Varyings vert(Attributes v) { Varyings o; o.positionCS = TransformObjectToHClip(v.positionOS.xyz); o.normalWS = TransformObjectToWorldNormal(v.normalOS); return o; }
            half4 frag(Varyings i) : SV_Target { return half4(NormalizeNormalPerPixel(i.normalWS), 0.0); }
            ENDHLSL
        }
    }
    FallBack Off
}
