/**
 * アクセサリー・遺跡・カケラ製作・限界能力付与(依頼29章のテスト一式)。
 *
 * アリーナの互換(A〜O)は `arenaAccessoryCompat.test.ts` に分けてある。
 */
import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { stripBuffs } from "../src/battle/unit.js";
import {
  ACCESSORY_FAMILIES, ACCESSORY_RARITIES, ACCESSORY_SPECIALS, SPECIAL_COUNT,
  type Accessory, type AccessoryBattleEffects, accessoryMainValue, emptyAccessoryEffects, generateAccessory,
  specialRange, weakValue, sanitizeAccessory, describeSpecial,
} from "../src/core/accessory.js";
import { appearanceTemplateOf, type MonsterDefinition } from "../src/core/monster.js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { SET_TYPES } from "../src/core/equipment.js";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import type { Skill } from "../src/core/skill.js";
import { findMonsterById } from "../src/data/monsters.js";
import {
  GUARDIAN_PROTECT_SHARE, HERALD_GUARD_MITIGATE, POWER_DEATH_BUFF, POWER_RUIN_DAMAGE_RAMP, findRuinFloor, ruinFloors, ruinLocationId, findRuinFloorByLocationId,
} from "../src/data/ruins.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import {
  addAccessory, equipAccessory, sellAccessory, tryEnhanceAccessory, unequipAccessory, accessoryOwner, setAccessoryLocked,
} from "../src/game/accessories.js";
import { ANCIENT_CRAFT_COST, craftAccessory, craftEquipment, setLimitPoints, unlockLimitBreak } from "../src/game/ancientCraft.js";
import { grantRuinReward, isRuinFloorUnlocked, rollRuinDrop } from "../src/game/ruins.js";
import { createInitialState, normalizeLoadedState, type PlayerState } from "../src/game/playerState.js";
import { decodeSave, encodeSave } from "../src/game/saveCodec.js";
import { FALLBACK_REFERENCE_SECONDS, manualClearKey, referenceRunTime } from "../src/game/manualClearTimes.js";
import { createBackgroundFarmJob } from "../src/game/backgroundAutoFarm.js";
import { emptyResult, mergeReward } from "../src/game/autoFarm.js";

function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ====================================================================== 生成 */

describe("生成", () => {
  it("レア度ごとの特殊効果の数(ヒーロー1・レジェンド2・エピック3)と、弱効果は必ず1つ", () => {
    const r = rng(1);
    for (const family of ACCESSORY_FAMILIES) for (const rarity of ACCESSORY_RARITIES) for (let i = 0; i < 300; i += 1) {
      const acc = generateAccessory({ star: 6, rarity, family, rng: r });
      expect(acc.specials).toHaveLength(SPECIAL_COUNT[rarity]);
      expect(acc.weak).toBeTruthy();
    }
  });

  it("同じ特殊効果が1つのアクセに2つ入らない。系統の外の効果も入らない。値は幅の中", () => {
    const r = rng(2);
    for (const family of ACCESSORY_FAMILIES) for (let i = 0; i < 2000; i += 1) {
      const acc = generateAccessory({ star: 6, rarity: "EPIC", family, rng: r });
      const ids = acc.specials.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const roll of acc.specials) {
        expect(ACCESSORY_SPECIALS[roll.id].family).toBe(family);
        const [lo, hi] = specialRange(roll.id, "EPIC");
        expect(roll.value).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(roll.value).toBeLessThanOrEqual(hi + 1e-9);
      }
    }
  });

  it("4系統の特殊は重ならず、攻撃は属性特効6つを別々の効果として持つ", () => {
    const byFamily = new Map<string, string[]>();
    for (const [id, def] of Object.entries(ACCESSORY_SPECIALS)) byFamily.set(def.family, [...(byFamily.get(def.family) ?? []), id]);
    expect(byFamily.get("ATTACK")!.filter((id) => id.startsWith("ELEM_"))).toHaveLength(6);
    expect(byFamily.get("ATTACK")!.length).toBe(20);
    expect(byFamily.get("DURABILITY")!.length).toBe(17);
    expect(byFamily.get("SUPPORT")!.length).toBe(9);
    expect(byFamily.get("DISRUPT")!.length).toBe(10);
    // 採らないと決めた効果は作っていない
    for (const banned of ["CLEANSE_SHIELD", "CLEANSE_HEAL", "CLEANSE_GAUGE", "REVIVE_HP", "REVIVE_SHIELD", "SUPPORT_SELF_GAUGE"]) {
      expect(Object.keys(ACCESSORY_SPECIALS)).not.toContain(banned);
    }
  });

  it("★6 Lv15 のメイン中央値は HP5000 / 攻撃2000 / 防御750、個体差は ×0.8〜1.2", () => {
    const at = (mainStat: Accessory["mainStat"], mainRoll: number) => accessoryMainValue({ star: 6, level: 15, mainStat, mainRoll });
    expect([at("HP", 1), at("ATK", 1), at("DEF", 1)]).toEqual([5000, 2000, 750]);
    expect([at("HP", 0.8), at("HP", 1.2)]).toEqual([4000, 6000]);
    expect([at("ATK", 0.8), at("ATK", 1.2)]).toEqual([1600, 2400]);
    expect([at("DEF", 0.8), at("DEF", 1.2)]).toEqual([600, 900]);
    const r = rng(3);
    const rolls = Array.from({ length: 4000 }, () => generateAccessory({ star: 6, rarity: "HERO", family: "ATTACK", rng: r }).mainRoll).sort((a, b) => a - b);
    expect(rolls[0]).toBeGreaterThanOrEqual(0.8);
    expect(rolls.at(-1)!).toBeLessThanOrEqual(1.2);
    expect(Math.abs(rolls[2000] - 1)).toBeLessThan(0.02);
  });

  it("★4 < ★5 < ★6、Lvが上がるほど大きい(自然な曲線)", () => {
    for (const mainStat of ["HP", "ATK", "DEF"] as const) {
      const v = (star: 4 | 5 | 6, level: number) => accessoryMainValue({ star, level, mainStat, mainRoll: 1 });
      expect(v(4, 15)).toBeLessThan(v(5, 15));
      expect(v(5, 15)).toBeLessThan(v(6, 15));
      for (let lv = 2; lv <= 15; lv += 1) expect(v(6, lv)).toBeGreaterThan(v(6, lv - 1));
    }
  });
});

