/**
 * 装備ダンジョンの難易度を、Battle Lab と同じ育成・装備基準で測る。
 *
 * 味方は全員 `buildAlly()` を通る。これにより★6 Lv60、スキルMAX、能力ポイント100、
 * タイプ転生、潜在覚醒、GearGrade別の装備が塔の検証と同じ経路で組み上がる。
 * 旧 `speedGear()` 編成は過去比較用の資料にだけ残し、最終バランス評価には使わない。
 *
 *   node --import tsx tools/dungeonPressure.ts --gear STRONG 10 11 12
 */
import { BattleEngine } from "../src/battle/engine.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import type { Stats } from "../src/core/stats.js";
import { EQUIPMENT_DUNGEON_FLOORS, type EquipmentDungeonKind, findDungeonFloor } from "../src/data/equipmentDungeon.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, GearGrade } from "./battleLab/types.js";

export interface PressureTeam {
  allies: AllySpec[];
  purpose: string;
  /** 毒詳細で死亡時点を追う役。ラベルは allies の label と一致させる。 */
  healerLabels?: string[];
  poisonCarryLabels?: string[];
}

const ally = (label: string, templateId: string, element: AllySpec["element"], preset: NonNullable<AllySpec["preset"]>): AllySpec => ({
  label, templateId, element, preset,
});

/** 本編の実スキルとBattle Labプリセットから組む、最終評価用の実戦編成。 */
export const PVE_DUNGEON_TEAMS: Record<string, PressureTeam> = {
  "実戦通常": {
    purpose: "通常モンスター中心。主力、サブ火力、妨害、回復、支援を1枠ずつ置く",
    allies: [
      ally("主力・草ウルフ", "wolf", "GRASS", "MAX_ATTACKER"),
      ally("サブ・水ナイト", "knight", "WATER", "MAX_ATTACKER"),
      ally("妨害・電気インプ", "imp", "ELECTRIC", "MAX_DEBUFFER"),
      ally("回復・水フェアリー", "fairy", "WATER", "MAX_HEALER"),
      ally("支援・草ウィスプ", "wisp", "GRASS", "MAX_SUPPORT"),
    ],
    healerLabels: ["回復・水フェアリー"],
  },
  "実戦毒": {
    purpose: "毒2体、毒と防御低下を補う1体、ヒーラー、タンクでボスを削る",
    allies: [
      // 火マッシュルンはS1毒、S2毒2スタック、S3毒床を実際に持つ。
      ally("毒主力・火マッシュルン", "mushroon", "FIRE", "MAX_DEBUFFER"),
      // 草スコーピオンは会心時S1毒に加え、S2防御低下とS3毒殺を持つ。
      ally("毒火力・草スコーピオン", "scorpion", "GRASS", "MAX_ATTACKER"),
      // 電気フェンリルは防御低下、回復阻害、2スタック毒で補助する。
      ally("毒補助・電気フェンリル", "fenrir", "ELECTRIC", "MAX_DEBUFFER"),
      ally("回復・水フェニックス", "phoenix", "WATER", "MAX_HEALER"),
      ally("防護・光ゴーレム", "golem", "LIGHT", "MAX_TANK"),
    ],
    healerLabels: ["回復・水フェニックス"],
    poisonCarryLabels: ["毒主力・火マッシュルン", "毒火力・草スコーピオン"],
  },
  "実戦耐久": {
    purpose: "削り役を残し、二重防護と回復で長期戦を成立させる",
    allies: [
      ally("削り・火ドラゴン", "dragon", "FIRE", "MAX_ATTACKER"),
      ally("回復・水フェニックス", "phoenix", "WATER", "MAX_HEALER"),
      ally("支援・水ウィスプ", "wisp", "WATER", "MAX_SUPPORT"),
      ally("防護・光ゴーレム", "golem", "LIGHT", "MAX_TANK"),
      ally("防護・光トレント", "treant", "LIGHT", "MAX_TANK"),
    ],
    healerLabels: ["回復・水フェニックス"],
  },
  "高レア": {
    purpose: "高レアの主力2体、妨害、回復、攻撃支援で組む",
    allies: [
      ally("主力・草グリフォン", "griffon", "GRASS", "MAX_ATTACKER"),
      ally("主力・火ドラゴン", "dragon", "FIRE", "MAX_ATTACKER"),
      ally("妨害・電気ネメシス", "nemesis", "ELECTRIC", "MAX_DEBUFFER"),
      ally("回復・水セラフ", "seraph", "WATER", "MAX_HEALER"),
      ally("支援・火ヴァルキリア", "valkyria", "FIRE", "MAX_SUPPORT"),
    ],
    healerLabels: ["回復・水セラフ"],
  },
  "防御無視": {
    purpose: "完全防御無視を持つ闇ドラゴンと火ウルフの相対価値を確認する",
    allies: [
      ally("防御無視・闇ドラゴン", "dragon", "DARK", "MAX_ATTACKER"),
      ally("防御無視・火ウルフ", "wolf", "FIRE", "MAX_ATTACKER"),
      ally("回復・水フェニックス", "phoenix", "WATER", "MAX_HEALER"),
      ally("支援・火ヴァルキリア", "valkyria", "FIRE", "MAX_SUPPORT"),
      ally("防護・光ゴーレム", "golem", "LIGHT", "MAX_TANK"),
    ],
    healerLabels: ["回復・水フェニックス"],
  },
  "旧毒圧力": {
    purpose: "毒発動だけを見る旧スライム2・ウルフ2・インプ1。最終評価には使わない",
    allies: [
      ally("草スライム", "slime", "GRASS", "MAX_DEBUFFER"),
      ally("闇スライム", "slime", "DARK", "MAX_DEBUFFER"),
      ally("闇ウルフ", "wolf", "DARK", "MAX_DEBUFFER"),
      ally("電気ウルフ", "wolf", "ELECTRIC", "MAX_DEBUFFER"),
      ally("闇インプ", "imp", "DARK", "MAX_DEBUFFER"),
    ],
    poisonCarryLabels: ["草スライム", "闇スライム", "闇ウルフ", "電気ウルフ", "闇インプ"],
  },
};

