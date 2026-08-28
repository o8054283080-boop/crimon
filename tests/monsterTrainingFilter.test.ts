import { describe, expect, it } from "vitest";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { EMPTY_MONSTER_TRAINING_FILTER, filterTrainingMaterials } from "../src/web/views/monsterTraining.js";

describe("モンスター強化素材フィルタ", () => {
  const target = createMonsterInstance("slime_FIRE", 3, 1);
  const sameSpecies = createMonsterInstance("slime_WATER", 3, 1);
  const sameElement = createMonsterInstance("wolf_FIRE", 2, 1);
  const both = createMonsterInstance("slime_FIRE", 3, 1);
  const other = createMonsterInstance("golem_DARK", 3, 1);
  const candidates = [sameSpecies, sameElement, both, other];

  it("属性と★をそれぞれ絞り込み、複合条件はANDになる", () => {
    expect(filterTrainingMaterials(candidates, target, [], { ...EMPTY_MONSTER_TRAINING_FILTER, element: "FIRE" })).toEqual([sameElement, both]);
    expect(filterTrainingMaterials(candidates, target, [], { ...EMPTY_MONSTER_TRAINING_FILTER, star: 2 })).toEqual([sameElement]);
    expect(filterTrainingMaterials(candidates, target, [], { element: "FIRE", star: 3, use: "ALL" })).toEqual([both]);
  });

  it("同じ種族・同じ属性は強化ボーナスと同じ判定を使う", () => {
    expect(filterTrainingMaterials(candidates, target, [], { ...EMPTY_MONSTER_TRAINING_FILTER, use: "SAME_SPECIES" })).toEqual([sameSpecies, both]);
    expect(filterTrainingMaterials(candidates, target, [], { ...EMPTY_MONSTER_TRAINING_FILTER, use: "SAME_ELEMENT" })).toEqual([sameElement, both]);
  });

  it("選択中だけを表示でき、別条件で非表示になっても選択ID自体は変更しない", () => {
    const selected = [sameSpecies.id, other.id];
    expect(filterTrainingMaterials(candidates, target, selected, { ...EMPTY_MONSTER_TRAINING_FILTER, use: "SELECTED" })).toEqual([sameSpecies, other]);
    expect(filterTrainingMaterials(candidates, target, selected, { element: "FIRE", star: "ALL", use: "SELECTED" })).toEqual([]);
    expect(selected).toEqual([sameSpecies.id, other.id]);
  });

  it("一致する素材がなければ空配列になる", () => {
    expect(filterTrainingMaterials(candidates, target, [], { element: "LIGHT", star: 6, use: "SAME_SPECIES" })).toEqual([]);
  });
});
