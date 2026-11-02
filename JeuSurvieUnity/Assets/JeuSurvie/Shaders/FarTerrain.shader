// Far relief (port of babylon/far-terrain-renderer FarTerrainPlugin): one coarse mesh of the real terrain over kilometres,
// drawn only BEYOND the loaded chunks (pixels inside the inner radius are discarded), sunk a little, fading into the haze at
// the edge of the grid. Same physical lighting and palette as the near ground; darker and smoother when wet.
Shader "JeuSurvie/FarTerrain"
{
    Properties
    {
        _FarParams ("Player x, player z, inner radius, half size", Vector) = (0, 0, 448, 4000)
        _FarCenter ("Grid centre x, z, albedo factor, roughness", Vector) = (0, 0, 1, 0.9)
        _EnvIntensity ("Sky reflection share", Float) = 0.3
    }
    SubShader
    {
        // Drawn after the near world (Geometry+10): pixels hidden by chunks and trees are rejected by the depth test.
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry+10" }
        HLSLINCLUDE
        #include "JSCommon.hlsl"
        CBUFFER_START(UnityPerMaterial)
            float4 _FarParams;
            float4 _FarCenter;
            float _EnvIntensity;
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
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fog
            struct Attributes { float4 positionOS : POSITION; float3 normalOS : NORMAL; float4 color : COLOR; };
            struct Varyings { float4 positionCS : SV_POSITION; float3 positionWS : TEXCOORD0; float3 normalWS : TEXCOORD1; float4 color : TEXCOORD2; float fogCoord : TEXCOORD3; };
            Varyings vert(Attributes v)
            {
                Varyings o;
                VertexPositionInputs p = GetVertexPositionInputs(v.positionOS.xyz);
                o.positionCS = p.positionCS; o.positionWS = p.positionWS;
                o.normalWS = TransformObjectToWorldNormal(v.normalOS);
                o.color = v.color;
                o.fogCoord = ComputeFogFactor(p.positionCS.z);
                return o;
            }
            half4 frag(Varyings i) : SV_Target
            {
                float2 fromPlayer = i.positionWS.xz - _FarParams.xy;
                clip(dot(fromPlayer, fromPlayer) - _FarParams.z * _FarParams.z);
                float3 albedo = JS_ToLinear(i.color.rgb) * _FarCenter.z;
                half3 color = JS_LightPBR(i.positionWS, normalize(i.normalWS), albedo, 0, _FarCenter.w, 1, _EnvIntensity, i.positionCS);
                color = JS_ApplyHeightFog(color, i.positionWS);
                color = MixFog(color, i.fogCoord);
                float2 fromCenter = abs(i.positionWS.xz - _FarCenter.xy);
                color = lerp(color, _JS_Haze.rgb, smoothstep(0.75 * _FarParams.w, _FarParams.w, max(fromCenter.x, fromCenter.y)));
                return half4(color, 1);
            }
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
            struct Varyings { float4 positionCS : SV_POSITION; float3 positionWS : TEXCOORD0; };
            Varyings vert(float4 positionOS : POSITION) { Varyings o; o.positionWS = TransformObjectToWorld(positionOS.xyz); o.positionCS = TransformWorldToHClip(o.positionWS); return o; }
            half4 frag(Varyings i) : SV_Target { float2 d = i.positionWS.xz - _FarParams.xy; clip(dot(d, d) - _FarParams.z * _FarParams.z); return 0; }
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
            struct Varyings { float4 positionCS : SV_POSITION; float3 positionWS : TEXCOORD0; float3 normalWS : TEXCOORD1; };
            Varyings vert(Attributes v) { Varyings o; o.positionWS = TransformObjectToWorld(v.positionOS.xyz); o.positionCS = TransformWorldToHClip(o.positionWS); o.normalWS = TransformObjectToWorldNormal(v.normalOS); return o; }
            half4 frag(Varyings i) : SV_Target { float2 d = i.positionWS.xz - _FarParams.xy; clip(dot(d, d) - _FarParams.z * _FarParams.z); return half4(normalize(i.normalWS), 0); }
            ENDHLSL
        }
    }
    FallBack Off
}
