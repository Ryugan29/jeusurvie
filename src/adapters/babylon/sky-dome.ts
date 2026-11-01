// Dôme de ciel peint : une sphère vue de l'intérieur qui suit la caméra. Le dégradé (zénith → horizon → brume) vient des
// couleurs de sommets (render-data/lighting, fog) ; le shader y ajoute, sans aucune texture ni fichier réseau :
//   - des nuages stylisés (bruit fractal, face au soleil éclairée, face opposée dans l'ombre), qui dérivent lentement ;
//   - un halo autour du soleil (ou de la lune) et son disque ;
//   - la nuit : voie lactée, étoiles en trois couches (les plus brillantes rayonnent), étoiles filantes, lune à cratères ;
//   - une planète géante éclairée par l'astre et des aurores (render-data/cosmos : la voûte tourne avec l'heure).
// Aucune allocation par image : les couleurs sont recopiées dans des tampons et des objets existants.
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { smoothstep } from '../../core/shared/math';
import type { Cosmos } from '../render-data/cosmos';
import { hazeHorizonWeight } from '../render-data/fog';
import { skyWeight, type Lighting } from '../render-data/lighting';
import type { Rgb } from '../render-data/palette';

export interface SkyDomeOptions {
  /** Rayon (m) de la sphère : au-delà de tout ce qui est dessiné. */
  readonly radiusM: number;
  /** Nombre de segments de la sphère (résolution du dégradé). */
  readonly segments: number;
  /** Nuages peints (défaut : oui). */
  readonly clouds?: boolean;
}

const SHADER_NAME = 'ciel';

const VERTEX = `
precision highp float;
attribute vec3 position;
attribute vec4 color;
uniform mat4 worldViewProjection;
varying vec3 vDir;
varying vec3 vGradient;
void main() {
  vDir = position;
  vGradient = color.rgb;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

// Nuages : le ciel est projeté sur un plan haut (dir.xz / (dir.y + décalage)) : ils se resserrent vers l'horizon comme
// dans un vrai ciel. Le bruit est déformé (bords en volutes), puis taillé en trois teintes douces façon « gouache » :
// face au soleil claire, cœur épais dans l'ombre. Le tout fond dans la brume près de l'horizon.
export const SKY_FRAGMENT = `
precision highp float;
varying vec3 vDir;
varying vec3 vGradient;
uniform vec3 sunDir;       // vers l'astre, unitaire
uniform vec3 sunColor;
uniform vec3 cloudLight;
uniform vec3 cloudShade;
uniform vec4 sky;          // x : temps (s), y : nuages (0 ou 1), z : étoiles (0 à 1), w : halo (0 à 1)
uniform vec4 weather;      // x : couverture nuageuse (0 à 1), y : éclair (0 à 1), z : éclat du disque de l'astre (HDR), w : pluie (0 à 1)
uniform vec4 cosmos;       // x : rotation de la voûte céleste (rad), y : force des aurores (0 à 1)

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s;
}
// Version à 3 octaves, pour les motifs qui n'ont pas besoin de fins détails (voie lactée, planète) : moins de calcul.
float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s / 0.875;
}
float density(vec2 p) {
  p += 0.7 * vec2(noise(p * 0.8 + 3.1), noise(p * 0.8 + 8.7));
  return fbm(p);
}

// Voûte céleste : étoiles, voie lactée et planète y sont fixes ; elle tourne d'un tour par cycle autour d'un pôle penché
// (ce qui est près du pôle ne se couche jamais). Direction du ciel → direction sur la voûte.
const vec3 CELESTIAL_POLE = vec3(0.0, 0.342, -0.94); // 20° au-dessus de l'horizon
vec3 toCelestial(vec3 v) {
  float s = sin(-cosmos.x), c = cos(-cosmos.x);
  return v * c + cross(CELESTIAL_POLE, v) * s + CELESTIAL_POLE * dot(CELESTIAL_POLE, v) * (1.0 - c);
}

