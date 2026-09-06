import { describe, expect, it } from "vitest";
import {
  BASIC_TALENT_BY_LINE, BATTLE_TALENT_BY_LINE, SKILL_AWAKENING_POINT_COST, SKILL_AWAKENING_STONE_COST,
  TALENT_POINT_CAP, TALENT_RESET_GOLD_COST, TALENT_UNLOCK_STAR,
  createDefaultTalentState, nextTalentUnlockCost, remainingTalentPoints, talentStatBonus,
  totalTalentUnlockCost, usedTalentPoints,
} from "../src/core/talents.js";
import { SKILL_AWAKENINGS, SKILL_TALENTS, availableSkillTalents, skillTalentCost } from "../src/core/talentSkills.js";
import { skillTags } from "../src/core/skillTags.js";
import { applySkillTalents } from "../src/core/talentApply.js";
import { initialRarityOfDexId } from "../src/data/initialRarity.js";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import { findMonsterById } from "../src/data/monsters.js";
import { createInitialState } from "../src/game/playerState.js";
import {
  reconcileSkillTalents, resetTalents, takeBasicTalent, takeSkillAwakening, takeSkillTalent,
  talentsOf, unlockTalentPoint,
} from "../src/game/talents.js";
import type { Skill } from "../src/core/skill.js";

/**
 * 才能覚醒。
 *
 * **上限は「今の★」ではなく「初期★」で決まる。**★3を★6まで育てても20pt。
 * ここが逆転していないことが、この仕組みの背骨。
 */

function star6(dexId = "slime_FIRE") {
  const monster = createMonsterInstance(dexId, 6, 60);
  return monster;
}

describe("才能ptの上限", () => {
  it("初期★3=20 / ★4=15 / ★5=11。**低い★ほど多い**", () => {
    expect(TALENT_POINT_CAP[3]).toBe(20);
    expect(TALENT_POINT_CAP[4]).toBe(15);
    expect(TALENT_POINT_CAP[5]).toBe(11);
    // 逆転していないこと自体が仕様
    expect(TALENT_POINT_CAP[3]).toBeGreaterThan(TALENT_POINT_CAP[4]);
    expect(TALENT_POINT_CAP[4]).toBeGreaterThan(TALENT_POINT_CAP[5]);
  });

  it("初期★は召喚の抽選表から導く。★6まで育てても変わらない", () => {
    // 通常モンスターは★3出身
    expect(initialRarityOfDexId("slime_FIRE")).toBe(3);
    // グリフォンは★4、ドラゴンは★5
    expect(initialRarityOfDexId("griffon_FIRE")).toBe(4);
    expect(initialRarityOfDexId("dragon_DARK")).toBe(5);
    /*
     * **テンプレートIDに `_` が含まれる種族**を壊さない。
     * 先頭から切ると `reincarnation` で切れて別物になる。
     */
    expect(initialRarityOfDexId("reincarnation_pig_FIRE")).toBe(3);
  });
});

describe("才能ptの解放コスト", () => {
  it("依頼どおりの合計になる(★3=欠片472・結晶76 / ★4=520・85 / ★5=550・86)", () => {
    expect(totalTalentUnlockCost(3)).toEqual({ shards: 472, crystals: 76 });
    expect(totalTalentUnlockCost(4)).toEqual({ shards: 520, crystals: 85 });
    expect(totalTalentUnlockCost(5)).toEqual({ shards: 550, crystals: 86 });
  });

  it("帯の切れ目で値段が変わる", () => {
    // ★3: 1〜7pt目は欠片16のみ、8pt目から結晶が要る
    expect(nextTalentUnlockCost(3, 0)).toEqual({ shards: 16, crystals: 0 });
    expect(nextTalentUnlockCost(3, 6)).toEqual({ shards: 16, crystals: 0 });
    expect(nextTalentUnlockCost(3, 7)).toEqual({ shards: 24, crystals: 4 });
    expect(nextTalentUnlockCost(3, 14)).toEqual({ shards: 32, crystals: 8 });
    // 上限まで解放したら次は無い
    expect(nextTalentUnlockCost(3, 20)).toBeNull();
    expect(nextTalentUnlockCost(5, 11)).toBeNull();
  });
});

