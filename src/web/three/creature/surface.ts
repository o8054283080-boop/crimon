import * as THREE from "three";
import { ELEMENT_THEME, ElementTheme } from "../elementTheme.js";
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
  /**
   * 地肌。マットで柔らかい。
   * 既定は鱗も毛も持たない「なめらかな皮膚」で、鱗や毛皮が要る種別は
   * ビルダーの先頭で `kit.skin` を指定して切り替える(SkinKind を参照)。
   */
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

/**
 * 属性ごとの「体の質」。
 *
 * 属性の差を色相だけで付けると、同じ人形を6色に塗り替えただけに見える。
 * 実際に見分けが付くのは色ではなく**光の扱われ方**で、
 * 火は溝の奥から熱が透け、水は濡れて空を映し、電気は表面を電位が這い、
 * 闇は当たっていない面の光を吸う。ここはその強さを属性から決める。
 *
 * どれも加算合成に上乗せするので、値は「気づくが眩しくない」上限で抑える。
 * 明るくして目立たせようとしないこと(過去に画面が白飛びしている)。
 */
export interface SurfaceTraits {
  /** 溝の奥に残る熾火。陰になった側ほど目立つ(火) */
  ember: number;
  /** 縁と逆光で光を透かす厚み(草の葉・光・火) */
  translucency: number;
  /** 濡れた被膜。地色が沈み、鋭い映り込みと空の色が乗る(水) */
  wet: number;
  /** 表面を這う帯電の筋(電気) */
  charge: number;
  /** 光を吸う。光の当たらない面が黒へ落ちる(闇) */
  absorb: number;
}

/**
 * 属性ごとの「体の作り」。
 *
 * 属性テーマ(elementTheme.ts)はUIやエフェクトと共有する色の定義で、
 * そのまま地色にすると**どの属性も同じ明度・同じ彩度**の人形になる。
 * 実際にそうなっていて、光属性は全身が同じカーキ色の塊になっていた。
 *
 * ここは「その属性の生き物はどういう体をしているか」を1属性1行で決める場所。
 * 色相はテーマから受け継ぎ、濃さ・明るさ・部位の色・光の扱われ方だけを設計する。
 */
interface ElementSkin {
  /**
   * 地色の作り直し [色相ずらし, 彩度倍率, 明度倍率, 明度加算]。
   * テーマの shell と rim から機械的に作った色を、ここで属性の性格へ寄せる。
   */
  body: [number, number, number, number];
  /**
   * 角・爪・牙・鰭のケラチン色。
   * 地色が明るい属性(光)では**暗い**べきで、暗い属性では明るいべき。
   * 属性色に染めると胴と同化するので、ここは属性色から独立して指定する。
   */
  keratin: number;
  /** 毛皮・羽毛の彩度倍率。面積が大きいので、濃いと胴を食う */
  peltSat: number;
  /** 翼膜に透ける血の量。薄い膜は属性色ではなく肉の色をしている */
  flesh: number;
  /** 光の扱われ方 */
  traits: SurfaceTraits;
}

const NEUTRAL_SKIN: ElementSkin = {
  body: [0, 1, 1, 0],
  keratin: 0xded4bc,
  peltSat: 0.7,
  flesh: 0.28,
  traits: { ember: 0, translucency: 0.2, wet: 0.1, charge: 0, absorb: 0 },
};

