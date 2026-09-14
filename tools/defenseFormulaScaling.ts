/**
 * STRONG実戦個体のATK/HP/DEF比例攻撃を、同じ防御の標的へ当てて比較する。
 * 本番データは一切変更せず、BattleLabで作った個体と本編のcalcDamageを使う。
 *
 *   node --import tsx tools/defenseFormulaScaling.ts --runs 200 --gear STRONG
 */
import type { DamageEffect } from "../src/core/skill.js";
import { calcDamage } from "../src/battle/damage.js";
import { setBalanceFlags } from "../src/core/balanceFlags.js";
import { createBattleUnit, getEffectiveStat } from "../src/battle/unit.js";
import { MONSTER_DEX } from "../src/data/monsters.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, GearGrade } from "./battleLab/types.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const RUNS = Number(arg("runs", "200"));
const GEAR = arg("gear", "STRONG") as GearGrade;
const TARGET_DEF = Number(arg("target-def", "1080")); // 魔人12F DEF3600 × 0.30
const SEED = 20260913;

const allDamageEffects = MONSTER_DEX.flatMap((monster) => monster.skills.flatMap((skill) =>
  skill.effects.filter((effect): effect is DamageEffect => effect.kind === "DAMAGE")
    .map((effect) => ({ monster, skill, effect }))));
const hpSkills = allDamageEffects.filter(({ effect }) => effect.hpCoefficient !== undefined);
const defSkills = allDamageEffects.filter(({ effect }) => effect.defCoefficient !== undefined);
const pureHp = hpSkills.filter(({ effect }) => effect.multiplier === 0);
const pureDef = defSkills.filter(({ effect }) => effect.multiplier === 0);

interface Case {
  label: string;
  ally: AllySpec;
  skillIndex: number;
}

const CASES: Case[] = [
  { label: "ATK型", ally: { templateId: "wolf", element: "FIRE", preset: "MAX_ATTACKER" }, skillIndex: 2 },
  { label: "ATK＋HP型", ally: { templateId: "phoenix", element: "FIRE", preset: "MAX_HEALER" }, skillIndex: 2 },
  { label: "ATK＋DEF型", ally: { templateId: "golem", element: "FIRE", preset: "MAX_TANK" }, skillIndex: 1 },
];

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log(`比例攻撃検証 / ${GEAR} / ${RUNS}個体 / 同属性標的DEF ${TARGET_DEF}`);
console.log(`HP比例DAMAGE ${hpSkills.length}件（HPのみ ${pureHp.length}件）、DEF比例DAMAGE ${defSkills.length}件（DEFのみ ${pureDef.length}件）`);
console.log("注: 0件なら、現行の比例攻撃はすべてATK項との複合。\n");
console.log("型\t代表スキル\tHP\tATK\tDEF\t比例項割合\t旧式平均Dmg\t新式平均Dmg\t新/旧");

for (const item of CASES) {
  const rows: { hp: number; atk: number; def: number; dependentShare: number; legacy: number; sw: number }[] = [];
  let skillName = "";
  for (let i = 0; i < RUNS; i += 1) {
    const rng = mulberry32(SEED + i * 7919);
    const attackerDef = buildAlly(item.ally, rng, GEAR);
    const skill = attackerDef.skills[item.skillIndex];
    skillName = skill.name;
    const effect = skill.effects.find((candidate): candidate is DamageEffect => candidate.kind === "DAMAGE")!;
    const targetBase = buildAlly({ templateId: "slime", element: "FIRE", preset: "MAX_TANK" }, rng, GEAR);
    const targetDef = { ...targetBase, stats: { ...targetBase.stats, hp: 1_000_000, def: TARGET_DEF } };
    const attacker = createBattleUnit(attackerDef, "PLAYER", `p${i}`);
    const target = createBattleUnit(targetDef, "ENEMY", `e${i}`);
    const atk = getEffectiveStat(attacker, "atk");
    const dependent = effect.hpCoefficient !== undefined ? attacker.maxHp : effect.defCoefficient !== undefined ? getEffectiveStat(attacker, "def") : 0;
    const coefficient = effect.hpCoefficient ?? effect.defCoefficient ?? 0;
    const atkPart = atk * effect.multiplier;
    const dependentPart = dependent * coefficient;
    const damageSeed = SEED ^ (i * 104729);
    setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false });
    const legacy = calcDamage(attacker, target, effect, mulberry32(damageSeed)).damage;
    setBalanceFlags({ defenseFormula: "sw", swRatio: 1.2, unifyDefModifiers: false });
    const sw = calcDamage(attacker, target, effect, mulberry32(damageSeed)).damage;
    rows.push({ hp: attacker.maxHp, atk, def: getEffectiveStat(attacker, "def"), dependentShare: dependentPart / (atkPart + dependentPart), legacy, sw });
  }
  const legacy = mean(rows.map((r) => r.legacy));
  const sw = mean(rows.map((r) => r.sw));
  console.log([
    item.label, skillName,
    Math.round(mean(rows.map((r) => r.hp))), Math.round(mean(rows.map((r) => r.atk))), Math.round(mean(rows.map((r) => r.def))),
    `${(mean(rows.map((r) => r.dependentShare)) * 100).toFixed(1)}%`,
    legacy.toFixed(0), sw.toFixed(0), (sw / legacy).toFixed(2),
  ].join("\t"));
}

setBalanceFlags({ defenseFormula: "legacy", swRatio: 1.2, unifyDefModifiers: false });
