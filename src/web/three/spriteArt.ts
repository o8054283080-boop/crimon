import * as THREE from "three";
import { Element } from "../../core/element.js";
import manifest from "../assets/monsters/sprites.json";

/**
 * モンスターの2D絵を探して読み込む。
 *
 * ## 置き場所と優先順位
 *
 *   src/web/assets/monsters/<種族>-<属性>.webp   その属性専用に描いた絵
 *   src/web/assets/monsters/<種族>.webp          全属性で使う基本の絵
 *
 * **専用の絵があればそちらを使い、無ければ基本の絵を属性色へ寄せて使う。**
 * こうしておくと15枚で90体ぶんが揃い、余力ができた属性から
 * 描き足して上書きできる。15種×6属性=90枚を最初に全部描かないと
 * 何も出せない、という形にはしない。
 *
 * 絵が1枚も無い種族は、ここが null を返す。呼び出し側はその時だけ
 * 従来の3Dモデルへ落ちる(avatarFactory.ts)。**一斉の切り替えにしない。**
 *
 * ## import.meta.glob を使う理由
 *
 * Viteは実際に参照されたファイルしか配らない。文字列でURLを組み立てると
 * 開発中は動くのに**本番ビルドで画像だけが消える**。ここで一括して
 * 静的に拾っておけば、ビルドに含まれることが保証される。
 */

const SPRITE_URLS = import.meta.glob<string>("../assets/monsters/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

/** ファイル名(拡張子なし) → URL */
const BY_NAME = new Map<string, string>();
for (const [path, url] of Object.entries(SPRITE_URLS)) {
  const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.webp$/, "");
  BY_NAME.set(name, url);
}

/**
 * 絵ごとに測った「体の主色」。`tools/prepareSprites.mjs` が書く。
 * -1 は無彩色の絵(守る色相が無い)。
 */
const MANIFEST = manifest as Record<string, { bodyHue: number; aspect: number }>;

/**
 * その種族の絵の「体の主色」(0〜1)。無彩色や未測定なら -1。
 *
 * **目分量で決めない。** 絵を差し替えたら測り直しになるので、
 * 道具が書いた値だけを使う。
 */
export function bodyHueFor(templateId: string, element: Element): number {
  return (
    MANIFEST[`${templateId}-${element}`]?.bodyHue ??
    MANIFEST[templateId]?.bodyHue ??
    -1
  );
}

/**
 * 基本の絵を属性色へ寄せる強さ。0で寄せない、1で完全に置き換える。
 *
 * **色を「混ぜる」のではなく「HSVで置き換える」。**
 * 最初は混ぜていたが、濃い青のスライムに赤を34%混ぜても青のままだった。
 * 混ぜる量を上げると今度は絵が平たくなる(明暗も彩度も一緒に潰れるため)。
 * 色相・彩度・明度を別々に扱えば、描かれた陰影をそのまま残して色が変わる。
 *
 * **戦闘画面(spriteAvatar.ts)とカード(portrait.ts)で同じ値を使う。**
 * 別々に持つと、カードで見た色と戦闘で見た色が食い違う。
 */
export const SPRITE_TINT = 0.9;

export interface ElementTint {
  /** 目標の色相(0〜1) */
  hue: number;
  /** 彩度の倍率。元の彩度に掛けるので、陰影の濃淡が残る */
  sat: number;
  /** 明度の倍率。闇を暗くするのに使う */
  valueMul: number;
  /** 明度の加算。光を明るくするのに使う */
  valueAdd: number;
}

/**
 * 属性ごとの色の作り方。
 *
 * **光は白、闇は黒。** ただし真っ白・真っ黒に潰さない。
 * 明度は元の値に倍率と加算をかけるだけなので、**描かれた陰影が必ず残る。**
 * 潰してしまうとシルエットだけの影絵になり、何のモンスターか分からなくなる。
 *
 * 有彩色の4属性は明度をいじらない。色相と彩度だけで十分に読める。
 */