// Une couche d'étoiles : au plus une par case d'une grille 3D posée sur la voûte. Éclat (beaucoup de faibles, peu de
// brillantes), couleur (bleutée, blanche, dorée) et scintillement tirés au hasard ; les plus brillantes ont un halo et
// dépassent le seuil du bloom de l'étalonnage : elles rayonnent.
vec3 starLayer(vec3 c, float cells, float chance, float minBright, float maxBright, float halo, float sharp) {
  vec3 p = c * cells;
  vec3 id = floor(p);
  float h = hash3(id);
  if (h > chance) return vec3(0.0);
  vec3 center = id + 0.3 + 0.4 * vec3(hash3(id + 1.31), hash3(id + 4.77), hash3(id + 8.13));
  float d = length(p - center);
  float bright = mix(minBright, maxBright, pow(hash3(id + 2.9), 3.0));
  float twinkle = 0.75 + 0.25 * sin(sky.x * (1.5 + 4.0 * hash3(id + 6.6)) + h * 60.0);
  float t = hash3(id + 9.4);
  vec3 tint = t < 0.3 ? vec3(0.72, 0.82, 1.0) : (t < 0.85 ? vec3(1.0, 0.97, 0.92) : vec3(1.0, 0.8, 0.56));
  // Le halo s'éteint avant le bord de la case (centre à 0,3 au moins du bord) : pas de petit carré autour des brillantes.
  return tint * bright * twinkle * (exp(-d * d * sharp) + halo * 0.22 * exp(-d * 7.0) * smoothstep(0.3, 0.1, d));
}