describe("段階制の才能", () => {
  it("速度だけ高い(3pt / 4pt / 5pt)。他の系統より重い", () => {
    const spd = BASIC_TALENT_BY_LINE.get("spd")!;
    expect(spd.steps.map((s) => s.cost)).toEqual([3, 4, 5]);
    expect(spd.steps.map((s) => s.value)).toEqual([3, 5, 7]);
    // 攻撃は1/2/3。速度はどの段でも攻撃より高い
    const atk = BASIC_TALENT_BY_LINE.get("atk")!;
    for (let i = 0; i < 3; i += 1) {
      expect(spd.steps[i].cost).toBeGreaterThan(atk.steps[i].cost);
    }
  });

  it("戦闘才能の値も依頼どおり", () => {
    expect(BATTLE_TALENT_BY_LINE.get("damageDealt")!.steps.map((s) => [s.cost, s.value]))
      .toEqual([[2, 0.03], [3, 0.05], [4, 0.07]]);
    expect(BATTLE_TALENT_BY_LINE.get("healing")!.steps.map((s) => [s.cost, s.value]))
      .toEqual([[1, 0.08], [2, 0.12], [3, 0.18]]);
  });

  /*
   * **段の値は置き換えではなく合計。**
   * 攻撃IIIまで取れば 5+8+12 = 25%。IIIだけの12%ではない。
   * 段ごとに1+2+3=6pt払うので、置き換えだと後段の割に合わない。
   */
  it("段の効果は積み上がる", () => {
    const talents = createDefaultTalentState();
    talents.basic.atk = 3;
    expect(talentStatBonus(talents).atkPercent).toBeCloseTo(0.25, 5);
    talents.basic.spd = 3;
    expect(talentStatBonus(talents).spdFlat).toBe(15);
  });

  it("IIはIを取らないと取れない", () => {
    const monster = star6();
    talentsOf(monster).unlockedPoints = 20;
    expect(takeBasicTalent(monster, "atk").ok).toBe(true);
    expect(talentsOf(monster).basic.atk).toBe(1);
    expect(takeBasicTalent(monster, "atk").ok).toBe(true);
    expect(talentsOf(monster).basic.atk).toBe(2);
    expect(takeBasicTalent(monster, "atk").ok).toBe(true);
    // 4段目は無い
    expect(takeBasicTalent(monster, "atk").ok).toBe(false);
    expect(talentsOf(monster).basic.atk).toBe(3);
  });
});

describe("★6でなければ何もできない", () => {
  it("解放も取得も弾く。**素材は★6前から貯められる**", () => {
    expect(TALENT_UNLOCK_STAR).toBe(6);
    const state = createInitialState();
    state.awakeningShards = 1000;
    state.awakeningCrystals = 1000;
    const young = createMonsterInstance("slime_FIRE", 5, 50);
    expect(unlockTalentPoint(state, young).ok).toBe(false);
    expect(takeBasicTalent(young, "atk").ok).toBe(false);
    // 素材は減っていない
    expect(state.awakeningShards).toBe(1000);
  });

  it("★6なら素材を払って1ptずつ解放できる", () => {
    const state = createInitialState();
    state.awakeningShards = 16;
    const monster = star6();
    expect(unlockTalentPoint(state, monster).ok).toBe(true);
    expect(talentsOf(monster).unlockedPoints).toBe(1);
    expect(state.awakeningShards).toBe(0);
    // 素材が尽きたら止まる
    expect(unlockTalentPoint(state, monster).ok).toBe(false);
    expect(talentsOf(monster).unlockedPoints).toBe(1);
  });
});