/* ====================================================================== 強化・着脱・売却 */

function stateWithAccessory(): { state: PlayerState; acc: Accessory } {
  const state = createInitialState();
  const a = createMonsterInstance("knight_FIRE", 6, 60);
  const b = createMonsterInstance("wolf_WATER", 6, 60);
  state.monsters = [a, b];
  const acc = generateAccessory({ star: 6, rarity: "LEGEND", family: "ATTACK", rng: rng(4) });
  addAccessory(state, acc);
  return { state, acc };
}

describe("強化", () => {
  it("ゴールドだけで必ず成功し、Lv15で止まる。弱効果はLv5・10・15でだけ伸びる", () => {
    const { state, acc } = stateWithAccessory();
    state.gold = 100_000_000;
    const weakAt: number[] = [weakValue(acc.weak, 1)];
    for (let i = 0; i < 20; i += 1) {
      const before = state.gold;
      const result = tryEnhanceAccessory(state, acc.id);
      if (acc.level >= 15 && !result.ok) break;
      expect(result.ok).toBe(true);
      expect(state.gold).toBe(before - result.cost);
      weakAt[acc.level] = weakValue(acc.weak, acc.level);
    }
    expect(acc.level).toBe(15);
    expect(tryEnhanceAccessory(state, acc.id).ok).toBe(false);
    for (let lv = 2; lv <= 15; lv += 1) {
      const grew = weakAt[lv] > weakAt[lv - 1];
      expect(grew, `Lv${lv}`).toBe([5, 10, 15].includes(lv));
    }
  });

  it("ゴールドが足りなければ上がらない", () => {
    const { state, acc } = stateWithAccessory();
    state.gold = 0;
    expect(tryEnhanceAccessory(state, acc.id).ok).toBe(false);
    expect(acc.level).toBe(1);
  });
});

describe("着脱・売却", () => {
  it("着ける・外す・付け替えると前の持ち主から外れる", () => {
    const { state, acc } = stateWithAccessory();
    const [a, b] = state.monsters;
    expect(equipAccessory(state, a.id, acc.id).ok).toBe(true);
    expect(accessoryOwner(state, acc.id)?.id).toBe(a.id);
    expect(equipAccessory(state, b.id, acc.id).ok).toBe(true);
    expect(a.accessoryId).toBeNull();
    expect(accessoryOwner(state, acc.id)?.id).toBe(b.id);
    unequipAccessory(state, b.id);
    expect(accessoryOwner(state, acc.id)).toBeUndefined();
  });

  it("装着中とロック中は売れない。売るとゴールドが入り、持ち物から消える", () => {
    const { state, acc } = stateWithAccessory();
    equipAccessory(state, state.monsters[0].id, acc.id);
    expect(sellAccessory(state, acc.id).ok).toBe(false);
    unequipAccessory(state, state.monsters[0].id);
    setAccessoryLocked(state, acc.id, true);
    expect(sellAccessory(state, acc.id).ok).toBe(false);
    setAccessoryLocked(state, acc.id, false);
    const gold = state.gold;
    const sold = sellAccessory(state, acc.id);
    expect(sold.ok).toBe(true);
    expect(state.gold).toBe(gold + sold.goldEarned);
    expect(state.accessories).toHaveLength(0);
  });

  it("メインの実数が戦闘の値へ乗る。着けていなければ定義は変わらない", () => {
    const instance = createMonsterInstance("knight_FIRE", 6, 60);
    const dex = findMonsterById(instance.dexId)!;
    const bare = toBattleDefinition(instance, dex);
    expect(toBattleDefinition(instance, dex, [], null)).toEqual(bare);
    const acc = generateAccessory({ star: 6, rarity: "HERO", family: "ATTACK", mainStat: "ATK", rng: rng(5) });
    acc.level = 15;
    const worn = toBattleDefinition(instance, dex, [], acc);
    expect(worn.stats.atk - bare.stats.atk).toBe(accessoryMainValue(acc));
  });
});

/* ====================================================================== セーブ互換 */

