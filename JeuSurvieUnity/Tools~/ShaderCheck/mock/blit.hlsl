#ifndef MOCK_BLIT
#define MOCK_BLIT
Texture2D _BlitTexture;
SamplerState sampler_LinearClamp;
float4 _BlitScaleBias;
struct Attributes { uint vertexID : SV_VertexID; };
struct Varyings { float4 positionCS : SV_POSITION; float2 texcoord : TEXCOORD0; };
Varyings Vert(Attributes i) { Varyings o; o.positionCS = float4(0, 0, 0, 1); o.texcoord = float2(0, 0); return o; }
#endif