describe("振り直し", () => {
  it("取得だけ白紙に戻し、**解放済みptは失わない**", () => {
    const state = createInitialState();
    state.gold = TALENT_RESET_GOLD_COST;
    const monster = star6();
    talentsOf(monster).unlockedPoints = 20;
    takeBasicTalent(monster, "atk");
    takeBasicTalent(monster, "hp");
    expect(usedTalentPoints(talentsOf(monster), skillTalentCost)).toBe(2);

    expect(resetTalents(state, monster).ok).toBe(true);
    expect(state.gold).toBe(0);
    expect(talentsOf(monster).basic).toEqual({});
    // 解放済みは20のまま
    expect(talentsOf(monster).unlockedPoints).toBe(20);
    expect(remainingTalentPoints(talentsOf(monster), skillTalentCost)).toBe(20);
  });

  it("100,000G。足りなければ何も起きない", () => {
    expect(TALENT_RESET_GOLD_COST).toBe(100_000);
    const state = createInitialState();
    state.gold = 99_999;
    const monster = star6();
    talentsOf(monster).unlockedPoints = 5;
    takeBasicTalent(monster, "atk");
    expect(resetTalents(state, monster).ok).toBe(false);
    expect(talentsOf(monster).basic.atk).toBe(1);
  });
});

describe("スキル才能", () => {
  const damageSkill: Skill = {
    id: "t_atk", name: "テスト攻撃", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 1.0 }],
  };
  const healSkill: Skill = {
    id: "t_heal", name: "テスト回復", description: "", target: "SINGLE_ALLY", cooldownTurns: 3,
    effects: [{ kind: "HEAL", healRate: 0.3 }],
  };

  it("札は技の中身から出す。**技の名前では決めない**", () => {
    expect([...skillTags(damageSkill)].sort()).toEqual(["attack", "enemy_target", "single"]);
    expect([...skillTags(healSkill)].sort()).toEqual(["ally_target", "heal", "single"]);
  });

  it("候補は札で絞る。攻撃技に回復の才能は並ばない", () => {
    const forAttack = availableSkillTalents(skillTags(damageSkill)).map((d) => d.id);
    expect(forAttack).toContain("atk_power1");
    expect(forAttack).not.toContain("heal_boost1");
  });

  it("威力強化は倍率に乗る", () => {
    const applied = applySkillTalents(damageSkill, ["atk_power1"]);
    const effect = applied.effects[0] as { multiplier: number };
    expect(effect.multiplier).toBeCloseTo(1.1, 5);
    // **元の定義は壊さない**(同じ技を持つ全員が変わってしまう)
    expect((damageSkill.effects[0] as { multiplier: number }).multiplier).toBe(1.0);
  });

  it("組み替えで書けないものは talentMods へ載る", () => {
    const applied = applySkillTalents(damageSkill, ["awk_atk_lifesteal", "awk_atk_extra_turn"]);
    expect(applied.effects.some((e) => e.kind === "LIFESTEAL")).toBe(true);
    expect(applied.talentMods?.extraTurnChance).toBeCloseTo(0.10, 5);
  });
});

describe("スキル覚醒", () => {
  it("どれも8pt・奇石3個", () => {
    expect(SKILL_AWAKENING_POINT_COST).toBe(8);
    expect(SKILL_AWAKENING_STONE_COST).toBe(3);
    for (const def of SKILL_AWAKENINGS) {
      expect(def.cost, `${def.id} の値段が8ptではない`).toBe(8);
      expect(def.awakening, `${def.id} に覚醒の印が無い`).toBe(true);
    }
  });

  it("**1体につき1つだけ。**2つ目は取れない", () => {
    const state = createInitialState();
    state.awakeningStones = 10;
    const monster = star6();
    talentsOf(monster).unlockedPoints = 20;
    const dex = findMonsterById(monster.dexId)!;
    const skills = toBattleDefinition(monster, dex).skills;

    const first = SKILL_AWAKENINGS.find((d) => d.requiresTags.every((t) => skillTags(skills[1]).has(t)));
    expect(first, "スキル2に付けられる覚醒が無い").toBeDefined();
    expect(takeSkillAwakening(state, monster, 1, first!.id, skills[1]).ok).toBe(true);
    expect(state.awakeningStones).toBe(7);

    // 別の枠でも取れない
    const second = SKILL_AWAKENINGS.find((d) => d.id !== first!.id && d.requiresTags.every((t) => skillTags(skills[2]).has(t)));
    if (second) {
      expect(takeSkillAwakening(state, monster, 2, second.id, skills[2]).ok).toBe(false);
      expect(state.awakeningStones).toBe(7);
    }
  });

  it("奇石が足りなければ取れない", () => {
    const state = createInitialState();
    state.awakeningStones = 2;
    const monster = star6();
    talentsOf(monster).unlockedPoints = 20;
    const skills = toBattleDefinition(monster, findMonsterById(monster.dexId)!).skills;
    const def = SKILL_AWAKENINGS.find((d) => d.requiresTags.every((t) => skillTags(skills[1]).has(t)))!;
    expect(takeSkillAwakening(state, monster, 1, def.id, skills[1]).ok).toBe(false);
    expect(state.awakeningStones).toBe(2);
  });
});

