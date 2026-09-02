import { describe, expect, it } from "vitest";
import {
  DUNGEON_FLOOR_COUNT,
  DUNGEON_FLOOR_STAR_WEIGHTS,
  generateDungeonEquipment,
  getDungeonFloorDropRates,
} from "../src/core/equipment.js";
import { EQUIPMENT_DUNGEON_FLOORS, findDungeonFloor } from "../src/data/equipmentDungeon.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { MONSTER_TEMPLATES } from "../src/data/monsters.js";

const COMPANION_TEMPLATE_IDS = MONSTER_TEMPLATES.map((t) => t.templateId);
const FINAL_BOSS_FLOOR_START = 9;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("装備ダンジョン フロアデータ", () => {
  it("1〜10階まで存在する", () => {
    expect(EQUIPMENT_DUNGEON_FLOORS).toHaveLength(DUNGEON_FLOOR_COUNT);
    for (let i = 1; i <= DUNGEON_FLOOR_COUNT; i++) {
      expect(findDungeonFloor(i)).toBeDefined();
    }
  });

  it("各階層の敵は全員同じ属性で統一されている(弱点属性を突きやすくするため)", () => {
    for (let floor = 1; floor <= DUNGEON_FLOOR_COUNT; floor++) {
      const enemies = findDungeonFloor(floor)!.enemies;
      const elements = new Set(enemies.map((e) => e.element));
      expect(elements.size).toBe(1);
    }
  });

  it("各階層はボス1体+お供2体の3体編成になっている", () => {
    for (let floor = 1; floor <= DUNGEON_FLOOR_COUNT; floor++) {
      const enemies = findDungeonFloor(floor)!.enemies;
      expect(enemies).toHaveLength(3);
      const bosses = enemies.filter((e) => e.isBoss);
      expect(bosses).toHaveLength(1);
    }
  });

  it("全10階のボスは専用モンスター「古代の魔人」で固定され、星6・Lv60で登場する", () => {
    for (let floor = 1; floor <= DUNGEON_FLOOR_COUNT; floor++) {
      const boss = findDungeonFloor(floor)!.enemies.find((e) => e.isBoss)!;
      expect(boss.templateId).toBe("ancient_demon");
      expect(boss.star).toBe(6);
      expect(boss.level).toBe(60);
    }
  });

  it("10階は魔人HP8.5倍・お供HP5倍、他階ボスはHP5倍になる", () => {
    for (let floor = 1; floor <= DUNGEON_FLOOR_COUNT; floor++) {
      const enemies = findDungeonFloor(floor)!.enemies;
      const boss = enemies.find((e) => e.isBoss)!;
      expect(boss.hpMultiplier).toBe(floor === 10 ? 8.5 : 5);
      expect(boss.spdMultiplier).toBe(1.3);
      for (const companion of enemies.filter((e) => !e.isBoss)) {
        expect(companion.hpMultiplier).toBe(floor === 10 ? 4 : undefined);
        expect(companion.spdMultiplier).toBeUndefined();
      }
    }
  });

  it("10階だけ古代の魔人が勝利対象として定義される", () => {
    expect(findDungeonFloor(10)!.enemies.filter((enemy) => enemy.victoryTarget).map((enemy) => enemy.templateId))
      .toEqual(["ancient_demon"]);
    expect(findDungeonFloor(9)!.enemies.some((enemy) => enemy.victoryTarget)).toBe(false);
  });

  it("個体倍率は実際の戦闘ステータスに反映される(HPは5倍、素早さは1.3倍)", () => {
    const floor = findDungeonFloor(1)!;
    const [boss] = buildDungeonEnemyTeam(floor);
    // 倍率を外した同じ個体と比べて、HPと素早さだけが伸びていることを確かめる
    const plain = buildDungeonEnemyTeam({
      ...floor,
      enemies: [{ ...floor.enemies[0], hpMultiplier: undefined, spdMultiplier: undefined }],
    })[0];
    expect(boss.stats.hp / plain.stats.hp).toBeCloseTo(5, 1);
    expect(boss.stats.spd / plain.stats.spd).toBeCloseTo(1.3, 1);
    expect(boss.stats.atk).toBe(plain.stats.atk);
    expect(boss.stats.def).toBe(plain.stats.def);
  });

  it("1〜8階のお供は通常モンスター種から選ばれ、星5・Lv50でボスより格下の強さになっている", () => {
    for (let floor = 1; floor < FINAL_BOSS_FLOOR_START; floor++) {
      const companions = findDungeonFloor(floor)!.enemies.filter((e) => !e.isBoss);
      expect(companions).toHaveLength(2);
      for (const companion of companions) {
        expect(COMPANION_TEMPLATE_IDS).toContain(companion.templateId);
        expect(companion.star).toBe(5);
        expect(companion.level).toBe(50);
      }
    }
  });

  it("9・10階(最終関門)は専用のオリジナルボス「古代の魔人」+お供「古代のクリスタル」「古代の呪晶」で固定される", () => {
    for (let floor = FINAL_BOSS_FLOOR_START; floor <= DUNGEON_FLOOR_COUNT; floor++) {
      const enemies = findDungeonFloor(floor)!.enemies;
      const boss = enemies.find((e) => e.isBoss)!;
      const companions = enemies.filter((e) => !e.isBoss);
      expect(boss.templateId).toBe("ancient_demon");
      expect(boss.star).toBe(6);
      expect(boss.level).toBe(60);
      expect(companions).toHaveLength(2);
      const companionTemplateIds = companions.map((c) => c.templateId).sort();
      expect(companionTemplateIds).toEqual(["ancient_crystal", "ancient_crystal_curse"]);
      for (const companion of companions) {
        expect(companion.star).toBe(5);
        expect(companion.level).toBe(50);
      }
    }
  });

  it("階層グループごとの最低レアリティ未満は出現しない", () => {
    for (let floor = 1; floor <= 3; floor++) {
      const stars = DUNGEON_FLOOR_STAR_WEIGHTS[floor].map((w) => w.value);
      expect(Math.min(...stars)).toBe(2);
      expect(Math.max(...stars)).toBeLessThanOrEqual(4);
    }
    for (let floor = 4; floor <= 6; floor++) {
      const stars = DUNGEON_FLOOR_STAR_WEIGHTS[floor].map((w) => w.value);
      expect(Math.min(...stars)).toBe(3);
      expect(Math.max(...stars)).toBeLessThanOrEqual(5);
      expect(Math.max(...stars)).toBe(5);
    }
    for (let floor = 7; floor <= 9; floor++) {
      const stars = DUNGEON_FLOOR_STAR_WEIGHTS[floor].map((w) => w.value);
      expect(Math.min(...stars)).toBe(4);
      expect(Math.max(...stars)).toBe(6);
    }
    expect(DUNGEON_FLOOR_STAR_WEIGHTS[10].map((w) => w.value)).toEqual([5, 6]);
  });

  it("7〜10階の星6確率は変更前の値を維持する", () => {
    const expectedRates = { 7: 5, 8: 9, 9: 15, 10: 32 };
    for (const [floor, expectedPercent] of Object.entries(expectedRates)) {
      const rate = getDungeonFloorDropRates(Number(floor)).find((entry) => entry.star === 6);
      expect(rate?.percent).toBe(expectedPercent);
    }
  });

  it("各階層の出現率の合計は100%になる", () => {
    for (let floor = 1; floor <= DUNGEON_FLOOR_COUNT; floor++) {
      const rates = getDungeonFloorDropRates(floor);
      const total = rates.reduce((sum, r) => sum + r.percent, 0);
      expect(total).toBeCloseTo(100, 5);
    }
  });

  it("階層が上がるほど、そのグループ内で最高レアリティの出現率が上がっていく", () => {
    // 星4グループ(1〜3階)
    const group4 = [1, 2, 3].map((f) => getDungeonFloorDropRates(f).find((r) => r.star === 4)!.percent);
    expect(group4[1]).toBeGreaterThan(group4[0]);
    expect(group4[2]).toBeGreaterThan(group4[1]);

    // 星5グループ(4〜6階)
    const group5 = [4, 5, 6].map((f) => getDungeonFloorDropRates(f).find((r) => r.star === 5)!.percent);
    expect(group5[1]).toBeGreaterThan(group5[0]);
    expect(group5[2]).toBeGreaterThan(group5[1]);

    // 星6グループ(7〜10階)
    const group6 = [7, 8, 9, 10].map((f) => getDungeonFloorDropRates(f).find((r) => r.star === 6)!.percent);
    expect(group6[1]).toBeGreaterThan(group6[0]);
    expect(group6[2]).toBeGreaterThan(group6[1]);
    expect(group6[3]).toBeGreaterThan(group6[2]);
  });
});

describe("装備ダンジョン 装備生成 (generateDungeonEquipment)", () => {
  it("その階層で許可された星の範囲内でしか生成されない", () => {
    const rng = mulberry32(1);
    for (let floor = 1; floor <= DUNGEON_FLOOR_COUNT; floor++) {
      const allowedStars = DUNGEON_FLOOR_STAR_WEIGHTS[floor].map((w) => w.value);
      for (let i = 0; i < 100; i++) {
        const eq = generateDungeonEquipment(floor, rng);
        expect(allowedStars).toContain(eq.star);
      }
    }
  });

  it("実測でも階層が上がるほど最高レアリティの出現率が上がる(統計的検証)", () => {
    const rng = mulberry32(2);
    const N = 3000;
    function highStarRate(floor: number, star: number): number {
      let count = 0;
      for (let i = 0; i < N; i++) {
        if (generateDungeonEquipment(floor, rng).star === star) count += 1;
      }
      return count / N;
    }
    const floor7Rate = highStarRate(7, 6);
    const floor10Rate = highStarRate(10, 6);
    expect(floor10Rate).toBeGreaterThan(floor7Rate);
  });
});
