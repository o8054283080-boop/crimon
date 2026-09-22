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

/**
 * **種を固定する。**渡さないと `Math.random` になる(`engine.ts` の
 * `this.rng = options.rng ?? Math.random`)。
 *
 * 種なしで30回まわしていたので、このテストは**実行のたびに違う戦闘**を見ていた。
 * 1-1の敗北率を2万回で測ると 0.01%(2回)。30回全勝を要求するので、
 * **1回の実行あたり 0.30% で落ちる**——300回に1回、無関係な変更のCIが赤くなる。
 * 実際、クラウドバックアップだけを直したPRで落ちた。
 *
 * 見たいのは「バランスが崩れたら気づく」ことで、0.01%の敗北は崩壊ではない。
 * 種を30通り固定すれば、**乱数の流れを30通り見る**という元の狙いはそのままに、
 * 結果が揺れなくなる。崩れれば、どれかが必ず落ちる。
 */
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("ステージ1-1は初期パーティ(星1 Lv1)で確実にクリアできる", () => {
  it("30通りの乱数で攻略して全て勝利する(バランス崩壊の回帰チェック)", () => {
    const stage = STAGES[0];
    for (let attempt = 0; attempt < 30; attempt++) {
      let party = STARTER_PARTY.map((m) => ({ ...m }));
      let carryHp: Map<string, number> | null = null;
      // 1回ぶんの攻略は、同じ流れを最後まで使う(ウェーブごとに種を替えない)
      const rng = seededRng(attempt + 1);

      for (const wave of stage.waves) {
        const setup = setupWaveBattle(party, carryHp, wave);
        const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, {
          initialPlayerHp: setup.initialPlayerHp,
          rng,
        });
        const result = engine.run();
        expect(result.winner, `種 ${attempt + 1} で負けた`).toBe("PLAYER");
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
