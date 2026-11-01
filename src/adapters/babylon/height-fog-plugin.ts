// Brume de hauteur sur un matériau standard ou physique (plugin de matériau Babylon) : s'accumule avec la distance mais seulement
// en bas, donc stagne dans les vallées. Babylon n'offre qu'une brume de distance ; des couleurs par sommet ne
// dépendraient pas de la distance à la caméra (une vallée proche serait aussi « embrumée ») : d'où ce plugin.
// La formule est la copie exacte de render-data/fog.ts → heightFogAmount (testée là-bas) :
//   (1 − exp(−d · densité)) · exp(−max(0, y − base) / épaisseur)
import type { Material } from '@babylonjs/core/Materials/material';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import type { HeightFog } from '../render-data/fog';
import type { Rgb } from '../render-data/palette';

/** `target` : la couleur finale du shader — `color` pour le matériau standard, `finalColor` pour le matériau physique (PBR). */
const fragment = (target: string): string => `
#ifdef HEIGHTFOG
  float hfDistance = length(vEyePosition.xyz - vPositionW);
  float hfAbove = max(vPositionW.y - heightFogParams.y, 0.0);
  float hfAmount = (1.0 - exp(-hfDistance * heightFogParams.x)) * exp(-hfAbove / heightFogParams.z);
  ${target}.rgb = mix(${target}.rgb, heightFogColor, clamp(hfAmount, 0.0, 1.0));
#endif
`;

export class HeightFogPlugin extends MaterialPluginBase {
  private fog: HeightFog = { density: 0, thickness: 1 };
  private baseY = 0;
  private color: Rgb = [1, 1, 1];
  private readonly code: string;

  constructor(material: Material) {
    super(material, 'HeightFog', 200, { HEIGHTFOG: false }, true, true);
    this.code = fragment(material.getClassName() === 'PBRMaterial' ? 'finalColor' : 'color');
  }

  /** Réglages courants (appelés à chaque image ; aucune allocation). */
  set(fog: HeightFog, baseY: number, color: Rgb): void {
    this.fog = fog;
    this.baseY = baseY;
    this.color = color;
  }

  override getClassName(): string {
    return 'HeightFogPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  override prepareDefines(defines: Record<string, unknown>): void {
    defines['HEIGHTFOG'] = true;
  }

  override getUniforms(): { ubo: { name: string; size: number; type: string }[]; fragment: string } {
    return {
      ubo: [
        { name: 'heightFogParams', size: 4, type: 'vec4' },
        { name: 'heightFogColor', size: 3, type: 'vec3' },
      ],
      fragment: '#ifdef HEIGHTFOG\nuniform vec4 heightFogParams;\nuniform vec3 heightFogColor;\n#endif\n',
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat4('heightFogParams', this.fog.density, this.baseY, this.fog.thickness, 0);
    uniformBuffer.updateFloat3('heightFogColor', this.color[0], this.color[1], this.color[2]);
  }

  override getCustomCode(shaderType: string): { CUSTOM_FRAGMENT_BEFORE_FOG: string } | null {
    return shaderType === 'fragment' ? { CUSTOM_FRAGMENT_BEFORE_FOG: this.code } : null;
  }
}