const ELEMENT_SKIN: Record<keyof typeof ELEMENT_THEME, ElementSkin> = {
  // 冷えかけた炭。地色を暗く落とすことで、割れ目の奥の熾火が初めて「熱」に見える。
  // 全身が明るい赤だと、どこが熱いのか分からない只のトマトになる
  FIRE: {
    body: [0, 0.94, 0.82, 0],
    keratin: 0xe8dcc4,
    peltSat: 0.55,
    flesh: 0.36,
    traits: { ember: 1.0, translucency: 0.45, wet: 0, charge: 0.12, absorb: 0 },
  },
  // 濡れている。深い水色を保ったまま、上を向いた面だけが空を映す
  WATER: {
    body: [0, 1.06, 0.92, 0],
    keratin: 0xd7e3ea,
    peltSat: 0.62,
    flesh: 0.22,
    traits: { ember: 0, translucency: 0.35, wet: 1.0, charge: 0, absorb: 0 },
  },
  // 帯電。地色は黄ではなく**焼けた青銅**にする。
  // 体まで黄色いと、体表を走る電位の筋が地色に埋もれて見えなくなる
  ELECTRIC: {
    body: [-0.03, 1.0, 0.76, 0],
    keratin: 0xf2e8cc,
    peltSat: 0.58,
    flesh: 0.28,
    traits: { ember: 0.35, translucency: 0.25, wet: 0.1, charge: 1.0, absorb: 0 },
  },
  // 葉。彩度を上げて、光を通した時の緑が濁らないようにする
  GRASS: {
    body: [0.005, 1.22, 0.98, 0],
    keratin: 0xe0dcc0,
    peltSat: 0.6,
    flesh: 0.3,
    traits: { ember: 0, translucency: 0.85, wet: 0.3, charge: 0, absorb: 0 },
  },
  // 光。テーマの shell は鈍い黄土色で、そのまま塗ると泥人形になる。
  // 彩度を大きく抜いて明度を上げ、磁器のような白へ。差し色は角と爪の**濃い金**が担う
  LIGHT: {
    body: [-0.012, 0.5, 1.0, 0.21],
    keratin: 0x8a6a2c,
    peltSat: 0.62,
    flesh: 0.18,
    traits: { ember: 0.28, translucency: 1.0, wet: 0.18, charge: 0.1, absorb: 0 },
  },
  // 闇。暗くしすぎると形が読めなくなるので、地色はむしろ保ち、
  // 「暗さ」は光の当たらない面を沈める uAbsorb だけで作る
  DARK: {
    body: [0, 1.08, 1.0, 0.0],
    keratin: 0xc9c0d2,
    peltSat: 0.58,
    flesh: 0.26,
    traits: { ember: 0, translucency: 0.05, wet: 0.12, charge: 0, absorb: 1.0 },
  },
};

/** テーマの実体から属性を逆引きする(テーマは属性ごとの定数を共有している) */
function skinFor(theme: ElementTheme): ElementSkin {
  for (const key of Object.keys(ELEMENT_THEME) as (keyof typeof ELEMENT_THEME)[]) {
    if (ELEMENT_THEME[key] === theme) return ELEMENT_SKIN[key];
  }
  return NEUTRAL_SKIN;
}

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
  /** 属性ごとの体の質(色ではなく光の扱われ方) */
  traits: SurfaceTraits;
}

/**
 * 色相・彩度・明度を相対的にずらす。
 *
 * 部位ごとの色を「元の色に別の色を混ぜる」で作ると、混ぜた先の色に引っ張られて
 * 属性ごとの差が消える(何を混ぜても灰色に寄る)。HSLで動かせば、
 * 属性の色相を保ったまま「濃さ」と「明るさ」だけを部位ごとに変えられる。
 *
 * **HSLは必ずsRGB空間で扱うこと。** three.js の色管理は既定で有効なので、
 * `getHSL()` を引数なしで呼ぶと作業空間(リニア)のHSLが返る。
 * リニアの明度は人の目の感じ方とかけ離れていて、1.3倍のつもりが
 * 見た目では2倍以上明るくなる。実際にこれで腹が白く飛んだ。
 */
function tune(
  color: THREE.Color,
  hueShift: number,
  satScale: number,
  lightScale: number,
  lightOffset = 0,
  lightMax = 0.92,
): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl, THREE.SRGBColorSpace);
  const out = new THREE.Color();
  out.setHSL(
    (hsl.h + hueShift + 1) % 1,
    Math.min(1, Math.max(0, hsl.s * satScale)),
    Math.min(lightMax, Math.max(0, hsl.l * lightScale + lightOffset)),
    THREE.SRGBColorSpace,
  );
  return out;
}

/**
 * 部位の色が胴に埋もれないよう、明度の差を最低限だけ確保する。
 *
 * 属性が変わると地色の明度は0.28〜0.74まで動くので、部位の色を固定値で決めると
 * ある属性では映え、別の属性では同化する。実際に光属性で
 * **角・爪・鰭・翼が全部胴と同じカーキ色**になっていた。
 *
 * 色相と彩度はそのまま残し、明度だけを「余白の広いほう」へ逃がす。
 * 元々十分離れている属性では何もしない。
 */
