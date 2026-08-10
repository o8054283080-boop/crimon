import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { calcDamage } from "../src/battle/damage.js";
import { createBattleUnit } from "../src/battle/unit.js";
import {
  Equipment,
  applyEquipmentToStats,
  computeSetCombatModifiers,
  generateEquipment,
  getActiveSetBonuses,
} from "../src/core/equipment.js";
import { Stats } from "../src/core/stats.js";
import { findMonster } from "../src/data/monsters.js";

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

const BASE_STATS: Stats = { hp: 1000, atk: 100, def: 50, spd: 100, criRate: 0.1, criDmg: 1.5, resistance: 0.1, accuracy: 0.1 };

function makeSetPieces(set: Equipment["set"], count: number, rng: () => number): Equipment[] {
  const slots: Equipment["slot"][] = [1, 2, 3, 4, 5, 6];
  return Array.from({ length: count }, (_, i) => generateEquipment({ slot: slots[i], star: 3, subStatCount: 0, set, rng }));
}

describe("装備セット (SetType) の基本", () => {
  it("生成された装備には必ずシリーズ(set)が設定される", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      const eq = generateEquipment({ slot: 1, star: 1, subStatCount: 0, rng });
      expect(eq.set).toBeTruthy();
    }
  });

  it("1個だけではセット効果は発動しない", () => {
    const rng = mulberry32(2);
    const pieces = makeSetPieces("CRIT", 1, rng);
    expect(getActiveSetBonuses(pieces)).toHaveLength(0);
  });

  it("2個そろうと2セット効果が発動する(4セットは未発動)", () => {
    const rng = mulberry32(3);
    const pieces = makeSetPieces("CRIT", 2, rng);
    const active = getActiveSetBonuses(pieces);
    expect(active).toHaveLength(1);
    expect(active[0].twoActive).toBe(true);
    expect(active[0].fourActive).toBe(false);
  });

  it("4個そろうと2セット・4セット両方の効果が発動する", () => {
    const rng = mulberry32(4);
    const pieces = makeSetPieces("CRIT", 4, rng);
    const active = getActiveSetBonuses(pieces);
    expect(active[0].twoActive).toBe(true);
    expect(active[0].fourActive).toBe(true);
  });
});

describe("セット効果のステータス反映 (applyEquipmentToStats)", () => {
  it("会心シリーズ2個(スロット1・2、サブなし)でクリ率がちょうど+15%になる", () => {
    const rng = mulberry32(5);
    // スロット1(ATK_FLAT固定)・スロット2(SPD/ATK%/DEF%/HP%)はどちらもクリ率を直接ロールしないため、
    // 上昇分はセット効果の+15%のみになるはず
    const pieces = makeSetPieces("CRIT", 2, rng);
    const result = applyEquipmentToStats(BASE_STATS, pieces);
    expect(result.criRate).toBeCloseTo(BASE_STATS.criRate + 0.15, 5);
  });

  it("速攻シリーズ2個でSPDが基礎値より上昇する(4個でさらに上昇する)", () => {
    const rng2 = mulberry32(6);
    const two = applyEquipmentToStats(BASE_STATS, makeSetPieces("SWIFT", 2, rng2));
    const rng4 = mulberry32(7);
    const four = applyEquipmentToStats(BASE_STATS, makeSetPieces("SWIFT", 4, rng4));
    expect(two.spd).toBeGreaterThan(BASE_STATS.spd);
    expect(four.spd).toBeGreaterThan(two.spd);
  });

  it("セット効果のない組み合わせ(各シリーズ1個ずつ)では基礎値から変化しない", () => {
    const rng = mulberry32(8);
    const pieces: Equipment[] = [
      generateEquipment({ slot: 1, star: 1, subStatCount: 0, set: "CRIT", rng }),
      generateEquipment({ slot: 3, star: 1, subStatCount: 0, set: "POWER", rng }),
    ];
    // ATK_FLAT/DEF_FLATのロールは残るが、セット由来のクリ率/防御%上昇は発生しない
    const result = applyEquipmentToStats(BASE_STATS, pieces);
    expect(result.criRate).toBe(BASE_STATS.criRate);
  });
});