// Voie lactée : une bande de lumière laiteuse autour d'un grand cercle de la voûte, en nuées bleues et rosées, cœur plus
// chaud, traversée de fils de poussière sombres.
vec3 milkyWay(vec3 c) {
  vec3 n = normalize(vec3(0.35, 0.55, 0.76));
  float b = dot(c, n);
  float band = exp(-b * b * 22.0);
  if (band < 0.01) return vec3(0.0);
  vec3 t1 = normalize(cross(n, vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(n, t1);
  vec2 q = vec2(dot(c, t1), dot(c, t2)) * (3.0 + b * 6.0);
  float nebula = fbm3(q * 1.7);
  float dust = smoothstep(0.5, 0.75, fbm3(q * 3.1 + 11.0)) * exp(-b * b * 120.0);
  vec3 tint = mix(vec3(0.45, 0.55, 1.0), vec3(0.95, 0.6, 0.95), smoothstep(0.35, 0.75, nebula));
  tint = mix(tint, vec3(1.0, 0.85, 0.65), exp(-b * b * 90.0) * 0.6);
  return tint * band * smoothstep(0.25, 0.8, nebula) * (1.0 - dust * 0.85) * 0.22;
}

// Étoile filante : au plus une toutes les 5 s (horloge réelle), qui file en ~0,8 s vers l'horizon en laissant une traînée.
float shootingStar(vec3 dir) {
  float slot = floor(sky.x / 5.0);
  if (hash(vec2(slot, 3.7)) > 0.45) return 0.0;
  float prog = (sky.x - slot * 5.0 - hash(vec2(slot, 8.1)) * 3.5) / 0.8;
  if (prog < 0.0 || prog > 1.0) return 0.0;
  float az = hash(vec2(slot, 1.9)) * 6.2831;
  float el = 0.45 + 0.6 * hash(vec2(slot, 5.3));
  vec3 s = vec3(cos(el) * sin(az), sin(el), cos(el) * cos(az));
  vec3 down = normalize(vec3(0.0, -1.0, 0.0) + s * s.y);
  vec3 side = normalize(cross(s, down));
  vec3 travel = normalize(down * 0.8 + side * (hash(vec2(slot, 6.2)) - 0.5) * 2.0);
  vec3 head = normalize(s + travel * prog * 0.35);
  vec3 tail = normalize(s + travel * max(prog * 0.35 - 0.12, 0.0));
  vec3 ab = head - tail;
  float along = clamp(dot(dir - tail, ab) / max(dot(ab, ab), 0.000001), 0.0, 1.0);
  float dist = length(dir - (tail + ab * along));
  return smoothstep(0.0025, 0.0, dist) * along * along * sin(prog * 3.1416) * 3.0;
}

// Planète géante : fixe sur la voûte, près du pôle (elle ne se couche jamais), elle tourne lentement avec les étoiles.
// Éclairée de trois quarts par une étoile lointaine : face lumineuse, croissant d'ombre, terminateur doux ; bandes turquoise et violettes, tempêtes ambrées,
// fine atmosphère qui s'allume sur le bord. Rend (couleur, opacité du disque).
const float PLANET_RADIUS = 0.14;
vec4 planet(vec3 c) {
  vec3 p = normalize(vec3(0.174, 0.337, -0.926)); // à 10° du pôle : entre 10° et 30° au-dessus de l'horizon, entière dans le champ
  if (dot(c, p) < cos(PLANET_RADIUS * 1.35)) return vec4(0.0);
  vec3 r1 = normalize(cross(p, vec3(0.0, 0.0, 1.0)));
  vec3 u1 = cross(r1, p);
  vec3 sunC = normalize(r1 * 0.8 + u1 * 0.35 - p * 0.5);
  vec2 q = vec2(dot(c, r1), dot(c, u1)) / sin(PLANET_RADIUS);
  float r = length(q);
  float disc = smoothstep(1.0, 0.985, r);
  vec3 n = normalize(q.x * r1 + q.y * u1 - sqrt(max(0.0, 1.0 - r * r)) * p);
  float lit = smoothstep(-0.12, 0.4, dot(n, sunC));
  vec3 axis = normalize(u1 * 0.94 + r1 * 0.34);
  float lat = dot(n, axis);
  float lon = dot(n, cross(axis, p));
  float swirl = fbm3(vec2(lat * 6.0, lon * 1.5));
  float bands = 0.5 + 0.5 * sin(lat * 10.0 + swirl * 3.0);
  vec3 surface = mix(vec3(0.16, 0.52, 0.58), vec3(0.5, 0.32, 0.72), bands);
  surface = mix(surface, vec3(0.95, 0.7, 0.42), smoothstep(0.62, 0.8, swirl) * 0.7);
  float limb = 1.0 - sqrt(max(0.0, 1.0 - r * r));
  vec3 col = (surface * (0.035 + 1.25 * lit) + vec3(0.35, 0.8, 1.0) * limb * limb * lit * 0.8) * disc;
  vec2 outward = q / max(r, 0.0001);
  float halo = (1.0 - disc) * exp(-max(r - 1.0, 0.0) * 22.0) * smoothstep(-0.2, 0.5, dot(outward.x * r1 + outward.y * u1, sunC)) * 0.35;
  return vec4(col + vec3(0.3, 0.75, 1.0) * halo, disc);
}

// Aurores : deux rideaux de lumière, vert d'eau à la base et violets en haut, striés de rayons verticaux, qui ondulent
// lentement au-dessus de l'horizon (vers +Z). Seulement de nuit, par temps dégagé.
vec3 aurora(vec3 dir, float up) {
  float a = atan(dir.x, dir.z);
  float sector = smoothstep(1.7, 0.5, abs(a));
  if (sector <= 0.0 || up < 0.02 || up > 0.85) return vec3(0.0);
  float t = sky.x * 0.04;
  vec3 total = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float base = 0.16 + fi * 0.09 + 0.06 * sin(a * (2.1 + fi) + t * (3.0 - fi)) + 0.05 * noise(vec2(a * 3.0 + fi * 7.0, t * 2.0));
    float h = up - base;
    float rays = noise(vec2(a * (26.0 + fi * 9.0) + noise(vec2(a * 4.0, t * 3.0)) * 3.0, t * 4.0 + fi));
    float curtain = smoothstep(-0.015, 0.02, h) * exp(-max(h, 0.0) * (5.0 + fi * 2.0)) * (0.3 + 0.7 * rays);
    vec3 tint = mix(vec3(0.1, 1.0, 0.55), vec3(0.55, 0.25, 1.0), smoothstep(0.0, 0.3, h));
    total += tint * curtain * (1.0 - fi * 0.35);
  }
  return total * sector;
}

const float MOON_RADIUS = 0.032;

void main() {
  vec3 dir = normalize(vDir);
  vec3 col = vGradient;
  float up = dir.y;
  float cosSun = max(dot(dir, sunDir), 0.0);
  float night = sky.z;

  // Halo large et chaud autour de l'astre, cœur plus serré. Un ciel couvert le voile.
  float clearSky = 1.0 - weather.x * 0.88;
  vec3 glow = sunColor * (pow(cosSun, 4.0) * 0.07 + pow(cosSun, 24.0) * 0.16 + pow(cosSun, 400.0) * 0.6);
  col += glow * sky.w;

  // Nuit : voie lactée, trois couches d'étoiles (poussière, moyennes, brillantes à halo), étoiles filantes. Les nuages,
  // dessinés ensuite, passent devant.
  vec3 cdir = toCelestial(dir);
  float clearNight = night * (1.0 - weather.x * 0.6) * smoothstep(0.0, 0.25, up);
  if (clearNight > 0.001) {
    col += milkyWay(cdir) * clearNight;
    // Taille du point (« sharp ») : plus la grille est grosse, plus le point est serré, pour garder des étoiles fines.
    col += (starLayer(cdir, 220.0, 0.55, 0.12, 0.55, 0.0, 40.0)
          + starLayer(cdir + 0.37, 110.0, 0.2, 0.4, 1.3, 0.3, 90.0)
          + starLayer(cdir + 0.71, 42.0, 0.1, 2.0, 7.0, 1.0, 300.0)) * clearNight;
    col += vec3(1.0, 0.95, 0.85) * shootingStar(dir) * clearNight;
  }

  // Planète géante : la nuit, son disque cache les étoiles ; le jour, seule sa face éclairée se devine, pâle.
  vec4 pl = planet(cdir);
  float planetSky = smoothstep(-0.02, 0.2, up) * (1.0 - weather.x * 0.85);
  col = mix(col, col * (1.0 - night * 0.97), pl.a * planetSky);
  col += pl.rgb * planetSky * mix(0.45, 1.0, night);

  // Aurores (devant la planète et les étoiles, derrière les nuages).
  if (night > 0.001 && cosmos.y > 0.0) col += aurora(dir, up) * cosmos.y * night * (1.0 - weather.x * 0.9) * 0.9;

  // Disque de l'astre : le soleil, bien au-delà de 1 (HDR), fait rayonner le halo de l'étalonnage ; la nuit, la lune, plus
  // grande, avec ses mers sombres et son bord un peu éteint.
  float visible = clearSky * step(-0.04, sunDir.y) * sky.w;
  float isMoon = smoothstep(0.15, 0.5, night);
  col += sunColor * smoothstep(0.99955, 0.9998, cosSun) * weather.z * visible * (1.0 - isMoon);
  if (isMoon > 0.0) {
    vec3 mR = normalize(cross(sunDir, vec3(0.0, 1.0, 0.0)) + vec3(0.0001, 0.0, 0.0));
    vec3 mU = cross(mR, sunDir);
    vec2 mq = vec2(dot(dir, mR), dot(dir, mU)) / MOON_RADIUS;
    float mr = length(mq);
    if (mr < 1.0 && dot(dir, sunDir) > 0.0) {
      float moonDisc = smoothstep(1.0, 0.93, mr);
      vec3 moon = vec3(0.85, 0.88, 0.96) * (0.6 + 0.55 * smoothstep(0.3, 0.7, fbm(mq * 1.4 + 7.3)))
                * (0.7 + 0.3 * sqrt(max(0.0, 1.0 - mr * mr))) * 1.8;
      col = mix(col, moon, moonDisc * isMoon * min(1.0, visible * 2.2));
    }
  }

  float cover = 0.0;
  if (sky.y > 0.5) {
    vec2 uv = dir.xz / (up + 0.2) * 2.2 + vec2(0.37, 0.11) * sky.x * 0.02;
    float d = density(uv);
    vec2 toSun = normalize(sunDir.xz + vec2(0.0001));
    float dSun = density(uv + toSun * 0.16);
    // La couverture abaisse le seuil : quelques cumulus par beau temps, une nappe continue sous la pluie. Bords doux (volutes).
    float threshold = mix(0.6, 0.3, weather.x);
    cover = smoothstep(threshold, threshold + 0.12, d) * smoothstep(0.02, 0.2, up);
    float rim = clamp(0.55 + (d - dSun) * 4.0, 0.0, 1.0);   // le côté tourné vers l'astre est moins épais : il est éclairé
    float core = smoothstep(threshold + 0.04, threshold + 0.24, d); // le cœur épais reste dans l'ombre
    float shade = clamp(core * 0.85 + (1.0 - rim) * 0.5, 0.0, 1.0);
    vec3 cloud = mix(cloudLight, cloudShade, shade);
    cloud += sunColor * pow(cosSun, 8.0) * rim * 0.35 * clearSky; // liseré doré face au soleil
    cloud = mix(cloud, vGradient, 0.25 * (1.0 - smoothstep(0.0, 0.35, up)));
    col = mix(col, cloud, cover * 0.96);
  }
  // Pluie : une couche basse de nuages sombres (gris ardoise), en lambeaux, qui file avec le vent sous la couche haute ;
  // ses bords tournés vers la lumière s'éclaircissent un peu. Calculée seulement quand il pleut.
  if (sky.y > 0.5 && weather.w > 0.01) {
    vec2 uvLow = dir.xz / (up + 0.08) * 3.4 + vec2(0.9, 0.35) * sky.x * 0.06 + 5.7;
    float dl = density(uvLow);
    float dlSun = density(uvLow + normalize(sunDir.xz + vec2(0.0001)) * 0.12);
    float low = smoothstep(0.4, 0.6, dl) * smoothstep(0.0, 0.1, up) * weather.w;
    float lowLit = clamp(0.45 + (dl - dlSun) * 3.0, 0.0, 1.0);
    vec3 lowCol = mix(cloudShade * 0.6, mix(cloudShade, cloudLight, 0.35), lowLit);
    lowCol = mix(lowCol, vGradient * 0.8, 0.3 * (1.0 - smoothstep(0.0, 0.25, up))); // fond dans la brume à l'horizon
    col = mix(col, lowCol, low * 0.92);
    cover = max(cover, low);
  }
  col += weather.y * vec3(0.5, 0.55, 0.7) * (0.6 + 0.4 * cover); // éclair : le ciel s'illumine, les nuages davantage

  gl_FragColor = vec4(col, 1.0);
}
`;

const store = ShaderStore.ShadersStore as Record<string, string>;
store[`${SHADER_NAME}VertexShader`] = VERTEX;
store[`${SHADER_NAME}FragmentShader`] = SKY_FRAGMENT;

const SKY_TIME_WRAP_S = 7200;

/** Éclat du disque de l’astre (×couleur de l’astre) : bien au-delà de 1, il passe le seuil du halo (bloom) de l’étalonnage HDR. */
export const SKY_SUN_DISC_HDR = 12;

/** Météo vue dans le ciel (render-data/atmosphere). */
export interface SkyWeather {
  /** Part du ciel couverte (0 à 1). */
  readonly cloudCover: number;
  /** Éclair en cours (0 à 1). */
  readonly flash: number;
  /** Brouillard (0 à 1) : la brume monte dans le ciel. */
  readonly fog: number;
  /** Pluie (0 à 1) : couche basse de nuages sombres (défaut : 0). */
  readonly rain?: number;
}

/** Ciel par beau temps (valeur par défaut de update). */
export const CLEAR_SKY: SkyWeather = { cloudCover: 0.15, flash: 0, fog: 0 };
/** Voûte immobile, sans aurores (valeur par défaut de update). */
export const STILL_COSMOS: Cosmos = { rotation: 0, aurora: 0 };
/** Hauteur relative du dôme jusqu’où monte la brume par plein brouillard. */
const FOG_SKY_HEIGHT = 0.7;

const setRgb = (target: Color3, c: Rgb): void => {
  target.set(c[0], c[1], c[2]);
};

export class SkyDome {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  /** Poids du zénith pour chaque sommet du dôme (précalculé : la forme du dégradé est une règle de render-data). */
  private readonly skyWeights: Float32Array;
  /** Poids de la teinte de brume pour chaque sommet du dôme (bas du ciel fondu dans la brume). */
  private readonly hazeWeights: Float32Array;
  /** Hauteur relative (0 = horizon, 1 = zénith) de chaque sommet. */
  private readonly heights: Float32Array;
  private readonly colors: Float32Array;
  private readonly toSun = new Vector3();
  private readonly sunColor = new Color3();
  private readonly cloudLight = new Color3();
  private readonly cloudShade = new Color3();
  private readonly params = new Vector4();
  private readonly weather = new Vector4();
  private readonly cosmos = new Vector4();
  private readonly clouds: boolean;

  constructor(scene: Scene, options: SkyDomeOptions) {
    this.clouds = options.clouds ?? true;
    const radius = options.radiusM;
    this.mesh = CreateSphere('ciel', { diameter: radius * 2, segments: options.segments, sideOrientation: Mesh.BACKSIDE }, scene);
    this.mesh.infiniteDistance = true;
    this.mesh.isPickable = false;
    this.mesh.applyFog = false;
    this.material = new ShaderMaterial(
      'ciel',
      scene,
      { vertex: SHADER_NAME, fragment: SHADER_NAME },
      {
        attributes: ['position', 'color'],
        uniforms: ['worldViewProjection', 'sunDir', 'sunColor', 'cloudLight', 'cloudShade', 'sky', 'weather', 'cosmos'],
      },
    );
    this.material.backFaceCulling = false;
    this.mesh.material = this.material;

    const positions = this.mesh.getVerticesData(VertexBuffer.PositionKind) ?? [];
    const count = positions.length / 3;
    this.skyWeights = new Float32Array(count);
    this.hazeWeights = new Float32Array(count);
    this.heights = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.heights[i] = positions[i * 3 + 1]! / radius;
      this.skyWeights[i] = skyWeight(positions[i * 3 + 1]! / radius);
      this.hazeWeights[i] = hazeHorizonWeight(positions[i * 3 + 1]! / radius);
    }
    this.colors = new Float32Array(count * 4);
    this.mesh.setVerticesData(VertexBuffer.ColorKind, this.colors, true);
  }

  get cloudsEnabled(): boolean {
    return this.clouds;
  }

  /**
   * Met le ciel à l'heure et au temps qu'il fait. `elapsedS` : temps réel (s), pour la dérive des nuages et le scintillement
   * (pas l'heure du jeu).
   */
  update(l: Lighting, haze: Rgb, elapsedS: number, weather: SkyWeather = CLEAR_SKY, cosmos: Cosmos = STILL_COSMOS): void {
    const h = l.skyHorizon, z = l.skyZenith;
    for (let i = 0; i < this.skyWeights.length; i++) {
      const fogged = weather.fog * (1 - smoothstep(0, FOG_SKY_HEIGHT, Math.max(0, this.heights[i]!)));
      const t = this.skyWeights[i]!, w = Math.max(this.hazeWeights[i]!, fogged);
      for (let k = 0; k < 3; k++) {
        const sky = h[k]! * (1 - t) + z[k]! * t;
        this.colors[i * 4 + k] = sky * (1 - w) + haze[k]! * w;
      }
      this.colors[i * 4 + 3] = 1;
    }
    this.mesh.updateVerticesData(VertexBuffer.ColorKind, this.colors);

    const d = l.sunDirection;
    this.toSun.set(-d.x, -d.y, -d.z);
    setRgb(this.sunColor, l.sunColor);
    setRgb(this.cloudLight, l.cloudLight);
    setRgb(this.cloudShade, l.cloudShade);
    const m = this.material;
    m.setVector3('sunDir', this.toSun);
    m.setColor3('sunColor', this.sunColor);
    m.setColor3('cloudLight', this.cloudLight);
    m.setColor3('cloudShade', this.cloudShade);
    // Le temps est ramené à 2 h : au-delà, la précision des flottants du shader abîmerait le bruit (un saut des nuages, une fois par 2 h).
    this.params.set(elapsedS % SKY_TIME_WRAP_S, this.clouds ? 1 : 0, l.starVisibility, l.sunGlow);
    m.setVector4('sky', this.params);
    this.weather.set(weather.cloudCover, weather.flash, SKY_SUN_DISC_HDR, weather.rain ?? 0);
    m.setVector4('weather', this.weather);
    this.cosmos.set(cosmos.rotation, cosmos.aurora, 0, 0);
    m.setVector4('cosmos', this.cosmos);
  }
}
