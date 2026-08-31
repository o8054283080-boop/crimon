/**
 * 装備ダンジョン10階の実プレイ報告編成を、本番 BattleEngine で再現する調査専用ツール。
 * 本番データは変更せず、固定seed・固定装備を用いて比較可能なJSONを出力する。
 *
 *   npx tsx tools/equipmentFloor10RealParty.ts > /tmp/floor10.json
 */
import { BattleEngine, BattleResult } from "../src/battle/engine.js";
import { Equipment, EQUIP_SLOTS, enhanceEquipment, generateEquipment } from "../src/core/equipment.js";
import { MonsterInstance, createMonsterInstance } from "../src/core/monsterInstance.js";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { setupDungeonBattle } from "../src/game/dungeonRunner.js";

const REAL_PARTY = [
  ["dragon_DARK", 6, 60],
  ["dragon_LIGHT", 6, 60],
  ["nemesis_LIGHT", 6, 60],
  ["wisp_WATER", 5, 50],
  ["slime_GRASS", 5, 50],
] as const;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type GearQuality = "medium" | "high";

function fixedGear(ownerIndex: number, quality: GearQuality): Equipment[] {
  const rng = mulberry32(41000 + ownerIndex * 101 + (quality === "high" ? 1 : 0));
  const star = quality === "medium" ? 5 : 6;
  const targetLevel = quality === "medium" ? 9 : 15;
  const initialSubs = quality === "medium" ? 2 : 4;
  return EQUIP_SLOTS.map((slot) => {
    const eq = generateEquipment({ slot, star, subStatCount: initialSubs, rng });
    while (eq.level < targetLevel) enhanceEquipment(eq, rng);
    // Date/Math.random由来のIDを固定化し、出力と再実行のdiffを安定させる。
    eq.id = `${quality}_${ownerIndex}_${slot}`;
    return eq;
  });
}

const MEDIUM_GEAR = REAL_PARTY.map((_, i) => fixedGear(i, "medium"));
const HIGH_GEAR = REAL_PARTY.map((_, i) => fixedGear(i, "high"));

function makeParty(indices = REAL_PARTY.map((_, i) => i), geared: number[] = [], quality: GearQuality = "medium", ability = false, maxSkills = false) {
  const equipment: Equipment[] = [];
  const party = indices.map((originalIndex) => {
    const [dexId, star, level] = REAL_PARTY[originalIndex];
    const monster = createMonsterInstance(dexId, star, level);
    if (maxSkills) monster.skillLevels = [5, 5, 5];
    // 正確なユーザー値は不明なので本測定はスキルLv1。能力点比較時のみ役割別100ptを付与する。
    if (ability) {
      if (originalIndex <= 2 || originalIndex === 4) monster.development.abilityPoints.atk = 100;
      else monster.development.abilityPoints.hp = 100;
    }
    if (geared.includes(originalIndex)) {
      for (const eq of (quality === "medium" ? MEDIUM_GEAR : HIGH_GEAR)[originalIndex]) {
        monster.equipment[eq.slot] = eq.id;
        equipment.push(eq);
      }
    }
    return monster;
  });
  return { party, equipment };
}

interface Aggregate {
  trials: number; wins: number; rate: number; minActions: number; averageActions: number; medianActions: number;
  maxActions: number; averageSurvivors: number; allAliveWinRate: number; lossEnemyHpLeft: number;
  bossKillRate: number; crystalKillRate: number; curseCrystalKillRate: number; commonKillOrder: string;
}

