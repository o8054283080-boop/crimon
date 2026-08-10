import { ELEMENTS } from "./core/element.js";
import { MonsterDefinition } from "./core/monster.js";
import { BattleEngine } from "./battle/engine.js";
import { MONSTER_TEMPLATES, findMonster } from "./data/monsters.js";

/** シード指定可能な決定論的乱数(再現性のあるバトル観戦用) */
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

function buildTeam(rng: () => number): MonsterDefinition[] {
  const shuffledTemplates = [...MONSTER_TEMPLATES].sort(() => rng() - 0.5);
  return shuffledTemplates.slice(0, 4).map((template) => {
    const element = ELEMENTS[Math.floor(rng() * ELEMENTS.length)];
    const monster = findMonster(template.templateId, element);
    if (!monster) throw new Error(`monster not found: ${template.templateId}/${element}`);
    return monster;
  });
}

function main() {
  const seedArg = process.argv.find((a) => a.startsWith("--seed="));
  const seed = seedArg ? Number(seedArg.split("=")[1]) : Date.now() % 1_000_000;
  const rng = mulberry32(seed);

  console.log(`=== 4vs4 バトルシミュレーション (seed=${seed}) ===\n`);

  const playerTeam = buildTeam(rng);
  const enemyTeam = buildTeam(rng);

  console.log("味方チーム:");
  playerTeam.forEach((m) => console.log(`  - ${m.name} [${m.role}] HP:${m.stats.hp} ATK:${m.stats.atk} DEF:${m.stats.def} SPD:${m.stats.spd}`));
  console.log("\n敵チーム:");
  enemyTeam.forEach((m) => console.log(`  - ${m.name} [${m.role}] HP:${m.stats.hp} ATK:${m.stats.atk} DEF:${m.stats.def} SPD:${m.stats.spd}`));
  console.log("\n--- バトル開始 ---\n");

  const engine = new BattleEngine(playerTeam, enemyTeam, { rng });
  const result = engine.run();

  result.log.forEach((line) => console.log(line));

  console.log("\n--- バトル終了 ---");
  console.log(`勝者: ${result.winner === "PLAYER" ? "味方チーム" : result.winner === "ENEMY" ? "敵チーム" : "引き分け"}`);
  console.log(`経過ターン数: ${result.turnsTaken}`);
}

main();