describe("セーブ互換", () => {
  it("アクセ・装着・限界配分・素材・遺跡の進みが、保存して読み直しても残る", () => {
    const { state, acc } = stateWithAccessory();
    equipAccessory(state, state.monsters[0].id, acc.id);
    state.monsters[0].development.limitBreak = { unlocked: true, points: { hp: -10, atk: 10, def: 0, spd: 0 } };
    state.ancientShards = 321;
    state.evolutionCores = 45;
    state.clearedPowerRuinFloors = [1, 2];
    const loaded = normalizeLoadedState(decodeSave(encodeSave(state))!);
    expect(loaded.accessories).toEqual(state.accessories);
    expect(loaded.monsters[0].accessoryId).toBe(acc.id);
    expect(loaded.monsters[0].development.limitBreak).toEqual({ unlocked: true, points: { hp: -10, atk: 10, def: 0, spd: 0 } });
    expect(loaded.ancientShards).toBe(321);
    expect(loaded.evolutionCores).toBe(45);
    expect(loaded.clearedPowerRuinFloors).toEqual([1, 2]);
  });

  it("旧セーブ(項目が無い)は空・0・未解放で読み、戦闘は前と同じ値", () => {
    const state = createInitialState();
    state.monsters = [createMonsterInstance("knight_FIRE", 6, 60)];
    const raw = JSON.parse(encodeSave(state));
    for (const key of ["accessories", "ancientShards", "evolutionCores", "clearedPowerRuinFloors", "clearedGuardianRuinFloors"]) delete raw.s[key];
    const loaded = normalizeLoadedState(decodeSave(JSON.stringify(raw))!);
    expect(loaded.accessories).toEqual([]);
    expect(loaded.ancientShards).toBe(0);
    expect(loaded.evolutionCores).toBe(0);
    expect(loaded.clearedPowerRuinFloors).toEqual([]);
    expect(loaded.monsters[0].development.limitBreak).toBeUndefined();
    const dex = findMonsterById("knight_FIRE")!;
    expect(toBattleDefinition(loaded.monsters[0], dex).stats).toEqual(toBattleDefinition(state.monsters[0], dex).stats);
  });

  it("壊れたアクセは持ち物から外し、持ち物に無いアクセを指す装着は外す(例外は出さない)", () => {
    const { state, acc } = stateWithAccessory();
    state.monsters[0].accessoryId = acc.id;
    state.monsters[1].accessoryId = "acc_missing";
    (state.accessories as unknown[]).push({ id: "broken", star: 9 }, null, "x");
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    expect(loaded.accessories!.map((a) => a.id)).toEqual([acc.id]);
    expect(loaded.monsters[0].accessoryId).toBe(acc.id);
    expect(loaded.monsters[1].accessoryId).toBeNull();
  });

  it("決まりを外れた限界配分は0へ戻す(解放の印は残す)", () => {
    const state = createInitialState();
    state.monsters = [createMonsterInstance("knight_FIRE", 6, 60)];
    state.monsters[0].development.limitBreak = { unlocked: true, points: { hp: 0, atk: 40, def: 0, spd: 0 } };
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)));
    expect(loaded.monsters[0].development.limitBreak).toEqual({ unlocked: true, points: { hp: 0, atk: 0, def: 0, spd: 0 } });
  });
});

/* ====================================================================== 戦闘の効き方 */

const HIT: Skill = { id: "t_hit", name: "打撃", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }] };
const WAIT: Skill = { id: "t_wait", name: "待機", description: "", target: "SELF", cooldownTurns: 0, effects: [] };

function dummy(overrides: Partial<MonsterDefinition> = {}, accessory?: Partial<AccessoryBattleEffects>): MonsterDefinition {
  const base = structuredClone(findMonsterById("knight_FIRE")!);
  return {
    ...base,
    stats: { ...base.stats, hp: 1_000_000, atk: 1000, def: 0, spd: 100, criRate: 0, criDmg: 1.5, accuracy: 1, resistance: 0 },
    skills: [HIT, WAIT, WAIT],
    combatMods: undefined,
    latentAbility: undefined,
    bossTraits: undefined,
    ...overrides,
    ...(accessory ? { accessory: { ...emptyAccessoryEffects(), ...accessory } } : {}),
  };
}

function oneHit(attacker: MonsterDefinition, defender: MonsterDefinition, skillIndex: 0 | 1 | 2 = 0): number {
  const engine = new BattleEngine([attacker], [defender], { rng: () => 0.5 });
  const [a, b] = engine.getUnits();
  const before = b.currentHp;
  a.gauge = 100;
  engine.resolveTurn(a, { skillIndex, targetId: b.instanceId });
  return before - b.currentHp;
}

