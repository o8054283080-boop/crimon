/**
 * 実戦アリーナ最終検証の下調べ: 指定した図鑑IDのスキル説明(本番の describeSkillLines)と潜在覚醒の候補。
 * **検証専用。**
 *
 *   npx tsx tools/arenaFinal/detail.ts behemoth_WATER undine_WATER
 */
import { findMonsterById } from "../../src/data/monsters.js";
import { createMonsterInstance, toBattleDefinition } from "../../src/core/monsterInstance.js";
import { MAX_SKILL_LEVEL, describeSkillLines } from "../../src/core/skill.js";
import { LATENT_ABILITY_CANDIDATES } from "../../src/data/latentAbilities.js";
const ids = process.argv.slice(2);
for (const id of ids) {
  const dex = findMonsterById(id)!;
  const inst = createMonsterInstance(id, 6, 60);
  inst.skillLevels = [MAX_SKILL_LEVEL, MAX_SKILL_LEVEL, MAX_SKILL_LEVEL];
  const def = toBattleDefinition(inst, dex, []);
  console.log(`### ${def.name} (${id}) HP${def.stats.hp} ATK${def.stats.atk} DEF${def.stats.def} SPD${def.stats.spd}`);
  def.skills.forEach((k, i) => console.log(`  S${i + 1} ${k.name} [${k.target} CT${k.cooldownTurns}]: ${describeSkillLines(k).join(" / ")}`));
  (LATENT_ABILITY_CANDIDATES[id] ?? []).forEach((c, i) => console.log(`  潜在${i}: ${c.name} — ${(c as any).description ?? JSON.stringify(c).slice(0, 200)}`));
}
