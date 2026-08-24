import * as THREE from "three";
import { ELEMENT_THEME, ElementTheme } from "../elementTheme.js";
import { SIMPLEX_NOISE_3D } from "../shaderChunks.js";
import { SURFACE_LIGHT_CHUNK } from "./shaderChunks.js";

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
    body: [0, 1.14, 0.70, 0],
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
    body: [-0.022, 0.72, 0.64, 0],
    keratin: 0xf2e8cc,
    peltSat: 0.58,
    flesh: 0.28,
    traits: { ember: 0.35, translucency: 0.25, wet: 0.1, charge: 1.0, absorb: 0 },
  },
  // 葉。彩度を上げて、光を通した時の緑が濁らないようにする
  GRASS: {
    body: [0.005, 1.12, 1.16, 0.02],
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
    body: [0, 0.92, 0.86, 0.0],
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
  // 既に離れかけている向きを尊重し、真横に並んだ時だけ余白の広いほうへ。
  //
  // ただし**その先に余白が無い時は反対へ逃がす**。地色が暗い属性(草・闇)では
  // 「胴より暗い部位」を作ろうとした結果、押し下げた先が黒く潰れて
  // 部位が分かれるどころか輪郭ごと消えていた(草属性の衣が真っ黒になっていた)。
  // 分離が目的なのだから、どちら向きに離すかは譲ってよい。
  let away = diff === 0 ? 0 : Math.sign(diff);
  if (away < 0 && b.l - gap < 0.22) away = 1;
  if (away > 0 && b.l + gap > 0.84) away = -1;
  if (away === 0) away = b.l < 0.5 ? 1 : -1;
  const out = new THREE.Color();
  out.setHSL(a.h, a.s, Math.min(0.9, Math.max(0.12, b.l + away * gap)), THREE.SRGBColorSpace);
  return out;
}

/**
 * 影になる部位の色を、地色から相対で作る。
 *
 * テーマの shell から機械的に作ると、地色が暗い属性(草・闇)ではほぼ黒になり、
 * 腹も関節も口の中も同じ「黒い穴」になる。実際に草属性の胴が、
 * 色の読めない暗い塊になっていた。
 *
 * 明度に下限を置いて必ず色が残るようにし、彩度はむしろ上げる。
 * 影が濁って見えるのは光が減るからであって、色素が抜けるからではない。
 */
function shade(color: THREE.Color, scale: number, floor: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl, THREE.SRGBColorSpace);
  const out = new THREE.Color();
  out.setHSL(
    (hsl.h + 0.985) % 1,
    Math.min(1, hsl.s * 1.12 + 0.04),
    Math.max(floor, hsl.l * scale),
    THREE.SRGBColorSpace,
  );
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
    // 腹・関節・溝。テーマの shell からではなく**作り直した後の地色**から起こす。
    // shell から作ると、地色を属性ごとに設計した意味が消えるうえ、
    // 暗い属性では黒に張り付いて部位の区別が付かなくなる
    dark: shade(main, 0.54, 0.17),
    deep: shade(main, 0.32, 0.09),
    // 角・爪・牙・鰭。ケラチンは属性を持たない材質なので、属性色に染めない。
    // 一段だけ差し色を混ぜて帰属を残し、胴との明度差は separate が保証する
    // (指定した生成り色はそのまま使うと骨が白く浮くので、一段落として蝋の色にする)
    plate: separate(tune(new THREE.Color(skin.keratin).lerp(theme.rim, 0.14), 0, 0.9, 0.72), main, 0.2),
    // 金属は属性色に染めすぎず、鋼の地色を残す。
    // 暗くしすぎると装甲が「焦げた塊」に見えるので、中明度を保って
    // 明暗はハイライトと映り込みで作る
    metal: separate(new THREE.Color(0x7d8698).lerp(theme.shell, 0.28).multiplyScalar(0.72), main, 0.18),
    // 布は染めたもの。地肌より彩度が低く、はっきり沈む。
    // 地肌と同じ明るさだと、ローブなのか素肌なのか見分けが付かない
    cloth: separate(tune(main, 0.02, 0.76, 0.72), main, 0.16),
    // 毛皮・羽毛・たてがみ。同じ属性色のままだと胴に埋もれて、
    // せっかくの面積が効かない。日に灼けた獣毛のように
    // 彩度を落とし、胴との明暗差で読ませる
    fur: separate(tune(main, 0.015, skin.peltSat, 1.34, 0, 0.72), main, 0.15),
    accent: theme.rim.clone().multiplyScalar(0.85),
    glow: theme.core.clone(),
    // 翼膜。地色ではなく**作り直した後の地色**から起こす。
    // テーマの shell から直に作ると、胴の色を属性ごとに設計した意味が消えて
    // 翼だけ元の色に取り残される(白い光属性のドラゴンに黄土色の翼が生えていた)。
    // そのうえで赤側へ寄せ、薄く血が透ける肉の膜であることを示す
    membrane: tune(main, 0, 0.9, 1.0, 0.04).lerp(new THREE.Color(0x9c3a34), skin.flesh),
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
  // 模様はワールドの「向き」で描くが、原点はその個体の足元へ移す。
  //
  // 向きをワールドに揃えるのは、法線の摂動をこの座標の勾配から取るため
  // (座標と法線が別の空間だと、向きを変えた個体で凹凸が裏返る)。
  // 一方で原点まで world のままにすると、個体が踏み込んだ分だけ模様が
  // 体の上を滑っていく。鱗が皮膚の上を泳ぐのは、静止画では気づかないが
  // 動くと一目で作り物に見える。並進だけを引けば、勾配は変わらないまま
  // 模様が皮膚に貼り付く。
  vWorld = worldPosition.xyz - modelMatrix[3].xyz;
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
${SURFACE_LIGHT_CHUNK}

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
 * 面に沿った2軸を選ぶための重み。法線に近い軸ほど小さくなる。
 *
 * 鱗や織り目のように「並び」を持つ模様を3次元の格子で作ると、
 * 斜めの面はその格子を斜めに切ることになり、**どこを見ても
 * 正方形が編み込まれた「かご」**に見える。実際にドラゴンの胸が
 * 籐のかごになっていた。面に沿った2軸だけで模様を組み、
 * 3枚を法線で混ぜれば、どの向きの面でも「面の上に並んだ鱗」になる。
 *
 * 指数を高くして混ざる帯を狭くしてある。広く混ぜると2枚の格子が
 * 重なった領域が広がり、結局かご編みに戻る。
 */
