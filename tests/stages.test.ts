import { describe, expect, it } from "vitest";
import { STAGES, rollStageDrop, rollStageEquipment } from "../src/data/stages.js";
import { STAR_MAX_LEVEL } from "../src/core/rarity.js";
import { findMonsterById } from "../src/data/monsters.js";
import { buildEnemyTeam } from "../src/game/stageRunner.js";

const CHAPTERS = [1, 2, 3, 4, 5, 6, 7, 8];

function stagesOf(chapter: number) {
  return STAGES.filter((s) => s.chapter === chapter);
}

describe("ステージデータ", () => {
  it("8チャプター×5ステージ(各3ウェーブ)存在する", () => {
    expect(STAGES).toHaveLength(40);
    for (const chapter of CHAPTERS) {
      const stages = stagesOf(chapter);
      expect(stages).toHaveLength(5);
      expect(stages.map((s) => s.id)).toEqual([1, 2, 3, 4, 5].map((n) => `${chapter}-${n}`));
      for (const stage of stages) expect(stage.waves).toHaveLength(3);
    }
  });

  it("各チャプターの最終ステージの3ウェーブ目だけがボスウェーブで、ボスは2番目に配置される", () => {
    for (const chapter of CHAPTERS) {
      for (const stage of stagesOf(chapter)) {
        stage.waves.forEach((wave) => {
          const isFinalBossWave = stage.id === `${chapter}-5` && wave.waveNumber === 3;
          expect(wave.isBossWave).toBe(isFinalBossWave);
          expect(wave.enemies.filter((e) => e.isBoss)).toHaveLength(isFinalBossWave ? 1 : 0);
          if (isFinalBossWave) expect(wave.enemies[1].isBoss).toBe(true);
        });
      }
    }
  });

  it("5〜8章の章ボスは専用名とNORMAL基準速度を持つ", () => {
    const expected = [
      [5, "腐食トレント", 120],
      [6, "古代守護ゴーレム", 125],
      [7, "奈落の死神", 145],
      [8, "時空の支配者", 155],
    ] as const;
    for (const [chapter, name, speed] of expected) {
      const wave = stagesOf(chapter)[4].waves[2];
      expect(wave.enemies[1].displayName).toBe(name);
      expect(buildEnemyTeam(wave, "NORMAL")[1].stats.spd).toBe(speed);
    }
  });

  it("古代守護ゴーレムは難易度が上がるほど少ない被弾数で反撃する", () => {
    const wave = stagesOf(6)[4].waves[2];
    expect(buildEnemyTeam(wave, "NORMAL")[1].bossTraits?.counterAfterHits).toBe(5);
    expect(buildEnemyTeam(wave, "HARD")[1].bossTraits?.counterAfterHits).toBe(4);
    expect(buildEnemyTeam(wave, "HELL")[1].bossTraits?.counterAfterHits).toBe(3);
  });

  it("各ウェーブは4体の敵で構成され、図鑑に存在するモンスターのみを使う", () => {
    for (const stage of STAGES) {
      for (const wave of stage.waves) {
        expect(wave.enemies).toHaveLength(4);
        for (const enemy of wave.enemies) {
          expect(findMonsterById(`${enemy.templateId}_${enemy.element}`)).toBeDefined();
        }
      }
    }
  });

  it("5〜8章の道中には新追加モンスターが意図的に登場する", () => {
    const lateIds = new Set(
      STAGES.filter((s) => s.chapter >= 5).flatMap((s) => s.waves.flatMap((w) => w.enemies.map((e) => e.templateId))),
    );
    for (const id of ["mushroon", "shellturtle", "kobold", "basilisk", "mimic", "valkyria", "thunderbeast", "abyssreaper", "fenrir", "chronos", "behemoth"]) {
      expect(lateIds.has(id)).toBe(true);
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
      for (let i = 1; i < scales.length; i++) expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1]);
    }
    expect(stagesOf(1)[4].waves[0].powerScale).toBeLessThanOrEqual(1);
  });

  it("チャプターが上がるほど同じステージ番号のpowerScaleは上がり、星は下がらない", () => {
    for (let stageNumber = 1; stageNumber <= 5; stageNumber++) {
      const stars = CHAPTERS.map((c) => stagesOf(c)[stageNumber - 1].waves[0].enemies[0].star);
      const scales = CHAPTERS.map((c) => stagesOf(c)[stageNumber - 1].waves[0].powerScale);
      for (let i = 1; i < CHAPTERS.length; i++) {
        expect(stars[i]).toBeGreaterThanOrEqual(stars[i - 1]);
        expect(scales[i]).toBeGreaterThan(scales[i - 1]);
      }
    }
  });

  it("5〜8章でも速度カーブが上昇し、HARD/HELLではさらに速度が上がる", () => {
    expect(stagesOf(8)[4].waves[0].speedScale).toBeGreaterThan(stagesOf(5)[0].waves[0].speedScale);
    const wave = stagesOf(8)[3].waves[0];
    const normal = buildEnemyTeam(wave, "NORMAL")[0].stats.spd;
    const hard = buildEnemyTeam(wave, "HARD")[0].stats.spd;
    const hell = buildEnemyTeam(wave, "HELL")[0].stats.spd;
    expect(hard).toBeGreaterThan(normal);
    expect(hell).toBeGreaterThan(hard);
  });

  it("チャプター内では報酬はステージが進むほど大きくなる", () => {
    for (const chapter of CHAPTERS) {
      const stages = stagesOf(chapter);
      for (let i = 1; i < stages.length; i++) expect(stages[i].rewards.clearGold).toBeGreaterThan(stages[i - 1].rewards.clearGold);
    }
  });

  it("チャプターが上がるほど同じステージ番号の報酬も大きくなる", () => {
    for (let stageNumber = 1; stageNumber <= 5; stageNumber++) {
      const gold = CHAPTERS.map((c) => stagesOf(c)[stageNumber - 1].rewards.clearGold);
      for (let i = 1; i < CHAPTERS.length; i++) expect(gold[i]).toBeGreaterThan(gold[i - 1]);
    }
  });

  it("8章のテーマドロップは通常種族8体を一巡し、高レア新規モンスターを直接周回ドロップさせない", () => {
    const templateIds = CHAPTERS.map((c) => stagesOf(c)[0].rewards.dropTemplateId);
    expect(new Set(templateIds).size).toBe(8);
    for (const id of templateIds) expect(["slime", "wolf", "golem", "fairy", "treant", "knight", "imp", "wisp"]).toContain(id);
  });

  it("チャプターのテーマドロップは後半ほど高い星になり、同一チャプター内で一貫している", () => {
    const expectedStars: Record<number, number[]> = { 1: [1], 2: [1], 3: [1], 4: [1], 5: [1], 6: [1], 7: [1, 2], 8: [2] };
    for (const chapter of CHAPTERS) {
      const stages = stagesOf(chapter);
      const templateId = stages[0].rewards.dropTemplateId;
      const set = stages[0].rewards.equipmentSet;
      for (const stage of stages) {
        expect(stage.rewards.dropTemplateId).toBe(templateId);
        expect(stage.rewards.equipmentSet).toBe(set);
        expect(stage.rewards.dropStars).toEqual(expectedStars[chapter]);
      }
    }
  });

  it("rollStageDropはそのチャプターのテーマ種族と設定された星をドロップする", () => {
    const rng = () => 0;
    const expectedMinimumStar: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2 };
    for (const chapter of CHAPTERS) {
      const stage = stagesOf(chapter)[0];
      const drop = rollStageDrop(stage, rng);
      expect(drop).not.toBeNull();
      expect(drop!.star).toBe(expectedMinimumStar[chapter]);
      expect(drop!.dexId.startsWith(`${stage.rewards.dropTemplateId}_`)).toBe(true);
    }
  });

  it("rollStageEquipmentはそのチャプターのテーマシリーズをドロップする", () => {
    const rng = () => 0;
    const expectedMinimumStar: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 2, 6: 3, 7: 3, 8: 3 };
    for (const chapter of CHAPTERS) {
      const stage = stagesOf(chapter)[0];
      const equipment = rollStageEquipment(stage, rng);
      expect(equipment).not.toBeNull();
      expect(equipment!.star).toBe(expectedMinimumStar[chapter]);
      expect(equipment!.set).toBe(stage.rewards.equipmentSet);
    }
  });
});
