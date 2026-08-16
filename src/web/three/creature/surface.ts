import * as THREE from "three";
import { ElementTheme } from "../elementTheme.js";
import { SIMPLEX_NOISE_3D } from "../shaderChunks.js";

/**
 * モンスターの体を構成する「材質」の種類。
 * 1体のモンスターは複数の材質を混ぜて作る(肉+骨+金属+膜+結晶+発光)ことで、
 * 単色の塊ではなく生き物として読める見た目になる。
 *
 * 材質は色だけでなく「反射の鋭さ」「ざらつきの模様」「縁の抜け方」で
 * 描き分ける。色を変えただけでは、属性色に染まった時に区別がつかなくなる。
 */
export type SurfaceStyle =
  /** 皮膚・鱗。マットで柔らかく、細かい鱗目が入る */
  | "hide"
  /** 毛皮・羽毛。ハイライトが立たず、縁が柔らかく光る */
  | "fur"
  /** 角・爪・骨・甲殻。硬く、蝋のような広いハイライト */
  | "plate"
  /** 金属装甲。暗い下地に鋭いハイライトと磨き筋、継ぎ目が入る */
  | "metal"
  /** 布・衣。マットだが斜めから見ると絹のような光沢が出る */
  | "cloth"
  /** 翼膜・薄布。薄く透けて逆光で光り、血管の筋が浮く */
  | "membrane"
  /** 結晶。透過とフレネルが強く、内側が光る */
  | "crystal"
  /** 目・コアなどの自発光。ライティングを受けない */
  | "glow";

/** 1体のモンスターが使う配色。属性テーマから機械的に導出する */
export interface CreaturePalette {
  /** 体表のメインカラー */
  main: THREE.Color;
  /** 腹・関節など、影になる部分 */
  dark: THREE.Color;
  /** 溝・口内・関節の隙間に使う最暗色 */
  deep: THREE.Color;
  /** 角・爪・骨(明るい生成り色) */
  plate: THREE.Color;
  /** 金属装甲 */
  metal: THREE.Color;
  /** 布・衣 */
  cloth: THREE.Color;
  /** 毛皮・羽毛 */
  fur: THREE.Color;
  /** 縁取り・差し色 */
  accent: THREE.Color;
  /** 目・コアの発光色 */
  glow: THREE.Color;
  /** 翼膜 */
  membrane: THREE.Color;
}

