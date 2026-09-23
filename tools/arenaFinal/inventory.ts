/**
 * 4系統検証の下調べ: 強化解除・防御DOWN・攻撃支援・妨害・サポートを持つスキルの一覧(★6 Lv60・スキル最大)。
 * **検証専用。本番のデータには何も書かない。**
 *
 *   npx tsx tools/arenaFinal/inventory.ts
 */
import { MONSTER_DEX } from "../../src/data/monsters.js";
import { createMonsterInstance, toBattleDefinition } from "../../src/core/monsterInstance.js";
import { MAX_SKILL_LEVEL } from "../../src/core/skill.js";
const skip = /pig|ancient/;
type Row = { cat: string; who: string; slot: string; target: string; ct: number; what: string };
const rows: Row[] = [];
const pct = (v?: number) => (v === undefined ? "確定" : `${Math.round(v * 100)}%`);
for (const dex of MONSTER_DEX) {
  if (skip.test(dex.templateId)) continue;
  const inst = createMonsterInstance(dex.id, 6, 60);
  inst.skillLevels = [MAX_SKILL_LEVEL, MAX_SKILL_LEVEL, MAX_SKILL_LEVEL];
  const def = toBattleDefinition(inst, dex, []);
  def.skills.forEach((k, i) => {
    if (k.passive) return;
    const enemyTarget = k.target === "ALL_ENEMIES" || k.target === "SINGLE_ENEMY";
    const aoe = k.target === "ALL_ENEMIES" ? "全体" : k.target === "SINGLE_ENEMY" ? "単体" : k.target === "ALL_ALLIES" ? "味方全体" : k.target === "SINGLE_ALLY" ? "味方単体" : "自身";
    const push = (cat: string, what: string) => rows.push({ cat, who: def.name.replace(/★6 Lv60/, ""), slot: `S${i + 1} ${k.name}`, target: aoe, ct: k.cooldownTurns, what });
    const walk = (effects: any[], perHit = false) => {
      for (const e of effects) {
        const allyApply = e.applyTo === "ALLIES" || e.applyTo === "SELF" || e.applyTo === "LOWEST_HP_ALLY";
        if (e.kind === "DAMAGE" && e.perHitEffects) walk(e.perHitEffects, true);
        if (e.kind === "STRIP") push("強化解除", `${pct(e.chance)} ${e.count ? `${e.count}個` : "全部"}${e.selfGaugePerRemoved ? " +解除1個ごと自ゲージ" : ""}`);
        if (e.kind === "STEAL_BUFF") push("強化解除", `${pct(e.chance)} 奪取${e.count ?? 1}個`);
        if (e.kind === "DEBUFF" && e.stat === "def") push("防御DOWN", `${pct(e.chance)} ${e.durationTurns}T${e.ignoreResistance ? " 抵抗無視" : ""}${perHit ? " (Hitごと)" : ""}`);
        if (e.kind === "DEBUFF" && e.stat === "atk") push("攻撃DOWN", `${pct(e.chance)} ${e.durationTurns}T`);
        if (e.kind === "DEBUFF" && e.stat === "spd") push("速度DOWN", `${pct(e.chance)} ${e.durationTurns}T`);
        if (e.kind === "STUN") push("スタン", `${pct(e.chance)}`);
        if (e.kind === "STATUS" && !allyApply && enemyTarget && ["SKILL_LOCK", "TAUNT"].includes(e.status)) push("行動阻害", `${e.status} ${pct(e.chance)}`);
        if (e.kind === "COOLDOWN_EXTEND") push("行動阻害", `CT延長 ${pct(e.chance)}`);
        if (e.kind === "GAUGE" && (e.amount < 0 || e.drain)) push("ゲージDOWN", `${e.drain ? "吸収" : ""}${Math.round(Math.abs(e.amount) * 100)}%${e.chance !== undefined ? ` ${pct(e.chance)}` : ""}`);
        if (e.kind === "GAUGE" && e.amount > 0 && !enemyTarget) push("ゲージUP", `+${Math.round(e.amount * 100)}%`);
        if (e.kind === "GAUGE" && e.amount > 0 && enemyTarget && allyApply && e.applyTo !== "SELF") push("ゲージUP", `+${Math.round(e.amount * 100)}%(味方へ)`);
        if (e.kind === "BUFF" && e.stat === "atk" && (!enemyTarget || e.applyTo === "ALLIES")) push("攻撃UP", `${e.durationTurns}T`);
        if (e.kind === "BUFF" && e.stat === "spd" && (!enemyTarget || e.applyTo === "ALLIES")) push("速度UP", `${e.durationTurns}T`);
        if (e.kind === "HEAL" && (!enemyTarget || allyApply)) push("回復", `${e.scaleStat ?? "hp"}×${e.healRate.toFixed(3)}`);
        if (e.kind === "SHIELD") push("シールド", `${Math.round(e.shieldRate * 100)}%${e.fromSourceHp ? "(術者HP)" : ""}`);
        if (e.kind === "CLEANSE") push("弱体解除", `${e.count ?? "全部"}`);
        if (e.kind === "IMMUNITY") push("免疫", `${e.durationTurns}T`);
        if (e.kind === "STATUS" && ["ENDURE", "INVINCIBLE", "REVIVE"].includes(e.status)) push("我慢・無敵・復活", `${e.status} ${e.durationTurns}T`);
      }
    };
    walk(k.effects);
  });
}
const cats = [...new Set(rows.map((r) => r.cat))];
for (const c of cats) {
  console.log(`\n## ${c}\n\n| モンスター | スキル | 対象 | CT | 内容 |\n|---|---|---|---:|---|`);
  for (const r of rows.filter((x) => x.cat === c)) console.log(`| ${r.who} | ${r.slot} | ${r.target} | ${r.ct} | ${r.what} |`);
}
