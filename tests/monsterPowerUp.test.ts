import { describe, expect, it } from "vitest";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { STAR_MAX_LEVEL, requiredExpForLevel } from "../src/core/rarity.js";
import {
  ALL_DISPLAYABLE_MONSTERS_DEX,
  ANCIENT_CRYSTAL_DEX,
  ANCIENT_DEMON_DEX,
  EXP_PIG_DEX,
  MONSTER_TEMPLATES_DEX,
  REINCARNATION_PIG_DEX,
  findMonsterById,
} from "../src/data/monsters.js";
import {
  applyMonsterPowerUp,
  checkMonsterPowerUp,
  feedExpValue,
  isSameElement,
  isSameSpecies,
} from "../src/game/monsterPowerUp.js";

describe("checkMonsterPowerUp", () => {
  it("素材が0体だと実行できない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    expect(checkMonsterPowerUp(target, [], []).ok).toBe(false);
  });

  it("対象自身を素材にはできない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    expect(checkMonsterPowerUp(target, [target], []).ok).toBe(false);
  });

  it("異なる種族の素材でも経験値用の素材として使える", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const material = createMonsterInstance("wolf_FIRE", 1, 1);
    expect(checkMonsterPowerUp(target, [material], []).ok).toBe(true);
  });

  it("同じ種族(属性違い)の素材も使える", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const material = createMonsterInstance("slime_WATER", 1, 1);
    expect(checkMonsterPowerUp(target, [material], []).ok).toBe(true);
  });

  it("パーティ編成中のモンスターは素材にできない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const material = createMonsterInstance("wolf_FIRE", 1, 1);
    expect(checkMonsterPowerUp(target, [material], [material.id]).ok).toBe(false);
  });

  it("対象が現在の星の最大レベルに達している場合、素材が無駄になるので実行できない(バグ回帰テスト)", () => {
    const target = createMonsterInstance("slime_FIRE", 1, STAR_MAX_LEVEL[1]);
    const material = createMonsterInstance(EXP_PIG_DEX[0].id, 6, STAR_MAX_LEVEL[6]);
    const check = checkMonsterPowerUp(target, [material], []);
    expect(check.ok).toBe(false);
    expect(check.reason).toBeTruthy();
  });

  it("対象がまだ最大レベルに達していなければ実行できる", () => {
    const target = createMonsterInstance("slime_FIRE", 1, STAR_MAX_LEVEL[1] - 1);
    const material = createMonsterInstance("wolf_FIRE", 1, 1);
    expect(checkMonsterPowerUp(target, [material], []).ok).toBe(true);
  });
});

describe("isSameSpecies", () => {
  it("同じ種族・同じ属性ならtrue", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const material = createMonsterInstance("slime_FIRE", 1, 1);
    expect(isSameSpecies(target, material)).toBe(true);
  });

  it("同じ種族で属性(色)が違ってもtrue", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const material = createMonsterInstance("slime_WATER", 1, 1);
    expect(isSameSpecies(target, material)).toBe(true);
  });

  it("種族が異なればfalse", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const material = createMonsterInstance("wolf_FIRE", 1, 1);
    expect(isSameSpecies(target, material)).toBe(false);
  });
});

describe("feedExpValue", () => {
  it("星が高いほど経験値の価値が高い", () => {
    const target = createMonsterInstance("slime_WATER", 1, 1);
    const low = createMonsterInstance("slime_FIRE", 1, 1);
    const high = createMonsterInstance("slime_FIRE", 3, 1);
    expect(feedExpValue(target, high)).toBeGreaterThan(feedExpValue(target, low));
  });

  it("同じ星ならレベルが高いほど経験値の価値が高い", () => {
    const target = createMonsterInstance("slime_WATER", 2, 1);
    const low = createMonsterInstance("slime_FIRE", 2, 1);
    const high = createMonsterInstance("slime_FIRE", 2, 15);
    expect(feedExpValue(target, high)).toBeGreaterThan(feedExpValue(target, low));
  });

  it("星ごとの基礎価値にそのレベルへ到達するための必要経験値分が上乗せされる(属性が異なる場合)", () => {
    const FEED_EXP_BASE_PER_STAR: Record<number, number> = { 1: 50, 2: 90, 3: 160, 4: 280, 5: 480, 6: 800 };
    const target = createMonsterInstance("slime_WATER", 4, 12);
    const material = createMonsterInstance("slime_FIRE", 4, 12);
    const expected = Math.round(FEED_EXP_BASE_PER_STAR[4] + requiredExpForLevel(12));
    expect(feedExpValue(target, material)).toBe(expected);
  });

  it("対象と同じ属性(色)の素材は経験値が1.5倍になる", () => {
    const target = createMonsterInstance("slime_FIRE", 4, 12);
    const sameElement = createMonsterInstance("wolf_FIRE", 4, 12);
    const diffElement = createMonsterInstance("wolf_WATER", 4, 12);
    expect(feedExpValue(target, sameElement)).toBe(Math.round(feedExpValue(target, diffElement) * 1.5));
  });
});

