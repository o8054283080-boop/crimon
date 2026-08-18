import { ELEMENTS, Element } from "../core/element.js";
import { MonsterInstance } from "../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../core/rarity.js";
import { findMonsterById } from "../data/monsters.js";

/**
 * 所持モンスターの並べ替え。
 *
 * 手持ちが増えると、目当ての1体を探すのに画面を延々とたどることになる。
 * 並べ替えの軸は「何をしに来たか」で決まるので、
 * 育成したい(レベル・星)・編成したい(総合力・属性)・見分けたい(種族)を揃えている。
 */
export type MonsterSortKey = "recommended" | "power" | "star" | "level" | "element" | "template" | "newest";

export const MONSTER_SORT_LABEL: Record<MonsterSortKey, string> = {
  recommended: "おすすめ",
  power: "総合力",
  star: "星",
  level: "レベル",
  element: "属性",
  template: "種族",
  newest: "新しい順",
};

export const MONSTER_SORT_KEYS: MonsterSortKey[] = ["recommended", "power", "star", "level", "element", "template", "newest"];

/**
 * ざっくりした総合力。
 *
 * 装備や相性まで含めた厳密な強さではなく、**並べ替えの軸として使うだけ**の目安。
 * HPは桁が大きいので10で割って、他の能力値と釣り合う重みにしてある。
 */
export function monsterPower(instance: MonsterInstance): number {
  const dex = findMonsterById(instance.dexId);
  if (!dex) return 0;
  const s = dex.stats;
  const base = s.hp / 10 + s.atk + s.def + s.spd;
  // 星とレベルの伸びを掛ける。星が上がるほど伸びしろも大きい
  const growth = instance.star * 1.0 + instance.level / 10;
  return Math.round(base * growth);
}

const ELEMENT_ORDER = new Map<Element, number>(ELEMENTS.map((e, i) => [e, i]));

function compareByTemplate(a: MonsterInstance, b: MonsterInstance): number {
  const da = findMonsterById(a.dexId);
  const db = findMonsterById(b.dexId);
  const ta = da?.templateId ?? "";
  const tb = db?.templateId ?? "";
  if (ta !== tb) return ta.localeCompare(tb);
  return (ELEMENT_ORDER.get(da?.element as Element) ?? 99) - (ELEMENT_ORDER.get(db?.element as Element) ?? 99);
}

function compareByElement(a: MonsterInstance, b: MonsterInstance): number {
  const da = findMonsterById(a.dexId);
  const db = findMonsterById(b.dexId);
  const ea = ELEMENT_ORDER.get(da?.element as Element) ?? 99;
  const eb = ELEMENT_ORDER.get(db?.element as Element) ?? 99;
  return ea - eb;
}

/** レベルの「上限に対する近さ」。星をまたいでも育ち具合を比べられる */
function levelProgress(instance: MonsterInstance): number {
  return instance.level / STAR_MAX_LEVEL[instance.star];
}

export interface MonsterSortContext {
  /** 編成中のモンスターID。おすすめ順で先頭へ寄せる */
  partyIds: readonly string[];
}

/**
 * 並べ替えの比較関数。
 *
 * どの軸でも**最後は総合力で決める**。同点が並ぶと、開くたびに順番が入れ替わって
 * 見えてしまい(実際には安定ソートでも、選択や削除のあとで並びが動く)、
 * 目で追えなくなるため。
 */
export function compareMonsters(key: MonsterSortKey, context: MonsterSortContext) {
  return (a: MonsterInstance, b: MonsterInstance): number => {
    switch (key) {
      case "recommended": {
        // 編成中を最優先。そのうえで強い順
        const inA = context.partyIds.includes(a.id) ? 1 : 0;
        const inB = context.partyIds.includes(b.id) ? 1 : 0;
        if (inA !== inB) return inB - inA;
        break;
      }
      case "star":
        if (a.star !== b.star) return b.star - a.star;
        break;
      case "level":
        if (a.level !== b.level) return b.level - a.level;
        if (levelProgress(a) !== levelProgress(b)) return levelProgress(b) - levelProgress(a);
        break;
      case "element": {
        const diff = compareByElement(a, b);
        if (diff !== 0) return diff;
        break;
      }
      case "template": {
        const diff = compareByTemplate(a, b);
        if (diff !== 0) return diff;
        break;
      }
      case "newest":
        // 後から手に入れたものほど配列の後ろにあるので、逆順にする。
        // ここだけは総合力で崩さない(「新しい順」が守られないと意味がない)
        return 0;
      case "power":
        break;
    }
    return monsterPower(b) - monsterPower(a);
  };
}

/** 並べ替えた新しい配列を返す(元の配列は変えない) */
export function sortMonsters(
  monsters: readonly MonsterInstance[],
  key: MonsterSortKey,
  context: MonsterSortContext,
): MonsterInstance[] {
  if (key === "newest") return monsters.slice().reverse();
  return monsters.slice().sort(compareMonsters(key, context));
}
