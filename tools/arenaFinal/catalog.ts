/**
 * 実戦アリーナ最終検証の下調べ: 図鑑の全種族(★6 Lv60・スキル最大)のステータスとスキル効果の一覧。
 * 属性で中身が変わるスキルは、その属性だけ追記する。**検証専用。本番のデータには何も書かない。**
 *
 *   npx tsx tools/arenaFinal/catalog.ts
 */
import { MONSTER_DEX } from "../../src/data/monsters.js";
import { createMonsterInstance, toBattleDefinition } from "../../src/core/monsterInstance.js";
import { MAX_SKILL_LEVEL } from "../../src/core/skill.js";
const seen = new Set<string>();
const rows: string[] = [];
for (const dex of MONSTER_DEX) {
  if (seen.has(dex.templateId)) continue;
  seen.add(dex.templateId);
  const elements = MONSTER_DEX.filter((d) => d.templateId === dex.templateId).map((d) => d.element).join("/");
  let def;
  try {
    const inst = createMonsterInstance(dex.id, 6, 60);
    inst.skillLevels = [MAX_SKILL_LEVEL, MAX_SKILL_LEVEL, MAX_SKILL_LEVEL];
    def = toBattleDefinition(inst, dex, []);
  } catch (e) { rows.push(`${dex.templateId} ERR ${(e as Error).message}`); continue; }
  const s = def.stats;
  const sk = def.skills.map((k, i) => {
    const eff = k.effects.map((e: any) => {
      if (e.kind === "DAMAGE") return `DMG(atk${e.multiplier}${e.hpCoefficient ? " +hp" + e.hpCoefficient : ""}${e.defCoefficient ? " +def" + e.defCoefficient : ""}${e.scaleBonus ? " sc:" + e.scaleBonus.stat : ""}${e.hits ? " x" + e.hits : ""}${e.ignoreDefense ? " 防御無視" : ""}${e.ignoreDefenseRatio ? " 防御無視" + e.ignoreDefenseRatio : ""}${e.conditionalIgnoreDefense ? " 条件防御無視" : ""}${e.perHitEffects ? " perHit[" + e.perHitEffects.map((x:any)=>x.kind+(x.status??x.stat??"")).join("/")+"]" : ""})`;
      if (e.kind === "STATUS") return `ST:${e.status}${e.chance !== undefined ? "@" + e.chance : ""}/${e.durationTurns}${e.applyTo ? ">" + e.applyTo : ""}`;
      if (e.kind === "BUFF" || e.kind === "DEBUFF") return `${e.kind}:${e.stat}${e.chance !== undefined ? "@" + e.chance : ""}/${e.durationTurns}${e.applyTo ? ">" + e.applyTo : ""}`;
      if (e.kind === "GAUGE") return `GAUGE:${JSON.stringify(e).replace(/"kind":"GAUGE",?/,"")}${e.applyTo ? ">" + e.applyTo : ""}`;
      if (e.kind === "HEAL") return `HEAL:${e.scaleStat ?? "hp"}${e.healRate}${e.applyTo ? ">" + e.applyTo : ""}`;
      return e.kind + (["SHIELD","MITIGATE","REGEN","IMMUNITY","PROTECT","CLEANSE","STRIP","MAX_HP_DAMAGE"].includes(e.kind) ? JSON.stringify(e).replace(/"kind":"[A-Z_]+",?/,"") : "") + (e.applyTo ? ">" + e.applyTo : "");
    }).join(",");
    return `S${i + 1}[${k.passive ? "P " : ""}${k.target} CT${k.cooldownTurns}] ${k.name}: ${eff}`;
  }).join(" | ");
  const base = def.skills.map((k) => k.name);
  const variants: string[] = [];
  for (const d2 of MONSTER_DEX.filter((d) => d.templateId === dex.templateId && d.id !== dex.id)) {
    const i2 = createMonsterInstance(d2.id, 6, 60); i2.skillLevels = [MAX_SKILL_LEVEL, MAX_SKILL_LEVEL, MAX_SKILL_LEVEL];
    const df2 = toBattleDefinition(i2, d2, []);
    df2.skills.forEach((k, i) => { if (k.name !== base[i]) variants.push(`    [${d2.element}] S${i + 1}${k.passive ? "(P)" : ""} ${k.name}: ${k.passive ? JSON.stringify(k.passive.levels[4]) : k.effects.map((e: any) => e.kind + (e.status ?? e.stat ?? "")).join(",")}${k.passive ? "" : " CT" + k.cooldownTurns + " " + k.target}`); });
    if (df2.stats.hp !== def.stats.hp || df2.stats.def !== def.stats.def) variants.push(`    [${d2.element}] stats HP${df2.stats.hp} ATK${df2.stats.atk} DEF${df2.stats.def} SPD${df2.stats.spd}`);
  }
  rows.push(`## ${def.name}(${dex.templateId}) ${elements}\n  HP${s.hp} ATK${s.atk} DEF${s.def} SPD${s.spd} role=${def.role}\n  ${sk}${variants.length ? "\n" + variants.join("\n") : ""}`);
}
console.log(rows.join("\n"));
console.log(`\n${seen.size} templates, ${MONSTER_DEX.length} dex`);
