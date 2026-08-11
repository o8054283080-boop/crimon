import { describe, expect, it } from "vitest";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../src/core/rarity.js";
import { STAGES, rollStageEquipment } from "../src/data/stages.js";
import { buildEnemyTeam, setupWaveBattle } from "../src/game/stageRunner.js";
import { applyStageClearRewards } from "../src/game/rewards.js";
import { FIRST_CLEAR_CRYSTAL_REWARD, createInitialState, getParty, isStageCleared, markStageCleared } from "../src/game/playerState.js";

const NON_BOSS_STAGE = STAGES.find((s) => s.stageNumber === 1)!; // 通常ステージ(ボス無し)
const BOSS_STAGE = STAGES.find((s) => s.stageNumber === 5)!; // 各チャプター最終ステージ(ボスを含む)

describe("ボスステージの装備ボーナスドロップ (rollStageEquipment)", () => {
  it("非ボスステージでは常に基礎星(星1)のまま", () => {
    const alwaysDrop = () => 0; // ドロップ判定・ボーナス判定ともに必ず成立する値
    const equipment = rollStageEquipment(NON_BOSS_STAGE, alwaysDrop);
    expect(equipment).not.toBeNull();
    expect(equipment!.star).toBe(1);
  });

  it("ボスステージではボーナス抽選に当たると星+1になる", () => {
    const alwaysDrop = () => 0; // ドロップ判定・ボーナス判定ともに必ず成立する値
    const equipment = rollStageEquipment(BOSS_STAGE, alwaysDrop);
    expect(equipment).not.toBeNull();
    expect(equipment!.star).toBe(2);
  });

  it("ボスステージでもボーナス抽選を外せば星1のまま", () => {
    let call = 0;
    const rng = () => {
      call += 1;
      return call === 1 ? 0 : 0.999; // 1回目(ドロップ判定)は必ず成立、2回目(ボーナス判定)は必ず外す
    };
    const equipment = rollStageEquipment(BOSS_STAGE, rng);
    expect(equipment).not.toBeNull();
    expect(equipment!.star).toBe(1);
  });

  it("難易度ハード/ヘルでは装備の星がさらに加算される", () => {
    const alwaysDrop = () => 0;
    const normal = rollStageEquipment(NON_BOSS_STAGE, alwaysDrop, "NORMAL");
    const hard = rollStageEquipment(NON_BOSS_STAGE, alwaysDrop, "HARD");
    const hell = rollStageEquipment(NON_BOSS_STAGE, alwaysDrop, "HELL");
    expect(normal!.star).toBe(1);
    expect(hard!.star).toBe(2);
    expect(hell!.star).toBe(3);
  });
});

describe("難易度による敵強化 (buildEnemyTeam / setupWaveBattle)", () => {
  it("ハード/ヘルでは敵の星・レベルが底上げされる", () => {
    const wave = NON_BOSS_STAGE.waves[0];
    const normalTeam = buildEnemyTeam(wave, "NORMAL");
    const hardTeam = buildEnemyTeam(wave, "HARD");
    const hellTeam = buildEnemyTeam(wave, "HELL");

    for (let i = 0; i < normalTeam.length; i++) {
      // 難易度が上がるほどATKなどの実効ステータスが大きくなる(星・レベル・powerScaleすべて底上げされるため)
      expect(hardTeam[i].stats.atk).toBeGreaterThan(normalTeam[i].stats.atk);
      expect(hellTeam[i].stats.atk).toBeGreaterThan(hardTeam[i].stats.atk);
    }
  });

  it("setupWaveBattleに難易度を渡すと敵チームに反映される", () => {
    const wave = NON_BOSS_STAGE.waves[0];
    const party = [createMonsterInstance("slime_FIRE", 3, 30)];
    const normalSetup = setupWaveBattle(party, null, wave, [], "NORMAL");
    const hellSetup = setupWaveBattle(party, null, wave, [], "HELL");
    expect(hellSetup.enemyDefs[0].stats.hp).toBeGreaterThan(normalSetup.enemyDefs[0].stats.hp);
  });
});

describe("難易度ごとの初回クリア判定 (isStageCleared / markStageCleared)", () => {
  it("ノーマルのクリア済みキーは既存セーブと同じ素のstageIdのまま(後方互換)", () => {
    const state = createInitialState();
    markStageCleared(state, "1-1", "NORMAL");
    expect(state.clearedStageIds).toContain("1-1");
  });

  it("ノーマル/ハード/ヘルは互いに独立してクリア判定される", () => {
    const state = createInitialState();
    expect(isStageCleared(state, "1-1", "NORMAL")).toBe(false);
    expect(isStageCleared(state, "1-1", "HARD")).toBe(false);
    expect(isStageCleared(state, "1-1", "HELL")).toBe(false);

    markStageCleared(state, "1-1", "HARD");

    expect(isStageCleared(state, "1-1", "NORMAL")).toBe(false);
    expect(isStageCleared(state, "1-1", "HARD")).toBe(true);
    expect(isStageCleared(state, "1-1", "HELL")).toBe(false);
  });
});

describe("難易度ごとの初回クリア報酬 (applyStageClearRewards)", () => {
  it("同じステージでも難易度が違えばそれぞれ初回クリア扱いになる", () => {
    const state = createInitialState();
    const stage = STAGES[0];
    const party = getParty(state);

    const normalResult = applyStageClearRewards(state, stage, stage.waves.length, party, "NORMAL");
    const hardResult = applyStageClearRewards(state, stage, stage.waves.length, party, "HARD");

    expect(normalResult.crystalEarned).toBe(FIRST_CLEAR_CRYSTAL_REWARD);
    expect(hardResult.crystalEarned).toBe(FIRST_CLEAR_CRYSTAL_REWARD);
  });
});

describe("難易度によるレベル底上げのクランプ", () => {
  it("ヘル難易度でもレベルは底上げ後の星の最大レベルを超えない", () => {
    const wave = BOSS_STAGE.waves[BOSS_STAGE.waves.length - 1];
    const hellTeam = buildEnemyTeam(wave, "HELL");
    for (const def of hellTeam) {
      const match = def.name.match(/★(\d)\s*Lv(\d+)/);
      expect(match).not.toBeNull();
      const [, starText, levelText] = match!;
      const star = Number(starText) as 1 | 2 | 3 | 4 | 5 | 6;
      const level = Number(levelText);
      expect(level).toBeLessThanOrEqual(STAR_MAX_LEVEL[star]);
    }
  });
});
