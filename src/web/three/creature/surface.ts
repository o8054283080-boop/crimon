import * as THREE from "three";
import { ElementTheme } from "../elementTheme.js";
import { SIMPLEX_NOISE_3D } from "../shaderChunks.js";

/**
 * モンスターの体を構成する「材質」の種類。
 * 1体のモンスターは複数の材質を混ぜて作る(肉+骨+膜+結晶+発光)ことで、
 * 単色の塊ではなく生き物として読める見た目になる。
 */
export type SurfaceStyle =
  /** 皮膚・肉。マットで柔らかい */
  | "hide"
  /** 角・爪・骨・金属装甲。硬くハイライトが立つ */
  | "plate"
  /** 翼膜・衣・布。薄く透けて逆光で光る */
  | "membrane"
  /** 結晶。透過とフレネルが強い */
  | "crystal"
  /** 目・コアなどの自発光。ライティングを受けない */
  | "glow";

/** 1体のモンスターが使う配色。属性テーマから機械的に導出する */
export interface CreaturePalette {
  /** 体表のメインカラー */
  main: THREE.Color;
  /** 腹・関節など、影になる部分 */
  dark: THREE.Color;
  /** 角・爪・装甲(骨っぽい明るい色) */
  plate: THREE.Color;
  /** 縁取り・差し色 */
  accent: THREE.Color;
  /** 目・コアの発光色 */
  glow: THREE.Color;
  /** 翼膜・衣 */
  membrane: THREE.Color;
}

export function paletteFor(theme: ElementTheme): CreaturePalette {
  return {
    // ブルームで白飛びしないよう、体表は暗めに保ち、明るいのは差し色だけにする
    main: theme.shell.clone().lerp(theme.rim, 0.24),
    dark: theme.shell.clone().multiplyScalar(0.5).lerp(new THREE.Color(0x0d1020), 0.45),
    plate: new THREE.Color(0xcfc7ae).lerp(theme.rim, 0.3).multiplyScalar(0.62),
    accent: theme.rim.clone().multiplyScalar(0.85),
    glow: theme.core.clone(),
    membrane: theme.shell.clone().lerp(theme.rim, 0.42),
  };
}

/** 1体分で共有するアニメーション用uniform群(全パーツが同時に光る/溶ける) */
export interface CreatureUniforms {
  uTime: { value: number };
  /** 被弾時の白飛び */
  uFlash: { value: number };
  /** 撃破ディゾルブ 0..1 */
  uDissolve: { value: number };
  /** 行動中ハイライト 0..1 */
  uActive: { value: number };
  /** 手負い度 0..1 */
  uWound: { value: number };
  /** 体高(ディゾルブを足元から進めるための基準) */
  uHeight: { value: number };
}

export function createCreatureUniforms(): CreatureUniforms {
  return {
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uDissolve: { value: 0 },
    uActive: { value: 0 },
    uWound: { value: 0 },
    uHeight: { value: 2.4 },
  };
}

const VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vLocal;
varying vec3 vWorld;
varying float vWorldY;

void main() {
  vLocal = position;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPosition.xyz);
  // 模様はワールド座標基準で描く。パーツごとに大きさが違っても
  // 鱗や筋の粗さが揃い、1体の生き物として見える
  vWorld = worldPosition.xyz;
  vWorldY = worldPosition.y;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

/**
 * ステージの3灯(キー/フィル/バックリム)を焼き込んだトゥーン寄りのライティング。
 * 実ライトを使わずに固定方向で解くことで、パーツ数が多くても軽く、
 * かつ属性色に引っ張られない安定した陰影が得られる。
 */
const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uRim;
uniform vec3 uGlow;
uniform float uRimStrength;
uniform float uEmissive;
uniform float uOpacity;
uniform float uTime;
uniform float uFlash;
uniform float uDissolve;
uniform float uActive;
uniform float uWound;
uniform float uHeight;

varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vLocal;
varying vec3 vWorld;
varying float vWorldY;

${SIMPLEX_NOISE_3D}

/**
 * 鱗。格子状のセルごとに濃淡を変え、境目をわずかに暗く落とす。
 * テクスチャを持たずに「一枚の皮ではない」情報量を出すのが狙い。
 */
