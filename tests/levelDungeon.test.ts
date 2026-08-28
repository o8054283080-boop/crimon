import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { STAR_MAX_LEVEL, levelMultiplier, starMultiplier } from "../src/core/rarity.js";
import { LEGACY_LEVEL_DUNGEON_TIERS, LEVEL_DUNGEON_DAILY_LIMIT, LEVEL_DUNGEON_DEFS, LEVEL_DUNGEON_TIERS, findLevelDungeonDef } from "../src/data/levelDungeon.js";
import { EXP_PIG, EXP_PIG_DEX, MONSTER_TEMPLATES, findMonsterById } from "../src/data/monsters.js";
import { setupDungeonBattle } from "../src/game/dungeonRunner.js";
import {
  PlayerState,
  createInitialState,
  isLevelDungeonTierCleared,
  levelDungeonChallengesRemaining,
  markLevelDungeonTierCleared,
  normalizeLoadedState,
  trySpendLevelDungeonChallenge,
} from "../src/game/playerState.js";
import { applyLevelDungeonClearRewards } from "../src/game/rewards.js";
import { farmBlockReason } from "../src/game/autoFarm.js";
import { LEVEL_DUNGEON_STAMINA_COST } from "../src/core/fighterLevel.js";

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
  it("5階ぶんが存在する", () => {
    expect(LEVEL_DUNGEON_DEFS).toHaveLength(5);
    expect(LEVEL_DUNGEON_DEFS.map((d) => d.tier)).toEqual(LEVEL_DUNGEON_TIERS);
  });

  it("上の階ほど獲得経験値・ゴールドが増える", () => {
    for (let i = 1; i < LEVEL_DUNGEON_DEFS.length; i++) {
      expect(LEVEL_DUNGEON_DEFS[i].expReward).toBeGreaterThan(LEVEL_DUNGEON_DEFS[i - 1].expReward);
      expect(LEVEL_DUNGEON_DEFS[i].goldReward).toBeGreaterThan(LEVEL_DUNGEON_DEFS[i - 1].goldReward);
    }
  });

  it("上の階ほど敵が強い(実効の強さで単調に上がる)", () => {
    // 星の帯とレベルと倍率を別々に見ても分からない。**掛けた値**で見る
    const power = (d: (typeof LEVEL_DUNGEON_DEFS)[number]) =>
      starMultiplier(d.enemies[0].star) * levelMultiplier(d.enemies[0].star, d.enemies[0].level) * d.powerScale;
    for (let i = 1; i < LEVEL_DUNGEON_DEFS.length; i++) {
      expect(power(LEVEL_DUNGEON_DEFS[i])).toBeGreaterThan(power(LEVEL_DUNGEON_DEFS[i - 1]));
    }
  });

  it("経験ピッグの星は下がらない(3階以降は★6で据え置き)", () => {
    // **下げると、前から遊んでいる人にとっては劣化になる**
    for (let i = 1; i < LEVEL_DUNGEON_DEFS.length; i++) {
      expect(LEVEL_DUNGEON_DEFS[i].pigStar).toBeGreaterThanOrEqual(LEVEL_DUNGEON_DEFS[i - 1].pigStar);
    }
    expect(LEVEL_DUNGEON_DEFS[LEVEL_DUNGEON_DEFS.length - 1].pigStar).toBe(6);
  });

  it("findLevelDungeonDefで難易度から定義を引ける", () => {
    expect(findLevelDungeonDef("F3")?.tier).toBe("F3");
  });
});

describe("レベル上げダンジョンの報酬 (applyLevelDungeonClearRewards)", () => {
  it("クリアするとパーティ全員に経験値が入り、経験ピッグを確定で入手する", () => {
    const state = createInitialState();
    const def = findLevelDungeonDef("F1")!;
    const party = [createMonsterInstance("slime_FIRE", 1, 1)];

    const monstersBefore = state.monsters.length;
    const result = applyLevelDungeonClearRewards(state, def, party, () => 0);

    expect(result.expTotal).toBe(def.expReward);
    expect(result.fighterExp).toBe(160);
    expect(result.levelUps.length).toBeGreaterThan(0);
    expect(result.pigDrop).not.toBeNull();
    expect(result.pigDrop!.star).toBe(def.pigStar);
    expect(state.monsters.length).toBe(monstersBefore + 1);
    const addedPig = state.monsters[state.monsters.length - 1];
    expect(addedPig.level).toBe(STAR_MAX_LEVEL[def.pigStar]);
  });

  it("最高階でもモンスター52,000 EXPとファイター400 EXPを分離する", () => {
    const state = createInitialState();
    const def = findLevelDungeonDef("F5")!;
    const result = applyLevelDungeonClearRewards(state, def, [], () => 0);
    expect([result.expTotal, result.fighterExp]).toEqual([52_000, 400]);
  });

  it("初回クリアはダイヤ200、2回目以降は3%の確率でダイヤ50になる", () => {
    const state = createInitialState();
    const def = findLevelDungeonDef("F1")!;
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
    markLevelDungeonTierCleared(state, "F3");
    markLevelDungeonTierCleared(state, "F3");
    expect(state.clearedLevelDungeonTiers.filter((t) => t === "F3")).toHaveLength(1);
  });
});