export interface PressureResult {
  rate: number;
  enemyHpLeft: number;
  actions: number;
  actionsMean: number;
  allyHpLeft: number;
  wipeRate: number;
  timeoutRate: number;
  maxPoisonOnEnemy: number;
  /** 全戦闘・全敵・全スナップショットでの毒スタック平均。 */
  avgPoisonOnEnemy: number;
  poisonAppliedRate: number;
  poisonDamageShare: number;
  /** 死亡した戦闘だけで平均した手数。死亡しなければnull。 */
  healerDeathAction: number | null;
  healerDeathRate: number;
  poisonCarryDeathAction: number | null;
  poisonCarryDeathRate: number;
}

function deathAction(result: ReturnType<BattleEngine["run"]>, labels: readonly string[]): number | null {
  if (labels.length === 0) return null;
  for (let i = 0; i < result.turns.length; i += 1) {
    const tracked = result.turns[i].snapshot.filter((u) => labels.includes(u.name));
    if (tracked.length > 0 && tracked.some((u) => !u.alive)) return i + 1;
  }
  return null;
}

export function measurePressure(
  team: PressureTeam,
  floorNum: number,
  gear: GearGrade,
  trials = 50,
  kind: EquipmentDungeonKind = "DEMON",
  seedBase = 900,
  patchEnemies?: (defs: MonsterDefinition[]) => MonsterDefinition[],
): PressureResult {
  const floor = findDungeonFloor(floorNum, kind);
  if (!floor) throw new Error(`${kind} の ${floorNum}階が見つからない`);
  let wins = 0, hpLeftSum = 0, allyHpSum = 0, wipes = 0, timeouts = 0;
  let maxPoisonOnEnemy = 0, poisonStackSum = 0, poisonSnapshotCount = 0, poisonBattles = 0;
  let poisonDamage = 0, totalEnemyDamage = 0;
  let healerDeathSum = 0, healerDeaths = 0, poisonDeathSum = 0, poisonDeaths = 0;
  const actions: number[] = [];

  for (let i = 0; i < trials; i += 1) {
    const rng = mulberry32(seedBase + i);
    const players = team.allies.map((spec) => buildAlly(spec, rng, gear));
    const baseEnemies = buildDungeonEnemyTeam(floor);
    const enemies = patchEnemies ? patchEnemies(baseEnemies) : baseEnemies;
    const engine = new BattleEngine(players, enemies, { rng, maxTurns: 300 });
    const enemyIds = new Set(engine.getUnits().filter((u) => u.team === "ENEMY").map((u) => u.instanceId));
    const result = engine.run();
    if (result.winner === "PLAYER") wins += 1;
    actions.push(result.turnsTaken);

    let battleHadPoison = false;
    for (const turn of result.turns) {
      for (const u of turn.snapshot) {
        if (u.team !== "ENEMY") continue;
        maxPoisonOnEnemy = Math.max(maxPoisonOnEnemy, u.poisonStacks);
        poisonStackSum += u.poisonStacks;
        poisonSnapshotCount += 1;
        if (u.poisonStacks > 0) battleHadPoison = true;
      }
      for (const event of turn.events) {
        if (event.kind === "DAMAGE" && enemyIds.has(event.targetId)) totalEnemyDamage += event.amount ?? 0;
      }
      for (const line of turn.lines) {
        const match = line.match(/毒\(\d+スタック\)でダメージを受けた！\s*([\d,]+)/);
        if (match) poisonDamage += Number(match[1].replaceAll(",", ""));
      }
    }
    if (battleHadPoison) poisonBattles += 1;

    const healerDeath = deathAction(result, team.healerLabels ?? []);
    if (healerDeath !== null) { healerDeathSum += healerDeath; healerDeaths += 1; }
    const poisonCarryDeath = deathAction(result, team.poisonCarryLabels ?? []);
    if (poisonCarryDeath !== null) { poisonDeathSum += poisonCarryDeath; poisonDeaths += 1; }

    const last = result.turns[result.turns.length - 1];
    const enemiesAtEnd = last ? last.snapshot.filter((u) => u.team === "ENEMY") : [];
    const enemyMax = enemiesAtEnd.reduce((s, u) => s + u.maxHp, 0);
    hpLeftSum += enemyMax > 0 ? enemiesAtEnd.reduce((s, u) => s + Math.max(0, u.currentHp), 0) / enemyMax : 0;
    const alliesAtEnd = last ? last.snapshot.filter((u) => u.team === "PLAYER") : [];
    const allyMax = alliesAtEnd.reduce((s, u) => s + u.maxHp, 0);
    allyHpSum += allyMax > 0 ? alliesAtEnd.reduce((s, u) => s + Math.max(0, u.currentHp), 0) / allyMax : 0;
    if (alliesAtEnd.length > 0 && alliesAtEnd.every((u) => !u.alive)) wipes += 1;
    else if (result.winner !== "PLAYER") timeouts += 1;
  }

  actions.sort((a, b) => a - b);
  return {
    rate: wins / trials,
    enemyHpLeft: hpLeftSum / trials,
    actions: actions[Math.floor(trials / 2)],
    actionsMean: actions.reduce((a, b) => a + b, 0) / trials,
    allyHpLeft: allyHpSum / trials,
    wipeRate: wipes / trials,
    timeoutRate: timeouts / trials,
    maxPoisonOnEnemy,
    avgPoisonOnEnemy: poisonSnapshotCount > 0 ? poisonStackSum / poisonSnapshotCount : 0,
    poisonAppliedRate: poisonBattles / trials,
    poisonDamageShare: totalEnemyDamage > 0 ? poisonDamage / totalEnemyDamage : 0,
    healerDeathAction: healerDeaths > 0 ? healerDeathSum / healerDeaths : null,
    healerDeathRate: healerDeaths / trials,
    poisonCarryDeathAction: poisonDeaths > 0 ? poisonDeathSum / poisonDeaths : null,
    poisonCarryDeathRate: poisonDeaths / trials,
  };
}