describe("applyMonsterPowerUp", () => {
  it("素材はすべて経験値になり、対象のレベルが上がる", () => {
    const target = createMonsterInstance("slime_FIRE", 3, 1);
    const materials = [createMonsterInstance("wolf_FIRE", 3, 20), createMonsterInstance("golem_WATER", 3, 20)];
    const before = target.level;

    const result = applyMonsterPowerUp(target, materials, () => 0);

    expect(result.expGained).toBeGreaterThan(0);
    expect(target.level).toBeGreaterThan(before);
  });

  it("異なる種族の素材ではスキルレベルは上がらない", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const materials = [createMonsterInstance("wolf_FIRE", 1, 1)];

    const result = applyMonsterPowerUp(target, materials, () => 0);

    expect(result.leveledSkillIndices).toHaveLength(0);
  });

  it("同じ種族(属性違い)の素材1体につき1回スキルレベルアップを試行する", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const materials = [
      createMonsterInstance("slime_WATER", 1, 1),
      createMonsterInstance("slime_ELECTRIC", 1, 1),
      createMonsterInstance("slime_GRASS", 1, 1),
    ];

    const result = applyMonsterPowerUp(target, materials, () => 0);

    expect(result.leveledSkillIndices).toHaveLength(3);
    expect(target.skillLevels.reduce((a, b) => a + b, 0)).toBe(3 + 3); // 初期値3(1,1,1) + 3レベル分
  });

  it("スキルが全て最大レベルに達すると以降は上昇しない(経験値は引き続き入る)", () => {
    const target = createMonsterInstance("slime_FIRE", 3, 1);
    target.skillLevels = [5, 5, 4];
    const materials = [
      createMonsterInstance("slime_WATER", 3, 20),
      createMonsterInstance("slime_ELECTRIC", 3, 20),
    ];

    const result = applyMonsterPowerUp(target, materials, () => 0);

    expect(target.skillLevels).toEqual([5, 5, 5]);
    expect(result.leveledSkillIndices.length).toBeLessThanOrEqual(1);
    expect(result.expGained).toBeGreaterThan(0);
  });

  it("同種と異種が混ざった素材でも、同種の分だけスキルレベルアップを試行する", () => {
    const target = createMonsterInstance("slime_FIRE", 1, 1);
    const materials = [
      createMonsterInstance("slime_WATER", 1, 1),
      createMonsterInstance("wolf_FIRE", 1, 1),
      createMonsterInstance("golem_WATER", 1, 1),
    ];

    const result = applyMonsterPowerUp(target, materials, () => 0);

    expect(result.leveledSkillIndices).toHaveLength(1);
  });
});

describe("モンスター図鑑データ", () => {
  it("全モンスター種×全属性が図鑑に掲載されている", () => {
    expect(MONSTER_TEMPLATES_DEX.length).toBeGreaterThan(0);
    for (const dex of MONSTER_TEMPLATES_DEX) {
      expect(dex.skills).toHaveLength(3);
    }
  });

  it("転生ピッグは図鑑一覧(通常モンスター図鑑)には含まれない", () => {
    const pigIds = new Set(REINCARNATION_PIG_DEX.map((p) => p.id));
    for (const dex of MONSTER_TEMPLATES_DEX) {
      expect(pigIds.has(dex.id)).toBe(false);
    }
  });

  it("findMonsterByIdで図鑑エントリを取得できる", () => {
    const dex = findMonsterById(MONSTER_TEMPLATES_DEX[0].id);
    expect(dex).toBeDefined();
    expect(dex?.id).toBe(MONSTER_TEMPLATES_DEX[0].id);
  });

  it("全モンスター(転生ピッグ含む)に仮アイコンの絵文字が設定されている", () => {
    for (const dex of [...MONSTER_TEMPLATES_DEX, ...REINCARNATION_PIG_DEX]) {
      expect(dex.emoji.length).toBeGreaterThan(0);
    }
  });

  it("古代の魔人・古代のクリスタルは装備ダンジョン専用で、通常の召喚・図鑑表示には出てこない", () => {
    const specialIds = new Set([...ANCIENT_DEMON_DEX, ...ANCIENT_CRYSTAL_DEX].map((m) => m.id));
    for (const dex of [...MONSTER_TEMPLATES_DEX, ...ALL_DISPLAYABLE_MONSTERS_DEX]) {
      expect(specialIds.has(dex.id)).toBe(false);
    }
  });

  it("古代の魔人・古代のクリスタルはfindMonsterByIdで解決できる(装備ダンジョンのバトル生成に必要)", () => {
    const demon = findMonsterById("ancient_demon_FIRE");
    const crystal = findMonsterById("ancient_crystal_FIRE");
    expect(demon).toBeDefined();
    expect(demon?.skills).toHaveLength(3);
    expect(crystal).toBeDefined();
    expect(crystal?.skills).toHaveLength(3);
  });

  it("種族が同じなら属性が違っても同じ絵文字になる(色違いフレーバー)", () => {
    const fireSlime = findMonsterById("slime_FIRE")!;
    const waterSlime = findMonsterById("slime_WATER")!;
    expect(fireSlime.emoji).toBe(waterSlime.emoji);
  });
});