vec3 planarWeights(vec3 n) {
  vec3 w = abs(n);
  w = w * w;
  w = w * w;
  return w / max(0.0001, w.x + w.y + w.z);
}

/**
 * 鱗1枚。**平らな面と、その縁**でできている。
 *
 * 以前はここを丸い盛り上がり(ドーム)で作っていた。並べると、鱗ではなく
 * **窪みの並んだゴルフボール**にしか見えない。丸い高さは中心から縁まで
 * 連続して落ちるので、1枚と隣の1枚の境目がどこにも無いためで、
 * 高さをいくら強くしても「粒の集まり」から抜け出せない。
 *
 * 参考にした高レアのカードで効いているのは、1枚1枚に縁があること。
 * 面そのものは平らでよく、**縁だけで情報量が出る**。
 * だからここは、内側を平らな台地にし、外周に細い稜を立て、
 * 隣との間を溝まで落とす、という3つの段で作る。
 */
float scaleCell(vec2 uv) {
  // 段ごとに半個ずらす。格子のままだと市松模様に見えて生き物にならない
  uv.x += mod(floor(uv.y), 2.0) * 0.5;
  vec2 f = fract(uv) - 0.5;
  // 鱗の輪郭は丸い。角のある距離(max)で測ると、そのままタイルになる。
  // 縦を詰めて「横に広い」形にする
  float d = length(f * vec2(1.0, 1.28));
  // 1枚の面。内側では高さが変わらないので、光が均一に返って「板」に見える
  float face = smoothstep(0.60, 0.44, d);
  // 縁の稜。輪郭のすぐ内側にだけ立つ細い帯。
  // 2つの smoothstep を掛けて帯を作る(段を作らないので勾配は連続のまま)
  float ridge = smoothstep(0.62, 0.52, d) * smoothstep(0.38, 0.50, d);
  // 上の一枚が下の一枚に被さる。下側の縁だけ深く落として重なりを作る。
  // 溝が上下で同じ深さだと、生えている向きが読めない
  float overlap = smoothstep(0.06, 0.42, f.y) * 0.30;
  return clamp(face * 0.62 + ridge * 0.52 - overlap, 0.0, 1.0);
}

/**
 * 鱗。面に沿った並びを法線で選び、列そのものを低い周波数で曲げる。
 * まっすぐな列は体の丸みを無視するので、平らなタイル貼りに見える。
 */
