import { EquipStar, Equipment, SET_TYPES, SetType, generateEquipment } from "../core/equipment.js";
import { Star } from "../core/rarity.js";
import { ELEMENTS, Element } from "../core/element.js";
import { MONSTER_TEMPLATES } from "../data/monsters.js";
import { MAX_FIGHTER_LEVEL } from "../core/fighterLevel.js";

/**
 * ショップ。1時間ごとに品揃えが入れ替わる。
 *
 * 品揃えはサーバを持たずに決めたいので、**時刻から決定的に生成**している
 * (乱数を保存すると、端末をまたいだ時や保存が壊れた時に品揃えが飛ぶ)。
 * 同じ時間帯なら何度開いても同じ並びになり、購入済みの枠も正しく残る。
 */

/** 品揃えが入れ替わる間隔(ミリ秒) */
export const SHOP_ROTATION_MS = 60 * 60 * 1000;

/** 最初から開いている枠の数 */
export const SHOP_INITIAL_SLOTS = 5;
/** 枠の上限(ダイヤで SHOP_INITIAL_SLOTS からここまで開けられる) */
export const SHOP_MAX_SLOTS = 10;

/**
 * 枠を1つ開けるのに要るダイヤ。開けるほど高くなる。
 * 6枠目から10枠目まで、順に対応する。
 */
export const SHOP_SLOT_UNLOCK_COSTS = [150, 250, 400, 600, 900];

/** 装備の星ごとの値段(ゴールド) */
export const SHOP_EQUIPMENT_PRICE: Record<EquipStar, number> = {
  1: 1000,
  2: 3000,
  3: 6000,
  4: 12000,
  5: 35000,
  6: 100000,
};

/** モンスターの星ごとの値段(ゴールド)。ショップに出るのは星3まで */
export const SHOP_MONSTER_PRICE: Record<1 | 2 | 3, number> = {
  1: 3000,
  2: 7500,
  3: 12000,
};

/** 召喚の書の個数ごとの値段(ゴールド)。まとめ買いほど1個あたりが安い */
export const SHOP_SCROLL_PRICES: { count: number; price: number }[] = [
  { count: 1, price: 10000 },
  { count: 3, price: 25000 },
  { count: 5, price: 40000 },
  { count: 10, price: 80000 },
];

export type ShopEntry =
  | { kind: "EQUIPMENT"; equipment: Equipment; price: number }
  | { kind: "MONSTER"; dexId: string; star: 1 | 2 | 3; price: number }
  | { kind: "SCROLL"; count: number; price: number };

export interface ShopLineup {
  /** この品揃えの識別子。時間帯が変わると変わる(購入済みの管理に使う) */
  rotationKey: number;
  entries: ShopEntry[];
  /** 次に品揃えが入れ替わる時刻(ミリ秒epoch) */
  nextRotationAt: number;
}

/** 品揃え生成用の決定的な乱数。時間帯とファイターレベルから作る */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)];
}

/**
 * ファイターレベルに応じた、装備の星の重み。
 *
 * レベルが上がるほど高い星が出やすくなるが、**低い星が出なくなることはない**。
 * 星6だけが並ぶ品揃えは、一見豪華でも「買えないものが並んでいるだけ」になる。
 * 具体的な確率はゲーム内では公開しない。
 */
function equipmentStarWeights(fighterLevel: number): { star: EquipStar; weight: number }[] {
  // 0(レベル1)〜1(上限)へ滑らかに進む度合い
  const t = Math.max(0, Math.min(1, (fighterLevel - 1) / (MAX_FIGHTER_LEVEL - 1)));
  return [
    { star: 1, weight: 40 - 34 * t },
    { star: 2, weight: 28 - 16 * t },
    { star: 3, weight: 18 + 2 * t },
    { star: 4, weight: 9 + 15 * t },
    { star: 5, weight: 4 + 20 * t },
    { star: 6, weight: 1 + 13 * t },
  ];
}