export interface TeamStatSummary {
  label: string;
  stats: Stats;
}

/** GearGradeに乱数幅があるため、最終ステータスは同じseed群の平均を返す。 */
export function summarizeTeamStats(team: PressureTeam, gear: GearGrade, trials = 200, seedBase = 20260913): TeamStatSummary[] {
  const sums = team.allies.map(() => ({ hp: 0, atk: 0, def: 0, spd: 0, criRate: 0, criDmg: 0, resistance: 0, accuracy: 0 }));
  for (let i = 0; i < trials; i += 1) {
    const rng = mulberry32(seedBase + i);
    team.allies.map((spec) => buildAlly(spec, rng, gear)).forEach((def, index) => {
      for (const key of Object.keys(sums[index]) as (keyof Stats)[]) sums[index][key] += def.stats[key];
    });
  }
  return sums.map((sum, index) => ({
    label: team.allies[index].label ?? `${team.allies[index].templateId}[${team.allies[index].element}]`,
    stats: Object.fromEntries(Object.entries(sum).map(([key, value]) => [key, value / trials])) as unknown as Stats,
  }));
}

if (process.argv[1]?.endsWith("dungeonPressure.ts")) {
  const argv = process.argv.slice(2);
  const gearIndex = argv.indexOf("--gear");
  const gear = (gearIndex >= 0 ? argv[gearIndex + 1] : "STRONG") as GearGrade;
  const floors = argv.filter((value, index) => index !== gearIndex && index !== gearIndex + 1).map(Number).filter(Number.isFinite);
  for (const f of floors.length > 0 ? floors : [7, 8, 9, 10]) {
    console.log(`\n=== ${f}階 (powerScale ${EQUIPMENT_DUNGEON_FLOORS[f - 1].powerScale.toFixed(3)} / ${gear}) ===`);
    for (const [name, team] of Object.entries(PVE_DUNGEON_TEAMS)) {
      const r = measurePressure(team, f, gear);
      console.log(`${name}: 勝率${(r.rate * 100).toFixed(0)}% 敵残${(r.enemyHpLeft * 100).toFixed(1)}% 手数${r.actions} 最大毒${r.maxPoisonOnEnemy}`);
    }
  }
}
