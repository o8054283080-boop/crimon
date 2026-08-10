import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { generateEquipment, SetType } from "../src/core/equipment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { Star } from "../src/core/rarity.js";
import { STAGES } from "../src/data/stages.js";
import { extractSurvivors, setupWaveBattle } from "../src/game/stageRunner.js";

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

const STARTER = [
  { templateId: "slime", element: "FIRE" },
  { templateId: "wolf", element: "WATER" },
  { templateId: "golem", element: "ELECTRIC" },
  { templateId: "fairy", element: "GRASS" },
];

/**
 * 章のボス(最終ステージ最終ウェーブ)を、指定した星・レベル・装備(全員フル6スロット、星1・サブ2個の
 * チャプターテーマシリーズ)のパーティでクリアできるかを試行し、勝率を返す。
 */
function chapterBossWinRate(chapter: number, star: Star, level: number, set: SetType, trials: number): number {
  const stage = STAGES.filter((s) => s.chapter === chapter)[4];
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const gearRng = mulberry32(1000 + i);
    const party = STARTER.map((s) => createMonsterInstance(`${s.templateId}_${s.element}`, star, level));
    const equipmentList = party.flatMap((instance) => {
      const slots = [1, 2, 3, 4, 5, 6] as const;
      return slots.map((slot) => {
        const eq = generateEquipment({ slot, star: 1, subStatCount: 2, set, rng: gearRng });
        instance.equipment[slot] = eq.id;
        return eq;
      });
    });

    const battleRng = mulberry32(2000 + i);
    let carryHp: Map<string, number> | null = null;
    let currentParty = party;
    let cleared = true;
    for (const wave of stage.waves) {
      const setup = setupWaveBattle(currentParty, carryHp, wave, equipmentList);
      const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { initialPlayerHp: setup.initialPlayerHp, rng: battleRng });
      const result = engine.run();
      if (result.winner !== "PLAYER") {
        cleared = false;
        break;
      }
      const survivors = extractSurvivors(engine, currentParty);
      currentParty = survivors.survivorInstances;
      carryHp = survivors.survivorHp;
    }
    if (cleared) wins += 1;
  }
  return wins / trials;
}

describe("チャプター間の難易度エスカレーション(章が進むほどちゃんと強くなるか)", () => {
  it("チャプター1・2のボスは星2Lv20のパーティで安定してクリアできる(序盤の据え置きバランスを維持)", () => {
    expect(chapterBossWinRate(1, 2, 20, "CRIT", 40)).toBeGreaterThan(0.8);
    expect(chapterBossWinRate(2, 2, 20, "POWER", 40)).toBeGreaterThan(0.8);
  });

  it("チャプター3のボスは星2Lv20のパーティでは苦戦し、星3Lv30まで育てると安定してクリアできる", () => {
    expect(chapterBossWinRate(3, 2, 20, "GUARD", 40)).toBeLessThan(0.3);
    expect(chapterBossWinRate(3, 3, 30, "GUARD", 40)).toBeGreaterThan(0.4);
  });

  it("チャプター4のボスは星3Lv30ではまだ厳しく、星4Lv40まで育てると安定してクリアできる", () => {
    expect(chapterBossWinRate(4, 3, 30, "VITALITY", 40)).toBeLessThan(0.3);
    expect(chapterBossWinRate(4, 4, 40, "VITALITY", 40)).toBeGreaterThan(0.8);
  });

  it("同じ星2Lv20装備のパーティでも、チャプターが上がるほど勝率は下がっていく(単調悪化)", () => {
    const rates = [1, 2, 3, 4].map((chapter) => chapterBossWinRate(chapter, 2, 20, "CRIT", 30));
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeLessThanOrEqual(rates[i - 1]);
    }
    expect(rates[0]).toBeGreaterThan(rates[rates.length - 1]);
  });
});
