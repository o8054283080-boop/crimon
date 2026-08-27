import { BattleEngine } from "../src/battle/engine.js";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import { findMonster } from "../src/data/monsters.js";

let seed = 0x8_03_216;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x1_0000_0000; };
const runs = 1000;
let proc = 0; let landed = 0;
for (let i = 0; i < runs; i += 1) {
  const dex = findMonster("imp", "FIRE")!; const instance = createMonsterInstance(dex.id, 6, 40);
  instance.development.type = "DISRUPT"; instance.development.abilityPoints.spd = 100;
  instance.development.latentAbilityId = LATENT_ABILITY_CANDIDATES[dex.id][1].id;
  const target = { ...findMonster("golem", "GRASS")!, stats: { ...findMonster("golem", "GRASS")!.stats, resistance: .2 } };
  const engine = new BattleEngine([toBattleDefinition(instance, dex)], [target], { rng }); const [actor, victim] = engine.getUnits();
  const record = engine.resolveTurn(actor, { skillIndex: 0, targetId: victim.instanceId });
  if (record.lines.some((line) => line.includes("封印針"))) proc += 1;
  if (victim.statusEffects.some((effect) => effect.type === "SKILL_LOCK")) landed += 1;
}
console.log(JSON.stringify({ runs, successfulProcs: proc, landed, averagePerBattle: landed / runs,
  estimatedBlockedS2S3Actions: landed, blockedActionRatio: landed / runs }, null, 2));
