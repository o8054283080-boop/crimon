import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { STAGES } from "../src/data/stages.js";
import { extractSurvivors, isIntermediateStageWaveResultLabel, setupWaveBattle } from "../src/game/stageRunner.js";

const STARTER_PARTY = [
  { templateId: "slime", element: "FIRE" },
  { templateId: "wolf", element: "WATER" },
  { templateId: "golem", element: "ELECTRIC" },
  { templateId: "fairy", element: "GRASS" },
].map((s) => createMonsterInstance(`${s.templateId}_${s.element}`, 1, 1));

describe("ステージ1-1は初期パーティ(星1 Lv1)で確実にクリアできる", () => {
  it("30回攻略して全て勝利する(バランス崩壊の回帰チェック)", () => {
    const stage = STAGES[0];
    for (let attempt = 0; attempt < 30; attempt++) {
      let party = STARTER_PARTY.map((m) => ({ ...m }));
      let carryHp: Map<string, number> | null = null;

      for (const wave of stage.waves) {
        const setup = setupWaveBattle(party, carryHp, wave);
        const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { initialPlayerHp: setup.initialPlayerHp });
        const result = engine.run();
        expect(result.winner).toBe("PLAYER");
        const survivors = extractSurvivors(engine, party);
        party = survivors.survivorInstances;
        carryHp = survivors.survivorHp;
      }
    }
  });
});

describe("HP持ち越し (setupWaveBattle)", () => {
  it("carryHpを渡すと開始HPがそのまま反映される", () => {
    const stage = STAGES[0];
    const wave = stage.waves[0];
    const party = STARTER_PARTY.map((m) => ({ ...m }));
    const carryHp = new Map([[party[0].id, 1]]);

    const setup = setupWaveBattle(party, carryHp, wave);
    expect(setup.initialPlayerHp).toBeDefined();
    expect(setup.initialPlayerHp?.[0]).toBe(1);
  });

  it("carryHpがnullなら満タンHPで開始する(initialPlayerHpがundefined)", () => {
    const stage = STAGES[0];
    const wave = stage.waves[0];
    const party = STARTER_PARTY.map((m) => ({ ...m }));

    const setup = setupWaveBattle(party, null, wave);
    expect(setup.initialPlayerHp).toBeUndefined();
  });
});

describe("ステージの中間ウェーブ自動進行", () => {
  it("中間ウェーブの結果ラベルだけを自動進行対象にする", () => {
    expect(isIntermediateStageWaveResultLabel("▶ 次のウェーブへ")).toBe(true);
    expect(isIntermediateStageWaveResultLabel("🎁 報酬を受け取る")).toBe(false);
    expect(isIntermediateStageWaveResultLabel("ステージ選択に戻る")).toBe(false);
  });
});
