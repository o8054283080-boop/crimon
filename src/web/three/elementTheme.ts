import * as THREE from "three";
import { Element } from "../../core/element.js";

/**
 * 3Dバトルシーンの属性別アートディレクション。
 * 2D UI用のELEMENT_COLOR(単色)とは別に、3D表現では
 * コア/リム/発光/パーティクルで色を作り分けることで
 * 立体感と属性ごとの「らしさ」を出す。
 */
export interface ElementTheme {
  /** body内部の発光コア色 */
  core: THREE.Color;
  /** 外殻のベース色 */
  shell: THREE.Color;
  /** フレネルリムライトの色(輪郭の光) */
  rim: THREE.Color;
  /** スキル演出・パーティクルの主色 */
  vfx: THREE.Color;
  /** キャラを照らす属性ライトの色 */
  light: THREE.Color;
  /** 足元の魔法陣の色 */
  ground: THREE.Color;
}

function theme(core: number, shell: number, rim: number, vfx: number, light: number, ground: number): ElementTheme {
  return {
    core: new THREE.Color(core),
    shell: new THREE.Color(shell),
    rim: new THREE.Color(rim),
    vfx: new THREE.Color(vfx),
    light: new THREE.Color(light),
    ground: new THREE.Color(ground),
  };
}

export const ELEMENT_THEME: Record<Element, ElementTheme> = {
  FIRE: theme(0xfff1c9, 0x8c2118, 0xff6b2c, 0xff7a1a, 0xff8a3d, 0xff5a1f),
  WATER: theme(0xd8f4ff, 0x15406e, 0x36b6ff, 0x2fa8ff, 0x4fb8ff, 0x2b9bff),
  ELECTRIC: theme(0xfffbe0, 0x6b5410, 0xffd93b, 0xffe14d, 0xffd75e, 0xffd11f),
  GRASS: theme(0xe6ffd9, 0x1d5a2a, 0x53e06b, 0x4ade5f, 0x6ee07e, 0x3fd45c),
  LIGHT: theme(0xfffdf2, 0x8a7a3a, 0xffe9a6, 0xfff2c4, 0xfff4d2, 0xffe9a0),
  DARK: theme(0xe9d4ff, 0x2e1245, 0xa855f7, 0x9b4dff, 0xb06bff, 0x8b3dff),
};

export function themeFor(element: Element): ElementTheme {
  return ELEMENT_THEME[element];
}

// ---------------------------------------------------------------------------
// ステージの空気(ムード)
// ---------------------------------------------------------------------------

/**
 * 闘技場そのものの色調。**属性テーマとは目的が違う。**
 *
 * ElementTheme が「モンスター1体の色」を決めるのに対し、こちらは
 * 「その戦いが、どの空の下で行われているか」を決める。空・霞・遠景・
 * 石の色・篝火・グレーディングまで一式が入っていて、これを差し替えると
 * 画面全体の空気が変わる。
 *
 * 以前は全ステージが同じ紫の室内で、どの戦いも同じ絵に見えていた。
 * 属性ごとに空気を割ることで、同じ闘技場でも「火口の上」「深海の底」
 * 「雷雲の中」と読み替えられるようにする。
 *
 * **注意: fog と sky.haze は必ず同じ色にすること。** ずれると、遠景が
 * 霞に溶けずに「空の前に別の色の板が立っている」ように見える。
 */
export interface StageMood {
  /** 開発時に画面を見て突き合わせるための名前 */
  name: string;
  /** 天頂の色(空のいちばん高いところ) */
  zenith: THREE.Color;
  /** 中空の色 */
  mid: THREE.Color;
  /** 地平線の霞。THREE.FogExp2 の色と必ず一致させる */
  haze: THREE.Color;
  /** 奥(-Z)側の光源の色。敵チームの背後を明るくして視線を集める */
  glow: THREE.Color;
  /** 霧の濃さ。空気の重い場所ほど濃くする */
  fogDensity: number;
  /** 星の見え具合(0で昼、1で満天の星) */
  stars: number;
  /** 石材に掛ける色。同じテクスチャでも岩の種類が変わって見える */
  stone: THREE.Color;
  /** 篝火・灯りの色 */
  ember: THREE.Color;
  /** 床のルーンと発光リングの色 */
  rune: THREE.Color;
  /** 地表を這う霞の色 */
  mist: THREE.Color;
  /** 舞う塵の色 */
  dust: THREE.Color;
  /** 遠景(峰・浮島)の芯の色。距離に応じて haze へ寄せて使う */
  distant: THREE.Color;
  /** 雲海の明部 */
  cloud: THREE.Color;
  /** キーライトの色 */
  keyLight: THREE.Color;
  /** フィルライトの色(キーと寒暖で対にする) */
  fillLight: THREE.Color;
  /** 奥からのリムライト */
  rimLight: THREE.Color;
  /** 反対側からのリムライト(暖色側) */
  rimWarmLight: THREE.Color;
  /** 環境光の天側 */
  hemiSky: THREE.Color;
  /** 環境光の地側(床からの照り返し) */
  hemiGround: THREE.Color;
  /** グレーディング: 暗部に乗せる色 */
  gradeShadow: number;
  /** グレーディング: 明部に乗せる色 */
  gradeHighlight: number;
}