export function paletteFor(theme: ElementTheme): CreaturePalette {
  // ブルームで白飛びしないよう、体表は暗めに保ち、明るいのは差し色だけにする
  const shell = theme.shell.clone();
  return {
    main: shell.clone().lerp(theme.rim, 0.24),
    dark: shell.clone().multiplyScalar(0.5).lerp(new THREE.Color(0x0d1020), 0.45),
    deep: shell.clone().multiplyScalar(0.28).lerp(new THREE.Color(0x07080f), 0.6),
    plate: new THREE.Color(0xcfc7ae).lerp(theme.rim, 0.3).multiplyScalar(0.62),
    // 金属は属性色に染めすぎず、鋼の地色を残す。
    // 暗くしすぎると装甲が「焦げた塊」に見えるので、中明度を保って
    // 明暗はハイライトと映り込みで作る
    metal: new THREE.Color(0x7d8698).lerp(theme.shell, 0.28).multiplyScalar(0.72),
    cloth: shell.clone().multiplyScalar(0.62).lerp(theme.rim, 0.14),
    // 羽根は面積が大きい。属性色を保ったまま、体より一段だけ明るくする
    fur: shell.clone().lerp(theme.rim, 0.34).multiplyScalar(0.78),
    accent: theme.rim.clone().multiplyScalar(0.85),
    glow: theme.core.clone(),
    membrane: shell.clone().lerp(theme.rim, 0.42),
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
uniform float uSpecPower;
uniform float uSpecStrength;
/** 凹凸の高さ(ワールド単位)。0で法線を摂動しない */
uniform float uBump;
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
 * 体表の起伏(高さ場)。材質ごとに違う形を返す。
 *
 * ここで作った1つの高さから、色の濃淡と法線の傾きの両方を導く。
 * 色だけで凹凸を描くと、光の向きが変わっても影が動かず「模様を印刷した球」に
 * 見えてしまう。高さの勾配で法線を傾けることで、同じ模様が光に反応する。
 *
 * どの関数も 0..1 を返し、勾配が連続であること(floorで階段状にしないこと)が条件。
 * 階段状の高さ場は差分を取った瞬間に無限大の傾きを生み、縁が白く弾ける。
 */

/** 鱗。互い違いに並んだ丸い盛り上がりで、境目が溝になる */
float scaleHeight(vec3 p) {
  vec3 q = p * 15.0;
  // 段ごとに半個ずらす。格子のままだと市松模様に見えて生き物にならない
  q.xz += mod(floor(q.y), 2.0) * 0.5;
  vec3 f = fract(q) - 0.5;
  float d = max(abs(f.x), max(abs(f.y) * 1.2, abs(f.z)));
  float dome = smoothstep(0.5, 0.06, d);
  // 完全な繰り返しに見えないよう、粗いノイズで高さを揺らす
  return dome * (0.75 + (snoise(p * 9.0) * 0.5 + 0.5) * 0.5);
}

/** 岩の割れ。ノイズの零点に沿って溝が走り、面は平らに残る */
float crackHeight(vec3 p) {
  float n = snoise(p * 3.1) + snoise(p * 7.4) * 0.45;
  // 溝(0)と面(1)の間を狭くして、割れ目を鋭く見せる
  return smoothstep(0.0, 0.30, abs(n));
}

/** 磨いた金属の筋。一方向へ細長く伸ばしたノイズ */
float brushedStreak(vec3 p) {
  return snoise(vec3(p.x * 42.0, p.y * 3.5, p.z * 42.0)) * 0.5 + 0.5;
}

/** 毛の流れ。縦に細長いノイズで、束になった毛羽を表す */
float strandPattern(vec3 p) {
  return snoise(vec3(p.x * 34.0, p.y * 6.0, p.z * 34.0)) * 0.5 + 0.5;
}

/** 織り目。縦横2方向の細かい縞を掛け合わせる */
float weavePattern(vec3 p) {
  float warp = sin(p.x * 150.0) * sin(p.y * 150.0);
  return warp * 0.5 + 0.5;
}

/** 結晶の面。低周波ノイズを丸めた段にして、平らな面と鋭い稜線を作る */
float facetHeight(vec3 p) {
  float n = snoise(p * 4.6);
  // floorで段を作ると勾配が飛ぶので、正弦を寝かせた「丸い段」にする
  return smoothstep(-0.7, 0.7, sin(n * 6.0));
}

/**
 * 材質ごとの高さ場をひとつに束ねる。
 * 法線の摂動はこの関数を4回叩いて勾配を取るため、
 * 中身は「安いこと」と「勾配が連続なこと」を最優先にしている。
 */
float surfaceHeight(vec3 p) {
#if defined(CRACKS)
  return crackHeight(p);
#elif defined(SCALES)
  return scaleHeight(p);
#elif defined(STRANDS)
  return strandPattern(p);
#elif defined(FACETS)
  return facetHeight(p);
#elif defined(STREAKS)
  return brushedStreak(p);
#elif defined(WEAVE)
  return weavePattern(p) * 0.5 + (snoise(p * 20.0) * 0.5 + 0.5) * 0.5;
#else
  return snoise(p * 14.0) * 0.5 + 0.5;
#endif
}

/**
 * 高さ場の勾配で法線を傾ける。
 *
 * プロシージャル生成のジオメトリは接線ベクトルを持たないため、
 * 接空間の法線マップは使えない。代わりに高さの3次元勾配から
 * 面に沿った成分だけを取り出して法線を倒す(surface gradient 方式)。
 * これなら球・円錐・チューブのどれに貼っても継ぎ目が出ない。
 *
 * amplitude は凹凸の高さをワールド単位で指定する。
 */
vec3 bumpNormal(vec3 n, vec3 p, float h0, float amplitude) {
  if (amplitude < 0.0001) return n;
  const float e = 0.012;
  vec3 grad = vec3(
    surfaceHeight(p + vec3(e, 0.0, 0.0)) - h0,
    surfaceHeight(p + vec3(0.0, e, 0.0)) - h0,
    surfaceHeight(p + vec3(0.0, 0.0, e)) - h0
  ) / e;
  // 法線方向の変化は面の傾きに寄与しないので取り除く
  grad -= n * dot(n, grad);
  // 傾けすぎると裏返って黒い点が散るため、勾配に頭打ちを入れる
  float len = length(grad) * amplitude;
  if (len > 0.9) grad *= 0.9 / len;
  return normalize(n - grad * amplitude);
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
  vec3 geoNormal = normalize(vNormalW);
  if (!gl_FrontFacing) geoNormal = -geoNormal;
  vec3 viewDir = normalize(vViewDir);
  // 輪郭のフレネルは「幾何の」法線で取る。凹凸を混ぜると縁がちらつき、
  // シルエットが溶けてしまう。凹凸は面の中の陰影だけに効かせる
  float facing = clamp(dot(geoNormal, viewDir), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 3.0);
  float alpha = uOpacity;
  vec3 normal = geoNormal;

#ifdef UNLIT
  vec3 color = uGlow * (1.05 + 0.25 * sin(uTime * 3.4)) + uRim * fresnel * 0.6;
#else
  // --- 起伏 ----------------------------------------------------------
  // 材質ごとの高さ場を1回だけ求め、色の濃淡と法線の傾きの両方に使う。
  // これで「模様の暗い所」と「光が当たらない所」が一致し、
  // 光の向きが変わると鱗や割れ目の影も一緒に動く。
  float height = surfaceHeight(vWorld);
  normal = bumpNormal(geoNormal, vWorld, height, uBump);

  float key = max(dot(normal, KEY_DIR), 0.0);
  float fill = max(dot(normal, FILL_DIR), 0.0);
  float back = max(dot(normal, BACK_DIR), 0.0);

  #ifdef WRAP
    // 羽根や葉のように薄い面は、裏を向いた瞬間に真っ黒になって
    // 板の集まりに見えてしまう。光を回り込ませて面の向きの差を弱める。
    key = key * 0.5 + (dot(normal, KEY_DIR) * 0.5 + 0.5) * 0.5;
    fill = fill * 0.5 + (dot(normal, FILL_DIR) * 0.5 + 0.5) * 0.5;
  #endif

  // 半球光(上は青空、下は床の紫)で暗部が潰れないようにする
  vec3 ambient = mix(vec3(0.10, 0.08, 0.13), vec3(0.20, 0.23, 0.36), normal.y * 0.5 + 0.5);

  // --- 体表のディテール ---------------------------------------------
  // 単色のままだとプラスチックの人形に見えるため、色ムラ・ざらつき・
  // 接地側の落ち込みを重ねて情報量を作る。すべて手続き的に計算しており
  // テクスチャ画像は使わない。
  //
  // 画面上のモンスターは高さ100px前後にしかならないので、細かい模様だけでは
  // 潰れて灰色になる。大きなムラ(blotch)と、下向きの面を沈める処理で
  // 「かたまりの向き」が離れて見ても読めるようにするのが主眼。
  float blotch = snoise(vWorld * 5.5) * 0.5 + 0.5;
  float grain = snoise(vWorld * 26.0) * 0.5 + 0.5;
  // 体の下ほど暗くして、光が上から回っている感じと接地感を出す
  float height01 = clamp(vWorldY / max(0.6, uHeight), 0.0, 1.0);
  // 下を向いた面を沈める。腹・顎下・腕の内側が落ちて、部位の丸みが分離する
  float upness = normal.y * 0.5 + 0.5;

  vec3 albedo = uColor;
  albedo *= 0.84 + blotch * 0.32;
  albedo *= 0.93 + grain * 0.14;
  albedo *= 0.78 + height01 * 0.30;
  albedo *= 0.70 + upness * 0.42;

  #ifdef SCALES
    // 皮膚は鱗状に。境目が落ちることでパーツの丸みも読み取りやすくなる
    albedo *= 0.78 + height * 0.44;
  #endif

  #ifdef CRACKS
    // 岩は面の色を保ったまま、割れ目だけを深く落とす
    albedo *= 0.52 + height * 0.52;
  #endif

  #ifdef STRANDS
    // 毛皮・羽毛は縦に流れる毛束。粒より粗く、方向を持たせる
    albedo *= 0.80 + height * 0.34;
  #endif

  #ifdef STREAKS
    // 角・装甲は研いだ金属のような細い筋を走らせる
    albedo *= 0.88 + height * 0.24;
  #endif

  #ifdef WEAVE
    // 布は細かい織り目。ローカル座標基準なので、揺れても模様が泳がない
    albedo *= 0.90 + weavePattern(vLocal) * 0.16;
  #endif

  // 窪みの擬似的な陰り。大きなムラの暗い側をさらに沈めて締める
  float occlusion = 0.82 + smoothstep(0.15, 0.6, blotch) * 0.18;
  albedo *= occlusion;

  // 光の落ち方も材質で変える。硬い材質は3段のランプで面の向きを切り、
  // 毛は段を持たずになだらかに暗くなる
  #ifdef SOFT
    // 毛皮・羽毛は光が繊維の中で何度も散るので、明暗の境目が出ない。
    // 落ちを長く取り、いちばん暗いところも沈めきらない
    float diffuse = pow(key, 0.72) * 0.88 + 0.12;
  #else
    float diffuse = ramp(key) * 1.05;
  #endif

  vec3 color = albedo * (ambient + diffuse);
  color += albedo * vec3(0.38, 0.48, 1.0) * fill * 0.30;
  // 背後のリムライト(ステージのピンクライト)。暗い背景から輪郭を切り離す主役
  color += vec3(1.0, 0.48, 0.85) * pow(back, 1.6) * 0.42;
  color += uRim * fresnel * uRimStrength * (1.0 + uActive * 1.5);

  #ifdef SOFT
    // 毛先が逆光で透ける。輪郭が硬い縁ではなく、ふわりとした帯になる
    color += albedo * mix(uRim, vec3(1.0), 0.3) * pow(1.0 - facing, 1.7) * 0.28;
  #endif

  #ifdef METALLIC
    // 金属は拡散が弱く、上下の環境色を映し込む。
    // これがあるだけで、同じ色でも肉と金属が別物に見える
    color *= 0.70;
    vec3 sky = vec3(0.26, 0.30, 0.44);
    vec3 ground = vec3(0.14, 0.10, 0.16);
    // 映り込みは磨き筋に沿って途切れる。凹凸の高さがそのまま反射の粗さになる
    color += mix(ground, sky, smoothstep(-0.2, 0.6, normal.y)) * 0.36 * (0.30 + height * 0.80);
  #endif

  #ifdef SPECULAR
    vec3 halfDir = normalize(KEY_DIR + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), uSpecPower) * uSpecStrength;
    #ifdef METALLIC
      // 金属は「点」で光る。磨き筋に沿ってハイライトを途切れさせ、
      // さらにフィル側にも小さく鋭い2つ目を置く。反射が2つ見えると
      // 面が板ではなく金属板として読める
      spec *= 0.35 + height * 0.95;
      spec += pow(max(dot(normal, normalize(FILL_DIR + viewDir)), 0.0), uSpecPower * 0.6) * uSpecStrength * 0.30;
    #endif
    // ブルームで白く飛ばないよう、ハイライトの合計に頭打ちを入れる
    color += mix(vec3(1.0), uRim, 0.35) * min(spec, 1.5);
  #endif

  #ifdef SHEEN
    // 布の光沢。面が寝ているほど強く、絹のように縁が明るくなる
    color += mix(uRim, vec3(1.0), 0.35) * pow(1.0 - facing, 3.5) * 0.30;
  #endif

  #ifdef TRANSLUCENT
    // 薄い膜。正面から見ると濃く、縁と逆光で明るく抜ける
    float thin = pow(1.0 - facing, 1.4);
    color = albedo * (0.34 + ramp(key) * 0.5) + uRim * thin * 0.9;
    color += uGlow * pow(max(dot(-normal, KEY_DIR), 0.0), 2.0) * 0.35;
    alpha = uOpacity * (0.72 + thin * 0.28);
  #endif

  #ifdef VEINS
    // 翼膜の血管。ローカル座標で描くので、羽ばたいても模様が流れない
    float vein = 1.0 - smoothstep(0.0, 0.16, abs(snoise(vLocal * 7.0)));
    color *= 1.0 - vein * 0.34;
    color += uRim * vein * 0.10;
  #endif

  #ifdef CRYSTAL
    // 結晶は「向こうが透けること」で他の材質と区別する。
    // 明るくして目立たせるのではなく、正面を薄く・縁を厚く見せることで
    // 中身の詰まったガラスの塊にする(加算合成の飽和を増やさない)。
    float edge = pow(1.0 - facing, 2.0);
    // 内部の層。見る向きでずれるので、中に奥行きがあるように見える
    float inner = sin(dot(vLocal, vec3(11.0, 17.0, 9.0)) - facing * 7.0 + uTime * 0.35) * 0.5 + 0.5;
    vec3 core = mix(uColor * 0.42, uGlow * 0.5, inner * 0.7);
    color = core + albedo * (0.22 + ramp(key) * 0.40) + uRim * edge * 0.8;
    // 面の稜線だけが白く立つ。カットガラスの角の見え方
    color += vec3(1.0) * pow(height, 8.0) * 0.12;
    // 正面は透け、縁は詰まって見える。これが厚みの手がかりになる
    alpha = uOpacity * (0.42 + edge * 0.58);
  #endif
#endif

  color += uGlow * uEmissive;

  // 手負い: 体表に走る亀裂が内側から光る
  if (uWound > 0.01) {
    float crack = snoise(vLocal * 6.5 + uTime * 0.08);
    float mask = smoothstep(0.62 - uWound * 0.42, 0.72, crack) * uWound;
    // 瀕死の状態は長く続くので、光らせすぎると終盤ずっと画面が白む
    color += uGlow * mask * 0.7;
  }

  // 被弾の白飛び。
  // 全体攻撃では8体が同時に光るため、1体あたりが強い/長いと
  // 画面全体が白い靄になってしまう。短く鋭い「点滅」に留める。
  color = mix(color, vec3(1.3), uFlash * 0.32);

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
  /** ハイライトの鋭さ(大きいほど点に近い) */
  specPower: number;
  /** ハイライトの強さ */
  specStrength: number;
  /**
   * 体表の凹凸の高さ(ワールド単位)。法線をこの分だけ傾ける。
   * 模様の細かさと釣り合わない値にすると、面が裏返って黒い粒が散る。
   * 鱗のように細かい模様ほど小さく、岩の割れのように粗い模様ほど大きくする。
   */
  bump: number;
}

const STYLE_CONFIG: Record<SurfaceStyle, StyleConfig> = {
  // 肉: ハイライトは広く弱い。生き物の湿り気だけを感じさせる
  hide: {
    defines: { SCALES: "", SPECULAR: "" },
    rimStrength: 0.55,
    emissive: 0,
    opacity: 1,
    transparent: false,
    side: THREE.FrontSide,
    depthWrite: true,
    castShadow: true,
    specPower: 8,
    specStrength: 0.14,
    bump: 0.009,
  },
  // 毛皮・羽毛: ハイライトを持たず、光が繊維の中で散って柔らかく減衰する
  fur: {
    defines: { STRANDS: "", WRAP: "", SOFT: "" },
    rimStrength: 0.85,
    emissive: 0,
    opacity: 1,
    transparent: false,
    // 羽根は平面1枚で作るので、裏から見ても消えないようにする
    side: THREE.DoubleSide,
    depthWrite: true,
    castShadow: true,
    specPower: 4,
    specStrength: 0,
    bump: 0.005,
  },
  // 骨・角・爪: 蝋のような、やや広くて強いハイライト
  plate: {
    defines: { SPECULAR: "", STREAKS: "" },
    rimStrength: 0.75,
    emissive: 0,
    opacity: 1,
    transparent: false,
    side: THREE.FrontSide,
    depthWrite: true,
    castShadow: true,
    specPower: 26,
    specStrength: 0.5,
    bump: 0.003,
  },
  // 金属: 暗い下地・環境の映り込み・点で光る鋭いハイライト
  metal: {
    defines: { SPECULAR: "", STREAKS: "", METALLIC: "" },
    rimStrength: 0.5,
    emissive: 0,
    opacity: 1,
    transparent: false,
    side: THREE.FrontSide,
    depthWrite: true,
    castShadow: true,
    specPower: 160,
    specStrength: 1.2,
    bump: 0.0025,
  },
  // 布: ハイライトは出ず、斜めから見た時だけ絹の光沢が乗る
  cloth: {
    defines: { WEAVE: "", SHEEN: "" },
    rimStrength: 0.35,
    emissive: 0,
    opacity: 1,
    transparent: false,
    side: THREE.DoubleSide,
    depthWrite: true,
    castShadow: true,
    specPower: 6,
    specStrength: 0,
    bump: 0.002,
  },
  membrane: {
    defines: { TRANSLUCENT: "", VEINS: "" },
    rimStrength: 0.9,
    emissive: 0.04,
    opacity: 0.94,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    castShadow: false,
    specPower: 12,
    specStrength: 0,
    bump: 0.0,
  },
  // 結晶: 正面が透けて縁が詰まる。明るさではなく透過で他と区別する
  crystal: {
    defines: { SPECULAR: "", CRYSTAL: "", FACETS: "" },
    rimStrength: 1.3,
    emissive: 0.12,
    opacity: 0.95,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    castShadow: false,
    specPower: 200,
    specStrength: 1.0,
    bump: 0.012,
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
    specPower: 4,
    specStrength: 0,
    bump: 0,
  },
};

export function styleCastsShadow(style: SurfaceStyle): boolean {
  return STYLE_CONFIG[style].castShadow;
}

/**
 * 同じ材質でも「形の作り」で表面の割れ方が違う場合の枝分かれ。
 * 岩の塊(kit.rock)は皮膚と同じ "hide" で作られているが、
 * 鱗が並んでいてはただの大きなトカゲになる。ジオメトリを作る側が
 * 材質の中身を差し替えられるようにしておく。
 */
export type SurfaceVariant = "default" | "rock";

/** 変種ごとの、材質定義への上書き */
function applyVariant(config: StyleConfig, variant: SurfaceVariant): StyleConfig {
  if (variant === "rock") {
    const defines = { ...config.defines };
    delete defines.SCALES;
    defines.CRACKS = "";
    // 割れ目は鱗よりずっと粗いので、凹凸も深く取る
    return { ...config, defines, bump: 0.022 };
  }
  return config;
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

  get(style: SurfaceStyle, color: THREE.Color, variant: SurfaceVariant = "default"): THREE.ShaderMaterial {
    const key = `${style}:${variant}:${color.getHexString()}`;
    const cached = this.materials.get(key);
    if (cached) return cached;

    const config = applyVariant(STYLE_CONFIG[style], variant);
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
        uSpecPower: { value: config.specPower },
        uSpecStrength: { value: config.specStrength },
        uBump: { value: config.bump },
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