describe("効き方", () => {
  it("アクセの無い戦闘はアクセの仕組みを作らない", () => {
    const engine = new BattleEngine([dummy()], [dummy()]);
    expect((engine as unknown as { acc: unknown }).acc).toBeNull();
  });

  it("攻撃の与ダメUPは加算(1+0.10+0.05=1.15倍。1.10×1.05=1.155倍ではない)。上限は無い", () => {
    const base = oneHit(dummy(), dummy());
    const up = oneHit(dummy({}, { s1Damage: 0.10, selfHp70: 0.05 }), dummy());
    expect(up / base).toBeCloseTo(1.15, 2);
    const big = oneHit(dummy({}, { s1Damage: 0.30, selfHp70: 0.30, first: 0.30 }), dummy());
    expect(big / base).toBeCloseTo(1.90, 2);
  });

  it("耐久の被ダメ軽減は乗算(0.95×0.95=0.9025倍)", () => {
    const base = oneHit(dummy(), dummy());
    const cut = oneHit(dummy(), dummy({}, { dmgTaken: 0.05, hp70Taken: 0.05 }));
    expect(cut / base).toBeCloseTo(0.9025, 3);
  });

  it("ゲージ減少は元の減少量へ掛ける(20%×1.12×1.10=24.64%)。ptでは足さない", () => {
    const drain: Skill = {
      id: "t_gauge", name: "足止め", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "GAUGE", amount: -0.20 }],
    };
    const engine = new BattleEngine(
      [dummy({ skills: [drain, WAIT, WAIT] }, { gaugeDownUp: 0.12, debuffedGaugeDown: 0.10 })],
      [dummy()], { rng: () => 0.5 },
    );
    const [a, b] = engine.getUnits();
    b.effects.push({ kind: "DEBUFF", stat: "atk", amount: -0.5, remainingTurns: 3 } as never);
    b.gauge = 80;
    a.gauge = 100;
    engine.resolveTurn(a, { skillIndex: 0, targetId: b.instanceId });
    expect(80 - b.gauge).toBeCloseTo(24.64, 5);
  });

  it("サポートは1スキル×1対象で1回だけ(回復を2回持つ全体技でも、ゲージは1回ぶん)", () => {
    const doubleHeal: Skill = {
      id: "t_heal", name: "二重治癒", description: "", target: "ALL_ALLIES", cooldownTurns: 0,
      effects: [{ kind: "HEAL", healRate: 0.01 }, { kind: "HEAL", healRate: 0.01 }],
    };
    const engine = new BattleEngine(
      [dummy({ skills: [doubleHeal, WAIT, WAIT] }, { healedGauge: 0.06 }), dummy(), dummy()],
      [dummy()], { rng: () => 0.5 },
    );
    const [healer, x, y] = engine.getUnits();
    for (const u of [healer, x, y]) u.currentHp = Math.round(u.maxHp * 0.5);
    x.gauge = 10; y.gauge = 20;
    healer.gauge = 100;
    engine.resolveTurn(healer, { skillIndex: 0 });
    expect(x.gauge).toBeCloseTo(16, 5);
    expect(y.gauge).toBeCloseTo(26, 5);
  });

  it("アクセのシールドは足し合わせず大きい方。最大HPを超えない", () => {
    const heal: Skill = {
      id: "t_heal1", name: "治癒", description: "", target: "SINGLE_ALLY", cooldownTurns: 0,
      effects: [{ kind: "HEAL", healRate: 0.01 }],
    };
    const engine = new BattleEngine(
      [dummy({ skills: [heal, WAIT, WAIT] }, { healedShield: 0.08, low50HealedShield: 0.12 }), dummy()],
      [dummy()], { rng: () => 0.5 },
    );
    const [healer, ally] = engine.getUnits();
    ally.currentHp = Math.round(ally.maxHp * 0.3);
    for (let i = 0; i < 3; i += 1) {
      healer.gauge = 100;
      engine.resolveTurn(healer, { skillIndex: 0, targetId: ally.instanceId });
    }
    expect(ally.shieldValue).toBe(Math.round(ally.maxHp * 0.12));
    expect(ally.shieldValue).toBeLessThanOrEqual(ally.maxHp);
  });

  it("説明文は実際の値で書く", () => {
    expect(describeSpecial({ id: "S3_DMG", value: 0.11 })).toBe("S3ダメージ +11%");
    expect(describeSpecial({ id: "GAUGE_DOWN_UP", value: 0.12 })).toBe("行動ゲージ減少量 ×1.12");
    expect(describeSpecial({ id: "HEALED_DR", value: 0.15 })).toBe("回復した味方の被ダメージ -15%（1ターン）");
  });

  it("防衛データの改ざん値は正規の幅へ収まる", () => {
    const acc = sanitizeAccessory({ id: "x", star: 6, rarity: "HERO", family: "ATTACK", mainStat: "ATK", mainRoll: 50, level: 99, weak: "W_FIRST", specials: [{ id: "S1_DMG", value: 9 }, { id: "S2_DMG", value: 0.05 }] })!;
    expect(acc.mainRoll).toBe(1.2);
    expect(acc.level).toBe(15);
    expect(acc.specials).toEqual([{ id: "S1_DMG", value: specialRange("S1_DMG", "HERO")[1] }]);
  });
});

/* ====================================================================== 遺跡 */

function ruinEngine(kind: "POWER" | "GUARDIAN", floor: number) {
  const f = findRuinFloor(kind, floor)!;
  const enemies = buildDungeonEnemyTeam(f);
  const engine = new BattleEngine([dummy()], enemies, { rng: () => 0.5 });
  return { engine, units: engine.getUnits(), floor: f };
}

