import { describe, expect, it } from "vitest";
import { ABILITY_POINT_BUDGET, createDefaultMonsterDevelopment } from "../src/core/monsterDevelopment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

describe("将来の個体育成データ", () => {
  it("新しい個体は未転生・未振り分け・未覚醒で作られる", () => {
    const monster = createMonsterInstance("slime_FIRE", 1);
    expect(monster.development).toEqual(createDefaultMonsterDevelopment());
    expect(ABILITY_POINT_BUDGET).toBe(100);
  });

  it("拡張前のセーブデータには既存の強さを変えない初期値を補完する", () => {
    const state = createInitialState();
    const legacyMonster = state.monsters[0] as Partial<typeof state.monsters[number]>;
    delete legacyMonster.development;

    const normalized = normalizeLoadedState(state);

    expect(normalized.monsters[0].development).toEqual({
      schemaVersion: 1,
      type: null,
      abilityPoints: { hp: 0, atk: 0, def: 0, spd: 0 },
      latentAbilityId: null,
      latentReselectPending: false,
      // 1点も振っていないので未確定。ここから無料で配れる
      abilityPointsConfirmed: false,
      // 才能覚醒も白紙から。**素材を1つも買っていない状態**
      talents: { schemaVersion: 1, unlockedPoints: 0, basic: {}, battle: {}, skill: { 1: [], 2: [] }, awakening: null },
    });
  });
});