describe("レベル上げダンジョンのバトル設定・オート周回", () => {
  it("setupDungeonBattleで敵チームが定義通りの数だけ生成される", () => {
    const def = findLevelDungeonDef("F2")!;
    const party = [createMonsterInstance("slime_FIRE", 4, 40)];
    const setup = setupDungeonBattle(party, def, []);
    expect(setup.enemyDefs).toHaveLength(def.enemies.length);
  });

  it("初級は星2Lv20程度のパーティなら無装備でも勝てる", () => {
    const def = findLevelDungeonDef("F1")!;
    const rng = mulberry32(1);
    const party = [1, 2, 3, 4].map(() => createMonsterInstance("slime_FIRE", 2, 20));
    const setup = setupDungeonBattle(party, def, []);
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng });
    expect(engine.run().winner).toBe("PLAYER");
  });

  it("上級は星5Lv50でも無装備だと苦戦する(装備なしでは通常勝てない)", () => {
    const def = findLevelDungeonDef("F3")!;
    const rng = mulberry32(2);
    const party = [1, 2, 3, 4].map(() => createMonsterInstance("slime_FIRE", 5, 50));
    const setup = setupDungeonBattle(party, def, []);
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng });
    expect(engine.run().winner).not.toBe("PLAYER");
  });

  it("周回はスタミナが1回ぶんに足りなくなった時点で止まる", () => {
    const state = createInitialState();
    state.stamina = LEVEL_DUNGEON_STAMINA_COST - 1;
    expect(
      farmBlockReason({
        partySize: state.partyIds.length,
        stamina: state.stamina,
        staminaCost: LEVEL_DUNGEON_STAMINA_COST,
      }),
    ).toBe("STAMINA");
  });

  it("周回はパーティが空なら止まる", () => {
    expect(farmBlockReason({ partySize: 0, stamina: 999, staminaCost: LEVEL_DUNGEON_STAMINA_COST })).toBe("NO_PARTY");
  });
});

describe("1日の挑戦回数", () => {
  it(`1日に${LEVEL_DUNGEON_DAILY_LIMIT}回まで挑める`, () => {
    const state = createInitialState();
    const day = Date.parse("2026-05-01T09:00:00Z");
    expect(levelDungeonChallengesRemaining(state, day)).toBe(LEVEL_DUNGEON_DAILY_LIMIT);
    for (let i = 0; i < LEVEL_DUNGEON_DAILY_LIMIT; i++) {
      expect(trySpendLevelDungeonChallenge(state, day).ok).toBe(true);
    }
    expect(trySpendLevelDungeonChallenge(state, day).ok).toBe(false);
    expect(levelDungeonChallengesRemaining(state, day)).toBe(0);
  });

  it("日付が変わると回数が戻る", () => {
    const state = createInitialState();
    const day1 = Date.parse("2026-05-01T09:00:00Z");
    for (let i = 0; i < LEVEL_DUNGEON_DAILY_LIMIT; i++) trySpendLevelDungeonChallenge(state, day1);
    expect(levelDungeonChallengesRemaining(state, day1)).toBe(0);

    const day2 = Date.parse("2026-05-02T09:00:00Z");
    expect(levelDungeonChallengesRemaining(state, day2)).toBe(LEVEL_DUNGEON_DAILY_LIMIT);
  });

  it("ゴールドダンジョンの回数とは別枠で数える", () => {
    // 片方を使い切ったらもう片方も入れない、では別のコンテンツにならない
    const state = createInitialState();
    const day = Date.parse("2026-05-01T09:00:00Z");
    for (let i = 0; i < LEVEL_DUNGEON_DAILY_LIMIT; i++) trySpendLevelDungeonChallenge(state, day);
    expect(state.goldDungeonChallengesToday).toBe(0);
  });
});

describe("控えの移行(3段階 → 5階)", () => {
  it("古い名前のクリア記録が、対応する階へ読み替えられる", () => {
    // **読み替えないと、前から遊んでいる人のクリア済みが全部消える**
    const old = createInitialState() as unknown as Record<string, unknown>;
    old.clearedLevelDungeonTiers = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(old)) as PlayerState);
    expect(loaded.clearedLevelDungeonTiers).toEqual(["F1", "F2", "F3"]);
  });

  it("読み替えの行き先は、実在する階になっている", () => {
    for (const tier of Object.values(LEGACY_LEVEL_DUNGEON_TIERS)) {
      expect(findLevelDungeonDef(tier)).toBeDefined();
    }
  });

  it("新しい名前はそのまま残る", () => {
    const old = createInitialState() as unknown as Record<string, unknown>;
    old.clearedLevelDungeonTiers = ["F4", "F5"];
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(old)) as PlayerState);
    expect(loaded.clearedLevelDungeonTiers).toEqual(["F4", "F5"]);
  });
});