describe("遺跡", () => {
  it("能力値・スタミナ・消費は指定どおり(5階)", () => {
    const p5 = findRuinFloor("POWER", 5)!;
    // 力の遺跡の4・5階は、依頼主の指示(「力の遺跡をつよくして目標に近づけて」)で
    // 指定値(本体 510000/9000/3150/210)から HPを約半分・攻撃力を約3.8倍・本体の速さ+15 にした。
    // そのうえで「塔を倒すと必ず損」(既定の狙い19% / 本体を狙い撃ち94%)を直した。
    // 1回目は塔を脆くしすぎて「号令塔から倒すのが常に得」に裏返ったので、2回目で号令塔を巻き添えで
    // 倒れない硬さ(HP 47,250・防御2,860)へ戻し、妨害塔は硬く(既定の狙いが先に削りに行かない)、
    // 指揮兵器は会心寄りにした。3回目で回復阻害を外して長期戦の決着(POWER_RUIN_DAMAGE_RAMP)に替え、
    // 妨害塔のHPを2倍(57,600)・指揮兵器の攻撃を0.95倍(31,573)にした。比は tests/ruinPowerRoles.test.ts
    expect(p5.enemies.map((e) => [e.fixedStats!.hp, e.fixedStats!.atk, e.fixedStats!.def, e.fixedStats!.spd])).toEqual([
      [216_750, 31_573, 3_150, 225], [47_250, 5_400, 2_860, 205], [57_600, 7_800, 5_400, 200],
    ]);
    // 4階は5階と分けて決める(4階STRONGの汎用の放置が約5割になる強さ)
    expect(findRuinFloor("POWER", 4)!.enemies.map((e) => [e.fixedStats!.hp, e.fixedStats!.atk, e.fixedStats!.def, e.fixedStats!.spd])).toEqual([
      [191_250, 28_445, 3_150, 216], [42_000, 4_650, 2_730, 195], [48_000, 7_050, 5_100, 188],
    ]);
    expect(p5.enemies[0].fixedStats!.criRate).toBe(0.8);
    // 1〜3階は両遺跡で共通の作りのまま(会心率は図鑑どおり)
    expect(findRuinFloor("POWER", 3)!.enemies[0].fixedStats!.criRate).toBeUndefined();
    const g5 = findRuinFloor("GUARDIAN", 5)!;
    expect(g5.enemies.map((e) => [e.fixedStats!.hp, e.fixedStats!.atk, e.fixedStats!.def, e.fixedStats!.spd])).toEqual([
      [830_000, 9_000, 3_400, 198], [1_250_000, 1_900, 3_000, 210], [165_000, 1_700, 2_400, 204],
    ]);
    expect(ruinFloors("POWER").map((f) => f.stamina)).toEqual([8, 9, 10, 11, 12]);
    expect(p5.enemies.every((e) => e.element === "FIRE")).toBe(true);
    expect(g5.enemies.every((e) => e.element === "WATER")).toBe(true);
    // 魔人の反撃・魔獣の再行動と回復は持たせない
    expect(buildDungeonEnemyTeam(p5)[0].bossTraits?.counterAfterHits).toBeUndefined();
    expect(buildDungeonEnemyTeam(g5)[0].bossTraits?.extraTurnChance).toBeUndefined();
    expect(buildDungeonEnemyTeam(g5)[1].bossTraits?.allyThresholdHeal).toBeUndefined();
  });

  it("本体を倒せば取り巻きが生きていても勝ち", () => {
    for (const kind of ["POWER", "GUARDIAN"] as const) {
      const { engine, units } = ruinEngine(kind, 1);
      const boss = units[1];
      boss.currentHp = 0; boss.alive = false;
      expect(engine.getWinner()).toBe("PLAYER");
    }
  });

  it("力の遺跡: 号令塔が倒れると本体の攻撃力、妨害塔が倒れると速さが上がる(階ごとの値)", () => {
    for (const floor of [1, 3, 5]) {
      const { engine, units } = ruinEngine("POWER", floor);
      const [player, boss, herald, jammer] = units;
      herald.currentHp = 1; jammer.currentHp = 1;
      player.gauge = 100;
      engine.resolveTurn(player, { skillIndex: 0, targetId: herald.instanceId });
      player.gauge = 100;
      engine.resolveTurn(player, { skillIndex: 0, targetId: jammer.instanceId });
      expect(boss.flatStatBonus.atk).toBe(POWER_DEATH_BUFF[floor].atk);
      expect(boss.flatStatBonus.spd).toBe(POWER_DEATH_BUFF[floor].spd);
    }
  });

  it("力の遺跡4・5階: 号令塔は生きている間、指揮兵器へ攻撃力UP・速さUP・被ダメ軽減を張る(1〜3階は張らない)", () => {
    for (const floor of [4, 5]) {
      const { engine, units } = ruinEngine("POWER", floor);
      const [, boss, herald] = units;
      // 開幕すぐに張れる(3番目のCTが0で始まる)
      expect(herald.cooldowns[2]).toBe(0);
      herald.gauge = 100;
      engine.resolveTurn(herald);
      expect(boss.mitigateAmount).toBe(HERALD_GUARD_MITIGATE[floor as 4 | 5]);
      expect(boss.mitigateTurns).toBe(6);
      // 張り直しはクールタイム5。解除で剥がすと、次に張られるまで穴が開く
      expect(herald.cooldowns[2]).toBe(5);
      expect(boss.effects.some((e) => e.kind === "BUFF" && e.stat === "atk")).toBe(true);
      expect(boss.effects.some((e) => e.kind === "BUFF" && e.stat === "spd")).toBe(true);
      // 倒すと強くなる仕掛けは残す(値は小さくした)
      expect(POWER_DEATH_BUFF[floor].atk).toBeGreaterThan(0);
      expect(POWER_DEATH_BUFF[floor].spd).toBeGreaterThan(0);
    }
    const { units } = ruinEngine("POWER", 3);
    expect(units[2].def.skills.some((s) => s.effects.some((e) => e.kind === "MITIGATE"))).toBe(false);
  });

  it("力の遺跡4・5階: 護りは解除1個で攻撃力UP、2個で速さUP、3個で軽減が外れる(説明文どおり)", () => {
    for (const [count, left] of [[1, { atk: false, spd: true, mit: true }], [2, { atk: false, spd: false, mit: true }], [3, { atk: false, spd: false, mit: false }]] as const) {
      const { engine, units } = ruinEngine("POWER", 5);
      const [, boss, herald] = units;
      herald.gauge = 100;
      engine.resolveTurn(herald);
      expect(stripBuffs(boss, count)).toBe(count);
      expect(boss.effects.some((e) => e.kind === "BUFF" && e.stat === "atk"), `解除${count}個`).toBe(left.atk);
      expect(boss.effects.some((e) => e.kind === "BUFF" && e.stat === "spd"), `解除${count}個`).toBe(left.spd);
      expect(boss.mitigateTurns > 0, `解除${count}個`).toBe(left.mit);
    }
    expect(findRuinFloor("POWER", 5)!.enemies[1].skills![2].description).toContain("解除1個で攻撃力UP");
  });

  it("力の遺跡: 回復阻害は持たない(回復を選んだ編成だけへの税になったので取りやめた)", () => {
    for (const f of ruinFloors("POWER")) {
      expect(f.enemies.some((e) => e.skills?.some((sk) => sk.effects.some((ef) => ef.kind === "HEAL_BLOCK"))), `${f.floor}階`).toBe(false);
    }
  });

  it("力の遺跡4・5階の指揮兵器だけが、長期戦の決着(battleDamageRamp)を持つ", () => {
    const ramp = (kind: "POWER" | "GUARDIAN", floor: number) => buildDungeonEnemyTeam(findRuinFloor(kind, floor)!).some((d) => d.bossTraits?.battleDamageRamp);
    expect([1, 2, 3, 4, 5].map((f) => ramp("POWER", f))).toEqual([false, false, false, true, true]);
    expect([1, 2, 3, 4, 5].map((f) => ramp("GUARDIAN", f))).toEqual([false, false, false, false, false]);
    expect(buildDungeonEnemyTeam(findRuinFloor("POWER", 5)!)[0].bossTraits?.battleDamageRamp).toEqual(POWER_RUIN_DAMAGE_RAMP);
    // 遺跡のほかに、この特性を書いているデータは無い(塔・ダンジョン・アリーナの戦闘は1つも変わらない)
    const dataDir = new URL("../src/data/", import.meta.url);
    const offenders = readdirSync(dataDir, { recursive: true }).map(String).filter((file) => file.endsWith(".ts") && file !== "ruins.ts")
      .filter((file) => readFileSync(new URL(file, dataDir), "utf8").includes("battleDamageRamp"));
    expect(offenders).toEqual([]);
  });

  it("エンジン: 敵の特性の battleDamageRamp は、組み立て側が同じ damageRamp を渡したのと同じ経過になる。組み立て側の指定が優先する", () => {
    const floor = findRuinFloor("POWER", 5)!;
    const withTrait = buildDungeonEnemyTeam(floor);
    const withoutTrait = withTrait.map((d) => ({ ...d, bossTraits: d.bossTraits?.battleDamageRamp ? {} : d.bossTraits }));
    const runWith = (enemies: MonsterDefinition[], options: { damageRamp?: typeof POWER_RUIN_DAMAGE_RAMP }) => {
      let seed = 7;
      const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const engine = new BattleEngine([dummy(), dummy()], enemies, { rng, maxTurns: 300, ...options });
      const result = engine.run();
      return `${result.winner}:${result.turnsTaken}:${engine.getUnits().map((u) => u.currentHp).join(",")}`;
    };
    // 特性から拾った長期戦のダメージ増 = 組み立て側から同じ設定を渡した場合
    expect(runWith(withTrait, {})).toBe(runWith(withoutTrait, { damageRamp: POWER_RUIN_DAMAGE_RAMP }));
    // 特性が無ければ、長期戦のダメージ増は掛からない(従来どおり)
    const noRamp = new BattleEngine([dummy()], withoutTrait, { rng: () => 0.5 }) as unknown as { damageRamp?: unknown };
    expect(noRamp.damageRamp).toBeUndefined();
    // 組み立て側の指定(アリーナなど)があれば、そちらを使う
    const arenaLike = { afterTurns: 20, everyTurns: 10, factorPerStep: 1.25 };
    const both = new BattleEngine([dummy()], withTrait, { rng: () => 0.5, damageRamp: arenaLike }) as unknown as { damageRamp?: unknown };
    expect(both.damageRamp).toEqual(arenaLike);
  });

  it("守護の遺跡: 身代わり像が霊獣のダメージを階ごとの割合で肩代わりし、解除で剥がれる", () => {
    const { engine, units } = ruinEngine("GUARDIAN", 5);
    const [player, spirit, statue] = units;
    statue.gauge = 100;
    engine.resolveTurn(statue, { skillIndex: 1, targetId: spirit.instanceId });
    expect(spirit.protectTurns).toBeGreaterThan(0);
    expect(spirit.protectShare).toBe(GUARDIAN_PROTECT_SHARE[5]);
    const spiritBefore = spirit.currentHp;
    const statueBefore = statue.currentHp;
    player.gauge = 100;
    engine.resolveTurn(player, { skillIndex: 0, targetId: spirit.instanceId });
    const toSpirit = spiritBefore - spirit.currentHp;
    const toStatue = statueBefore - statue.currentHp;
    expect(toStatue).toBeGreaterThan(toSpirit);
    // 解除で剥がす
    const strip: Skill = { id: "t_strip", name: "解除", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0, effects: [{ kind: "STRIP" }] };
    player.def.skills[1] = strip;
    player.gauge = 100;
    engine.resolveTurn(player, { skillIndex: 1, targetId: spirit.instanceId });
    expect(spirit.protectTurns).toBe(0);
  });

  it("1階から順に開く。場所IDは ruins_power_1〜ruins_guardian_5", () => {
    const state = createInitialState();
    expect(isRuinFloorUnlocked(state, "POWER", 1)).toBe(true);
    expect(isRuinFloorUnlocked(state, "POWER", 2)).toBe(false);
    grantRuinReward(state, findRuinFloor("POWER", 1)!, rng(9));
    expect(isRuinFloorUnlocked(state, "POWER", 2)).toBe(true);
    expect(isRuinFloorUnlocked(state, "GUARDIAN", 2)).toBe(false);
    expect(ruinLocationId("GUARDIAN", 5)).toBe("ruins_guardian_5");
    expect(findRuinFloorByLocationId("ruins_power_3")?.floor).toBe(3);
    expect(findRuinFloorByLocationId("ruins_x_3")).toBeUndefined();
  });

  /*
   * ボスの姿は依頼主の描いた専用の絵。**戦い方は古代系を借りたまま**なので、
   * 種族ID(templateId)は変えず、絵を引く所だけが見た目の名前を見る。
   */
  it("ボスは全階で専用の絵を持ち、種族は古代系のまま", () => {
    const art = { POWER: "ruin_commander-FIRE", GUARDIAN: "ruin_spirit-WATER" } as const;
    for (const kind of ["POWER", "GUARDIAN"] as const) {
      for (const floor of ruinFloors(kind)) {
        const [boss, ...others] = buildDungeonEnemyTeam(floor);
        expect(`${appearanceTemplateOf(boss)}-${boss.element}`).toBe(art[kind]);
        expect(boss.templateId).toBe(kind === "POWER" ? "ancient_demon" : "ancient_beast");
        expect(existsSync(`src/web/assets/monsters/${art[kind]}.webp`)).toBe(true);
        // 取り巻きは図鑑の絵のまま
        for (const other of others) expect(other.artTemplateId).toBeUndefined();
      }
    }
  });

  it("戦闘の状態に載る種族IDは見た目の名前(画面がこれで絵を組み直す)", () => {
    const { engine } = ruinEngine("POWER", 5);
    const boss = engine.snapshotUnits().find((u) => u.name.startsWith("指揮兵器"));
    expect(boss?.templateId).toBe("ruin_commander");
  });
});