interface MoodSpec {
  name: string;
  zenith: number;
  mid: number;
  haze: number;
  glow: number;
  fogDensity: number;
  stars: number;
  stone: number;
  ember: number;
  rune: number;
  mist: number;
  dust: number;
  distant: number;
  cloud: number;
  keyLight: number;
  fillLight: number;
  rimLight: number;
  rimWarmLight: number;
  hemiSky: number;
  hemiGround: number;
  gradeShadow: number;
  gradeHighlight: number;
}

function mood(spec: MoodSpec): StageMood {
  return {
    name: spec.name,
    zenith: new THREE.Color(spec.zenith),
    mid: new THREE.Color(spec.mid),
    haze: new THREE.Color(spec.haze),
    glow: new THREE.Color(spec.glow),
    fogDensity: spec.fogDensity,
    stars: spec.stars,
    stone: new THREE.Color(spec.stone),
    ember: new THREE.Color(spec.ember),
    rune: new THREE.Color(spec.rune),
    mist: new THREE.Color(spec.mist),
    dust: new THREE.Color(spec.dust),
    distant: new THREE.Color(spec.distant),
    cloud: new THREE.Color(spec.cloud),
    keyLight: new THREE.Color(spec.keyLight),
    fillLight: new THREE.Color(spec.fillLight),
    rimLight: new THREE.Color(spec.rimLight),
    rimWarmLight: new THREE.Color(spec.rimWarmLight),
    hemiSky: new THREE.Color(spec.hemiSky),
    hemiGround: new THREE.Color(spec.hemiGround),
    gradeShadow: spec.gradeShadow,
    gradeHighlight: spec.gradeHighlight,
  };
}

/**
 * 属性ごとのステージの空気。
 *
 * 設計の芯は**寒暖を必ず割ること**。キーが暖色ならフィルは寒色、
 * 空が寒色なら灯りは暖色、というように必ず対を作る。
 * 全部を同じ色相で揃えると、どれだけ彩度を上げても「一色の絵」になる。
 * (以前の画面が「紫一色」だったのはこれが理由)
 */
