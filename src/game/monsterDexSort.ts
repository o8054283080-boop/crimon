import { ELEMENTS, Element } from "../core/element.js";
import { MonsterDefinition } from "../core/monster.js";

/**
 * 図鑑の並べ替え。
 *
 * 66体が図鑑番号だけで並んでいたので、「炎の耐久型はどれか」「クロノスの
 * 6属性はどこか」を探すのに全部たどることになっていた。
 *
 * **所持モンスターの並べ替え(`monsterSort.ts`)とは軸が別物。**
 * 図鑑は個体ではなく種の一覧なので、レベルも総合力も星も持たない。
 * 見比べるのは「属性・種族・役割・素の能力」の4つ。
 */
export type DexSortKey = "number" | "element" | "template" | "role" | "power";

export const DEX_SORT_LABEL: Record<DexSortKey, string> = {
  number: "図鑑順",
  element: "属性",
  template: "種族",
  role: "役割",
  power: "能力",
};

export const DEX_SORT_KEYS: DexSortKey[] = ["number", "element", "template", "role", "power"];

export function isDexSortKey(value: unknown): value is DexSortKey {
  return typeof value === "string" && (DEX_SORT_KEYS as string[]).includes(value);
}

/**
 * 素の能力の目安。
 *
 * 装備も育成も乗らない図鑑の値なので、**並べ替えの軸として使うだけ**。
 * HPは桁が大きいので10で割り、他と釣り合う重みにする
 * (`monsterSort.ts` の `monsterPower` と同じ考え方)。
 */
export function dexPower(dex: MonsterDefinition): number {
  const s = dex.stats;
  return Math.round(s.hp / 10 + s.atk + s.def + s.spd);
}

const ELEMENT_ORDER = new Map<Element, number>(ELEMENTS.map((element, index) => [element, index]));

/**
 * 並べ替えた新しい配列を返す(元の配列は変えない)。
 *
 * **どの軸でも最後は渡された並びで決める。** 画面は必ず図鑑順の配列を渡すので、
 * これは実質「図鑑番号順」。同点が並んだ時に順番が動くと、
 * 押した先が毎回変わって目で追えなくなる。
 */
export function sortDexEntries(entries: readonly MonsterDefinition[], key: DexSortKey): MonsterDefinition[] {
  const order = new Map<string, number>(entries.map((entry, index) => [entry.id, index]));
  const byNumber = (a: MonsterDefinition, b: MonsterDefinition) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  if (key === "number") return entries.slice();
  return entries.slice().sort((a, b) => {
    switch (key) {
      case "element": {
        const diff = (ELEMENT_ORDER.get(a.element) ?? 99) - (ELEMENT_ORDER.get(b.element) ?? 99);
        if (diff !== 0) return diff;
        break;
      }
      case "template": {
        if (a.templateId !== b.templateId) return a.templateId.localeCompare(b.templateId);
        const diff = (ELEMENT_ORDER.get(a.element) ?? 99) - (ELEMENT_ORDER.get(b.element) ?? 99);
        if (diff !== 0) return diff;
        break;
      }
      case "role": {
        if (a.role !== b.role) return a.role.localeCompare(b.role, "ja");
        break;
      }
      case "power": {
        const diff = dexPower(b) - dexPower(a);
        if (diff !== 0) return diff;
        break;
      }
    }
    return byNumber(a, b);
  });
}