describe("遺跡の報酬", () => {
  it("アクセ・進化核・カケラは毎回確定。範囲と★の幅は階ごと", () => {
    const r = rng(10);
    for (const kind of ["POWER", "GUARDIAN"] as const) for (const f of ruinFloors(kind)) {
      const stars = new Set<number>();
      for (let i = 0; i < 3000; i += 1) {
        const d = rollRuinDrop(f, r);
        expect(d.accessory).toBeTruthy();
        expect(d.cores).toBeGreaterThanOrEqual(f.cores[0]);
        expect(d.cores).toBeLessThanOrEqual(f.cores[1]);
        expect(d.shards).toBeGreaterThanOrEqual(f.shards[0]);
        expect(d.shards).toBeLessThanOrEqual(f.shards[1]);
        stars.add(d.accessory.star);
        expect(kind === "POWER" ? ["ATTACK", "DISRUPT"] : ["DURABILITY", "SUPPORT"]).toContain(d.accessory.family);
      }
      if (f.floor === 1) expect(stars.has(6)).toBe(false);
      if (f.floor === 5) expect(stars.has(4)).toBe(false);
    }
  });

  it("レア度・★・系統・副ドロップはそれぞれ指定の割合で、互いに独立", () => {
    const f = findRuinFloor("POWER", 5)!;
    const r = rng(11);
    const n = 60_000;
    let epic = 0, six = 0, attack = 0, scroll = 0, pig = 0, skillPig = 0, scrollAndPig = 0;
    for (let i = 0; i < n; i += 1) {
      const d = rollRuinDrop(f, r);
      if (d.accessory.rarity === "EPIC") epic += 1;
      if (d.accessory.star === 6) six += 1;
      if (d.accessory.family === "ATTACK") attack += 1;
      if (d.summonScroll) scroll += 1;
      if (d.reincarnationPig) pig += 1;
      if (d.skillPig) skillPig += 1;
      if (d.summonScroll && d.reincarnationPig) scrollAndPig += 1;
    }
    expect(epic / n).toBeCloseTo(0.15, 1);
    expect(six / n).toBeCloseTo(0.35, 1);
    expect(attack / n).toBeCloseTo(0.5, 1);
    expect(scroll / n).toBeCloseTo(0.10, 1);
    expect(pig / n).toBeCloseTo(0.05, 1);
    expect(Math.abs(skillPig / n - 0.01)).toBeLessThan(0.004);
    // 独立: 両方出る割合 ≒ 片方ずつの積
    expect(Math.abs(scrollAndPig / n - (scroll / n) * (pig / n))).toBeLessThan(0.002);
  });

  it("配ると持ち物・素材が増える(ゴールドと経験値は配らない)", () => {
    const state = createInitialState();
    const gold = state.gold;
    const reward = grantRuinReward(state, findRuinFloor("GUARDIAN", 3)!, rng(12));
    expect(state.accessories).toHaveLength(1);
    expect(state.evolutionCores).toBe(reward.evolutionCores);
    expect(state.ancientShards).toBe(reward.ancientShards);
    expect(state.gold).toBe(gold);
    expect(reward.firstClear).toBe(true);
    expect(grantRuinReward(state, findRuinFloor("GUARDIAN", 3)!, rng(13)).firstClear).toBe(false);
  });
});