describe("セット効果の戦闘専用modifiers (computeSetCombatModifiers)", () => {
  it("筋力シリーズ4個で与えるダメージ倍率が1.2倍になる", () => {
    const rng = mulberry32(9);
    const mods = computeSetCombatModifiers(makeSetPieces("POWER", 4, rng));
    expect(mods.damageDealtMultiplier).toBeCloseTo(1.2, 5);
  });

  it("守護シリーズ4個で受けるダメージ倍率が0.8倍になる", () => {
    const rng = mulberry32(10);
    const mods = computeSetCombatModifiers(makeSetPieces("GUARD", 4, rng));
    expect(mods.damageTakenMultiplier).toBeCloseTo(0.8, 5);
  });

  it("体力シリーズ4個で毎ターンHP5%回復が付く", () => {
    const rng = mulberry32(11);
    const mods = computeSetCombatModifiers(makeSetPieces("VITALITY", 4, rng));
    expect(mods.turnHealPercent).toBeCloseTo(0.05, 5);
  });

  it("的中シリーズ4個で状態異常抵抗率25%無視が付く", () => {
    const rng = mulberry32(12);
    const mods = computeSetCombatModifiers(makeSetPieces("ACCURACY_SET", 4, rng));
    expect(mods.ignoreResistancePercent).toBeCloseTo(0.25, 5);
  });

  it("抵抗シリーズ4個で状態異常抵抗時HP15%回復が付く", () => {
    const rng = mulberry32(13);
    const mods = computeSetCombatModifiers(makeSetPieces("RESIST_SET", 4, rng));
    expect(mods.healOnResistPercent).toBeCloseTo(0.15, 5);
  });

  it("2個だけでは戦闘専用modifiersは発動しない(セット未達成分)", () => {
    const rng = mulberry32(14);
    const mods = computeSetCombatModifiers(makeSetPieces("POWER", 2, rng));
    expect(mods.damageDealtMultiplier).toBe(1);
  });
});

describe("セット効果の戦闘反映(ダメージ計算)", () => {
  it("与ダメ倍率・被ダメ倍率がcalcDamageに反映される", () => {
    const attackerDef = findMonster("slime", "FIRE")!;
    const defenderDef = findMonster("slime", "FIRE")!; // 同属性同士で相性の影響を排除

    const boosted = createBattleUnit({ ...attackerDef, combatMods: { damageDealtMultiplier: 1.2, damageTakenMultiplier: 1, turnHealPercent: 0, ignoreResistancePercent: 0, healOnResistPercent: 0 } }, "PLAYER", "P1");
    const plain = createBattleUnit(attackerDef, "PLAYER", "P2");
    const target = createBattleUnit(defenderDef, "ENEMY", "E1");

    const effect = { kind: "DAMAGE" as const, multiplier: 1.0 };
    const noCrit = () => 0.999;
    const boostedDamage = calcDamage(boosted, target, effect, noCrit).damage;
    const plainDamage = calcDamage(plain, target, effect, noCrit).damage;

    expect(boostedDamage).toBeGreaterThan(plainDamage);
  });
});

describe("セット効果の戦闘反映(毎ターン回復・状態異常抵抗無視)", () => {
  it("体力シリーズの毎ターン回復が戦闘ログに現れる", () => {
    const def = findMonster("golem", "FIRE")!;
    const healerDef = { ...def, combatMods: { damageDealtMultiplier: 1, damageTakenMultiplier: 1, turnHealPercent: 0.05, ignoreResistancePercent: 0, healOnResistPercent: 0 } };
    const enemyDef = findMonster("fairy", "WATER")!;

    const rng = mulberry32(20);
    const engine = new BattleEngine([healerDef], [enemyDef], { rng, maxTurns: 300 });
    const result = engine.run();

    expect(result.log.some((line) => line.includes("体力シリーズの効果でHPが"))).toBe(true);
  });
});