float scaleHeight(vec3 p, vec3 n) {
  // 列を波打たせる。体の丸みに沿って流れているように見せるための歪み
  vec3 warp = vec3(snoise(p * 2.4), snoise(p * 2.4 + 19.0), snoise(p * 2.4 - 23.0));
  vec3 q = (p + warp * 0.045) * vec3(13.0, 19.0, 13.0);
  vec3 w = planarWeights(n);
  float h = scaleCell(q.zy) * w.x + scaleCell(q.xz) * w.y + scaleCell(q.xy) * w.z;
  // 一枚ごとの高さの差。これが無いと、どの角度から見ても同じ粒に見える。
  // **振れ幅は狭くしてある。** 色の側で「溝」と「縁の稜」を高さの閾値で
  // 拾っているので、ここで大きく揺らすと閾値がまたいで縁の線が途切れる
  return h * (0.74 + (snoise(p * 7.0) * 0.5 + 0.5) * 0.42);
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

/**
 * 毛の流れ。
 *
 * 細い筋を1段だけ描くと、遠目には均一なノイズに潰れて
 * **つるりとしたゴムの塊**にしか見えない(狼の胴が紫のグミになっていた)。
 * 実際の毛皮でいちばん目に付くのは1本ずつの毛ではなく、
 * 毛が寄って出来た「房」の陰影。粗い房と、その中の毛束の2段で作る。
 *
 * どちらもY方向の目を粗く取ってあるので、模様は縦へ長く流れる。
 * 毛は生えた向きに寝ているので、これが無いと綿のかたまりになる。
 *
 * **そのうえで房に縁を付ける。** 鱗で効いたのと同じ理屈で、
 * なだらかな濃淡を重ねただけでは「粒の集まり」から抜け出せない。
 * 房と房の境目に溝が落ち、そのすぐ内側で縁の毛が起きて光を拾う。
 * この2本の線があると、面が平らでも1房ずつを数えられる。
 *
 * 境目は房のノイズの**零点**で取る。閉じた曲線になるので、
 * 1本の等高線がそのまま1房の輪郭になり、大小が自然に混ざる。
 */
float strandPattern(vec3 p) {
  // 房。毛が寄って出来た大きな塊
  float lock = snoise(p * vec3(7.5, 3.4, 7.5));
  // 房の中の毛束。房そのものの位置で歪ませ、房に沿って流れるようにする
  float tuft = snoise(vec3(p.x * 26.0, p.y * 5.5, p.z * 26.0) + lock * 0.9) * 0.5 + 0.5;
  // 房の輪郭。零点からの距離で溝と稜を作る。
  // **帯は法線の摂動の刻み幅(0.012)より広く取ること。** これより細いと
  // 勾配を取る4点が溝をまたいでしまい、凹凸が線ではなくちらつく粒になる
  float outline = abs(lock);
  float groove = 1.0 - smoothstep(0.0, 0.18, outline);
  float crest = smoothstep(0.15, 0.34, outline) * smoothstep(0.62, 0.40, outline);
  return clamp((lock * 0.5 + 0.5) * 0.42 + tuft * 0.38 + crest * 0.22 - groove * 0.26, 0.0, 1.0);
}

/**
 * 織り目。
 *
 * 縦横の縞を掛け合わせると**方眼紙**になる。実際の布で目に付くのは
 * 格子ではなく、斜めに走る畝(綾織り)と、糸のむらによる不均一さ。
 * 面に沿った2軸で斜めの畝を作り、低い周波数のむらで濃さを揺らす。
 */
float weaveCell(vec2 uv) {
  // 斜めに走る主の畝と、それに直交する細い糸目
  float twill = sin((uv.x + uv.y * 0.62) * 6.2831);
  float thread = sin((uv.x * 0.5 - uv.y) * 6.2831 * 2.0);
  return (twill * 0.62 + thread * 0.38) * 0.5 + 0.5;
}

float weavePattern(vec3 p, vec3 n) {
  vec3 q = p * 46.0;
  vec3 w = planarWeights(n);
  float h = weaveCell(q.zy) * w.x + weaveCell(q.xz) * w.y + weaveCell(q.xy) * w.z;
  // 糸のむら。均一な畝だけだと機械織りのビニールに見える
  return mix(h, snoise(p * 9.0) * 0.5 + 0.5, 0.30);
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
float surfaceHeight(vec3 p, vec3 n) {
#if defined(CRACKS)
  return crackHeight(p);
#elif defined(SCALES)
  return scaleHeight(p, n);
#elif defined(STRANDS)
  return strandPattern(p);
#elif defined(FACETS)
  return facetHeight(p);
#elif defined(STREAKS)
  return brushedStreak(p);
#elif defined(WEAVE)
  // 布は「織り目」と「襞」の2段でできている。
  //
  // 以前はここへ高い周波数の粒を重ねていたが、遠目には灰色に潰れるだけで、
  // 布らしさには何も寄与していなかった。布が布に見えるのは、
  // 重力で縦に長く落ちる襞のほう。縦の目を粗く取って、下へ伸ばす。
  // 織り目と入れ替えたのでノイズを叩く回数は変わっていない
  return weavePattern(p, n) * 0.42
       + (snoise(vec3(p.x * 9.0, p.y * 1.6, p.z * 9.0)) * 0.5 + 0.5) * 0.58;
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
    surfaceHeight(p + vec3(e, 0.0, 0.0), n) - h0,
    surfaceHeight(p + vec3(0.0, e, 0.0), n) - h0,
    surfaceHeight(p + vec3(0.0, 0.0, e), n) - h0
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
  // 発光部は**面積を狭く、そのぶん強く**。
  //
  // 面の全体を同じ明るさで光らせていた。発光色(uGlow)はどの属性でも
  // ほぼ白なので、塊ごとブルームに拾われて滲み、目も宝珠も
  // 「白い光の玉」になって形が消えていた。属性の色も一緒に消える。
  //
  // こちらを向いた中心だけを白熱させ、外へ行くほど属性の色へ落とす。
  // 中心は前より明るいが、出る面積が狭く縁が沈むので、
  // 発光の総量はむしろ減っている(加算合成の飽和には効かない)。
  float hotspot = pow(facing, 1.6);
  vec3 emit = mix(uRim, uGlow, hotspot);
  vec3 color = emit * (0.42 + hotspot * 0.78) * (1.0 + 0.18 * sin(uTime * 3.4));
  color += uRim * fresnel * 0.5;
#else
  // --- 起伏 ----------------------------------------------------------
  // 材質ごとの高さ場を1回だけ求め、色の濃淡と法線の傾きの両方に使う。
  // これで「模様の暗い所」と「光が当たらない所」が一致し、
  // 光の向きが変わると鱗や割れ目の影も一緒に動く。
  float height = surfaceHeight(vWorld, geoNormal);
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

  // 半球光。暗部が潰れないようにするだけでなく、**暗部を青くする**役目も持つ
  // (SHADOW_LOW / SHADOW_HIGH は creature/shaderChunks.ts)
  vec3 ambient = hemisphereAmbient(normal);

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
  // 腹はゆるく広く、背はきっぱりと。境目を左右で非対称にすると、
  // 「上から塗料をかけた」ではなく「腹側の色素が薄い」ように見える
  float belly = smoothstep(0.04, 0.74, ventral) * uCounter;
  float dorsal = smoothstep(-0.06, -0.62, ventral) * uCounter;

  vec3 albedo = mix(uColor, uBelly, belly);
  albedo = mix(albedo, uDorsal, dorsal);

  // --- 色そのもののゆらぎ ---------------------------------------------
  // 明るさだけを揺らすと、単色の面に灰色の汚れを乗せたようにしか見えない。
  // 生き物の皮膚は場所によって色素の濃さが違うので、彩度と色相ごと動かす。
  // 混ぜ先には腹と背の色をそのまま使う。無関係な色を混ぜないので、
  // どれだけ揺らしても属性の色から外れない。
  //
  // 大きさの違う2つを重ねるのが要点。1つだけだと迷彩の斑になり、
  // 生き物ではなく「塗り分けた布」に見える
  float mottle = snoise(vWorld * 2.1 + 11.0);
  float fleck = snoise(vWorld * 8.5 - 4.0);
  albedo = mix(albedo, uDorsal, max(0.0, mottle) * 0.30 + max(0.0, fleck) * 0.13);
  albedo = mix(albedo, uBelly, max(0.0, -mottle) * 0.22 + max(0.0, -fleck) * 0.08);

  // 明暗のゆらぎは色のゆらぎより弱くする。強いと迷彩に見える
  albedo *= 0.90 + blotch * 0.20;
  albedo *= 0.94 + grain * 0.12;
  // 体の下ほど暗く。ただし**上を明るくはしない**。
  // 上へ加算すると、背を暗く塗った意味が消えて「背が明るい生き物」になる
  //
  // **背側では持ち上げを弱める。** 背は上を向いているので、この2行と
  // キーライトの3つが同時に効き、せっかく暗く塗った背が明るく戻ってしまう。
  // 実際に狼の背と脇腹が同じ明るさになり、腹背の塗り分けが消えていた
  float lift = 1.0 - dorsal * 0.62;
  albedo *= 0.80 + height01 * 0.21 * lift;
  // 下向きの面を沈める擬似AO。同じ理由で、上向きの面は素通しに留める
  albedo *= 0.82 + upness * 0.19 * lift;

  #ifdef SCALES
    // 爬虫類の鱗。**面には濃淡を付けない。**
    // 面まで塗り分けると、1枚が丸く膨らんで見えて「並んだ粒」に戻る。
    // 1枚1枚を数えられるようにするのは、境目の溝と縁に乗る光の2本の線だけ。
    //
    // 高さの低いほうが隣との溝、高いほうが縁の稜なので、
    // ひとつの高さ場から両方を閾値で取り出せる(サンプルを増やさない)
    //
    // 引いた絵では線を寝かせる。1枚は 1/16 ワールド単位ほどなので、
    // 画面上で数画素まで小さくなると線がちらつく粒に化ける
    float scaleLod = detailFade(vWorld, 0.062);
    float crease = (1.0 - smoothstep(0.0, 0.26, height)) * scaleLod;
    float lipLit = smoothstep(0.74, 0.98, height) * scaleLod;
    albedo *= 0.88 + height * 0.18;
    // 溝。1枚1枚を切り分ける濃い線
    albedo *= 1.0 - crease * 0.46;
    // 縁の稜にだけ光が乗る。面が平らでも、この線があるだけで情報量が出る
    albedo *= 1.0 + lipLit * 0.30;
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
    // 毛皮・羽毛は縦に流れる毛束。粒より粗く、方向を持たせる。
    // 弱いと均一な面に潰れて毛に見えないので、房の陰影ははっきり付ける
    albedo *= 0.66 + height * 0.56;
    // 房の縁。鱗と同じで、ひとつの高さ場から溝と稜を閾値で取り出す。
    // 房の目は鱗よりずっと粗いので、線が消え始める距離もそのぶん遠い
    float furLod = detailFade(vWorld, 0.055);
    float lockGap = (1.0 - smoothstep(0.0, 0.20, height)) * furLod;
    float lockLit = smoothstep(0.70, 0.95, height) * furLod;
    // 溝は毛の根元なので、鱗の溝ほど硬く落とさない
    albedo *= 1.0 - lockGap * 0.34;
    // 縁の毛だけが起きて光を拾う
    albedo *= 1.0 + lockLit * 0.24;
    // 毛先。房の陰影より細かい段をもう1枚だけ重ねる。
    // 高さ場に入れると法線の摂動が4回叩かれて重くなるので、色にだけ効かせる
    float bristle = snoise(vec3(vWorld.x * 60.0, vWorld.y * 9.0, vWorld.z * 60.0)) * 0.5 + 0.5;
    albedo *= 0.90 + bristle * 0.19;
  #endif

  #ifdef STREAKS
    // 角・装甲は研いだ金属のような細い筋を走らせる
    albedo *= 0.88 + height * 0.24;
  #endif

  #ifdef WEAVE
    // 織り目と襞。襞は高さ場から来るので、光の向きが変わると陰影も動く。
    // 色だけで襞を描くと、どの角度から見ても同じ場所が暗い「柄」になる。
    //
    // 以前はここで weavePattern をもう一度叩いていた(高さ場と合わせて
    // 1画素あたり5回)。同じ高さを使い回せば済むので、その分を襞に充てた
    albedo *= 0.76 + height * 0.42;
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
    // 落ちを長く取り、いちばん暗いところも沈めきらない。
    // ただし寝かせすぎると全面が同じ明るさになり、房を描いても
    // 陰影が付かないまま「均一な毛の塊」に戻る
    float diffuse = pow(key, 0.86) * 0.97 + 0.07;
  #else
    float diffuse = ramp(key) * 1.05;
  #endif

  // キーは温かい白、フィルは冷たい青。**寒暖を割る**のがここの主眼で、
  // 明暗だけの陰影は、どれだけ段を作っても「灰色の濃淡」にしかならない
  vec3 color = albedo * (ambient + diffuse * KEY_TINT);
  color += albedo * FILL_TINT * fill * 0.30;
  // 強く当たった面は色が抜けて白へ寄る。出る面積はごく狭いので、
  // 加算の総量はほとんど増えないまま「光が当たっている」に見える。
  //
  // **強くしすぎない。** これは腹の色と重なって効く。腹は明るいので key の
  // 5乗を越えやすく、腹と脇腹だけに白が二重で乗って中間調の彩度が抜ける
  color += highlightBleach(albedo, key) * 0.16;
  // 背後のリムライト(ステージのピンクライト)。暗い背景から輪郭を切り離す主役。
  // **帯を細くしてある。** 広く乗せると背中一面が桃色に染まり、
  // せっかく青く沈めた暗部も、腹背の塗り分けも、まとめて塗り潰される
  color += vec3(1.0, 0.48, 0.85) * pow(back, 2.4) * 0.48;
  color += uRim * fresnel * uRimStrength * (1.0 + uActive * 1.5);

  #ifdef SOFT
    // 毛先が逆光で透ける。輪郭が硬い縁ではなく、ふわりとした帯になる
    color += albedo * mix(uRim, vec3(1.0), 0.3) * pow(1.0 - facing, 1.7) * 0.28;
  #endif

  #ifdef METALLIC
    // 金属は拡散をほとんど持たず、**映り込みだけ**で見えている。
    // 拡散を残したまま明るくすると、同じ明るさでも灰色のプラスチックにしか見えない
    color *= 0.44;
    // 金属は「色の付いた鏡」。反射を無彩色で足すと、金だろうが鋼だろうが
    // 同じ灰色の粘土になる(実際に全属性の装甲が同じ灰色に見えていた)。
    // 地色の**色味だけ**を取り出して反射に掛け、明るさは環境から取る
    float peak = max(albedo.r, max(albedo.g, albedo.b));
    vec3 tint = mix(vec3(1.0), albedo / max(0.001, peak), 0.8);
    // 映り込みの幅を広げる。ここが金属らしさの本体で、
    // 空と床の明るさが近いと、どれだけ磨いても曇った石膏にしかならない。
    // 平均を上げずに幅だけ広げる(床を落とし、空を上げる)ので加算の負担は増えない
    // 空は上ほど明るい。一様な空を映すと、どの面も同じ明るさで返ってきて
    // 「灰色に塗った板」に戻る
    vec3 sky = mix(vec3(0.26, 0.34, 0.56), vec3(0.46, 0.58, 0.86), smoothstep(0.0, 0.85, normal.y));
    vec3 ground = vec3(0.030, 0.026, 0.048);
    // 空と床の境目を鋭く切る。この「水平線」が磨いた金属のいちばんの手がかりで、
    // なだらかに混ぜると曇った布のような面になる。
    // **濡れた板ほどこの境目が硬い。** 幅を詰めるだけで、明るさを一切上げずに
    // 「乾いた金属」から「濡れた金属」へ変わる
    vec3 env = mix(ground, sky, smoothstep(-0.012, 0.038, normal.y));
    // 映り込みは磨き筋に沿って途切れる。凹凸の高さがそのまま反射の粗さになる
    color += env * tint * 0.72 * (0.20 + height * 0.90);
    // 水平線のすぐ上に出る明るい帯。磨いた曲面が必ず持つ形。
    // 帯を細く、そのぶん強くしてある(占める面積は 1/2 以下なので総量は減る)
    float band = max(0.0, 1.0 - abs(normal.y - 0.06) * 9.0);
    color += mix(vec3(1.0), uRim, 0.4) * band * band * band * height * 0.34;

    // 装甲の継ぎ目。
    //
    // 金属板は必ず複数枚を接いだもので、一枚岩の金属というものは無い。
    // 継ぎ目が無いと、どれだけ磨いても塗装したプラスチックの殻に見える
    // (ネメシスの胴が、のっぺりした紫の樹脂に見えていた)。
    // 溝を落とし、そのすぐ脇に薄い光を置くと、板の厚みまで読める。
    //
    // 高さ場ではなく色にだけ効かせる。高さ場へ入れると法線の摂動で
    // 4回叩かれ、金属パーツの多い個体で重くなる
    float seamNoise = snoise(vWorld * 2.6);
    // 継ぎ目も線なので、引いた絵ではちらつく粒に化ける。画面上の太さで寝かせる
    float seamLod = detailFade(vWorld, 0.030);
    float seam = (1.0 - smoothstep(0.0, 0.040, abs(seamNoise))) * seamLod;
    float seamLip = smoothstep(0.105, 0.045, abs(seamNoise)) * (1.0 - seam) * seamLod;
    color *= 1.0 - seam * 0.52;
    color += env * tint * seamLip * 0.30;

    // 反射に属性色を回す。無彩色の反射だけだと鉄にしか見えず、
    // どの属性の装甲かも、格の高さも読めない
    color += uRim * fresnel * 0.22;
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
      // 濡れたような芯。針のように細い一点だけを飽和させる。
      // **同じ光の量でも、広くぼかせば樹脂の玉に、狭く固めれば濡れた金属になる。**
      // 明るくして目立たせるのではなく、面積を絞って強度を上げる
      spec += pow(max(dot(normal, halfDir), 0.0), uSpecPower * 5.0) * uSpecStrength * 0.55;
      // 磨き筋に沿って伸びる映り込み。
      // 法線の縦成分だけを寝かせた向きでハイライトを解くと、
      // 筋と直交する向きには鋭く、筋に沿った向きには寝る。
      // 丸い点ではなく細長い帯になるので、角度を変えると板の上を「走る」
      vec3 alongGrain = normalize(vec3(normal.x, normal.y * 0.34, normal.z));
      spec += pow(max(dot(alongGrain, halfDir), 0.0), uSpecPower * 0.22)
            * uSpecStrength * 0.16 * (0.25 + height * 0.85);
    #endif
    // ブルームで白く飛ばないよう、ハイライトの合計に頭打ちを入れる
    color += mix(vec3(1.0), uRim, 0.35) * min(spec, 1.5);
  #endif

  #ifdef SHEEN
    // 布の光沢。面が寝ているほど強く、絹のように縁が明るくなる
    color += mix(uRim, vec3(1.0), 0.35) * pow(1.0 - facing, 3.5) * 0.30;
  #endif

  #ifdef WAXY
    // 角・爪・牙・鰭。
    // ケラチンは硬い材質の中で唯一「薄いところで中身が見える」。
    // 縁が飴色に抜けることで、金属でも骨でもない、伸びて固まった材に見える
    color += albedo * vec3(1.30, 1.02, 0.72) * pow(1.0 - facing, 2.2) * 0.34;
    // 縦の磨き筋。長さ方向の繊維
    color *= 0.92 + height * 0.16;
    // 成長の段。角も爪も牙も「伸びて固まった」材なので、
    // 伸びた向きと直交する段が必ず入る。縦の筋だけだと削り出した棒に見え、
    // 実際に角と翼の指が**厚紙を切って貼った**ように平たく見えていた。
    // 段の間隔と深さを揺らして、機械で刻んだねじ山にならないようにする
    float growth = sin(vWorld.y * 84.0 + snoise(vWorld * 2.6) * 3.6) * 0.5 + 0.5;
    color *= 0.90 + growth * 0.13;
    // 段の稜だけが光る。これが入ると、同じ明るさのままでも硬さが出る
    color += mix(vec3(1.0), uRim, 0.45) * pow(growth, 6.0) * height * 0.10;
  #endif

  #ifdef TRANSLUCENT
    // 薄い膜。
    //
    // ここを「一様に薄い板」として塗ると、どれだけ色を選んでも
    // **色紙を切って貼った**ようにしか見えない。翼膜の質は色ではなく
    // 「根元が厚く、外へ行くほど薄い」という厚みの勾配そのもの。
    //
    // 厚みは体の中心軸からの横の距離で測る。体高で割って正規化してあるので、
    // 小さい妖精の耳でも大きい竜の翼でも同じ割合で薄くなる。
    float span = clamp(abs(vBody.x) / max(0.5, uHeight * 0.55), 0.0, 1.0);
    float thickness = 1.0 - span * 0.74;
    float thin = pow(1.0 - facing, 1.4);
    // 逆光で透ける量。薄いところほど多く通す
    float through = max(dot(-normal, KEY_DIR), 0.0) * (1.25 - thickness * 0.55);
    color = albedo * (0.52 + thickness * 0.48) * (0.34 + ramp(key) * 0.52);
    // 透けた光は膜そのものの色に染まって出てくる。白い光を足すと紙になる
    color += mix(albedo, uRim, 0.45) * through * 0.62;
    color += uRim * thin * 0.58;
    // 薄い縁ほど向こうが見える。ただし抜きすぎるとシルエットが痩せるので、
    // 翼の先でも下地が読める濃さは残す
    alpha = uOpacity * clamp(0.60 + thickness * 0.32 + thin * 0.10, 0.0, 1.0);
  #endif

  #ifdef VEINS
    // 翼膜の血管。太い枝と細い枝を重ねて分岐に見せる。
    // 1本の太さで描くと網戸の目になり、生き物の膜に見えない。
    // ローカル座標で描くので、羽ばたいても模様が流れない
    float trunk = 1.0 - smoothstep(0.0, 0.095, abs(snoise(vLocal * vec3(3.4, 5.0, 3.4))));
    float twig = 1.0 - smoothstep(0.0, 0.05, abs(snoise(vLocal * vec3(10.0, 15.0, 10.0))));
    float vein = clamp(trunk + twig * 0.6, 0.0, 1.0);
    // 血管は膜の厚い側(根元)ほど太く濃い。先端まで同じ濃さで走ると
    // 血が通っているのではなく「網目模様を印刷した板」に見える
    float veinSpan = clamp(abs(vBody.x) / max(0.5, uHeight * 0.55), 0.0, 1.0);
    vein *= 1.0 - veinSpan * 0.55;
    color *= 1.0 - vein * 0.5;
    color += mix(uRim, uGlow, 0.3) * vein * 0.09;
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
    // 結晶は「内側から光り、縁で色が詰まる」ことで他の材質と区別する。
    //
    // 以前はここを**縁ほど白く光らせる**作りにしていた。それは氷砂糖や
    // すりガラスの見え方で、中身の詰まった宝石には見えない。実際に、
    // 水属性の結晶が色を失って灰色のプラスチックになっていた。
    // 実物は逆で、見通す距離が長い縁ほど光が吸われて**色が濃く沈み**、
    // まっすぐ見通せる中心だけが明るい。
    //
    // 中心を明るくしても加算の総量は増えない。出る面積が狭いうえ、
    // 縁を沈めるぶんむしろ減る。
    float thick = pow(1.0 - facing, 1.5);
    // 地色から色味だけを取り出す。明るさは厚みの側で決めるので、
    // 明るい差し色でも暗い地色でも同じ「濃くなり方」になる
    float peak = max(uColor.r, max(uColor.g, uColor.b));
    vec3 pigment = uColor / max(0.08, peak);
    // 内部の層。見る向きでずれるので、中に奥行きがあるように見える
    float inner = sin(dot(vLocal, vec3(11.0, 17.0, 9.0)) - facing * 7.0 + uTime * 0.35) * 0.5 + 0.5;
    // 厚みを通った色。縁は濃く暗く、中心は薄く明るい
    color = pigment * mix(0.62, 0.13, thick);
    // 中に灯った明かり。まっすぐ見通せる正面だけに出る、狭くて強い光。
    // 全面を光らせると発光体になり、透過しているようには見えなくなる。
    //
    // **灯りは結晶の色に染めて出す。** 発光色(uGlow)はどの属性でもほぼ白なので、
    // そのまま足すと中心が白く抜け、せっかくの属性色が消える
    // (水の結晶が灰色のプラスチックに見えていた原因はこれ)。
    // 内側から出てくる光は、必ず自分の体の色を通ってくる
    float lantern = pow(facing, 2.4) * (0.42 + inner * 0.58);
    color += mix(uGlow * pigment, uGlow, 0.22) * lantern * 0.46;
    // 外から当たる光の分。完全な透明ではないので、面の向きは残す
    color += albedo * ramp(key) * 0.22;
    // 面と面が切り替わる稜線。高さの中腹だけを細く拾う。
    // 高いところを拾うと面が広く光ってしまい、カットではなく染みに見える
    float facetEdge = 1.0 - smoothstep(0.0, 0.16, abs(height - 0.5));
    color += mix(vec3(1.0), uRim, 0.55) * facetEdge * 0.24;
    // 正面は透け、縁は詰まって見える。ここが厚みの唯一の手がかりなので、
    // 中心はしっかり抜く。抜けていないと、ただの色の付いた塊になる
    alpha = uOpacity * clamp(0.30 + thick * 0.66, 0.0, 1.0);
  #endif

  // --- 属性ごとの体の質 -----------------------------------------------
  // ここまでは色相が違うだけで、火も水も同じ材質の色違いだった。
  // 属性を「別の生き物」に見せるのは色ではなく光の扱われ方なので、
  // 最後にその差を上乗せする。どれも加算なので、値は控えめに抑えてある
  // (明るくして目立たせようとしないこと)。

  // 熾火。溝の奥ほど、そして光の当たらない面ほど赤く残る。
  // 明るい面で光らせると全身が発光体になってしまうので、影の側だけに出す
  if (uEmber > 0.001) {
    float pit = 1.0 - smoothstep(0.08, 0.55, height);
    // 溝の奥は自分の縁に隠れて光が届かない。光の当たっている面でも
    // 割れ目の底だけは熱が見える。ここを 0 にすると、正面から見た時に
    // 熱がどこにも無い「ただの赤い生き物」になる
    float shade = 0.30 + 0.70 * (1.0 - smoothstep(0.05, 0.55, key));
    float breathe = 0.72 + 0.28 * sin(uTime * 1.1 + vBody.y * 3.0);
    color += mix(uGlow, uRim, 0.45) * uEmber * pit * shade * breathe * 0.24;
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

  // 帯電。細い筋が体表を這う。面積が小さいので薄くても目に付く。
  // 太い筋を1本だけ出すと「光る模様」になるので、
  // ノイズの零点に沿った**細い線**にして、体表を走る電位に見せる
  if (uCharge > 0.001) {
    float arc = snoise(vBody * 7.0 + vec3(0.0, uTime * 1.5, uTime * 0.5));
    float filament = 1.0 - smoothstep(0.0, 0.045, abs(arc));
    // **体の一部にだけ**出す。全面に走らせると閉じた輪が敷き詰められて、
    // 電気ではなく「ひび割れ模様の釉薬」になる。
    // 遅いノイズで区画を切り、その区画自体をゆっくり移動させる
    float sparkArea = smoothstep(0.05, 0.55, snoise(vBody * 1.6 + vec3(uTime * 0.5, uTime * 0.3, 0.0)));
    // 明滅。全身が同時に光ると電飾になるので、体の高さで位相をずらす
    float flicker = 0.55 + 0.45 * sin(uTime * 9.0 + vBody.y * 5.0);
    color += mix(uGlow, uRim, 0.4) * filament * sparkArea * flicker * uCharge * 0.5;
    // 筋の周りだけ地色が持ち上がる。線が体表に「乗っている」ように見える
    color += uRim * smoothstep(0.26, 0.0, abs(arc)) * sparkArea * uCharge * 0.07;
  }

  // 吸光。光の当たっていない面が黒へ落ちる。
  // 明るくせずに「暗さの質」だけで属性を語れる、いちばん安全な手。
  // 落とすのは陰の側だけで、キーライトの当たる面には触らない。
  // 全体を暗くすると形が読めなくなり、闇属性だけ別ゲームの絵になる
  if (uAbsorb > 0.001) {
    float lit = smoothstep(0.02, 0.50, key);
    color *= 1.0 - uAbsorb * 0.44 * (1.0 - lit);
    // 縁の光まで吸う。輪郭だけがかろうじて残る、という見え方になる
    color -= uRim * fresnel * uAbsorb * 0.10 * (1.0 - lit);
    color = max(color, vec3(0.0));
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
  //
  // 全体攻撃では8体が同時に光る。そこへ足元の属性光と自己発光が重なると、
  // **体の色が完全に飛んで白い人形になる**(実測で8体全員がそうなった)。
  // 白へ寄せるのではなく、元の色を保ったまま持ち上げる。
  // こうすると強く光っても「その子」だと分かり続ける。
  color += color * uFlash * 0.55 + vec3(0.16) * uFlash;

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
 *
 * **ただし彩度を落としすぎない。** 腹の色は腹だけに使われるのではなく、
 * 脇腹の中間調(belly の smoothstep が半分効く帯)と、色ムラの明るい側の
 * 混ぜ先を兼ねている。ここを 0.55 まで抜くと、体の側面がまるごと
 * 「彩度の無い明るい灰色」へ寄る。実際に水ドラゴンの脇腹が青灰色になり、
 * 属性が色で読めなくなっていた。明度を上げるぶんは彩度で払わない。
 */
function bellyOf(color: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl, THREE.SRGBColorSpace);
  // **腹は必ず地色より明るい。** 上限を固定値で置くと、地色が明るい属性(光)では
  // 腹だけが暗くなり、塗り分けが裏返る(実際に光属性で腹が影のように沈んでいた)。
  // 地色からの相対で決め、上限は白飛びしない範囲にだけ効かせる
  const lit = Math.min(0.82, Math.max(hsl.l + 0.12, hsl.l * 1.26 + 0.09));
  const out = new THREE.Color();
  // 色相をほんの少し暖色側へ。生々しさはこの数度で決まる
  out.setHSL((hsl.h + 0.015) % 1, hsl.s * 0.78, lit, THREE.SRGBColorSpace);
  return out;
}

/**
 * 地色から「背側の色」を作る。暗く、彩度は上げる(影ではなく色素の濃さ)。
 *
 * ここは弱いと**まったく効かない**。背は上を向いているのでキーライトを正面から
 * 受け、擬似AOでも持ち上がる。地色を少し暗くした程度では、その加算に全部
 * 打ち消されて「背が明るい」という逆の絵になる。打ち消される分を見込んで落とす。
 */
function dorsalOf(color: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl, THREE.SRGBColorSpace);
  const out = new THREE.Color();
  // 下限を置くのは闇属性のため。ここを 0 まで許すと背が黒く潰れて形が読めなくなる
  const lit = Math.max(0.10, hsl.l * 0.44);
  out.setHSL((hsl.h + 0.985) % 1, Math.min(1, hsl.s * 1.2 + 0.06), lit, THREE.SRGBColorSpace);
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
    defines: { SPECULAR: "", STREAKS: "", WAXY: "" },
    counter: 0.34,
    rimStrength: 0.62,
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
    // 襞の深さ。織り目だけを描いていた頃はここを 0.002 にしていたが、
    // それでは面が平らなままで、どれだけ目を細かくしても板に見える
    bump: 0.009,
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
    // 皮膜には細かい皺がある。凹凸を0にすると、どれだけ色を作り込んでも
    // 光が一様に返ってきて「紙を切って貼った翼」に見える
    bump: 0.005,
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
        bump: 0.011,
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