/* ====================================================================== 製作・限界能力付与 */

describe("カケラ製作", () => {
  it("150個で1つ。余りは残り、150未満では作れない", () => {
    const state = createInitialState();
    state.ancientShards = 160;
    const made = craftAccessory(state, "SUPPORT", rng(14));
    expect(made.ok).toBe(true);
    expect(state.ancientShards).toBe(10);
    if (made.ok) { expect(made.item.star).toBe(6); expect(made.item.family).toBe("SUPPORT"); }
    expect(craftAccessory(state, "SUPPORT", rng(15)).ok).toBe(false);
    expect(state.ancientShards).toBe(10);
    expect(ANCIENT_CRAFT_COST).toBe(150);
  });

  it("アクセのレア度は 50/35/15", () => {
    const state = createInitialState();
    const r = rng(16);
    const counts = { HERO: 0, LEGEND: 0, EPIC: 0 };
    for (let i = 0; i < 20_000; i += 1) {
      state.ancientShards = 150;
      const made = craftAccessory(state, "ATTACK", r);
      if (made.ok) counts[made.item.rarity] += 1;
    }
    expect(counts.HERO / 20_000).toBeCloseTo(0.5, 1);
    expect(counts.LEGEND / 20_000).toBeCloseTo(0.35, 1);
    expect(counts.EPIC / 20_000).toBeCloseTo(0.15, 1);
  });

  it("装備は★6・選んだシリーズで、初期サブ数は12階と同じ出方(12階より良くならない)", () => {
    const state = createInitialState();
    const r = rng(17);
    const subs = [0, 0, 0, 0, 0];
    for (let i = 0; i < 20_000; i += 1) {
      state.ancientShards = 150;
      const made = craftEquipment(state, SET_TYPES[i % SET_TYPES.length], r);
      if (!made.ok) continue;
      subs[made.item.initialSubStatCount ?? made.item.subStats.length] += 1;
      expect(made.item.star).toBe(6);
      expect(made.item.set).toBe(SET_TYPES[i % SET_TYPES.length]);
    }
    const total = subs.reduce((a, b) => a + b, 0);
    expect(total).toBe(20_000);
    expect(subs[0]).toBe(0);
    expect(subs[1] / total).toBeCloseTo(0.03, 1);
    expect(subs[2] / total).toBeCloseTo(0.25, 1);
    expect(subs[3] / total).toBeCloseTo(0.40, 1);
    expect(subs[4] / total).toBeCloseTo(0.32, 1);
  });
});