function separate(part: THREE.Color, body: THREE.Color, gap: number): THREE.Color {
  const a = { h: 0, s: 0, l: 0 };
  const b = { h: 0, s: 0, l: 0 };
  part.getHSL(a, THREE.SRGBColorSpace);
  body.getHSL(b, THREE.SRGBColorSpace);
  const diff = a.l - b.l;
  if (Math.abs(diff) >= gap) return part;
  // 既に離れかけている向きを尊重し、真横に並んだ時だけ余白の広いほうへ
  const away = diff === 0 ? (b.l < 0.5 ? 1 : -1) : Math.sign(diff);
  const out = new THREE.Color();
  out.setHSL(a.h, a.s, Math.min(0.9, Math.max(0.06, b.l + away * gap)), THREE.SRGBColorSpace);
  return out;
}

export function paletteFor(theme: ElementTheme): CreaturePalette {
  const skin = skinFor(theme);
  const shell = theme.shell.clone();
  // テーマから機械的に作った地色を、属性ごとの「体の作り」で作り直す。
  // ブルームで白飛びしないよう、明るいのは光属性だけに許している
  const main = tune(shell.clone().lerp(theme.rim, 0.24), ...skin.body);
  return {
    main,
    dark: shell.clone().multiplyScalar(0.5).lerp(new THREE.Color(0x0d1020), 0.45),
    deep: shell.clone().multiplyScalar(0.28).lerp(new THREE.Color(0x07080f), 0.6),
    // 角・爪・牙・鰭。ケラチンは属性を持たない材質なので、属性色に染めない。
    // 一段だけ差し色を混ぜて帰属を残し、胴との明度差は separate が保証する
    // (指定した生成り色はそのまま使うと骨が白く浮くので、一段落として蝋の色にする)
    plate: separate(tune(new THREE.Color(skin.keratin).lerp(theme.rim, 0.14), 0, 0.9, 0.72), main, 0.2),
    // 金属は属性色に染めすぎず、鋼の地色を残す。
    // 暗くしすぎると装甲が「焦げた塊」に見えるので、中明度を保って
    // 明暗はハイライトと映り込みで作る
    metal: separate(new THREE.Color(0x7d8698).lerp(theme.shell, 0.28).multiplyScalar(0.72), main, 0.12),
    // 布は染めたもの。地肌より彩度が低く、わずかに沈む
    cloth: tune(main, 0.02, 0.62, 0.84),
    // 毛皮・羽毛・たてがみ。同じ属性色のままだと胴に埋もれて、
    // せっかくの面積が効かない。日に灼けた獣毛のように
    // 彩度を落とし、胴との明暗差で読ませる
    fur: separate(tune(main, 0.015, skin.peltSat, 1.34, 0, 0.72), main, 0.15),
    accent: theme.rim.clone().multiplyScalar(0.85),
    glow: theme.core.clone(),
    // 翼膜は薄く血が透ける。属性色のままだと「胴と同じ色の板」になるので、
    // 赤側へ寄せて肉の膜であることを示す
    membrane: shell.clone().lerp(theme.rim, 0.42).lerp(new THREE.Color(0x9c3a34), skin.flesh),
    traits: skin.traits,
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
varying vec3 vBody;
varying vec3 vBodyNormal;

// 骨による変形。SkinnedMesh に対して three.js が USE_SKINNING を立て、
// bindMatrix / boneTexture も自動で流し込む。素の Mesh では丸ごと無効になる
#include <skinning_pars_vertex>

void main() {
  // three.js のスキニングのチャンクは transformed / objectNormal を書き換える約束なので、
  // その名前で受けてから使う
  vec3 transformed = position;
  vec3 objectNormal = normal;

  // バインド姿勢(スキニング前)の座標と法線。
  //
  // rig.ts は動かない部位を「rig.core から見た座標」へ焼き込んでから1本の
  // スキンメッシュに束ねている。つまり素の position / normal は
  // **その個体の体の座標系**(足元が原点、正面が -Z、上が +Y)にそろっている。
  // ワールド座標は個体の立ち位置と向きで回るので、腹と背を見分ける用には使えない。
  // 姿勢が変わっても動かないこの座標を使うことで、
  // 腹の白さも部位ごとの塗り分けもモーション中に泳がない。
  vBody = position;
  vBodyNormal = normalize(normal);

  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>

  vLocal = transformed;
  vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * objectNormal);
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
/** 腹側の色(明るく彩度を落とした地色) */
uniform vec3 uBelly;
/** 背側の色(暗く彩度を上げた地色) */
uniform vec3 uDorsal;
/** 腹背の塗り分けの強さ。材質ごとに変える(金属や結晶では効かせない) */
uniform float uCounter;
/** 属性ごとの体の質。SurfaceTraits を参照 */
uniform float uEmber;
uniform float uTranslucency;
uniform float uWet;
uniform float uCharge;
uniform float uAbsorb;
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
varying vec3 vBody;
varying vec3 vBodyNormal;

${SIMPLEX_NOISE_3D}

/**
 * 腹側の向き。真下と正面のあいだを向く。
 *
 * 四足は腹が下を向き、二足は胸が前を向く。その両方を1本の向きで拾うために
 * 下と前の中間に置いてある。四足でも喉と胸は前下がりなので、
 * 「腹・喉・顎の下・脚の内側」がまとめて明るくなる。
 */
const vec3 VENTRAL_DIR = vec3(0.0, -0.906, -0.423);

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

/**
 * 鱗。互い違いに並んだ、横に広く縦に浅い盛り上がり。
 *
 * 立方体のセルをそのまま丸めると、粒が均等に並んで「気泡緩衝材」に見える。
 * 実際の鱗は横に広く、上下に重なって並んでいるので、Y方向の目を細かく取る。
 * さらに一枚ごとの高さを揺らして、規則的な繰り返しに見えないようにする。
 */
float scaleHeight(vec3 p) {
  vec3 q = p * vec3(11.0, 17.0, 11.0);
  // 段ごとに半個ずらす。格子のままだと市松模様に見えて生き物にならない
  q.xz += mod(floor(q.y), 2.0) * 0.5;
  vec3 f = fract(q) - 0.5;
  float d = max(abs(f.x), max(abs(f.y), abs(f.z)));
  // 頂点を平らにしすぎない。中央から縁までなだらかに落として、
  // 溝(セルの境目)だけがはっきり残るようにする
  float dome = smoothstep(0.5, 0.14, d);
  // 一枚ごとの高さの差。これが無いと、どの角度から見ても同じ粒に見える
  return dome * (0.55 + (snoise(p * 7.0) * 0.5 + 0.5) * 0.7);
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

/**
 * なめらかな皮膚。獣・粘体・人型の地肌。
 * 鱗のような並びを持たず、ゆるい皺と細かい毛穴だけがある。
 */
float skinHeight(vec3 p) {
  return (snoise(p * 8.5) * 0.66 + snoise(p * 27.0) * 0.34) * 0.5 + 0.5;
}

/** 粘体のうねり。表面張力で丸まった、大きく柔らかい起伏 */
float gelHeight(vec3 p) {
  return snoise(p * 5.5) * 0.5 + 0.5;
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
#elif defined(GEL)
  return gelHeight(p);
#else
  return skinHeight(p);
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

  // --- 腹背の塗り分け -------------------------------------------------
  // 実在の動物はほぼ例外なく「背が暗く腹が明るい」。上から来る光を打ち消して
  // 立体を消す保護色だが、絵として見た時には逆に「設計された生き物」に見える。
  // 単色の塊が、腹・喉・脚の内側で色が変わるだけで急に生物になる。
  //
  // 光の当たり方ではなく**地色そのもの**を変えるのが要点。陰影で暗くしただけでは
  // 「影が濃い」としか読めず、模様として認識されない。
  float ventral = dot(vBodyNormal, VENTRAL_DIR);
  // 境目をノイズで崩す。まっすぐな帯だと塗り分けたペンキに見える
  ventral += (blotch - 0.5) * 0.30;
  float belly = smoothstep(0.14, 0.86, ventral) * uCounter;
  float dorsal = smoothstep(-0.02, -0.72, ventral) * uCounter;

  vec3 albedo = mix(uColor, uBelly, belly);
  albedo = mix(albedo, uDorsal, dorsal);

  // --- 色そのもののゆらぎ ---------------------------------------------
  // 明るさだけを揺らすと、単色の面に灰色の汚れを乗せたようにしか見えない。
  // 生き物の皮膚は場所によって色素の濃さが違うので、彩度と色相ごと動かす。
  // 混ぜ先には腹と背の色をそのまま使う。無関係な色を混ぜないので、
  // どれだけ揺らしても属性の色から外れない
  float mottle = snoise(vWorld * 2.3 + 11.0);
  albedo = mix(albedo, uDorsal, max(0.0, mottle) * 0.26);
  albedo = mix(albedo, uBelly, max(0.0, -mottle) * 0.16);

  albedo *= 0.84 + blotch * 0.32;
  albedo *= 0.93 + grain * 0.14;
  albedo *= 0.78 + height01 * 0.30;
  // 下向きの面を沈める擬似AO。腹側は地色で既に分離しているので、
  // ここまで暗くすると塗り分けを打ち消してしまう。控えめに残す
  albedo *= 0.78 + upness * 0.30;

  #ifdef SCALES
    // 爬虫類の鱗。境目が落ちることでパーツの丸みも読み取りやすくなる
    albedo *= 0.78 + height * 0.44;
  #endif

  #ifdef SKIN
    // なめらかな地肌。模様を持たせず、皺のぶんだけ薄く濃淡を付ける。
    // ここを強くすると、鱗でも毛でもない獣の胴が「編み物」に見えてしまう
    albedo *= 0.90 + height * 0.18;
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

  // 濡れた体は地色が沈む。水を含んだ布や濡れた石と同じで、
  // 明るさは失われ、そのぶんが鋭い映り込みに置き換わる
  albedo *= 1.0 - uWet * 0.18;

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

  #ifdef GEL
    // 粘体。硬い面を持たず、内側に濁りが漂う。
    // 結晶ほど透かすと中身が空に見えるので、向こうがうっすら見える程度に留める。
    // 明るさではなく透過とぬめりで質感を出すので、ブルームの負担は増えない
    float wet = pow(1.0 - facing, 2.2);
    float murk = snoise(vLocal * 3.0 + vec3(0.0, uTime * 0.22, 0.0)) * 0.5 + 0.5;
    // 内側の濁りが、体の奥のほうで固まって見える
    color += uColor * murk * 0.20;
    // 縁が厚く見えるのは、そこだけ粘体を長く通り抜けて見ているため
    color += mix(uRim, vec3(1.0), 0.35) * wet * 0.30;
    alpha = uOpacity * (0.70 + wet * 0.30);
  #endif

  #ifdef CRYSTAL
    // 結晶は「向こうが透けること」で他の材質と区別する。
    // 明るくして目立たせるのではなく、正面を薄く・縁を厚く見せることで
    // 中身の詰まったガラスの塊にする(加算合成の飽和を増やさない)。
    float edge = pow(1.0 - facing, 2.0);
    // 内部の層。見る向きでずれるので、中に奥行きがあるように見える
    float inner = sin(dot(vLocal, vec3(11.0, 17.0, 9.0)) - facing * 7.0 + uTime * 0.35) * 0.5 + 0.5;
    vec3 core = mix(uColor * 0.30, uGlow * 0.55, inner * 0.6);
    color = core + albedo * (0.18 + ramp(key) * 0.34) + uRim * edge * 0.85;
    // 面の稜線だけが白く立つ。カットガラスの角の見え方
    color += vec3(1.0) * pow(height, 8.0) * 0.16;
    // 正面は透け、縁は詰まって見える。これが厚みの手がかりになる。
    // 明るさではなく「向こうが見えること」で他の材質と差をつけるので、
    // ブルームに投げ込む光の量は増えない
    alpha = uOpacity * (0.32 + edge * 0.68);
  #endif

  // --- 属性ごとの体の質 -----------------------------------------------
  // ここまでは色相が違うだけで、火も水も同じ材質の色違いだった。
  // 属性を「別の生き物」に見せるのは色ではなく光の扱われ方なので、
  // 最後にその差を上乗せする。どれも加算なので、値は控えめに抑えてある
  // (明るくして目立たせようとしないこと)。

  // 熾火。溝の奥ほど、そして光の当たらない面ほど赤く残る。
  // 明るい面で光らせると全身が発光体になってしまうので、影の側だけに出す
  if (uEmber > 0.001) {
    float pit = 1.0 - smoothstep(0.10, 0.60, height);
    float shade = 1.0 - smoothstep(0.05, 0.55, key);
    float breathe = 0.72 + 0.28 * sin(uTime * 1.1 + vBody.y * 3.0);
    color += uGlow * uEmber * pit * shade * breathe * 0.16;
  }

  // 厚みを透かす。逆光側の縁が内側から色づき、体が中身の詰まった
  // 一枚の材に見える。葉・炎・光の体はこれがあるかどうかで質が変わる
  if (uTranslucency > 0.001) {
    float thickness = pow(1.0 - facing, 2.6);
    float behind = max(dot(-normal, KEY_DIR), 0.0);
    color += albedo * mix(uRim, uGlow, 0.35) * uTranslucency * (thickness * 0.55 + behind * 0.30);
  }

  // 濡れた被膜。鋭いハイライトと、上を向いた面に映る空。
  // 拡散の上に薄い層が1枚乗るので、地色は先に少し沈めてある
  if (uWet > 0.001) {
    float coat = pow(max(dot(normal, normalize(KEY_DIR + viewDir)), 0.0), 110.0);
    color += mix(vec3(1.0), uRim, 0.28) * min(coat, 1.0) * uWet * 0.42;
    color += vec3(0.20, 0.31, 0.48) * uWet * fresnel * smoothstep(-0.2, 0.8, normal.y) * 0.30;
  }

  // 帯電。細い筋が体表を這う。面積が小さいので薄くても目に付く
  if (uCharge > 0.001) {
    float arc = snoise(vBody * 9.0 + vec3(0.0, uTime * 1.7, uTime * 0.6));
    float spark = smoothstep(0.80, 0.97, abs(arc));
    color += mix(uGlow, uRim, 0.4) * spark * uCharge * 0.30;
  }

  // 吸光。光の当たっていない面が黒へ落ちる。
  // 明るくせずに「暗さの質」だけで属性を語れる、いちばん安全な手
  if (uAbsorb > 0.001) {
    color *= 1.0 - uAbsorb * 0.34 * (1.0 - smoothstep(0.02, 0.50, key));
  }
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

/**
 * 地色から「腹側の色」を作る。
 *
 * 明るくするだけでは色が白茶けて、同じ色のライトを当てただけに見える。
 * 実際の腹は色素そのものが薄いので、**彩度を落として明度を上げる**。
 * さらにわずかに暖色へ寄せると、皮膚の下の血の色が透けたように見える。
 */
function bellyOf(color: THREE.Color): THREE.Color {
  // 色相をほんの少し暖色側へ。生々しさはこの数度で決まる
  return tune(color, 0.015, 0.55, 1.34, 0.10, 0.56);
}

/** 地色から「背側の色」を作る。暗く、彩度は上げる(影ではなく色素の濃さ) */
function dorsalOf(color: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl, THREE.SRGBColorSpace);
  const out = new THREE.Color();
  out.setHSL((hsl.h + 0.985) % 1, Math.min(1, hsl.s * 1.18 + 0.05), hsl.l * 0.62, THREE.SRGBColorSpace);
  return out;
}

interface StyleConfig {
  defines: Record<string, string>;
  /**
   * 腹背の塗り分けの強さ。
   * 生き物の地肌と毛皮でいちばん強く、硬い材質になるほど弱い。
   * 金属や結晶は色素を持たないので効かせない(効かせると塗装に見える)。
   */
  counter: number;
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
  // 地肌: ハイライトは広く弱い。生き物の湿り気だけを感じさせる。
  // 既定は模様を持たないなめらかな皮膚(鱗は kit.skin = "scale" で付ける)
  hide: {
    defines: { SKIN: "", SPECULAR: "" },
    counter: 1.0,
    rimStrength: 0.55,
    emissive: 0,
    opacity: 1,
    transparent: false,
    side: THREE.FrontSide,
    depthWrite: true,
    castShadow: true,
    specPower: 8,
    specStrength: 0.14,
    bump: 0.005,
  },
  // 毛皮・羽毛: ハイライトを持たず、光が繊維の中で散って柔らかく減衰する
  fur: {
    defines: { STRANDS: "", WRAP: "", SOFT: "" },
    counter: 0.92,
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
    counter: 0.34,
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
    counter: 0.22,
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
    counter: 0.4,
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
    counter: 0.0,
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
    counter: 0.0,
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
    counter: 0.0,
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
 * 「地肌が何でできているか」。
 *
 * 材質(SurfaceStyle)はパーツごとの指定なので、1体あたり数十箇所に散っている。
 * 一方で「鱗か、毛皮か、粘体か」は個体まるごとの性質で、パーツごとに違わない。
 * この2つを同じ軸で表そうとすると、ドラゴンの鱗を狼にも塗ってしまう。
 * 肌質は個体の軸として分け、ビルダーの先頭で1回だけ指定する。
 *
 * 既定は "smooth"。鱗や毛皮は、それが要る種別だけが明示的に選ぶ。
 * 逆(既定を鱗にする)にすると、指定を忘れた種別が全部トカゲになる。
 */
export type SkinKind =
  /** なめらかな地肌。獣・人型・虫の胴。模様を持たない */
  | "smooth"
  /** 爬虫類の鱗。ドラゴンや蛇 */
  | "scale"
  /** 毛や羽毛に覆われた体。獣・鳥 */
  | "pelt"
  /** 粘体。半透明で、内側に濁りが漂う */
  | "gel";

/**
 * 材質の中身の差し替え。
 * 個体の肌質(SkinKind)のほか、形の作りによる差し替え("rock")も扱う。
 * 岩の塊(kit.rock)は皮膚と同じ "hide" で作られているが、
 * 鱗が並んでいてはただの大きなトカゲになる。
 */
export type SurfaceVariant = SkinKind | "rock";

/** 変種ごとの、材質定義への上書き。地肌("hide")にだけ効く */
function applyVariant(config: StyleConfig, variant: SurfaceVariant): StyleConfig {
  if (variant === "smooth") return config;

  // 地肌の模様は排他。既定の SKIN を外してから、その肌質のものを入れる
  const defines = { ...config.defines };
  delete defines.SKIN;

  switch (variant) {
    case "rock":
      // 割れ目は鱗よりずっと粗いので、凹凸も深く取る
      return { ...config, defines: { ...defines, CRACKS: "" }, bump: 0.022 };
    case "scale":
      return { ...config, defines: { ...defines, SCALES: "" }, bump: 0.009 };
    case "pelt":
      // 毛に覆われた地肌。硬い段の付いた陰影にせず、光を柔らかく減衰させる
      return {
        ...config,
        defines: { ...defines, STRANDS: "", SOFT: "" },
        bump: 0.006,
        specStrength: 0,
        rimStrength: 0.7,
      };
    case "gel":
      // 粘体。半透明にするので、材質の設定そのものを差し替える
      return {
        ...config,
        defines: { ...defines, GEL: "", SPECULAR: "" },
        transparent: true,
        opacity: 0.92,
        // ぬめった濡れ肌のハイライト。金属ほど点にはならない
        specPower: 42,
        specStrength: 0.5,
        rimStrength: 0.8,
        bump: 0.006,
      };
    default:
      return config;
  }
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

  get(style: SurfaceStyle, color: THREE.Color, variant: SurfaceVariant = "smooth"): THREE.ShaderMaterial {
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
        uBelly: { value: bellyOf(color) },
        uDorsal: { value: dorsalOf(color) },
        uCounter: { value: config.counter },
        uEmber: { value: this.palette.traits.ember },
        uTranslucency: { value: this.palette.traits.translucency },
        uWet: { value: this.palette.traits.wet },
        uCharge: { value: this.palette.traits.charge },
        uAbsorb: { value: this.palette.traits.absorb },
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
