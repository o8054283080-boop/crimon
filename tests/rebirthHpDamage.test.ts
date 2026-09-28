/**
 * 闇フェニックス S3「輪廻転生」Lv5 の与ダメージ。
 *
 * 依頼主の指定(2026-09-28):
 *   ・敵の現在HP割合に応じた与ダメージ上昇 … 最大 +100%
 *   ・全攻撃に自身最大HPの 5% をダメージとして加算(S1/S2 など全攻撃)
 *
 * 計算の順は次のとおりで、**加算も乗算も1回ずつ**であることを確かめる:
 *
 *   基礎 = ATK × 倍率 + 最大HP × (技のHP比例 + 輪廻の5%)
 *   最終 = 基礎 × (1 + 1.0 × 敵の現在HP割合 + 他の最終上乗せ)
 */
import { describe, expect, it } from "vitest";
import { calcDamage } from "../src/battle/damage.js";
import { createBattleUnit, getEffectiveStat, type BattleUnit } from "../src/battle/unit.js";
import { computeLeveledSkill, type Skill } from "../src/core/skill.js";
import { findMonster } from "../src/data/monsters.js";
import type { Element } from "../src/core/element.js";

function def(name: string, element: Element, level: number) {
  const original = structuredClone(findMonster(name, element)!);
  original.skills = original.skills.map((s) => computeLeveledSkill(s, level)) as [Skill, Skill, Skill];
  // 防御0・クリ0にして、ダメージ式の形だけを見る
  original.stats = { ...original.stats, hp: 100_000, atk: 100, def: 0, accuracy: 1, resistance: 0, criRate: 0, criDmg: 1.5 };
  return original;
}

/** 闇フェニックス(輪廻転生 Lv n)と、防御0の的 */
function pair(level: number) {
  const phoenix = createBattleUnit(def("phoenix", "DARK", level), "PLAYER", "p");
  const target = createBattleUnit(def("slime", "DARK", 1), "ENEMY", "t");
  return { phoenix, target };
}

const NO_CRIT = () => 0.99;
/** 防御の最低値(1)ぶんの軽減。`1000 / (1000 + 1.2 × DEF)` */
const guard = (target: BattleUnit) => 1000 / (1000 + 1.2 * getEffectiveStat(target, "def"));

describe("輪廻転生 Lv5 の最大HP5%加算と、敵HP割合による最大+100%", () => {
  it("1段に1つずつ伸び、Lv5は damage 1.0 / hpDamage 0.05 / 回復10% / 復活CT8", () => {
    const skill = computeLeveledSkill(findMonster("phoenix", "DARK")!.skills[2], 5);
    expect(skill.id).toBe("phoenix_s3_dark");
    const { phoenix } = pair(5);
    const passive = phoenix.def.skills[2].passive?.levels[4];
    expect(passive).toEqual({ kind: "REBIRTH", heal: 0.1, damage: 1.0, cooldown: 8, hpDamage: 0.05 });
    // どの段も「何も伸びない段」が無い(前の段から少なくとも1つ動く)
    const levels = phoenix.def.skills[2].passive!.levels as readonly Record<string, number | string | undefined>[];
    for (let i = 1; i < 5; i += 1) {
      const moved = ["heal", "damage", "cooldown", "hpDamage"].filter((k) => levels[i][k] !== levels[i - 1][k]);
      expect(moved.length, `Lv${i + 1}`).toBeGreaterThan(0);
    }
  });

  it("HP比例を持たない攻撃(S1など)にも、最大HPの5%が加わる", () => {
    const { phoenix, target } = pair(5);
    const hp = phoenix.maxHp;
    // 敵は満タン: 基礎 = ATK×1 + 最大HP×0.05、最終 = 基礎 × (1 + 1.0×1)
    expect(calcDamage(phoenix, target, { kind: "DAMAGE", multiplier: 1 }, NO_CRIT).damage).toBe(Math.round((100 + hp * 0.05) * 2 * guard(target)));
  });

  it("技のHP比例と5%は足し算。敵HP割合の上乗せは最後に1回だけ掛かる", () => {
    const { phoenix, target } = pair(5);
    const base = (100 * 0.55 + phoenix.maxHp * (0.14 + 0.05)) * guard(target);
    const wing = { kind: "DAMAGE", multiplier: 0.55, hpCoefficient: 0.14 } as const;
    // 敵満タン: 基礎 × 2(+100%)。二重に掛かっていれば ×4、HPが二重に足されていれば基礎が大きくなる
    expect(calcDamage(phoenix, target, wing, NO_CRIT).damage).toBe(Math.round(base * 2));
    // 敵HP50%: 上乗せは +50%
    target.currentHp = target.maxHp / 2;
    expect(Math.abs(calcDamage(phoenix, target, wing, NO_CRIT).damage - base * 1.5)).toBeLessThanOrEqual(1);
    // 敵HPがほぼ0: 上乗せはほぼ0で、基礎だけが残る
    target.currentHp = 1;
    expect(Math.abs(calcDamage(phoenix, target, wing, NO_CRIT).damage - base)).toBeLessThanOrEqual(1);
  });

  it("上乗せは Lv1・2 +60% / Lv3 +80% / Lv4 +100%。Lv4以下には5%の加算が無い", () => {
    for (const [level, bonus] of [[1, 0.6], [2, 0.6], [3, 0.8], [4, 1.0]] as const) {
      const { phoenix, target } = pair(level);
      // 基礎 = ATK×1 = 100、最終 = 100 × (1 + 上乗せ)
      expect(calcDamage(phoenix, target, { kind: "DAMAGE", multiplier: 1 }, NO_CRIT).damage, `Lv${level}`)
        .toBe(Math.round(100 * (1 + bonus) * guard(target)));
    }
  });

  it("輪廻転生を持たないモンスターには何も足さない", () => {
    const plain = createBattleUnit(def("phoenix", "FIRE", 5), "PLAYER", "f");
    const { target } = pair(5);
    expect(calcDamage(plain, target, { kind: "DAMAGE", multiplier: 1 }, NO_CRIT).damage).toBe(100);
  });
});
