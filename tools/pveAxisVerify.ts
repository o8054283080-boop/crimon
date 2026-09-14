/**
 * 新防御式1.2で、毒と防御無視だけが攻略高レアから突出しないかを測る。
 *
 * 本番データは変更しない。毒無効・毒上限・防御無視率は、buildAlly()が作った
 * 1戦分の写しとBattleEngineインスタンスだけへ適用する。
 *
 *   node --import tsx tools/pveAxisVerify.ts --runs 200
 */
import { setBalanceFlags } from "../src/battle/balanceFlags.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { AWAKENING_DEPTH_FLOORS } from "../src/data/awakeningDepths.js";
import type { EquipmentDungeonKind } from "../src/data/equipmentDungeon.js";
import {
  AWAKENING_PVE_TEAMS,
  PVE_DUNGEON_TEAMS,
  measurePressure,
  measurePressureOnFloor,
  type PressureControls,
  type PressureResult,
  type PressureTeam,
} from "./dungeonPressure.js";
import type { GearGrade } from "./battleLab/types.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const RUNS = Number(arg("runs", "200"));
const ONLY = arg("only", "all");
const SEED = Number(arg("seed", "20260913"));

interface EnemyScale { hp: number; def: number; atk: number }
interface ContentConfig {
  key: "demon" | "beast" | "awakening";
  title: string;
  kind?: EquipmentDungeonKind;
  floors: number[];
  scale: EnemyScale;
  optimized: PressureTeam;
}

const CONTENTS: ContentConfig[] = [
  {
    key: "demon", title: "魔人", kind: "DEMON", floors: [10, 11, 12],
    scale: { hp: 0.8, def: 0.3, atk: 2.2 },
    optimized: PVE_DUNGEON_TEAMS["魔人攻略高レア(光フェアリー)"],
  },
  {
    key: "beast", title: "魔獣", kind: "BEAST", floors: [10, 11, 12],
    scale: { hp: 0.8, def: 0.3, atk: 2.0 },
    optimized: PVE_DUNGEON_TEAMS["魔獣攻略高レア(水フェニックス)"],
  },
  {
    key: "awakening", title: "目覚め", floors: [8, 9, 10],
    scale: { hp: 0.8, def: 0.3, atk: 2.2 },
    optimized: AWAKENING_PVE_TEAMS["高レアバランス型(水フェニックス)"],
  },
];

const POISON = PVE_DUNGEON_TEAMS["実戦毒"];
const IGNORE = PVE_DUNGEON_TEAMS["防御無視"];
const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const n0 = (value: number): string => value.toFixed(0);

function patchEnemyDefs(defs: MonsterDefinition[], scale: EnemyScale): MonsterDefinition[] {
  return defs.map((def) => ({
    ...def,
    stats: {
      ...def.stats,
      hp: Math.max(1, Math.round(def.stats.hp * scale.hp)),
      def: Math.max(0, Math.round(def.stats.def * scale.def)),
      atk: Math.max(0, Math.round(def.stats.atk * scale.atk)),
    },
  }));
}

function measure(
  content: ContentConfig,
  floor: number,
  team: PressureTeam,
  gear: GearGrade,
  formula: "legacy" | "sw",
  scale: EnemyScale,
  controls: PressureControls = {},
): PressureResult {
  setBalanceFlags({ defenseFormula: formula, unifyDefModifiers: false, swRatio: 1.2 });
  const patch = formula === "legacy" ? undefined : (defs: MonsterDefinition[]) => patchEnemyDefs(defs, scale);
  if (content.kind) {
    return measurePressure(team, floor, gear, RUNS, content.kind, SEED, patch, controls);
  }
  const depthFloor = AWAKENING_DEPTH_FLOORS[floor - 1];
  if (!depthFloor) throw new Error(`目覚の深域${floor}Fが見つからない`);
  return measurePressureOnFloor(team, depthFloor, gear, RUNS, SEED, patch, controls);
}

function summary(result: PressureResult): string {
  return `勝${pct(result.rate)} 中${result.actions} 平${n0(result.actionsMean)} ` +
    `敵${pct(result.enemyHpLeft)} 味${pct(result.allyHpLeft)} 全${pct(result.wipeRate)} 時${pct(result.timeoutRate)}`;
}

