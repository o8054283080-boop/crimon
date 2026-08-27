import { describe, expect, it } from "vitest";
import { LatentAbilityCandidate } from "../src/core/monsterDevelopment.js";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import { findMonsterById } from "../src/data/monsters.js";
import {
  abilityStatBonuses,
  awakenLatentAbility,
  reincarnateMonsterType,
  setAbilityPoint,
  usedAbilityPoints,
} from "../src/game/monsterDevelopment.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

const candidates: LatentAbilityCandidate[] = [1, 2, 3].map((n) => ({
  id: `slime_skill1_latent_${n}`, name: `候補${n}`, description: "TODO: 効果未確定", skillSlot: 0,
}));

describe("クリエイトシステム拡張", () => {
  it("能力ポイントは合計100までで、極振りと実効値への反映ができる", () => {
    const monster = createMonsterInstance("slime_FIRE", 6);
    expect(setAbilityPoint(monster, "atk", 100)).toBe(true);
    expect(setAbilityPoint(monster, "hp", 1)).toBe(false);
    expect(usedAbilityPoints(monster.development.abilityPoints)).toBe(100);
    expect(abilityStatBonuses(monster.development.abilityPoints).atk).toBe(200);
    const dex = findMonsterById(monster.dexId)!;
    expect(toBattleDefinition(monster, dex).stats.atk).toBeGreaterThan(dex.stats.atk);
  });

  it("タイプ転生はタイプを変更しLv1・経験値0へ戻す", () => {
    const monster = createMonsterInstance("slime_FIRE", 6, 40);
    monster.exp = 123;
    reincarnateMonsterType(monster, "SUPPORT");
    expect(monster.development.type).toBe("SUPPORT");
    expect([monster.level, monster.exp]).toEqual([1, 0]);
  });

  it("覚醒オーブを消費して3候補から選んだ安定IDを保存する", () => {
    const monster = createMonsterInstance("slime_FIRE", 1);
    const inventory = { awakeningOrbs: 1 };
    expect(awakenLatentAbility(monster, candidates[1].id, candidates, inventory)).toBe(true);
    expect(monster.development.latentAbilityId).toBe(candidates[1].id);
    expect(inventory.awakeningOrbs).toBe(0);
  });

  it("旧セーブを補完し、新しい育成値と覚醒オーブをロード後も保持する", () => {
    const state = createInitialState();
    const monster = state.monsters[0];
    monster.star = 6;
    reincarnateMonsterType(monster, "DEFENSE");
    setAbilityPoint(monster, "def", 100);
    monster.development.latentAbilityId = candidates[0].id;
    state.awakeningOrbs = 4;
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    expect(loaded.monsters[0].development).toEqual(monster.development);
    expect(loaded.awakeningOrbs).toBe(4);

    const legacy = createInitialState() as Partial<typeof state>;
    delete legacy.awakeningOrbs;
    delete (legacy.monsters![0] as Partial<typeof monster>).development;
    const normalized = normalizeLoadedState(legacy as typeof state);
    expect(normalized.awakeningOrbs).toBe(0);
    expect(normalized.monsters[0].development.type).toBeNull();
  });
});
