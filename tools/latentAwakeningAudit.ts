import { pathToFileURL } from "node:url";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";

export function auditLatentAwakening() {
  const candidates = Object.values(LATENT_ABILITY_CANDIDATES).flat();
  const runtime = candidates.flatMap((candidate) => candidate.runtimeEffects ?? []);
  const hasRuntime = (candidate: typeof candidates[number], kind: string, status?: string) => candidate.runtimeEffects?.some((effect) => effect.kind === kind && (!status || ("status" in effect && effect.status === status))) ?? false;
  const count = (predicate: (candidate: typeof candidates[number]) => boolean) => candidates.filter(predicate).length;
  const ids = candidates.map((candidate) => candidate.id);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  return {
    monsterCount: ALL_DISPLAYABLE_MONSTERS_DEX.length,
    candidateCount: candidates.length,
    candidatesPerMonster: Object.fromEntries(Object.entries(LATENT_ABILITY_CANDIDATES).map(([id, values]) => [id, values.length])),
    duplicateIds,
    aoeConversionCount: count((c) => Boolean(c.aoeConversion)),
    healBlockCount: count((c) => hasRuntime(c, "DEBUFF", "HEAL_BLOCK")),
    gaugeDownCount: count((c) => hasRuntime(c, "GAUGE_DOWN")), stripCount: count((c) => hasRuntime(c, "STRIP")),
    spdDownCount: count((c) => hasRuntime(c, "DEBUFF", "SPD_DOWN")), poisonCount: count((c) => hasRuntime(c, "DEBUFF", "POISON")),
    stunCount: count((c) => hasRuntime(c, "DEBUFF", "STUN")), ignoreDefenseCount: count((c) => Boolean(c.ignoreDefenseRatio)),
    buffBlockCount: count((c) => hasRuntime(c, "DEBUFF", "BUFF_BLOCK")), allyGaugeUpCount: count((c) => hasRuntime(c, "ALLY_GAUGE_UP")),
    debuffExtendCount: count((c) => hasRuntime(c, "DEBUFF_EXTEND")), debuffCountDamageCount: count((c) => Boolean(c.debuffDamageBonus)),
    healSupportCount: count((c) => c.category === "SUPPORT" || hasRuntime(c, "HEAL_CLEANSE") || hasRuntime(c, "REGEN")),
    durabilityCount: count((c) => c.category === "DURABILITY" || Boolean(c.hpMultiplier || c.defMultiplier || c.damageTakenMultiplier)),
    gradeDistribution: Object.fromEntries(["S", "A", "B", "C", "D"].map((grade) => [grade, candidates.filter((candidate) => candidate.grade === grade).length])),
    monstersByCategory: Object.fromEntries(["aoeConversion", "HEAL_BLOCK", "GAUGE_DOWN", "STRIP", "SPD_DOWN", "POISON", "STUN", "ignoreDefense"].map((category) => [category,
      ALL_DISPLAYABLE_MONSTERS_DEX.filter((monster) => LATENT_ABILITY_CANDIDATES[monster.id].some((candidate) => category === "aoeConversion" ? Boolean(candidate.aoeConversion) : category === "ignoreDefense" ? Boolean(candidate.ignoreDefenseRatio) : hasRuntime(candidate, category === "GAUGE_DOWN" || category === "STRIP" ? category : "DEBUFF", category === "GAUGE_DOWN" || category === "STRIP" ? undefined : category))).map((monster) => monster.name),
    ])),
    runtimeEffectCount: runtime.length,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(auditLatentAwakening(), null, 2));