export const ELEMENT_TINT: Record<Element, ElementTint> = {
  // 赤。朱〜橙
  FIRE: { hue: 0.015, sat: 1.08, valueMul: 1.0, valueAdd: 0 },
  // 緑。若草〜深緑
  GRASS: { hue: 0.33, sat: 1.02, valueMul: 1.0, valueAdd: 0 },
  // 黄。山吹〜黄
  ELECTRIC: { hue: 0.135, sat: 1.1, valueMul: 1.04, valueAdd: 0.02 },
  // 青。空〜藍
  WATER: { hue: 0.57, sat: 1.02, valueMul: 1.0, valueAdd: 0 },
  // 白。彩度をほぼ落とし、明度を持ち上げる。わずかに温かい生成りを残す
  LIGHT: { hue: 0.125, sat: 0.15, valueMul: 1.0, valueAdd: 0.17 },
  // 黒。彩度を半分にし、明度を大きく落とす。濃紺〜濃紫を残す
  DARK: { hue: 0.72, sat: 0.55, valueMul: 0.4, valueAdd: 0.015 },
};

/**
 * 色替えから守る部分の判定。
 *
 * **白目・瞳・歯・爪・角・金属・装備品まで染めない**ための境目。
 * ここが無いと、経験ピッグの青い本まで赤くなり、
 * グレイヴナイトの銀の縁取りが緑になる。
 *
 * 判定は3つの掛け合わせ:
 *   1. 彩度が低いもの(白目・歯・銀・骨)は染めない
 *   2. 明度が極端なもの(潰れた輪郭、白いハイライト)は染めない
 *   3. **その絵の「体の主色」から色相が離れたもの**(装備・宝石)は染めない
 *
 * 3番の基準になる主色は、絵ごとに `tools/prepareSprites.mjs` が測って
 * `sprites.json` に書いてある。目分量で決めない。
 */
export const TINT_MASK = {
  /** これ未満の彩度は無彩色とみなして守る / これを超えたら完全に染める */
  satLow: 0.07,
  satHigh: 0.26,
  /** これ未満の明度は潰れた輪郭とみなして守る */
  valLow: 0.05,
  valHigh: 0.15,
  /** これを超える明度の「無彩色寄り」はハイライトとみなして守る */
  hiLow: 0.86,
  hiHigh: 1.0,
  /** 体の主色からの色相の隔たり(0〜0.5)。これを超えたら守る */
  hueNear: 0.085,
  hueFar: 0.19,
} as const;

/**
 * 属性による色替えをしない種族。
 *
 * 転生ピッグは属性を持たない育成素材で、6色に散らす意味が無い。
 * 経験ピッグは属性ごとに出るので、色替えの対象に含める。
 */
export const NO_TINT_TEMPLATES = new Set(["reincarnation_pig"]);

export type SpritePose = "idle" | "attack" | "hit" | "cast";

/** そのポーズ専用の絵の接尾辞。idle(基本)だけは接尾辞を持たない */
const POSE_SUFFIX: Record<SpritePose, string> = {
  idle: "",
  attack: "-attack",
  hit: "-hit",
  cast: "-cast",
};

/**
 * 種族と属性から絵のURLを引く。
 * 専用 → 基本 の順に探し、どちらも無ければ null。
 */
export function spriteUrlFor(templateId: string, element: Element, pose: SpritePose = "idle"): string | null {
  const suffix = POSE_SUFFIX[pose];
  return (
    BY_NAME.get(`${templateId}-${element}${suffix}`) ??
    BY_NAME.get(`${templateId}${suffix}`) ??
    null
  );
}

/** その種族に2Dの絵があるか(基本の絵の有無で判定する) */
export function hasSprite(templateId: string, element: Element): boolean {
  return spriteUrlFor(templateId, element, "idle") !== null;
}

/**
 * その絵が「属性専用に描かれたもの」か。
 *
 * 専用の絵は描いた人が既に属性の色にしているので、**コード側で色を寄せない。**
 * 寄せると二重にかかって濁る。
 */
export function isElementSpecific(templateId: string, element: Element): boolean {
  return BY_NAME.has(`${templateId}-${element}`);
}

const loader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();

/**
 * 絵を読み込む。同じURLは1つのテクスチャを共有する。
 *
 * 4体編成で同じ種族が並ぶことは普通にあるので、共有しないと
 * 同じ画像を何枚もGPUへ送ることになる。
 */
export function loadSpriteTexture(url: string): THREE.Texture {
  const cached = textures.get(url);
  if (cached) return cached;
  const texture = loader.load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  // 縁の透明部分と混ざって黒い線が出るのを防ぐ
  texture.premultiplyAlpha = false;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  textures.set(url, texture);
  return texture;
}

/** 読み込み済みのテクスチャを全部捨てる(画面を離れる時) */
export function disposeSpriteTextures(): void {
  for (const texture of textures.values()) texture.dispose();
  textures.clear();
}