export const STAGE_MOOD: Record<Element, StageMood> = {
  // 火口の縁。空は煤けた赤褐色、下から溶岩の照り返し。影は冷たい青で受ける
  FIRE: mood({
    name: "灼熱の火口",
    zenith: 0x140611,
    mid: 0x4d1522,
    haze: 0x6b2a22,
    glow: 0xff6a2a,
    fogDensity: 0.0158,
    stars: 0.15,
    stone: 0xd9b6a4,
    ember: 0xff8a3a,
    rune: 0xffb060,
    mist: 0xc4663a,
    dust: 0xffa163,
    distant: 0x5a2a30,
    cloud: 0xffb489,
    keyLight: 0xffdcb0,
    fillLight: 0x6f8ae0,
    rimLight: 0xff5a3c,
    rimWarmLight: 0xffc07a,
    hemiSky: 0xb98a86,
    hemiGround: 0x6b2a10,
    gradeShadow: 0x27406e,
    gradeHighlight: 0xffd9a8,
  }),
  WATER: mood({
    name: "沈んだ神殿",
    zenith: 0x02101f,
    mid: 0x0c3358,
    haze: 0x1c5372,
    glow: 0x3ec4ff,
    fogDensity: 0.0212,
    stars: 0.3,
    stone: 0xbfd6e6,
    ember: 0x5fd8ff,
    rune: 0x8ceaff,
    mist: 0x5fb0d8,
    dust: 0xbfe6ff,
    distant: 0x2a5f7e,
    cloud: 0x9fd8f0,
    keyLight: 0xe4f4ff,
    fillLight: 0x4f8fd0,
    rimLight: 0x36b6ff,
    rimWarmLight: 0xffc27a,
    hemiSky: 0x74c0e8,
    hemiGround: 0x123c50,
    gradeShadow: 0x123c5c,
    gradeHighlight: 0xffe8c4,
  }),
  ELECTRIC: mood({
    name: "雷雲の櫓",
    zenith: 0x080a1c,
    mid: 0x2b3057,
    haze: 0x4a4c6e,
    glow: 0xffe173,
    fogDensity: 0.0186,
    stars: 0.2,
    stone: 0xcfd2e0,
    ember: 0xffdc6a,
    rune: 0xffe98f,
    mist: 0x8f92c8,
    dust: 0xffeaa8,
    distant: 0x3f4468,
    cloud: 0xb9bce0,
    keyLight: 0xfff0c8,
    fillLight: 0x8296e8,
    rimLight: 0xffd94d,
    rimWarmLight: 0xff9f6a,
    hemiSky: 0x9aa2e0,
    hemiGround: 0x3a3450,
    gradeShadow: 0x293a6c,
    gradeHighlight: 0xfff0c0,
  }),
  GRASS: mood({
    name: "森霧の遺跡",
    zenith: 0x05140f,
    mid: 0x17402c,
    haze: 0x38634a,
    glow: 0x9ce878,
    fogDensity: 0.0208,
    stars: 0.25,
    stone: 0xc2cdb6,
    ember: 0x9ce878,
    rune: 0xb6ff9a,
    mist: 0x6fb08a,
    dust: 0xd4ffb0,
    distant: 0x2c5642,
    cloud: 0xa8d8b4,
    keyLight: 0xf0ffd8,
    fillLight: 0x6f9ad0,
    rimLight: 0x6ce07a,
    rimWarmLight: 0xffc98a,
    hemiSky: 0x8cc4a0,
    hemiGround: 0x274a2e,
    gradeShadow: 0x1d4a48,
    gradeHighlight: 0xf4ffcc,
  }),
  LIGHT: mood({
    name: "黎明の天穹",
    zenith: 0x161a3c,
    mid: 0x6a4a70,
    haze: 0xa87a5c,
    glow: 0xffd28a,
    fogDensity: 0.0146,
    stars: 0.1,
    stone: 0xe6dcc4,
    ember: 0xffd48a,
    rune: 0xffeec0,
    mist: 0xd0a888,
    dust: 0xffe8c0,
    distant: 0x7a5f74,
    cloud: 0xffd4b0,
    keyLight: 0xfff2d4,
    fillLight: 0x8fa8f0,
    rimLight: 0xffe0a6,
    rimWarmLight: 0xffc08a,
    hemiSky: 0xd8c0b0,
    hemiGround: 0x6a5240,
    gradeShadow: 0x3a4a80,
    gradeHighlight: 0xffe4bc,
  }),
  DARK: mood({
    name: "紫紺の夜",
    zenith: 0x050713,
    mid: 0x1b2245,
    haze: 0x2f3660,
    glow: 0x8c5aa8,
    fogDensity: 0.0196,
    stars: 1,
    stone: 0xc6c8dc,
    ember: 0xff9a52,
    rune: 0x8fd8ff,
    mist: 0x7f86c8,
    dust: 0xb0c0ff,
    distant: 0x2b3160,
    cloud: 0x9a9ad0,
    keyLight: 0xffe7c2,
    fillLight: 0x8fa8f0,
    rimLight: 0xff86c8,
    rimWarmLight: 0xffab6a,
    hemiSky: 0x8ea6ee,
    hemiGround: 0x3a2418,
    gradeShadow: 0x223d70,
    gradeHighlight: 0xffdfae,
  }),
};

/**
 * その戦いの空気を決める。
 *
 * 舞台側にステージIDが無いので、**そこに立っている顔ぶれ**から決める。
 * 敵チームで最も多い属性をステージの主にすると、「火のダンジョンに
 * 挑めば空が焼ける」という対応が自然に付き、戦うたびに絵が変わる。
 */
export function moodFor(enemyElements: Element[]): StageMood {
  if (enemyElements.length === 0) return STAGE_MOOD.DARK;
  const counts = new Map<Element, number>();
  for (const element of enemyElements) counts.set(element, (counts.get(element) ?? 0) + 1);
  let best: Element = enemyElements[0];
  let bestCount = -1;
  for (const [element, count] of counts) {
    if (count > bestCount) {
      best = element;
      bestCount = count;
    }
  }
  return STAGE_MOOD[best];
}