describe("継承で技が変わった時", () => {
  it("付けられなくなった才能を外し、ptを未使用へ戻す", () => {
    const monster = star6();
    talentsOf(monster).unlockedPoints = 20;
    const dex = findMonsterById(monster.dexId)!;
    const skills = toBattleDefinition(monster, dex).skills;

    // スキル2へ、その技に合う才能を1つ取る
    const fit = availableSkillTalents(skillTags(skills[1]))[0];
    expect(fit, "スキル2に付けられる才能が無い").toBeDefined();
    expect(takeSkillTalent(monster, 1, fit.id, skills[1]).ok).toBe(true);
    const used = usedTalentPoints(talentsOf(monster), skillTalentCost);
    expect(used).toBe(fit.cost);

    /*
     * 技が**まるごと別のもの**に入れ替わったことにする。
     * 攻撃技に回復の技を入れれば、攻撃系の才能は付けられなくなる。
     */
    const replaced: Skill = {
      id: "swapped", name: "入れ替えた技", description: "", target: "SELF", cooldownTurns: 0,
      effects: [{ kind: "HEAL", healRate: 0.2, applyTo: "SELF" }],
    };
    const result = reconcileSkillTalents(monster, [skills[0], replaced, skills[2]]);
    if (fit.requiresTags.some((tag) => !skillTags(replaced).has(tag))) {
      expect(result.removed.length).toBe(1);
      expect(result.refunded).toBe(fit.cost);
      expect(usedTalentPoints(talentsOf(monster), skillTalentCost)).toBe(0);
      // **解放済みptは減らない。**そのまま別の才能へ振り直せる
      expect(talentsOf(monster).unlockedPoints).toBe(20);
    }
  });
});

describe("才能が戦闘へ乗る", () => {
  it("基礎才能がステータスに反映される", () => {
    const monster = star6();
    const dex = findMonsterById(monster.dexId)!;
    const before = toBattleDefinition(monster, dex);

    talentsOf(monster).unlockedPoints = 20;
    takeBasicTalent(monster, "atk");
    takeBasicTalent(monster, "atk");
    takeBasicTalent(monster, "atk");
    const after = toBattleDefinition(monster, dex);
    // 5+8+12 = 25%
    expect(after.stats.atk).toBe(Math.round(before.stats.atk * 1.25));
  });

  it("戦闘才能が CombatModifiers に乗る", () => {
    const monster = star6();
    const dex = findMonsterById(monster.dexId)!;
    talentsOf(monster).unlockedPoints = 20;
    talentsOf(monster).battle.healing = 3;
    talentsOf(monster).battle.damageTaken = 1;
    const def = toBattleDefinition(monster, dex);
    // 8+12+18 = 38%
    expect(def.combatMods?.healingMultiplier).toBeCloseTo(1.38, 5);
    // 被ダメは減る向き
    expect(def.combatMods?.damageTakenMultiplier).toBeCloseTo(0.97, 5);
  });
});

describe("スキル才能の定義そのもの", () => {
  it("値段の帯が依頼どおり(2〜6pt)", () => {
    for (const def of SKILL_TALENTS) {
      expect(def.cost, `${def.id} の値段が範囲外`).toBeGreaterThanOrEqual(2);
      expect(def.cost, `${def.id} の値段が範囲外`).toBeLessThanOrEqual(6);
    }
  });

  it("IDが重複していない", () => {
    const ids = [...SKILL_TALENTS, ...SKILL_AWAKENINGS].map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
