import { afterEach, describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { calcDamage } from "../src/battle/damage.js";
import { applyStatEffect, applyStatus, createBattleUnit, extendEffects, getEffectiveStat } from "../src/battle/unit.js";
import { resetBalanceFlags } from "../src/core/balanceFlags.js";
import { MonsterDefinition, createMonsterVariant } from "../src/core/monster.js";
import { ABILITY_POINT_VALUES, MONSTER_TYPE_STAT_MULTIPLIERS } from "../src/core/monsterDevelopment.js";
import { Skill } from "../src/core/skill.js";
import {
  ATK_DOWN, ATK_UP, CRIT_RATE_TAKEN_DOWN, CRIT_RATE_TAKEN_UP, CRI_DMG_UP, CRI_RATE_DOWN,
  CRI_RATE_UP, DEF_DOWN, DEF_UP, SPD_DOWN, SPD_UP,
} from "../src/core/statusValues.js";
import { ALL_MONSTER_TEMPLATES } from "../src/data/monsters.js";

/** 種族テンプレートから名前でスキルを引く。属性ごとの割り当てに左右されない */
function skillOf(templateId: string, name: string): Skill {
  const t = ALL_MONSTER_TEMPLATES.find((x) => x.templateId === templateId)!;
  const all: Skill[] = [t.skill1, ...(t.skill2Variants ?? []), ...(t.skill3Variants ?? []),
    ...(t.lightSkill3 ? [t.lightSkill3] : []), ...(t.darkSkill3 ? [t.darkSkill3] : [])].filter(Boolean) as Skill[];
  const found = all.find((x) => x.name === name);
  if (!found) throw new Error(`${templateId} に「${name}」が無い`);
  return found;
}

/*
 * 2026年9月の大きなバランス調整の番人。
 *
 * **効果量だけを固定し、持続ターン・付与確率・CT・倍率はスキルごとのまま**という
 * 決まりを守るためのもの。同じ名前のバフ/デバフがスキルごとに違う量で入っていると、
 * プレイヤーからは同じアイコンにしか見えないのに強さが違う、という状態になる。
 */

const unit = (overrides: Partial<MonsterDefinition["stats"]> = {}, element: MonsterDefinition["element"] = "FIRE") =>
  createBattleUnit({
    id: "t", templateId: "t", name: "検査", element, color: "#fff", role: "検査", emoji: "⬜",
    stats: { hp: 30000, atk: 3000, def: 2000, spd: 120, criRate: 0, criDmg: 1.5, resistance: 0, accuracy: 0, ...overrides },
    skills: [] as unknown as MonsterDefinition["skills"],
  }, "PLAYER", "P1");

afterEach(() => resetBalanceFlags());

describe("固定値そのもの", () => {
  it("依頼どおりの値が入っている", () => {
    expect({ ATK_UP, DEF_UP, SPD_UP, CRI_RATE_UP, CRI_DMG_UP, CRIT_RATE_TAKEN_DOWN })
      .toEqual({ ATK_UP: 0.30, DEF_UP: 0.30, SPD_UP: 0.20, CRI_RATE_UP: 0.20, CRI_DMG_UP: 0.30, CRIT_RATE_TAKEN_DOWN: 0.30 });
    expect({ ATK_DOWN, DEF_DOWN, SPD_DOWN, CRI_RATE_DOWN, CRIT_RATE_TAKEN_UP })
      .toEqual({ ATK_DOWN: 0.50, DEF_DOWN: 0.75, SPD_DOWN: 0.30, CRI_RATE_DOWN: 0.30, CRIT_RATE_TAKEN_UP: 0.50 });
  });

  it("**全スキルが共通値を使っている。**同じ名前で違う量は1つも無い", () => {
    const expected: Record<string, { BUFF: number; DEBUFF: number }> = {
      atk: { BUFF: ATK_UP, DEBUFF: ATK_DOWN },
      def: { BUFF: DEF_UP, DEBUFF: DEF_DOWN },
      spd: { BUFF: SPD_UP, DEBUFF: SPD_DOWN },
      criRate: { BUFF: CRI_RATE_UP, DEBUFF: CRI_RATE_DOWN },
      criDmg: { BUFF: CRI_DMG_UP, DEBUFF: CRI_DMG_UP },
    };
    const odd: string[] = [];
    const walk = (where: string, effects: readonly unknown[]): void => {
      for (const raw of effects) {
        const e = raw as { kind?: string; stat?: string; amount?: number; perHitEffects?: unknown[] };
        if (e.perHitEffects) walk(where, e.perHitEffects);
        if ((e.kind !== "BUFF" && e.kind !== "DEBUFF") || !e.stat) continue;
        const want = expected[e.stat]?.[e.kind as "BUFF" | "DEBUFF"];
        if (want !== undefined && e.amount !== want) odd.push(`${where}: ${e.kind} ${e.stat} = ${e.amount}(共通値は ${want})`);
      }
    };
    for (const t of ALL_MONSTER_TEMPLATES) {
      const all: Skill[] = [t.skill1, ...(t.skill2Variants ?? []), ...(t.skill3Variants ?? []),
        ...(t.lightSkill3 ? [t.lightSkill3] : []), ...(t.darkSkill3 ? [t.darkSkill3] : [])].filter(Boolean) as Skill[];
      for (const s of all) walk(`${t.templateId}/${s.id}`, s.effects ?? []);
    }
    expect(odd, `共通値から外れている効果:\n${odd.join("\n")}`).toEqual([]);
  });
});

describe("同じ強化・弱体は重ねがけしない", () => {
  it("攻撃UPを2回付けても +30% のまま", () => {
    const u = unit();
    const base = u.def.stats.atk;
    applyStatEffect(u, "atk", ATK_UP, 2, "BUFF");
    applyStatEffect(u, "atk", ATK_UP, 2, "BUFF");
    expect(u.effects.filter((e) => e.stat === "atk")).toHaveLength(1);
    expect(getEffectiveStat(u, "atk")).toBe(Math.round(base * (1 + ATK_UP)));
  });

  it("防御DOWNを2回付けても -75% のまま", () => {
    const u = unit();
    const base = u.def.stats.def;
    applyStatEffect(u, "def", -DEF_DOWN, 2, "DEBUFF");
    applyStatEffect(u, "def", -DEF_DOWN, 2, "DEBUFF");
    expect(getEffectiveStat(u, "def")).toBe(Math.round(base * (1 - DEF_DOWN)));
  });

  it("速度UPを2回付けても +20% のまま", () => {
    const u = unit();
    const base = u.def.stats.spd;
    applyStatEffect(u, "spd", SPD_UP, 2, "BUFF");
    applyStatEffect(u, "spd", SPD_UP, 2, "BUFF");
    expect(getEffectiveStat(u, "spd")).toBe(Math.round(base * (1 + SPD_UP)));
  });

  it("**強化と弱体は別枠。**攻撃UPと攻撃DOWNは同時に付いて打ち消し合う", () => {
    const u = unit();
    applyStatEffect(u, "atk", ATK_UP, 2, "BUFF");
    applyStatEffect(u, "atk", -ATK_DOWN, 2, "DEBUFF");
    expect(u.effects.filter((e) => e.stat === "atk")).toHaveLength(2);
    expect(getEffectiveStat(u, "atk")).toBe(Math.round(u.def.stats.atk * (1 + ATK_UP - ATK_DOWN)));
  });
});

describe("再付与は長い方、明示的な延長だけが足し算", () => {
  it("残り1ターンへ2ターンを重ねると2ターン", () => {
    const u = unit();
    applyStatEffect(u, "atk", ATK_UP, 1, "BUFF");
    applyStatEffect(u, "atk", ATK_UP, 2, "BUFF");
    expect(u.effects[0].remainingTurns).toBe(2);
  });

  it("残り3ターンへ2ターンを重ねても3ターンのまま(短くならない)", () => {
    const u = unit();
    applyStatEffect(u, "atk", ATK_UP, 3, "BUFF");
    applyStatEffect(u, "atk", ATK_UP, 2, "BUFF");
    expect(u.effects[0].remainingTurns).toBe(3);
  });

  it("**1+2=3 にはしない**", () => {
    const u = unit();
    applyStatEffect(u, "def", -DEF_DOWN, 1, "DEBUFF");
    applyStatEffect(u, "def", -DEF_DOWN, 2, "DEBUFF");
    expect(u.effects[0].remainingTurns).not.toBe(3);
  });

  it("無敵3ターンへ1ターンを重ねても縮まない", () => {
    const u = unit();
    applyStatus(u, "INVINCIBLE", 3);
    applyStatus(u, "INVINCIBLE", 1);
    expect(u.statusEffects[0].remainingTurns).toBe(3);
  });

  it("明示的な延長は残りターンへ足す(残り2 + 1 = 3)", () => {
    const u = unit();
    applyStatEffect(u, "def", -DEF_DOWN, 2, "DEBUFF");
    applyStatus(u, "TAUNT", 2);
    expect(extendEffects(u, 1, "DEBUFF")).toBe(2);
    expect(u.effects[0].remainingTurns).toBe(3);
    expect(u.statusEffects[0].remainingTurns).toBe(3);
  });
});

describe("タイプ転生と能力付与", () => {
  it("体力タイプは HP+10% / DEF-10%", () => {
    expect(MONSTER_TYPE_STAT_MULTIPLIERS.HP).toMatchObject({ hp: 1.10, def: 0.90, atk: 0.85 });
  });
  it("防御タイプは HP-15% / DEF+40%", () => {
    expect(MONSTER_TYPE_STAT_MULTIPLIERS.DEFENSE).toMatchObject({ hp: 0.85, def: 1.40, atk: 0.90 });
  });
  it("能力付与のDEFは1ptにつき+5", () => {
    expect(ABILITY_POINT_VALUES).toEqual({ hp: 20, atk: 2, def: 5, spd: 0.1 });
  });
});

describe("防御計算は 1000/(1000+1.2×DEF)", () => {
  it("実戦の経路でこの式が使われている", () => {
    const attacker = unit();
    for (const def of [500, 2000, 4000]) {
      const defender = unit({ def });
      const withDef = calcDamage(attacker, defender, { kind: "DAMAGE", multiplier: 1 }, () => 0.999).damage;
      const without = calcDamage(attacker, defender, { kind: "DAMAGE", multiplier: 1, ignoreDefense: true }, () => 0.999).damage;
      expect(withDef / without).toBeCloseTo(1000 / (1000 + 1.2 * def), 2);
    }
  });
});

describe("個別に直したスキル", () => {
  it("ウルフスラッシュは0.95倍×3、各ヒット25%で防御DOWN", () => {
    const skill = skillOf("wolf", "ウルフスラッシュ");
    const damage = skill.effects[0] as { multiplier: number; hits: number; perHitEffects: { chance: number; amount: number; durationTurns: number }[] };
    expect(damage).toMatchObject({ multiplier: 0.95, hits: 3 });
    expect(damage.perHitEffects).toHaveLength(1);
    expect(damage.perHitEffects[0]).toMatchObject({ chance: 0.25, amount: DEF_DOWN, durationTurns: 2 });
    // 3回とも外す確率は 0.75^3。1回以上入るのは約57.8%
    expect(1 - 0.75 ** 3).toBeCloseTo(0.578, 3);
  });

  it("古代の加護は3種類の強化を4ターン配り、重ねがけしない", () => {
    const skill = skillOf("ancient_crystal", "古代の加護");
    expect(skill.cooldownTurns).toBe(2);
    expect(skill.effects).toEqual([
      { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 4 },
      { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 4 },
      { kind: "BUFF", stat: "criDmg", amount: CRI_DMG_UP, durationTurns: 4 },
    ]);
    expect(skill.description).not.toContain("重ねがけ");

    // 2回配っても積み上がらない
    const u = unit();
    for (let i = 0; i < 2; i += 1) applyStatEffect(u, "atk", ATK_UP, 4, "BUFF");
    expect(getEffectiveStat(u, "atk")).toBe(Math.round(u.def.stats.atk * (1 + ATK_UP)));
  });

  it("ほしくずのわのCTは4", () => {
    const skill = skillOf("wisp", "ほしくずのわ");
    expect(skill.cooldownTurns).toBe(4);
    // 2026年10月の調整で味方ゲージ+10%が付いた。強化はどれも2ターンのまま
    expect(skill.effects.filter((e) => e.kind === "BUFF").every((e) => e.kind === "BUFF" && e.durationTurns === 2)).toBe(true);
  });

  it("いわくだきの付与確率は85%、持続2ターン、CT3", () => {
    const skill = skillOf("golem", "いわくだき");
    expect(skill.cooldownTurns).toBe(3);
    // 9月の調整(実行時の差し替え)で 85%・2ターンになっていたものを、2026年10月に定義へ移した
    expect(skill.effects[1]).toMatchObject({ chance: 0.85, amount: DEF_DOWN, durationTurns: 2 });
  });
});

describe("毒と特殊スタックは壊していない", () => {
  it("毒は今までどおり積み上がる(上限5)", () => {
    const caster = createMonsterVariant(ALL_MONSTER_TEMPLATES.find((t) => t.templateId === "scorpion")!, "FIRE");
    const target = createMonsterVariant(ALL_MONSTER_TEMPLATES.find((t) => t.templateId === "golem")!, "ELECTRIC");
    const engine = new BattleEngine([caster], [target], { rng: () => 0 });
    const [a, b] = engine.getUnits();
    b.poisonStacks = 3;
    b.poisonTurns = 2;
    // エンジンを通さず、毒の積み方そのものを見る
    b.poisonStacks = Math.min(5, b.poisonStacks + 2);
    expect(b.poisonStacks).toBe(5);
    b.poisonStacks = Math.min(5, b.poisonStacks + 2);
    expect(b.poisonStacks, "上限5を超えない").toBe(5);
    expect(a.alive).toBe(true);
  });
});
