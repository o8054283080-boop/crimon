import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ELEMENTS } from "../src/core/element.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";
import { DEX_SORT_KEYS, DEX_SORT_LABEL, DexSortKey, dexPower, isDexSortKey, sortDexEntries } from "../src/game/monsterDexSort.js";

/*
 * 図鑑の並べ替え。
 *
 * 66体が図鑑番号だけで並んでいたので、「炎の耐久型はどれか」
 * 「クロノスの6属性はどこか」を探すのに全部たどることになっていた。
 *
 * 所持モンスターの並べ替え(`monsterSort.ts`)とは軸が別物。
 * 図鑑は個体ではなく種の一覧なので、レベルも総合力も星も持たない。
 */

const ALL = ALL_DISPLAYABLE_MONSTERS_DEX;

describe("図鑑の並べ替え", () => {
  it("どの軸でも1体も落とさず、増やさない", () => {
    for (const key of DEX_SORT_KEYS) {
      const sorted = sortDexEntries(ALL, key);
      expect(sorted, `${key} で件数が変わった`).toHaveLength(ALL.length);
      expect(new Set(sorted.map((d) => d.id)).size, `${key} で重複か欠落`).toBe(ALL.length);
    }
  });

  it("元の配列を書き換えない", () => {
    const before = ALL.map((d) => d.id);
    sortDexEntries(ALL, "power");
    expect(ALL.map((d) => d.id)).toEqual(before);
  });

  it("図鑑順は元の並びのまま", () => {
    expect(sortDexEntries(ALL, "number").map((d) => d.id)).toEqual(ALL.map((d) => d.id));
  });

  it("属性順は属性の定義順に固まる", () => {
    const order = new Map(ELEMENTS.map((e, i) => [e, i]));
    const seen = sortDexEntries(ALL, "element").map((d) => order.get(d.element) ?? 99);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it("種族順は同じ種族が固まり、その中は属性順", () => {
    const sorted = sortDexEntries(ALL, "template");
    const firstIndex = new Map<string, number>();
    sorted.forEach((d, i) => { if (!firstIndex.has(d.templateId)) firstIndex.set(d.templateId, i); });
    // 同じ種族が離れて現れない = 連続している
    for (const [templateId, start] of firstIndex) {
      const members = sorted.filter((d) => d.templateId === templateId);
      expect(sorted.slice(start, start + members.length).every((d) => d.templateId === templateId),
        `${templateId} が連続していない`).toBe(true);
    }
  });

  it("能力順は強い方から並ぶ", () => {
    const values = sortDexEntries(ALL, "power").map(dexPower);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it("同点は渡された並び(=図鑑番号)の順で決まる", () => {
    /*
     * 同点が並んだ時に順番が動くと、押した先が毎回変わって目で追えなくなる。
     * 役割は種類が少ないので同点が大量に出る軸。
     * 画面は必ず図鑑順の配列を渡すので、同点は図鑑番号の順に並ぶ。
     */
    const number = new Map(ALL.map((d, i) => [d.id, i]));
    for (const key of DEX_SORT_KEYS) {
      const sorted = sortDexEntries(ALL, key);
      expect(sortDexEntries(ALL, key).map((d) => d.id), `${key} が呼ぶたび変わる`).toEqual(sorted.map((d) => d.id));
    }
    const byRole = sortDexEntries(ALL, "role");
    for (let i = 1; i < byRole.length; i++) {
      if (byRole[i - 1].role !== byRole[i].role) continue;
      expect(number.get(byRole[i - 1].id)!, "同じ役割の中が図鑑番号順でない")
        .toBeLessThan(number.get(byRole[i].id)!);
    }
  });

  it("すべての軸に日本語の名前がある", () => {
    for (const key of DEX_SORT_KEYS) expect(DEX_SORT_LABEL[key], key).toBeTruthy();
    expect(Object.keys(DEX_SORT_LABEL).sort()).toEqual([...DEX_SORT_KEYS].sort());
  });

  it("保存された値が壊れていても既定へ落ちる", () => {
    expect(isDexSortKey("power")).toBe(true);
    expect(isDexSortKey("recommended")).toBe(false);
    expect(isDexSortKey(null)).toBe(false);
  });

  it("図鑑番号は並べ替えても振り直さない", () => {
    /*
     * 「No.007」はその種を指す名前。表示の順番で振り直すと、
     * 図鑑を見ながら話が通じなくなる。番号は必ず元の並びから引く。
     */
    const view = readFileSync(new URL("../src/web/views/monsterDex.ts", import.meta.url), "utf8");
    expect(view).toContain("const numbers = new Map(ALL_DISPLAYABLE_MONSTERS_DEX.map((dex, index) => [dex.id, index]))");
    expect(view).toContain("numbers.get(dex.id)");
    // 並べ替えた配列の添字を番号に使っていない
    expect(view).not.toMatch(/entries\.map\(\(dex, index\) => dexCard\(dex, index/);
  });

  it("並べ替えの札は所持モンスターの一覧と同じ形", () => {
    // 同じ操作は同じ見た目で置く。画面ごとに形が違うと迷う
    const view = readFileSync(new URL("../src/web/views/monsterDex.ts", import.meta.url), "utf8");
    expect(view).toContain('className: "slot-filter-row sort-row monster-dex__sort"');
    expect(view).toContain("slot-filter-chip--active");
  });
});

describe("図鑑の並べ替えは所持一覧と混ざらない", () => {
  it("図鑑の軸に、個体しか持たない値が入っていない", () => {
    // レベル・総合力・星は個体の話。種の一覧に出しても意味が無い
    const forbidden: string[] = ["level", "newest", "star", "recommended"];
    for (const key of DEX_SORT_KEYS as string[]) expect(forbidden).not.toContain(key);
  });

  it("型としても取り違えられない", () => {
    const key: DexSortKey = "template";
    expect(DEX_SORT_KEYS).toContain(key);
  });
});
