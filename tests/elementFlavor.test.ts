import { describe, expect, it } from "vitest";
import { ELEMENTS, type Element } from "../src/core/element.js";
import { elementStatFlavorOf } from "../src/core/monster.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX, ALL_MONSTER_TEMPLATES, findMonster } from "../src/data/monsters.js";

/**
 * 属性ごとのステータス補正。
 *
 * 直した歪みは2つ。
 *
 *   1. **上がるだけで、下がるものが1つも無かった。**属性は引いた時に決まるもので
 *      選べないので、上がるだけだと「木を引けば得、光を引けば損」の当たり外れになる
 *   2. **電気の速度+15%が効きすぎた。**速度は何回動けるかに直結する
 *
 * ここで見張るのは4つ。
 *
 *   1. どの型も「1つ上げて、1つ下げる」
 *   2. **速度を上げる型は1つだけ、上げ幅も小さい**
 *   3. 属性ごとに型が割れている(同じモンスターでも属性で上がるものが違う)
 *   4. 何度呼んでも同じ型になる(決定論)
 */

/** テンプレートの素の値に対して、その属性の型を掛けた結果 */
function flavored(templateId: string, element: Element) {
  const template = ALL_MONSTER_TEMPLATES.find((t) => t.templateId === templateId)!;
  return elementStatFlavorOf(templateId, element).apply({ ...template.baseStats });
}

const NUMERIC_KEYS = ["hp", "atk", "def", "spd", "criRate", "criDmg", "accuracy", "resistance"] as const;

describe("どの型も、1つ上げて1つ下げる", () => {
  for (const element of ELEMENTS) {
    it(`${element}`, () => {
      /*
       * **全テンプレートを回す。**型は属性ごとに複数あり、どれが使われるかは
       * テンプレートIDで決まるので、1体だけ見ると片方の型を見落とす。
       */
      const seen = new Set<string>();
      for (const template of ALL_MONSTER_TEMPLATES) {
        const flavor = elementStatFlavorOf(template.templateId, element);
        if (seen.has(flavor.note)) continue;
        seen.add(flavor.note);

        const before = { ...template.baseStats };
        const after = flavor.apply({ ...before });
        const ups = NUMERIC_KEYS.filter((key) => after[key] > before[key]);
        const downs = NUMERIC_KEYS.filter((key) => after[key] < before[key]);
        expect(ups.length, `${flavor.note}: 上がるものが1つ`).toBe(1);
        expect(downs.length, `${flavor.note}: 下がるものが1つ`).toBe(1);
      }
      // 属性ごとに型が2つある(どちらも実際に使われている)
      expect(seen.size, `${element} の型の数`).toBe(2);
    });
  }
});

describe("速度は慎重に扱う", () => {
  /*
   * 速度は手番の数に直結する。装備ダンジョンでは「10階の速度を1.85→1.96
   * (わずか6%)に上げただけで最強編成の勝率が0%から動かなくなる」ほど鋭い。
   */
  it("速度を上げる型は全属性で1つだけ、上げ幅は6%まで", () => {
    const risers: string[] = [];
    for (const element of ELEMENTS) {
      for (const template of ALL_MONSTER_TEMPLATES) {
        const flavor = elementStatFlavorOf(template.templateId, element);
        const before = { ...template.baseStats, spd: 100 };
        const after = flavor.apply(before);
        if (after.spd > before.spd) {
          expect(after.spd, `${element} / ${flavor.note}`).toBeLessThanOrEqual(106);
          if (!risers.includes(`${element}:${flavor.note}`)) risers.push(`${element}:${flavor.note}`);
        }
      }
    }
    expect(risers, "速度が上がる型").toHaveLength(1);
    expect(risers[0]).toContain("ELECTRIC");
  });

  it("速度を下げる型も1つだけ、下げ幅は4%まで", () => {
    const fallers: string[] = [];
    for (const element of ELEMENTS) {
      for (const template of ALL_MONSTER_TEMPLATES) {
        const flavor = elementStatFlavorOf(template.templateId, element);
        const before = { ...template.baseStats, spd: 100 };
        const after = flavor.apply(before);
        if (after.spd < before.spd) {
          expect(after.spd, `${element} / ${flavor.note}`).toBeGreaterThanOrEqual(96);
          if (!fallers.includes(`${element}:${flavor.note}`)) fallers.push(`${element}:${flavor.note}`);
        }
      }
    }
    expect(fallers, "速度が下がる型").toHaveLength(1);
  });
});

describe("属性ごとに型が割れている", () => {
  /*
   * **ここが今回いちばん間違えたところ。**
   *
   * 最初 `hash * 31 + code`、次に FNV-1a で書いたが、どちらも掛ける数が奇数なので
   * 剰余2では全文字コードの最下位ビットのXORしか見ていない。結果として
   * 「FIREとGRASSは必ず同じ型、WATERとELECTRICは必ず同じ型」になり、
   * 全モンスターが2グループに分かれるだけで、属性ごとに変わっていなかった。
   * 表を出して初めて気づいた。
   */
  it("同じモンスターでも、4つの属性で型がばらける", () => {
    const targets = ["dragon", "wolf", "golem", "fairy", "griffon", "nemesis"];
    const cycle: Element[] = ["FIRE", "WATER", "ELECTRIC", "GRASS"];
    let mixed = 0;
    for (const templateId of targets) {
      const indexes = cycle.map((element) => {
        const flavors = ["攻撃", "クリダメ", "防御", "HP", "速度", "命中"];
        return flavors.findIndex((k) => elementStatFlavorOf(templateId, element).note.startsWith(k));
      });
      if (new Set(indexes).size >= 3) mixed += 1;
    }
    // 6体のうち大半が3種類以上の型を持っていれば、割れていると言える
    expect(mixed, "型がばらけたモンスター数").toBeGreaterThanOrEqual(4);
  });

  it("属性ごとに、どちらの型も実際に使われている", () => {
    for (const element of ELEMENTS) {
      const notes = new Set(ALL_MONSTER_TEMPLATES.map((t) => elementStatFlavorOf(t.templateId, element).note));
      expect(notes.size, `${element}`).toBe(2);
    }
  });
});

describe("何度呼んでも同じ", () => {
  it("同じテンプレートと属性なら必ず同じ型", () => {
    for (const templateId of ["dragon", "fairy", "kobold"]) {
      for (const element of ELEMENTS) {
        const first = elementStatFlavorOf(templateId, element).note;
        for (let i = 0; i < 5; i += 1) {
          expect(elementStatFlavorOf(templateId, element).note).toBe(first);
        }
      }
    }
  });

  it("図鑑に出る値と一致する", () => {
    const dex = findMonster("dragon", "FIRE")!;
    expect(dex.stats).toEqual(flavored("dragon", "FIRE"));
  });
});

describe("会心の平準化を割らない", () => {
  /*
   * `tests/secondaryStatsFinal.test.ts` が CR15〜23% / CD150〜170% を要求している。
   * 素の上限(CR20% / CD165%)から動かせる幅は +3% / +5% しかないので、
   * 会心を上げる型はそこに収める。
   */
  it("属性補正の後もCR23%・CD170%を超えない", () => {
    for (const monster of ALL_DISPLAYABLE_MONSTERS_DEX) {
      expect(monster.stats.criRate, monster.id).toBeLessThanOrEqual(0.23);
      expect(monster.stats.criDmg, monster.id).toBeLessThanOrEqual(1.7);
    }
  });
});