describe("進化核・限界能力付与", () => {
  function sixStar(): PlayerState {
    const state = createInitialState();
    state.monsters = [createMonsterInstance("knight_FIRE", 6, 60), createMonsterInstance("wolf_WATER", 5, 50)];
    return state;
  }

  it("進化核100個で解放。★6のみ。足りなければ解放しない", () => {
    const state = sixStar();
    state.evolutionCores = 99;
    expect(unlockLimitBreak(state, state.monsters[0].id).ok).toBe(false);
    state.evolutionCores = 250;
    expect(unlockLimitBreak(state, state.monsters[1].id).ok).toBe(false);
    expect(unlockLimitBreak(state, state.monsters[0].id).ok).toBe(true);
    expect(state.evolutionCores).toBe(150);
    expect(unlockLimitBreak(state, state.monsters[0].id).ok).toBe(false);
  });

  it("+側と−側は同じ合計、+側は50まで。+は通常1pt、−は2倍減る", () => {
    const state = sixStar();
    state.evolutionCores = 100;
    const m = state.monsters[0];
    unlockLimitBreak(state, m.id);
    expect(setLimitPoints(state, m.id, { hp: -9, atk: 10, def: 0, spd: 0 }).ok).toBe(false);
    expect(setLimitPoints(state, m.id, { hp: -51, atk: 51, def: 0, spd: 0 }).ok).toBe(false);
    const dex = findMonsterById(m.dexId)!;
    const before = toBattleDefinition(m, dex).stats;
    expect(setLimitPoints(state, m.id, { hp: -10, atk: 10, def: 0, spd: 0 }).ok).toBe(true);
    const after = toBattleDefinition(m, dex).stats;
    expect(after.atk - before.atk).toBe(10 * 2);
    expect(before.hp - after.hp).toBe(10 * 20 * 2);
    expect(setLimitPoints(state, m.id, { hp: 0, atk: 0, def: -50, spd: 50 }).ok).toBe(true);
    const spd = toBattleDefinition(m, dex).stats;
    expect(spd.spd - before.spd).toBe(5);
    expect(before.def - spd.def).toBe(50 * 5 * 2);
  });
});

/* ====================================================================== 周回 */

describe("周回", () => {
  it("遺跡は場所IDごとに実戦記録を分け、記録が無い時の基準は150秒(装備12階)を流用しない", () => {
    expect(manualClearKey("RUINS", "ruins_power_5")).toBe("ruins_power_5");
    expect(FALLBACK_REFERENCE_SECONDS.RUINS).not.toBe(FALLBACK_REFERENCE_SECONDS.EQUIP_DUNGEON);
    const records = { ruins_power_5: [12, 13, 11] };
    expect(referenceRunTime(records, "RUINS", "ruins_power_5")).toMatchObject({ seconds: 12, fromManual: true });
    expect(referenceRunTime(records, "RUINS", "ruins_guardian_5").fromManual).toBe(false);
    const job = createBackgroundFarmJob({ kind: "RUINS", targetId: "ruins_power_5", targetName: "力の遺跡 5階", requestedRuns: 3, partyIds: ["a"], referenceRunSeconds: 12 });
    expect(job.kind).toBe("RUINS");
  });

  it("周回の集計にアクセ・進化核・カケラが積まれる", () => {
    const state = createInitialState();
    const result = emptyResult();
    for (let i = 0; i < 3; i += 1) mergeReward(result, grantRuinReward(state, findRuinFloor("POWER", 2)!, rng(20 + i)), 0);
    expect(result.accessoryDropCount).toBe(3);
    expect(result.earnedAccessoryIds).toHaveLength(3);
    expect(result.evolutionCores).toBe(state.evolutionCores);
    expect(result.ancientShards).toBe(state.ancientShards);
  });
});