function pickWeighted<T>(items: { value: T; weight: number }[], rng: () => number): T {
  const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

/** 星が高いほどサブステータスも多めに付く(値段に見合う中身にするため) */
function subStatCountFor(star: EquipStar, rng: () => number): number {
  const base = star >= 5 ? 2 : star >= 3 ? 1 : 0;
  return Math.min(4, base + (rng() < 0.45 ? 1 : 0));
}

/**
 * ショップに並ぶモンスターの候補。
 *
 * ダンジョンやステージで手に入る通常モンスターに限る。
 * ガチャ限定の高レア(グリフォン/ドラゴン/セラフ/ネメシス)をここで売ると、
 * 召喚に石を使う理由が無くなってしまう。
 */
function monsterCandidates(): { dexId: string; templateId: string; element: Element }[] {
  const out: { dexId: string; templateId: string; element: Element }[] = [];
  for (const template of MONSTER_TEMPLATES) {
    for (const element of ELEMENTS) {
      out.push({ dexId: `${template.templateId}_${element}`, templateId: template.templateId, element });
    }
  }
  return out;
}

/** 星1〜3の重み。星3はたまにしか出ない */
const MONSTER_STAR_WEIGHTS: { value: 1 | 2 | 3; weight: number }[] = [
  { value: 1, weight: 55 },
  { value: 2, weight: 32 },
  { value: 3, weight: 13 },
];

/** その時刻がどの品揃えに属するかの識別子 */
export function rotationKeyAt(now: number): number {
  return Math.floor(now / SHOP_ROTATION_MS);
}

function buildEntry(rng: () => number, fighterLevel: number, index: number): ShopEntry {
  // 枠の性格を index で決め打ちしておく。全部を抽選にすると、
  // 「装備しか並ばない回」「書しか並ばない回」が普通に起きて品揃えとして成立しない
  const role = index % 5;

  if (role === 3) {
    const monster = pick(monsterCandidates(), rng);
    const star = pickWeighted(MONSTER_STAR_WEIGHTS, rng);
    return { kind: "MONSTER", dexId: monster.dexId, star, price: SHOP_MONSTER_PRICE[star] };
  }
  if (role === 4) {
    const offer = pick(SHOP_SCROLL_PRICES, rng);
    return { kind: "SCROLL", count: offer.count, price: offer.price };
  }

  const star = pickWeighted(
    equipmentStarWeights(fighterLevel).map((w) => ({ value: w.star, weight: w.weight })),
    rng,
  );
  const set: SetType = pick(SET_TYPES, rng);
  const equipment = generateEquipment({ star, subStatCount: subStatCountFor(star, rng), set, rng });
  return { kind: "EQUIPMENT", equipment, price: SHOP_EQUIPMENT_PRICE[star] };
}

/**
 * 品揃えの装備に、時間帯と枠から決まるIDを振り直す。
 *
 * `generateEquipment` のIDは時刻と乱数から作られるため、同じ時間帯に
 * 画面を開き直すだけで別物になってしまう。品揃えは「保存せずに再現できる」ことが
 * 前提なので、ここだけは決定的なIDにする。
 * 時間帯の番号は単調に増えるので、過去の品と衝突することはない。
 */
function stableEquipmentId(rotationKey: number, slotIndex: number): string {
  return `shop_${rotationKey.toString(36)}_${slotIndex}`;
}

/**
 * その時刻・そのファイターレベルでの品揃えを組み立てる。
 * `slots` は開いている枠の数。枠を増やしても既存の並びは変わらない
 * (末尾に足されるだけ)ので、解放した瞬間に欲しかった品が消えることはない。
 */
export function buildShopLineup(now: number, fighterLevel: number, slots: number): ShopLineup {
  const rotationKey = rotationKeyAt(now);
  const count = Math.max(0, Math.min(SHOP_MAX_SLOTS, slots));
  const entries: ShopEntry[] = [];
  for (let i = 0; i < count; i++) {
    // 枠ごとに別の乱数列にする。1本の列から順に取ると、
    // 枠を増やした時に後続の抽選がずれて既存の並びまで変わってしまう
    const rng = seededRng(rotationKey * 8191 + i * 131 + fighterLevel * 17);
    const entry = buildEntry(rng, fighterLevel, i);
    if (entry.kind === "EQUIPMENT") entry.equipment.id = stableEquipmentId(rotationKey, i);
    entries.push(entry);
  }
  return { rotationKey, entries, nextRotationAt: (rotationKey + 1) * SHOP_ROTATION_MS };
}

/** 次の入れ替えまでの残り(ミリ秒) */
export function msUntilRotation(now: number): number {
  return (rotationKeyAt(now) + 1) * SHOP_ROTATION_MS - now;
}

/** 次に枠を1つ開けるのに要るダイヤ。もう開けられないなら null */
export function nextSlotUnlockCost(unlockedSlots: number): number | null {
  const index = unlockedSlots - SHOP_INITIAL_SLOTS;
  if (index < 0 || index >= SHOP_SLOT_UNLOCK_COSTS.length) return null;
  return SHOP_SLOT_UNLOCK_COSTS[index];
}

/** 表示用のラベル。値段はUIに出すが、星の出やすさは出さない */
export function describeShopEntry(entry: ShopEntry): string {
  switch (entry.kind) {
    case "EQUIPMENT":
      return `星${entry.equipment.star} 装備`;
    case "MONSTER":
      return `星${entry.star} モンスター`;
    case "SCROLL":
      return `召喚の書 ×${entry.count}`;
  }
}

export type { Star };
