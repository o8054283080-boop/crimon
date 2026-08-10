import { describe, expect, it } from "vitest";
import { STAGES, rollStageDrop, rollStageEquipment } from "../src/data/stages.js";
import { STAR_MAX_LEVEL } from "../src/core/rarity.js";
import { findMonsterById } from "../src/data/monsters.js";

const CHAPTERS = [1, 2, 3, 4];

function stagesOf(chapter: number) {
  return STAGES.filter((s) => s.chapter === chapter);
}

describe("ステージデータ", () => {
  it("4チャプター×5ステージ(各3ウェーブ)存在する", () => {
    expect(STAGES).toHaveLength(20);
    for (const chapter of CHAPTERS) {
      const stages = stagesOf(chapter);
      expect(stages).toHaveLength(5);
      expect(stages.map((s) => s.id)).toEqual([1, 2, 3, 4, 5].map((n) => `${chapter}-${n}`));
      for (const stage of stages) {
        expect(stage.waves).toHaveLength(3);
      }
    }
  });

  it("各チャプターの最終ステージの3ウェーブ目だけがボスウェーブで、ボス個体を含む", () => {
    for (const chapter of CHAPTERS) {
      for (const stage of stagesOf(chapter)) {
        stage.waves.forEach((wave) => {
          const isFinalBossWave = stage.id === `${chapter}-5` && wave.waveNumber === 3;
          expect(wave.isBossWave).toBe(isFinalBossWave);
          const bossCount = wave.enemies.filter((e) => e.isBoss).length;
          expect(bossCount).toBe(isFinalBossWave ? 1 : 0);
        });
      }
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

  it("チャプター内ではステージが進むほど難易度(powerScale)が上がる", () => {
    for (const chapter of CHAPTERS) {
      const scales = stagesOf(chapter).map((s) => s.waves[0].powerScale);
      for (let i = 1; i < scales.length; i++) {
        expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1]);
      }
      expect(scales[scales.length - 1]).toBeLessThanOrEqual(1);
    }
  });

  it("チャプター内では報酬はステージが進むほど大きくなる", () => {
    for (const chapter of CHAPTERS) {
      const stages = stagesOf(chapter);
      for (let i = 1; i < stages.length; i++) {
        expect(stages[i].rewards.clearGold).toBeGreaterThan(stages[i - 1].rewards.clearGold);
      }
    }
  });

  it("チャプターごとにテーマ種族・テーマ装備シリーズが異なり、全チャプターで重複しない", () => {
    const templateIds = new Set(CHAPTERS.map((c) => stagesOf(c)[0].rewards.dropTemplateId));
    const sets = new Set(CHAPTERS.map((c) => stagesOf(c)[0].rewards.equipmentSet));
    expect(templateIds.size).toBe(CHAPTERS.length);
    expect(sets.size).toBe(CHAPTERS.length);
  });

  it("チャプターのテーマドロップは星1固定で、同一チャプター内のどのステージでも一貫している", () => {
    for (const chapter of CHAPTERS) {
      const stages = stagesOf(chapter);
      const templateId = stages[0].rewards.dropTemplateId;
      const set = stages[0].rewards.equipmentSet;
      for (const stage of stages) {
        expect(stage.rewards.dropTemplateId).toBe(templateId);
        expect(stage.rewards.equipmentSet).toBe(set);
        expect(stage.rewards.dropStars).toEqual([1]);
      }
    }
  });

  it("rollStageDropはそのチャプターのテーマ種族・星1のみをドロップする", () => {
    const rng = () => 0; // 必ずドロップさせる
    for (const chapter of CHAPTERS) {
      const stage = stagesOf(chapter)[0];
      const drop = rollStageDrop(stage, rng);
      expect(drop).not.toBeNull();
      expect(drop!.star).toBe(1);
      expect(drop!.dexId.startsWith(`${stage.rewards.dropTemplateId}_`)).toBe(true);
    }
  });

  it("rollStageEquipmentはそのチャプターのテーマシリーズ・星1のみをドロップする", () => {
    const rng = () => 0; // 必ずドロップさせる
    for (const chapter of CHAPTERS) {
      const stage = stagesOf(chapter)[0];
      const equipment = rollStageEquipment(stage, rng);
      expect(equipment).not.toBeNull();
      expect(equipment!.star).toBe(1);
      expect(equipment!.set).toBe(stage.rewards.equipmentSet);
    }
  });
});
