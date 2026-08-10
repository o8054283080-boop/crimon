import { describe, expect, it } from "vitest";
import { STAGES } from "../src/data/stages.js";
import { STAR_MAX_LEVEL } from "../src/core/rarity.js";
import { findMonsterById } from "../src/data/monsters.js";

describe("ステージデータ", () => {
  it("1-1から1-5まで5ステージ、各3ウェーブ存在する", () => {
    expect(STAGES).toHaveLength(5);
    expect(STAGES.map((s) => s.id)).toEqual(["1-1", "1-2", "1-3", "1-4", "1-5"]);
    for (const stage of STAGES) {
      expect(stage.waves).toHaveLength(3);
    }
  });

  it("最終ステージの3ウェーブ目だけがボスウェーブで、ボス個体を含む", () => {
    for (const stage of STAGES) {
      stage.waves.forEach((wave) => {
        const isFinalBossWave = stage.id === "1-5" && wave.waveNumber === 3;
        expect(wave.isBossWave).toBe(isFinalBossWave);
        const bossCount = wave.enemies.filter((e) => e.isBoss).length;
        expect(bossCount).toBe(isFinalBossWave ? 1 : 0);
      });
    }
  });

  it("各ウェーブは4体の敵で構成され、図鑑に存在するモンスターのみを使う", () => {
    for (const stage of STAGES) {
      for (const wave of stage.waves) {
        expect(wave.enemies).toHaveLength(4);
        for (const enemy of wave.enemies) {
          const dex = findMonsterById(`${enemy.templateId}_${enemy.element}`);
          expect(dex).toBeDefined();
        }
      }
    }
  });

  it("敵のレベルは自身の星の最大レベルを超えない", () => {
    for (const stage of STAGES) {
      for (const wave of stage.waves) {
        for (const enemy of wave.enemies) {
          expect(enemy.level).toBeLessThanOrEqual(STAR_MAX_LEVEL[enemy.star]);
          expect(enemy.level).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("ステージが進むほど難易度(powerScale)が上がる", () => {
    const scales = STAGES.map((s) => s.waves[0].powerScale);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1]);
    }
    expect(scales[scales.length - 1]).toBeLessThanOrEqual(1);
  });

  it("報酬はステージが進むほど大きくなる", () => {
    for (let i = 1; i < STAGES.length; i++) {
      expect(STAGES[i].rewards.clearGold).toBeGreaterThan(STAGES[i - 1].rewards.clearGold);
    }
  });
});