float scalePattern(vec3 p) {
  vec3 q = p * 16.0;
  vec3 cell = floor(q);
  vec3 f = fract(q) - 0.5;
  float tone = snoise(cell * 1.7) * 0.5 + 0.5;
  float edge = smoothstep(0.34, 0.5, max(abs(f.x), max(abs(f.y), abs(f.z))));
  return mix(tone, 0.25, edge);
}

/** 磨いた金属の筋。一方向へ細長く伸ばしたノイズ */
float brushedStreak(vec3 p) {
  return snoise(vec3(p.x * 42.0, p.y * 3.5, p.z * 42.0)) * 0.5 + 0.5;
}

const vec3 KEY_DIR = vec3(0.401, 0.802, 0.442);
const vec3 FILL_DIR = vec3(-0.771, 0.482, 0.417);
const vec3 BACK_DIR = vec3(0.0, 0.446, -0.895);

/** 3段のトゥーンランプ。境目をわずかにぼかしてバンドの硬さを和らげる */
float ramp(float x) {
  float a = smoothstep(0.00, 0.10, x) * 0.34;
  float b = smoothstep(0.26, 0.38, x) * 0.34;
  float c = smoothstep(0.66, 0.78, x) * 0.32;
  return a + b + c;
}

void main() {
  vec3 normal = normalize(vNormalW);
  if (!gl_FrontFacing) normal = -normal;
  vec3 viewDir = normalize(vViewDir);
  float facing = clamp(dot(normal, viewDir), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 3.0);
  float alpha = uOpacity;

#ifdef UNLIT
  vec3 color = uGlow * (1.05 + 0.25 * sin(uTime * 3.4)) + uRim * fresnel * 0.6;
#else
  float key = max(dot(normal, KEY_DIR), 0.0);
  float fill = max(dot(normal, FILL_DIR), 0.0);
  float back = max(dot(normal, BACK_DIR), 0.0);

  // 半球光(上は青空、下は床の紫)で暗部が潰れないようにする
  vec3 ambient = mix(vec3(0.10, 0.08, 0.13), vec3(0.20, 0.23, 0.36), normal.y * 0.5 + 0.5);

  // --- 体表のディテール ---------------------------------------------
  // 単色のままだとプラスチックの人形に見えるため、色ムラ・ざらつき・
  // 接地側の落ち込みを重ねて情報量を作る。すべて手続き的に計算しており
  // テクスチャ画像は使わない。
  float blotch = snoise(vWorld * 5.5) * 0.5 + 0.5;
  float grain = snoise(vWorld * 26.0) * 0.5 + 0.5;
  // 体の下ほど暗くして、光が上から回っている感じと接地感を出す
  float height01 = clamp(vWorldY / max(0.6, uHeight), 0.0, 1.0);

  vec3 albedo = uColor;
  albedo *= 0.84 + blotch * 0.32;
  albedo *= 0.93 + grain * 0.14;
  albedo *= 0.74 + height01 * 0.38;

  #ifdef SCALES
    // 皮膚は鱗状に。境目が落ちることでパーツの丸みも読み取りやすくなる
    albedo *= 0.78 + scalePattern(vWorld) * 0.44;
  #endif

  #ifdef STREAKS
    // 角・装甲は研いだ金属のような細い筋を走らせる
    albedo *= 0.88 + brushedStreak(vWorld) * 0.24;
  #endif

  // 窪みの擬似的な陰り。大きなムラの暗い側をさらに沈めて締める
  float occlusion = 0.82 + smoothstep(0.15, 0.6, blotch) * 0.18;
  albedo *= occlusion;

  vec3 color = albedo * (ambient + ramp(key) * 1.05);
  color += albedo * vec3(0.38, 0.48, 1.0) * fill * 0.30;
  // 背後のリムライト(ステージのピンクライト)。暗い背景から輪郭を切り離す主役
  color += vec3(1.0, 0.48, 0.85) * pow(back, 1.6) * 0.42;
  color += uRim * fresnel * uRimStrength * (1.0 + uActive * 1.5);

  #ifdef SPECULAR
    vec3 halfDir = normalize(KEY_DIR + viewDir);
    color += mix(vec3(1.0), uRim, 0.35) * pow(max(dot(normal, halfDir), 0.0), 42.0) * 0.85;
  #endif

  #ifdef TRANSLUCENT
    // 薄い膜。正面から見ると濃く、縁と逆光で明るく抜ける
    float thin = pow(1.0 - facing, 1.4);
    color = albedo * (0.34 + ramp(key) * 0.5) + uRim * thin * 0.9;
    color += uGlow * pow(max(dot(-normal, KEY_DIR), 0.0), 2.0) * 0.35;
    alpha = uOpacity * (0.72 + thin * 0.28);
  #endif
#endif

  color += uGlow * uEmissive;

  // 手負い: 体表に走る亀裂が内側から光る
  if (uWound > 0.01) {
    float crack = snoise(vLocal * 6.5 + uTime * 0.08);
    float mask = smoothstep(0.62 - uWound * 0.42, 0.72, crack) * uWound;
    color += uGlow * mask * 1.5;
  }

  color = mix(color, vec3(1.5), uFlash);

  // 撃破ディゾルブ: 上から崩れ、境界が強く発光する
  if (uDissolve > 0.001) {
    float noise = snoise(vLocal * 3.4) * 0.5 + 0.5;
    float heightMask = clamp(vWorldY / max(uHeight, 0.001), 0.0, 1.0);
    float mask = mix(noise, 1.0 - heightMask, 0.45);
    if (mask < uDissolve) discard;
    float edge = smoothstep(uDissolve, uDissolve + 0.10, mask);
    color = mix(uRim * 3.2 + uGlow, color, edge);
  }

  gl_FragColor = vec4(color, alpha);
}
`;

interface StyleConfig {
  defines: Record<string, string>;
  rimStrength: number;
  emissive: number;
  opacity: number;
  transparent: boolean;
  side: THREE.Side;
  depthWrite: boolean;
  castShadow: boolean;
}

const STYLE_CONFIG: Record<SurfaceStyle, StyleConfig> = {
  hide: {
    defines: { SCALES: "" },
    rimStrength: 0.55,
    emissive: 0,
    opacity: 1,
    transparent: false,
    side: THREE.FrontSide,
    depthWrite: true,
    castShadow: true,
  },
  plate: {
    defines: { SPECULAR: "", STREAKS: "" },
    rimStrength: 0.75,
    emissive: 0,
    opacity: 1,
    transparent: false,
    side: THREE.FrontSide,
    depthWrite: true,
    castShadow: true,
  },
  membrane: {
    defines: { TRANSLUCENT: "" },
    rimStrength: 0.9,
    emissive: 0.04,
    opacity: 0.94,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    castShadow: false,
  },
  crystal: {
    defines: { SPECULAR: "", TRANSLUCENT: "" },
    rimStrength: 1.3,
    emissive: 0.18,
    opacity: 0.88,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    castShadow: false,
  },
  glow: {
    defines: { UNLIT: "" },
    rimStrength: 0.6,
    emissive: 0.6,
    opacity: 1,
    transparent: false,
    side: THREE.FrontSide,
    depthWrite: true,
    castShadow: false,
  },
};

export function styleCastsShadow(style: SurfaceStyle): boolean {
  return STYLE_CONFIG[style].castShadow;
}

/**
 * 材質×色ごとにShaderMaterialを1つだけ作って共有するキャッシュ。
 * 1体のモンスターは30〜50個のメッシュで構成されるが、
 * マテリアルは高々6〜8個で済む。
 */
export class SurfaceSet {
  private readonly materials = new Map<string, THREE.ShaderMaterial>();

  constructor(
    private readonly palette: CreaturePalette,
    private readonly uniforms: CreatureUniforms,
  ) {}

  get(style: SurfaceStyle, color: THREE.Color): THREE.ShaderMaterial {
    const key = `${style}:${color.getHexString()}`;
    const cached = this.materials.get(key);
    if (cached) return cached;

    const config = STYLE_CONFIG[style];
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      defines: { ...config.defines },
      transparent: config.transparent,
      side: config.side,
      depthWrite: config.depthWrite,
      uniforms: {
        uColor: { value: color.clone() },
        uRim: { value: this.palette.accent.clone() },
        uGlow: { value: this.palette.glow.clone() },
        uRimStrength: { value: config.rimStrength },
        uEmissive: { value: config.emissive },
        uOpacity: { value: config.opacity },
        // 以下は1体で共有する参照(同じオブジェクトを渡すことで一括更新される)
        uTime: this.uniforms.uTime,
        uFlash: this.uniforms.uFlash,
        uDissolve: this.uniforms.uDissolve,
        uActive: this.uniforms.uActive,
        uWound: this.uniforms.uWound,
        uHeight: this.uniforms.uHeight,
      },
    });
    this.materials.set(key, material);
    return material;
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}
