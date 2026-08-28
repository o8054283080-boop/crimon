import { describe, expect, it } from "vitest";
import { Equipment, EquipSlot, SetType, StatType } from "../src/core/equipment.js";
import { equipmentForSlot } from "../src/web/uxHelpers.js";
import { EquipmentSortKey, sortEquipment } from "../src/web/views/equipment.js";

function gear(id: string, overrides: Partial<Equipment> = {}): Equipment {
  return {
    id,
    slot: 1,
    star: 3,
    level: 0,
    set: "POWER",
    mainStat: { type: "ATK_FLAT", value: 1 },
    subStats: [],
    ...overrides,
  };
}

function ids(items: readonly Equipment[], key: EquipmentSortKey): string[] {
  return sortEquipment(items, key).map((item) => item.id);
}

const statKeys: StatType[] = [
  "HP_PERCENT", "HP_FLAT", "ATK_PERCENT", "ATK_FLAT", "DEF_PERCENT", "DEF_FLAT",
  "SPD", "CRIT_RATE", "CRIT_DMG", "ACCURACY", "RESISTANCE",
];

function statGear(id: string, type: StatType, value: number): Equipment {
  return gear(id, { mainStat: { type, value } });
}

describe("装備ソート回帰", () => {
  it.each(statKeys)("%s は同種ステータス合計の降順", (key) => {
    const scale = ["HP_FLAT", "ATK_FLAT", "DEF_FLAT", "SPD"].includes(key) ? 100 : 0.1;
    const input = [statGear("B", key, scale), statGear("A", key, scale * 3), statGear("C", key, scale * 2)];
    expect(ids(input, key)).toEqual(["A", "C", "B"]);
  });

  it("強化値は強化値降順、同値なら★、スロット、IDで安定する", () => {
    const input = [gear("B", { level: 2 }), gear("A", { level: 10 }), gear("C", { level: 6 })];
    expect(ids(input, "level")).toEqual(["A", "C", "B"]);
  });

  it("★は★降順、同値なら強化値、スロット、IDで安定する", () => {
    const input = [gear("B", { star: 1 }), gear("A", { star: 6 }), gear("C", { star: 4 })];
    expect(ids(input, "star")).toEqual(["A", "C", "B"]);
  });

  it("売値は計算済み売値の降順", () => {
    const input = [gear("B", { star: 1 }), gear("A", { star: 5, level: 10 }), gear("C", { star: 3, level: 4 })];
    expect(ids(input, "value")).toEqual(["A", "C", "B"]);
  });

  it("スロットは昇順、シリーズは識別子昇順で並ぶ", () => {
    const slots = [gear("B", { slot: 6 }), gear("A", { slot: 1 }), gear("C", { slot: 3 })];
    expect(ids(slots, "slot")).toEqual(["A", "C", "B"]);
    const sets: [string, SetType][] = [["B", "VITALITY"], ["A", "ACCURACY_SET"], ["C", "SWIFT"]];
    expect(ids(sets.map(([id, set]) => gear(id, { set })), "set")).toEqual(["A", "C", "B"]);
  });

  it("おすすめは装着中、スロット、★、強化値の順", () => {
    const input = [gear("B", { slot: 1, star: 2 }), gear("A", { slot: 6 }), gear("C", { slot: 1, star: 6 })];
    expect(sortEquipment(input, "recommended", (item) => item.id === "A").map((item) => item.id)).toEqual(["A", "C", "B"]);
  });

  it("%系と実数系を相互に混ぜない", () => {
    const input = [
      gear("flat", { mainStat: { type: "HP_FLAT", value: 9999 }, subStats: [{ type: "ATK_FLAT", value: 9999 }, { type: "DEF_FLAT", value: 9999 }] }),
      gear("percent", { mainStat: { type: "HP_PERCENT", value: 0.2 }, subStats: [{ type: "ATK_PERCENT", value: 0.3 }, { type: "DEF_PERCENT", value: 0.4 }] }),
    ];
    expect(ids(input, "HP_PERCENT")).toEqual(["percent", "flat"]);
    expect(ids(input, "ATK_PERCENT")).toEqual(["percent", "flat"]);
    expect(ids(input, "DEF_PERCENT")).toEqual(["percent", "flat"]);
    expect(ids(input, "HP_FLAT")).toEqual(["flat", "percent"]);
    expect(ids(input, "ATK_FLAT")).toEqual(["flat", "percent"]);
    expect(ids(input, "DEF_FLAT")).toEqual(["flat", "percent"]);
  });

  it("会心率/会心ダメージと効果命中/効果抵抗を相互に混ぜない", () => {
    const input = [
      gear("rate-accuracy", { subStats: [{ type: "CRIT_RATE", value: 0.5 }, { type: "ACCURACY", value: 0.5 }] }),
      gear("damage-resist", { subStats: [{ type: "CRIT_DMG", value: 0.9 }, { type: "RESISTANCE", value: 0.9 }] }),
    ];
    expect(ids(input, "CRIT_RATE")).toEqual(["rate-accuracy", "damage-resist"]);
    expect(ids(input, "CRIT_DMG")).toEqual(["damage-resist", "rate-accuracy"]);
    expect(ids(input, "ACCURACY")).toEqual(["rate-accuracy", "damage-resist"]);
    expect(ids(input, "RESISTANCE")).toEqual(["damage-resist", "rate-accuracy"]);
  });

  it("全比較値が同じ場合は装備IDを最終タイブレークにする", () => {
    expect(ids([gear("C"), gear("A"), gear("B")], "HP_PERCENT")).toEqual(["A", "B", "C"]);
  });

  it("モンスター装備候補もスロット絞り込み後に選択中ソートを適用する", () => {
    const inventory = [
      statGear("B", "SPD", 10),
      statGear("other-slot", "SPD", 999),
      statGear("A", "SPD", 30),
      statGear("C", "SPD", 20),
    ];
    inventory[1].slot = 2;
    expect(sortEquipment(equipmentForSlot(inventory, 1 as EquipSlot), "SPD").map((item) => item.id)).toEqual(["A", "C", "B"]);
  });
});
