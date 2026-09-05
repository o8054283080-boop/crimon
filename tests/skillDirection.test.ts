import { describe, expect, it } from "vitest";
import { MonsterTemplate } from "../src/core/monster.js";
import { Skill, SkillEffect, TargetType } from "../src/core/skill.js";
import { ALL_MONSTER_TEMPLATES } from "../src/data/monsters.js";

/**
 * スキルの「効果の向き」が対象と噛み合っているかを機械的に検査する。
 *
 * 効果の解決はスキルの対象に対して走るので、敵を狙う技に回復やシールドを
 * 素直に置くと**敵を回復してしまう**。実際に光スライムのセイントスラッシュが
 * 敵全体を12%回復しており、説明文とは逆のことをしていた。
 * 目で見て気付ける類のミスではないので、ここで全スキルを通す。
 */

type Direction = "ENEMY" | "ALLY" | "SELF";

function directionOf(target: TargetType): Direction {
  if (target === "SINGLE_ENEMY" || target === "ALL_ENEMIES") return "ENEMY";
  if (target === "SELF") return "SELF";
  return "ALLY";
}

/** 味方に向けてこそ意味がある効果(敵を狙う技に置くと敵を利する) */
const HELPFUL: SkillEffect["kind"][] = ["HEAL", "SHIELD", "IMMUNITY", "REGEN", "CLEANSE", "BUFF", "MITIGATE", "PROTECT", "COOLDOWN_REDUCE"];
/** 敵に向けてこそ意味がある効果(味方を狙う技に置くと味方を害する) */
const HARMFUL: SkillEffect["kind"][] = ["DAMAGE", "DEBUFF", "STUN", "BURN", "POISON", "BLIND", "COOLDOWN_EXTEND", "STRIP", "STEAL_BUFF", "HEAL_BLOCK"];

/** 効果の向きが対象と合っていない場合に、その理由を返す */
function misdirection(effect: SkillEffect, direction: Direction): string | undefined {
  /*
   * **`applyTo` が書いてある時点で、向き先は宣言されている。**
   * スキルの対象と食い違っていても、それは食い違いではなく指定。
   * 効果の種類ごとに書き写していた頃は、新しく applyTo を持てるようにした
   * 種類だけが検査から漏れた(GAUGEとCLEANSEで実際に起きた)。
   */
  if ("applyTo" in effect && effect.applyTo !== undefined) return undefined;
  // ライフスティール・反撃態勢・協力攻撃は、常に術者そのものに向く
  if (effect.kind === "LIFESTEAL" || effect.kind === "COUNTER_STANCE" || effect.kind === "COOP_ATTACK") return undefined;

  if (effect.kind === "GAUGE") {
    // 吸収は相手から奪う動作なので敵向き、素の増加は味方向き
    if (effect.drain && effect.amount <= 0) return "ゲージ吸収量が0以下で発動しない";
    if (effect.drain && direction !== "ENEMY") return "ゲージ吸収を味方に向けている";
    if (!effect.drain && effect.amount > 0 && direction === "ENEMY") return "敵の行動ゲージを進めてしまう";
    return undefined;
  }

  if (HELPFUL.includes(effect.kind) && direction === "ENEMY") return `${effect.kind} が敵を利する`;
  if (HARMFUL.includes(effect.kind) && direction === "ALLY") return `${effect.kind} が味方を害する`;
  return undefined;
}

function skillsOf(template: MonsterTemplate): Skill[] {
  return [
    template.skill1,
    ...template.skill2Variants,
    ...template.skill3Variants,
    ...(template.lightSkill3 ? [template.lightSkill3] : []),
    ...(template.darkSkill3 ? [template.darkSkill3] : []),
  ];
}

describe("スキルの効果の向き", () => {
  // 検査そのものが機能していなければ、上の検査は「常に合格」でしかない。
  // 実際に起きていた3件を、そのままの形で拾えることを確かめる
  it("実際に起きた食い違いを拾える", () => {
    expect(misdirection({ kind: "HEAL", healRate: 0.12 }, "ENEMY")).toBeTruthy();
    expect(misdirection({ kind: "GAUGE", amount: 0.3 }, "ENEMY")).toBeTruthy();
    expect(misdirection({ kind: "GAUGE", amount: 0.25, drain: true }, "ALLY")).toBeTruthy();
    expect(misdirection({ kind: "GAUGE", amount: -0.15, drain: true }, "ENEMY")).toBeTruthy();
  });

  it("正しい向きは通す", () => {
    expect(misdirection({ kind: "HEAL", healRate: 0.12, applyTo: "SELF" }, "ENEMY")).toBeUndefined();
    expect(misdirection({ kind: "GAUGE", amount: 0.3, drain: true }, "ENEMY")).toBeUndefined();
    expect(misdirection({ kind: "LIFESTEAL", healRate: 0.2 }, "ENEMY")).toBeUndefined();
    expect(misdirection({ kind: "BUFF", stat: "atk", amount: 0.3, durationTurns: 2, applyTo: "ALLIES" }, "ENEMY")).toBeUndefined();
  });

  it("敵を狙う技が敵を回復・強化していない / 味方を狙う技が味方を害していない", () => {
    const problems: string[] = [];
    for (const template of ALL_MONSTER_TEMPLATES) {
      for (const skill of skillsOf(template)) {
        const direction = directionOf(skill.target);
        for (const effect of skill.effects) {
          const reason = misdirection(effect, direction);
          if (reason) problems.push(`${template.baseName} / ${skill.name}(${skill.target}): ${reason}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
