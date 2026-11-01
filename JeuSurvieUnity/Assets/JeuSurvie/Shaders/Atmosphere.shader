// Full-screen passes of Rendering/AtmosphereFeature.cs (ports of babylon/atmosphere-pass, sun-rays, lens-drops, SSR and sharpen).
//   0 AerialPerspective — exact distance + integrated height fog along the view ray, Mie forward scattering of the body.
//   1 DistanceBlur      — ULTRA depth of field: far background softened (Vogel disc, near never bleeds on far).
//   2 SunRays           — god rays: march toward the sun on screen, count open sky in the depth buffer.
//   3 WetReflections    — screen-space reflections on wet, flat ground (URP has no SSR: adaptation of the Babylon SSR pass).
//   4 LensAndSharpen    — after post-processing: light sharpen, then rain drops on the lens (refraction, trails, glints).
Shader "Hidden/JeuSurvie/Atmosphere"
{
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" }
        ZWrite Off ZTest Always Cull Off Blend Off

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"

        float4 _AerialFog;      // x distance density, y height density at base, z 1/thickness, w base altitude
        float4 _AerialHaze;     // rgb haze
        float4 _AerialSun;      // xyz toward body, w Mie g
        float4 _AerialScatter;  // rgb scattered body light
        float4 _DofParams;      // x from m, y full m, z max blur px
        float4 _RaysParams;     // xy sun uv, z strength, w aspect
        float4 _RaysColor;
        float4 _SsrParams;      // x wetness, y max distance m, z steps, w strength
        float4 _LensParams;     // x density, y time, z aspect, w sharpen

        bool IsSky(float rawDepth)
        {
        #if UNITY_REVERSED_Z
            return rawDepth <= 0.000001;
        #else
            return rawDepth >= 0.999999;
        #endif
        }

        float3 WorldAt(float2 uv, float rawDepth) { return ComputeWorldSpacePosition(uv, rawDepth, UNITY_MATRIX_I_VP); }

        float HgPhase(float mu, float g)
        {
            float g2 = g * g;
            return (1.0 - g2) / (12.566371 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
        }
        ENDHLSL

        Pass
        {
            Name "AerialPerspective"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment frag
            half4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.texcoord;
                half4 color = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv);
                float raw = SampleSceneDepth(uv);
                if (IsSky(raw)) return color;
                float3 world = WorldAt(uv, raw);
                float3 cam = _WorldSpaceCameraPos;
                float dist = length(world - cam);
                float3 rayDir = (world - cam) / max(dist, 1e-4);
                float k = _AerialFog.z;
                float startH = max(cam.y - _AerialFog.w, -8.0 / max(k, 1e-4));
                float dy = world.y - cam.y;
                float kdy = k * dy;
                float spread = abs(kdy) > 1e-3 ? (1.0 - exp(-kdy)) / kdy : 1.0 - 0.5 * kdy;
                float tauHeight = _AerialFog.y * exp(-k * startH) * dist * spread;
                float tau = _AerialFog.x * dist + tauHeight;
                float transmittance = exp(-tau);
                float mu = dot(rayDir, _AerialSun.xyz);
                float3 inscatter = _AerialHaze.rgb + _AerialScatter.rgb * HgPhase(mu, _AerialSun.w);
                return half4(color.rgb * transmittance + inscatter * (1.0 - transmittance), color.a);
            }
            ENDHLSL
        }

        Pass
        {
            Name "DistanceBlur"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment frag
            float CocAt(float2 uv)
            {
                float raw = SampleSceneDepth(uv);
                if (IsSky(raw)) return 1.0;
                float dist = length(WorldAt(uv, raw) - _WorldSpaceCameraPos);
                return smoothstep(_DofParams.x, _DofParams.y, dist);
            }
            half4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.texcoord;
                float coc = CocAt(uv);
                half4 center = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv);
                if (coc < 0.02) return center;
                float radius = coc * _DofParams.z;
                float2 texel = 1.0 / _ScreenParams.xy;
                float3 sum = center.rgb;
                float total = 1.0;
                [unroll] for (int k = 0; k < 16; k++)
                {
                    float r = sqrt((float(k) + 0.5) / 16.0) * radius;
                    float a = float(k) * 2.39996323;
                    float2 suv = uv + float2(cos(a), sin(a)) * r * texel;
                    float w = saturate(CocAt(suv) / coc);
                    sum += SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, suv).rgb * w;
                    total += w;
                }
                return half4(sum / total, center.a);
            }
            ENDHLSL
        }

        Pass
        {
            Name "SunRays"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment frag
            #pragma multi_compile_local _ _RAYS_24 _RAYS_32 _RAYS_48
            #if defined(_RAYS_48)
                #define SAMPLES 48
            #elif defined(_RAYS_32)
                #define SAMPLES 32
            #else
                #define SAMPLES 24
            #endif
            half4 frag(Varyings i) : SV_Target
            {
                float2 uv0 = i.texcoord;
                half4 base = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv0);
                if (_RaysParams.z <= 0.001) return base;
                float2 toSun = _RaysParams.xy - uv0;
                float dist = length(float2(toSun.x * _RaysParams.w, toSun.y));
                float2 stride = toSun * 0.85 / float(SAMPLES);
                float jitter = frac(sin(dot(uv0, float2(12.9898, 78.233))) * 43758.5453);
                float2 uv = uv0 + stride * jitter;
                float open = 0.0, weight = 1.0, total = 0.0;
                [loop] for (int k = 0; k < SAMPLES; k++)
                {
                    uv += stride;
                    bool outside = uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0;
                    float skyHere = outside ? 1.0 : (IsSky(SampleSceneDepth(uv)) ? 1.0 : 0.0);
                    open += skyHere * weight;
                    total += weight;
                    weight *= 0.97;
                }
                open /= total;
                float nearSun = exp(-dist * 2.2);
                return half4(base.rgb + _RaysColor.rgb * open * nearSun * _RaysParams.z * 0.55, base.a);
            }
            ENDHLSL
        }

        Pass
        {
            Name "WetReflections"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareNormalsTexture.hlsl"
            half4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.texcoord;
                half4 color = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv);
                float raw = SampleSceneDepth(uv);
                if (IsSky(raw) || _SsrParams.x <= 0.001) return color;
                float3 N = normalize(SampleSceneNormals(uv));
                float flatness = smoothstep(0.9, 0.99, N.y);
                if (flatness <= 0.0) return color;
                float3 P = WorldAt(uv, raw);
                float3 V = normalize(P - _WorldSpaceCameraPos);
                float3 R = reflect(V, N);
                float fresnel = 0.02 + 0.98 * pow(1.0 - saturate(dot(-V, N)), 5.0);
                int steps = (int)_SsrParams.z;
                float stepLen = _SsrParams.y / max(1.0, _SsrParams.z);
                float3 hitColor = 0;
                float hit = 0.0;
                float3 p = P + N * 0.05;
                [loop] for (int k = 0; k < 128; k++)
                {
                    if (k >= steps) break;
                    p += R * stepLen * (1.0 + k * 0.08);
                    float4 clip = TransformWorldToHClip(p);
                    float2 suv = clip.xy / clip.w * 0.5 + 0.5;
                #if UNITY_UV_STARTS_AT_TOP
                    suv.y = 1.0 - suv.y;
                #endif
                    if (any(suv < 0.0) || any(suv > 1.0)) break;
                    float sceneRaw = SampleSceneDepth(suv);
                    if (IsSky(sceneRaw)) continue;
                    float sceneEye = LinearEyeDepth(sceneRaw, _ZBufferParams);
                    float rayEye = clip.w;
                    float gap = rayEye - sceneEye;
                    if (gap > 0.0 && gap < 0.4 + stepLen)
                    {
                        float2 edge = smoothstep(0.0, 0.1, suv) * smoothstep(1.0, 0.9, suv);
                        hit = edge.x * edge.y * (1.0 - float(k) / max(1.0, _SsrParams.z));
                        hitColor = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, suv).rgb;
                        break;
                    }
                }
                float amount = hit * fresnel * flatness * _SsrParams.x * _SsrParams.w;
                return half4(lerp(color.rgb, hitColor, saturate(amount)), color.a);
            }
            ENDHLSL
        }

        Pass
        {
            Name "LensAndSharpen"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment frag
            float Hash12(float2 p) { float3 p3 = frac(float3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return frac((p3.x + p3.y) * p3.z); }
            float3 DropLayer(float2 uv, float t, float cells, float density)
            {
                float2 p = uv * float2(_LensParams.z, 1.0) * cells;
                float2 id = floor(p);
                float2 f = frac(p) - 0.5;
                float cycle = 3.0 + floor(4.0 * Hash12(id + 4.7));
                float life = frac(t / cycle + Hash12(id + 9.1));
                float alive = step(Hash12(id), density);
                float slides = step(0.55, Hash12(id + 2.3));
                float2 c = (float2(Hash12(id + 1.7), Hash12(id + 6.1)) - 0.5) * float2(0.45, 0.2);
                c.y = lerp(c.y + 0.12, -0.23, slides * smoothstep(0.2, 1.0, life));
                float r = (0.12 + 0.11 * Hash12(id + 3.3)) * smoothstep(0.0, 0.06, life);
                float2 d = (f - c) * float2(1.0, 0.85 + 0.3 * slides);
                float drop = smoothstep(r, r * 0.55, length(d));
                float above = f.y - c.y;
                float trail = slides * smoothstep(0.05, 0.0, abs(f.x - c.x)) * smoothstep(0.0, 0.05, above) * smoothstep(0.5 * life, 0.0, above) * 0.5;
                float m = max(drop, trail) * smoothstep(1.0, 0.75, life) * alive;
                return float3(d / max(r, 0.001) * drop, m);
            }
            half4 frag(Varyings i) : SV_Target
            {
                float2 uv = i.texcoord;
                float2 texel = 1.0 / _ScreenParams.xy;
                float3 col = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv).rgb;
                if (_LensParams.w > 0.0)
                {
                    float3 blur = (SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv + float2(texel.x, 0)).rgb
                                + SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv - float2(texel.x, 0)).rgb
                                + SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv + float2(0, texel.y)).rgb
                                + SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv - float2(0, texel.y)).rgb) * 0.25;
                    col = max(col + (col - blur) * _LensParams.w * 4.0, 0.0);
                }
                if (_LensParams.x > 0.01)
                {
                    // Unity blit uv has v up like Babylon's vUV: drops slide toward the bottom of the screen.
                    float2 luv = uv;
                    float3 big = DropLayer(luv, _LensParams.y, 5.0, _LensParams.x * 0.55);
                    float3 small = DropLayer(luv + float2(0.37, 0.11), _LensParams.y * 1.3, 11.0, _LensParams.x * 0.75);
                    float mask = max(big.z, small.z);
                    float2 offset = -(big.xy * big.z * 0.045 + small.xy * small.z * 0.025);
                    col = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv + offset).rgb;
                    float edge = max(smoothstep(0.55, 1.0, length(big.xy)) * big.z, smoothstep(0.55, 1.0, length(small.xy)) * small.z);
                    float glint = max(smoothstep(0.45, 0.1, length(big.xy - float2(-0.35, 0.4))) * big.z, smoothstep(0.45, 0.1, length(small.xy - float2(-0.35, 0.4))) * small.z);
                    col = col * (1.0 - edge * 0.3) + glint * 0.18 + mask * 0.02;
                }
                return half4(col, 1.0);
            }
            ENDHLSL
        }
    }
}
