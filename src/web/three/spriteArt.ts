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
const MANIFEST = manifest as Record<string, {
  bodyHue?: number;
  /** その絵の彩度の中央値。守り判定の境目をここから作る */
  bodySat?: number;
  /** その絵の明度の中央値 */
  bodyVal?: number;
  aspect?: number;
  /** コマ送りの待機アニメ。格子状に並んだシートの割り方 */
  sheet?: { cols: number; rows: number; frames: number };
}>;

function entryFor(templateId: string, element: Element) {
  return MANIFEST[`${templateId}-${element}`] ?? MANIFEST[templateId];
}

/**
 * その種族の絵の「体の主色」(0〜1)。無彩色や未測定なら -1。
 *
 * **目分量で決めない。** 絵を差し替えたら測り直しになるので、
 * 道具が書いた値だけを使う。
 */
export function bodyHueFor(templateId: string, element: Element): number {
  return entryFor(templateId, element)?.bodyHue ?? -1;
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
 * その絵に合わせた、色替えの守り判定の境目。
 *
 * ## 固定の値ではいけない理由
 *
 * `TINT_MASK` の値は「ふつうの濃さの絵」を前提にしている。
 * **フェアリーは薄荷色の淡い絵で、体の彩度の中央値が0.22、明度が0.96だった。**
 * 固定の境目(彩度0.07〜0.26、明部0.86〜)では
 *
 *   - 彩度が低いので「白目や歯」と同じ扱いで守られ
 *   - 明るいので「白いハイライト」としても守られる
 *
 * という二重の守りが掛かり、**染まった量が2割しか残らなかった。**
 * 6属性を並べても全部同じ薄荷色で、依頼主の指定した「主要色を変える」が
 * 効いていなかった(図鑑で6枚を並べて確認)。
 *
 * ## どう決めるか
 *
 * その絵の彩度・明度の**中央値**を基準にして境目を寄せる。
 * ただし**元の値より緩くはしない。** 濃い絵(スライム・トレント)では
 * 今までどおりの境目のまま、淡い絵だけが下がる。
 * 緩める向きにも動かすと、濃い絵の陰の部分が染まらなくなる。
 *
 * 白目・歯は彩度がほぼ0なので、下げた境目でも守られたままになる。
 */
export interface TintThresholds {
  satLow: number;
  satHigh: number;
  hiLow: number;
}

export function tintThresholdsFor(templateId: string, element: Element): TintThresholds {
  const entry = entryFor(templateId, element);
  const sat = entry?.bodySat;
  const val = entry?.bodyVal;
  return {
    // 中央値の3割を下限、中央値そのものを上限に置くと、体の半分以上が完全に染まる
    satLow: sat && sat > 0 ? Math.min(TINT_MASK.satLow, sat * 0.3) : TINT_MASK.satLow,
    satHigh: sat && sat > 0 ? Math.min(TINT_MASK.satHigh, sat * 1.05) : TINT_MASK.satHigh,
    // 体の明度より上だけを「ハイライト」とみなす。1.0まで上げると守りが消える
    hiLow: val && val > 0 ? Math.max(TINT_MASK.hiLow, Math.min(0.98, val + 0.03)) : TINT_MASK.hiLow,
  };
}

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

/**
 * コマ送りの待機アニメ(スプライトシート)。
 *
 * ## いつ使うか
 *
 * 1枚の絵を変形させる方式には限界がある。板の高さを手がかりに
 * 呼吸させ、遅らせ、頷かせることはできても、**コードは絵のどこが
 * 腕で、どこが尻尾なのかを知らない。** 腕を振る動きは作れない。
 *
 * コマ送りなら、描かれた絵がそのまま動く。ただし**全部の種族で
 * 有効とは限らない。** 生成側は硬い造形(鎧・岩)をほとんど動かさず、
 * 画面80pxまで縮めると数pxしか変わらない。
 * `tools/prepareSpriteSheets.mjs` が動きの量を測って警告を出す。
 *
 * ## 無い種族はどうなるか
 *
 * ここが null を返すと、従来のシェーダ変形が待機を担う。
 * **絵が届いた種族から順に切り替わる**ので、20体を揃えないと
 * 何も出せない、という形にはしない(モンスターの絵の時と同じ考え方)。
 */
export interface SpriteSheet {
  url: string;
  cols: number;
  rows: number;
  frames: number;
}

export function idleSheetFor(templateId: string, element: Element): SpriteSheet | null {
  for (const name of [`${templateId}-${element}-idle`, `${templateId}-idle`]) {
    const url = BY_NAME.get(name);
    const sheet = MANIFEST[name]?.sheet;
    if (url && sheet) return { url, ...sheet };
  }
  return null;
}

/**
 * コマ送り用のテクスチャ。**個体ごとに複製して返す。**
 *
 * `repeat` と `offset` でコマを切り出すので、テクスチャを共有すると
 * 同じ種族が2体並んだ時に**互いのコマ位置を上書きし合う。**
 * three.js の `clone()` は画像データ(`source`)を共有したまま
 * テクスチャだけを複製するので、GPUへ送る絵は1枚のまま済む。
 */
export function loadSheetTexture(url: string, cols: number, rows: number): THREE.Texture {
  const texture = loadSpriteTexture(url).clone();
  texture.needsUpdate = true;
  /*
   * **ミップマップを切る。**
   *
   * コマの境目でミップが隣のコマを拾い、輪郭に別のコマの色がにじむ。
   * 1コマ128pxに対して画面の表示は80px前後。縮小率が小さいので、
   * ミップが無くてもざらつかない。
   */
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.repeat.set(1 / cols, 1 / rows);
  return texture;
}

/**
 * その種族に2Dの絵があるか(基本の絵の有無で判定する)。
 *
 * **コマ送りのシートは数えない。** カード・図鑑・ホームのロビーは
 * 1枚絵(`portrait.ts`)から作るので、シートしか無い種族が出ると
 * そちらが空になる。シートを足す時は、**必ず1枚絵も一緒に置く。**
 */
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