function poisonSummary(result: PressureResult): string {
  return `${summary(result)} 毒戦${pct(result.poisonAppliedRate)} ` +
    `毒平均${result.avgPoisonOnEnemy.toFixed(2)} 最大${result.maxPoisonOnEnemy} ` +
    `毒総${n0(result.poisonDamageTotal)} 毒/戦${n0(result.poisonDamageMean)} ` +
    `毒比${pct(result.poisonDamageShare)} ボス毒比${pct(result.bossPoisonDamageShare)} ` +
    `毒主力死${pct(result.poisonCarryDeathRate)} 回復死${pct(result.healerDeathRate)}`;
}

function printHeader(title: string): void {
  console.log(`\n${"═".repeat(110)}\n■ ${title}\n${"═".repeat(110)}`);
}

function runContent(content: ContentConfig): void {
  printHeader(`${content.title} / STRONG / 各${RUNS}戦 / seed ${SEED}`);
  for (const floor of content.floors) {
    console.log(`\n  ── ${floor}F 攻略高レア・実戦毒・防御無視（旧式 / 新式C） ──`);
    for (const [name, team] of [["攻略高レア", content.optimized], ["実戦毒", POISON], ["防御無視", IGNORE]] as const) {
      const legacy = measure(content, floor, team, "STRONG", "legacy", { hp: 1, def: 1, atk: 1 });
      const redesigned = measure(content, floor, team, "STRONG", "sw", content.scale);
      console.log(`  ${name.padEnd(8)} 旧 ${summary(legacy)}`);
      console.log(`  ${"".padEnd(8)} C  ${summary(redesigned)}`);
      if (name === "実戦毒") console.log(`             ${poisonSummary(redesigned)}`);
    }

    console.log(`\n  ── ${floor}F 毒ダメージ・上限感度（新式C） ──`);
    for (const [label, controls] of [
      ["毒あり・上限5", { poisonDamageEnabled: true, poisonStackCap: 5 }],
      ["毒ダメージ無効", { poisonDamageEnabled: false, poisonStackCap: 5 }],
      ["毒あり・上限4", { poisonDamageEnabled: true, poisonStackCap: 4 }],
      ["毒あり・上限3", { poisonDamageEnabled: true, poisonStackCap: 3 }],
    ] as const) {
      console.log(`  ${label.padEnd(10)} ${poisonSummary(measure(content, floor, POISON, "STRONG", "sw", content.scale, controls))}`);
    }

    console.log(`\n  ── ${floor}F 防御無視率感度（新式C） ──`);
    for (const ignoreDefenseScale of [1, 0.75, 0.5]) {
      const result = measure(content, floor, IGNORE, "STRONG", "sw", content.scale, { ignoreDefenseScale });
      console.log(`  現在値×${ignoreDefenseScale.toFixed(2)} ${summary(result)}`);
    }
  }

  const topFloor = content.floors.at(-1)!;
  printHeader(`${content.title}${topFloor}F / 敵DEF感度（HP×${content.scale.hp}, ATK×${content.scale.atk}固定・STRONG）`);
  for (const def of [0.2, 0.3, 0.4, 0.5, 0.75, 1]) {
    const scale = { ...content.scale, def };
    const optimized = measure(content, topFloor, content.optimized, "STRONG", "sw", scale);
    const poison = measure(content, topFloor, POISON, "STRONG", "sw", scale);
    const ignore = measure(content, topFloor, IGNORE, "STRONG", "sw", scale);
    console.log(`  DEF×${def.toFixed(2)} 攻略 ${summary(optimized)} / 毒 ${summary(poison)} / 無視 ${summary(ignore)}`);
  }

  printHeader(`${content.title}${topFloor}F / TYPICAL（各${RUNS}戦）`);
  for (const [name, team] of [["攻略高レア", content.optimized], ["実戦毒", POISON], ["防御無視", IGNORE]] as const) {
    const legacy = measure(content, topFloor, team, "TYPICAL", "legacy", { hp: 1, def: 1, atk: 1 });
    const redesigned = measure(content, topFloor, team, "TYPICAL", "sw", content.scale);
    console.log(`  ${name.padEnd(8)} 旧 ${summary(legacy)}`);
    console.log(`  ${"".padEnd(8)} C  ${summary(redesigned)}`);
  }
}

console.log(`PvE攻略軸検証 / 新式=1000/(1000+1.2*DEF) / 各${RUNS}戦 / 同一seed群`);
for (const content of CONTENTS.filter((entry) => ONLY === "all" || ONLY === entry.key)) runContent(content);
setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false, swRatio: 1.2 });
console.log("\n検証終了。防御式フラグは旧式へ復帰済み。");