function aggregate(results: BattleResult[]): Aggregate {
  const actions = results.map((r) => r.turnsTaken).sort((a, b) => a - b);
  let wins = 0, survivors = 0, allAliveWins = 0, lossHp = 0, losses = 0;
  const killed = [0, 0, 0];
  const orders = new Map<string, number>();
  for (const result of results) {
    const last = result.turns.at(-1)?.snapshot ?? [];
    const players = last.filter((u) => u.team === "PLAYER");
    const enemies = last.filter((u) => u.team === "ENEMY");
    const won = result.winner === "PLAYER";
    if (won) wins++;
    const alive = players.filter((u) => u.alive).length;
    survivors += alive;
    if (won && alive === players.length) allAliveWins++;
    if (!won) {
      losses++;
      const max = enemies.reduce((s, u) => s + u.maxHp, 0);
      lossHp += max ? enemies.reduce((s, u) => s + Math.max(0, u.currentHp), 0) / max : 0;
    }
    enemies.forEach((u, i) => { if (!u.alive) killed[i]++; });
    const seen = new Set<string>();
    const order: string[] = [];
    for (const turn of result.turns) for (const unit of turn.snapshot.filter((u) => u.team === "ENEMY" && !u.alive)) {
      if (!seen.has(unit.instanceId)) { seen.add(unit.instanceId); order.push(unit.instanceId); }
    }
    const key = order.join(">");
    orders.set(key, (orders.get(key) ?? 0) + 1);
  }
  const commonKillOrder = [...orders].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  return {
    trials: results.length, wins, rate: wins / results.length, minActions: actions[0],
    averageActions: actions.reduce((s, n) => s + n, 0) / actions.length,
    medianActions: actions[Math.floor(actions.length / 2)], maxActions: actions.at(-1)!,
    averageSurvivors: survivors / results.length, allAliveWinRate: allAliveWins / results.length,
    lossEnemyHpLeft: losses ? lossHp / losses : 0, bossKillRate: killed[0] / results.length,
    crystalKillRate: killed[1] / results.length, curseCrystalKillRate: killed[2] / results.length, commonKillOrder,
  };
}

function simulate(config: ReturnType<typeof makeParty>, trials = 100): Aggregate {
  const results: BattleResult[] = [];
  for (let i = 0; i < trials; i++) {
    // インスタンスを試行ごとに作り直し、装備IDだけ同じ固定装備へ結び直す。
    const indices = config.party.map((m) => REAL_PARTY.findIndex(([id]) => id === m.dexId));
    const geared = indices.filter((idx) => config.party.find((m) => m.dexId === REAL_PARTY[idx][0])?.equipment[1]);
    const quality = config.equipment[0]?.star === 6 ? "high" : "medium";
    const ability = config.party.some((m) => Object.values(m.development.abilityPoints).some((v) => v > 0));
    const maxSkills = config.party.some((m) => m.skillLevels[0] === 5);
    const fresh = makeParty(indices, geared, quality, ability, maxSkills);
    const setup = setupDungeonBattle(fresh.party, EQUIPMENT_DUNGEON_FLOORS[9], fresh.equipment);
    results.push(new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng: mulberry32(15000 + i), maxTurns: 300 }).run());
  }
  return aggregate(results);
}

const all = [0, 1, 2, 3, 4];
const cases = {
  A_unequipped: simulate(makeParty()),
  B_dark_and_light_dragons: simulate(makeParty(all, [0, 1])),
  B_dark_dragon_and_light_nemesis: simulate(makeParty(all, [0, 2])),
  C_three_star6: simulate(makeParty(all, [0, 1, 2])),
  D_all_medium: simulate(makeParty(all, all)),
  E_all_high: simulate(makeParty(all, all, "high")),
};

const abilityPointComparison = {
  B_dark_and_light_dragons_100pt: simulate(makeParty(all, [0, 1], "medium", true)),
  D_all_medium_100pt: simulate(makeParty(all, all, "medium", true)),
};

const unknownGrowthSensitivity = {
  B_two_high_quality: simulate(makeParty(all, [0, 1], "high")),
  B_two_high_quality_max_skills: simulate(makeParty(all, [0, 1], "high", false, true)),
  B_two_high_quality_max_skills_100pt: simulate(makeParty(all, [0, 1], "high", true, true)),
  D_all_medium_max_skills: simulate(makeParty(all, all, "medium", false, true)),
};

const leaveOneOut = Object.fromEntries(REAL_PARTY.map(([id], removed) => [
  `without_${id}`,
  simulate(makeParty(all.filter((i) => i !== removed), all.filter((i) => i !== removed))),
]));

console.log(JSON.stringify({
  seed: "15000..15099", skillLevels: [1, 1, 1], cases, abilityPointComparison, unknownGrowthSensitivity, leaveOneOut,
  mediumEquipment: MEDIUM_GEAR, highEquipment: HIGH_GEAR,
}, null, 2));
