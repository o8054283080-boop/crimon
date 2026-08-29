import * as THREE from "three";
import { Element } from "../../core/element.js";

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
 * 基本の絵を属性色へ寄せる強さ。0で寄せない、1で完全に色相を差し替える。
 *
 * **色を「混ぜる」のではなく「色相を差し替える」。**
 * 最初は混ぜていたが、濃い青のスライムに赤を34%混ぜても青のままだった。
 * 混ぜる量を上げると今度は絵が平たくなる(明暗も彩度も一緒に潰れるため)。
 * 色相だけ差し替えれば、描かれた明暗と艶をそのまま残して色が変わる。
 *
 * **戦闘画面(spriteAvatar.ts)とカード(portrait.ts)で同じ値を使う。**
 * 別々に持つと、カードで見た色と戦闘で見た色が食い違う。
 */
export const SPRITE_TINT = 0.85;

/**
 * 属性ごとの色相(0〜1)と彩度の倍率。
 *
 * 色相は `ELEMENT_COLOR` の見た目の色から取ってある。
 * 光だけは彩度を落とす。淡い生成りが「光」なので、
 * 他と同じ彩度で回すとただの黄色いモンスターになる。
 */
export const ELEMENT_TINT: Record<Element, { hue: number; sat: number }> = {
  FIRE: { hue: 0.017, sat: 1.05 },      // #e74c3c 朱
  GRASS: { hue: 0.386, sat: 1.0 },      // #2ecc71 若草
  ELECTRIC: { hue: 0.133, sat: 1.08 },  // #f1c40f 山吹
  WATER: { hue: 0.567, sat: 1.0 },      // #3498db 空
  LIGHT: { hue: 0.128, sat: 0.42 },     // #f5e6a8 生成り
  DARK: { hue: 0.786, sat: 0.92 },      // #6c3483 藍紫
};

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
