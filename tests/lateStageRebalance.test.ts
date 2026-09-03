import { describe, expect, it } from "vitest";
import {
  STAGES,
  rollStageEquipment,
  stageClearExp,
  stageClearGold,
  stageWaveGold,
} from "../src/data/stages.js";
import { buildEnemyTeam } from "../src/game/stageRunner.js";

function stage(id: string) {
  return STAGES.find((candidate) => candidate.id === id)!;
}

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

describe("5〜8章の報酬カーブ", () => {
  it("章ごとのNORMAL経験値が7,500→15,000へ段階的に増える", () => {
    expect([5, 6, 7, 8].map((chapter) => stageClearExp(stage(`${chapter}-5`), "NORMAL"))).toEqual([
      7_500,
      9_000,
      12_000,
      15_000,
    ]);
  });

  it("8章はHARD 22,500・HELL 30,000 EXPになる", () => {
    expect(["NORMAL", "HARD", "HELL"].map((difficulty) => stageClearExp(stage("8-5"), difficulty as "NORMAL" | "HARD" | "HELL"))).toEqual([
      15_000,
      22_500,
      30_000,
    ]);
  });

  it("各章ボス面のNORMAL総ゴールドは6,000→12,500で、難易度倍率も反映する", () => {
    const normalTotals = [5, 6, 7, 8].map((chapter) => {
      const target = stage(`${chapter}-5`);
      return stageWaveGold(target, "NORMAL") * target.waves.length + stageClearGold(target, "NORMAL");
    });
    expect(normalTotals).toEqual([6_000, 8_000, 10_000, 12_500]);

    const finalStage = stage("8-5");
    expect(["NORMAL", "HARD", "HELL"].map((difficulty) => {
      const value = difficulty as "NORMAL" | "HARD" | "HELL";
      return stageWaveGold(finalStage, value) * finalStage.waves.length + stageClearGold(finalStage, value);
    })).toEqual([12_500, 18_750, 25_000]);
  });

  it("装備ドロップ率も章が進むほど上がる", () => {
    expect([5, 6, 7, 8].map((chapter) => stage(`${chapter}-1`).rewards.equipmentDropRate)).toEqual([0.55, 0.6, 0.65, 0.7]);
  });
});

describe("後半通常ステージの装備品質", () => {
  it("どの章・難易度でも星6装備を出さない", () => {
    for (const chapter of [5, 6, 7, 8]) {
      for (const difficulty of ["NORMAL", "HARD", "HELL"] as const) {
        const rng = mulberry32(chapter * 10 + difficulty.length);
        for (let i = 0; i < 2_000; i++) {
          const equipment = rollStageEquipment(stage(`${chapter}-5`), rng, difficulty);
          if (equipment) expect(equipment.star).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it("8章HELLの装備当選内では星5がおよそ10%に留まる", () => {
    const rng = mulberry32(805);
    let dropped = 0;
    let star5 = 0;
    for (let i = 0; i < 20_000; i++) {
      const equipment = rollStageEquipment(stage("8-5"), rng, "HELL");
      if (!equipment) continue;
      dropped += 1;
      if (equipment.star === 5) star5 += 1;
    }
    expect(star5 / dropped).toBeGreaterThan(0.08);
    expect(star5 / dropped).toBeLessThan(0.12);
  });
});

describe("8-5 HELLの最終Wave", () => {
  it("合意したボス・道中3体の最終ステータスになる", () => {
    const team = buildEnemyTeam(stage("8-5").waves[2], "HELL");
    expect(team.map((enemy) => enemy.stats)).toMatchObject([
      { hp: 42_000, atk: 2_400, def: 2_650, spd: 198 },
      { hp: 110_000, atk: 3_500, def: 3_400, spd: 195 },
      { hp: 43_000, atk: 3_700, def: 2_500, spd: 190 },
      { hp: 60_000, atk: 2_700, def: 2_900, spd: 150 },
    ]);
  });
});
