import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../src/core/rarity.js";
import { LEVEL_DUNGEON_DEFS, LEVEL_DUNGEON_TIERS, findLevelDungeonDef } from "../src/data/levelDungeon.js";
import { EXP_PIG, EXP_PIG_DEX, MONSTER_TEMPLATES, findMonsterById } from "../src/data/monsters.js";
import { setupDungeonBattle } from "../src/game/dungeonRunner.js";
import { createInitialState, isLevelDungeonTierCleared, markLevelDungeonTierCleared } from "../src/game/playerState.js";
import { applyLevelDungeonClearRewards } from "../src/game/rewards.js";
import { runLevelDungeonAutoFarm } from "../src/game/autoFarm.js";

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

describe("経験ピッグ", () => {
  it("通常のガチャ・ステージ対象(MONSTER_TEMPLATES)には含まれない", () => {
    expect(MONSTER_TEMPLATES.some((t) => t.templateId === EXP_PIG.templateId)).toBe(false);
  });

  it("6属性のバリエーションが存在し、図鑑検索できる", () => {
    expect(EXP_PIG_DEX).toHaveLength(6);
    expect(findMonsterById(EXP_PIG_DEX[0].id)).toBeDefined();
  });

  it("転生ピッグとは別のモンスター種(テンプレートID)である", () => {
    expect(EXP_PIG.templateId).not.toBe("reincarnation_pig");
  });
});

describe("レベル上げダンジョンの定義", () => {
  it("初級・中級・上級の3段階が存在する", () => {
    expect(LEVEL_DUNGEON_DEFS).toHaveLength(3);
    expect(LEVEL_DUNGEON_DEFS.map((d) => d.tier)).toEqual(LEVEL_DUNGEON_TIERS);
  });

  it("難易度が上がるほど獲得経験値が増える", () => {
    const [beginner, intermediate, advanced] = LEVEL_DUNGEON_DEFS;
    expect(intermediate.expReward).toBeGreaterThan(beginner.expReward);
    expect(advanced.expReward).toBeGreaterThan(intermediate.expReward);
  });

  it("難易度が上がるほど経験ピッグの星が高くなる", () => {
    const [beginner, intermediate, advanced] = LEVEL_DUNGEON_DEFS;
    expect(intermediate.pigStar).toBeGreaterThan(beginner.pigStar);
    expect(advanced.pigStar).toBeGreaterThan(intermediate.pigStar);
  });

  it("findLevelDungeonDefで難易度から定義を引ける", () => {
    expect(findLevelDungeonDef("ADVANCED")?.tier).toBe("ADVANCED");
  });
});

describe("レベル上げダンジョンの報酬 (applyLevelDungeonClearRewards)", () => {
  it("クリアするとパーティ全員に経験値が入り、経験ピッグを確定で入手する", () => {
    const state = createInitialState();
    const def = findLevelDungeonDef("BEGINNER")!;
    const party = [createMonsterInstance("slime_FIRE", 1, 1)];

    const monstersBefore = state.monsters.length;
    const result = applyLevelDungeonClearRewards(state, def, party, () => 0);

    expect(result.expTotal).toBe(def.expReward);
    expect(result.levelUps.length).toBeGreaterThan(0);
    expect(result.pigDrop).not.toBeNull();
    expect(result.pigDrop!.star).toBe(def.pigStar);
    expect(state.monsters.length).toBe(monstersBefore + 1);
    const addedPig = state.monsters[state.monsters.length - 1];
    expect(addedPig.level).toBe(STAR_MAX_LEVEL[def.pigStar]);
  });

  it("初回クリアはダイヤ200、2回目以降は3%の確率でダイヤ50になる", () => {
    const state = createInitialState();
    const def = findLevelDungeonDef("BEGINNER")!;
    const party = [createMonsterInstance("slime_FIRE", 1, 1)];

    expect(isLevelDungeonTierCleared(state, def.tier)).toBe(false);
    const first = applyLevelDungeonClearRewards(state, def, party, () => 0);
    expect(first.crystalEarned).toBe(200);
    expect(isLevelDungeonTierCleared(state, def.tier)).toBe(true);

    const second = applyLevelDungeonClearRewards(state, def, party, () => 0);
    expect(second.crystalEarned).toBe(50);

    const missed = applyLevelDungeonClearRewards(state, def, party, () => 0.5);
    expect(missed.crystalEarned).toBe(0);
  });

  it("markLevelDungeonTierClearedは重複しても1回分しか記録しない", () => {
    const state = createInitialState();
    markLevelDungeonTierCleared(state, "ADVANCED");
    markLevelDungeonTierCleared(state, "ADVANCED");
    expect(state.clearedLevelDungeonTiers.filter((t) => t === "ADVANCED")).toHaveLength(1);
  });
});

describe("レベル上げダンジョンのバトル設定・オート周回", () => {
  it("setupDungeonBattleで敵チームが定義通りの数だけ生成される", () => {
    const def = findLevelDungeonDef("INTERMEDIATE")!;
    const party = [createMonsterInstance("slime_FIRE", 4, 40)];
    const setup = setupDungeonBattle(party, def, []);
    expect(setup.enemyDefs).toHaveLength(def.enemies.length);
  });

  it("初級は星2Lv20程度のパーティなら無装備でも勝てる", () => {
    const def = findLevelDungeonDef("BEGINNER")!;
    const rng = mulberry32(1);
    const party = [1, 2, 3, 4].map(() => createMonsterInstance("slime_FIRE", 2, 20));
    const setup = setupDungeonBattle(party, def, []);
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng });
    expect(engine.run().winner).toBe("PLAYER");
  });

  it("上級は星5Lv50でも無装備だと苦戦する(装備なしでは通常勝てない)", () => {
    const def = findLevelDungeonDef("ADVANCED")!;
    const rng = mulberry32(2);
    const party = [1, 2, 3, 4].map(() => createMonsterInstance("slime_FIRE", 5, 50));
    const setup = setupDungeonBattle(party, def, []);
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng });
    expect(engine.run().winner).not.toBe("PLAYER");
  });

  it("runLevelDungeonAutoFarmはパーティ未編成ならNO_PARTYで即中断する", () => {
    const state = createInitialState();
    state.partyIds = [];
    const def = findLevelDungeonDef("BEGINNER")!;
    const result = runLevelDungeonAutoFarm(state, def, 5);
    expect(result.stopReason).toBe("NO_PARTY");
    expect(result.attempts).toBe(0);
  });

  it("runLevelDungeonAutoFarmはスタミナが尽きると中断する", () => {
    const state = createInitialState();
    state.stamina = 25;
    state.maxStamina = 25;
    const def = findLevelDungeonDef("BEGINNER")!;
    const result = runLevelDungeonAutoFarm(state, def, 5, mulberry32(3));
    expect(result.stopReason === "STAMINA" || result.stopReason === "DEFEAT").toBe(true);
    expect(result.attempts).toBeLessThanOrEqual(1);
  });
});
