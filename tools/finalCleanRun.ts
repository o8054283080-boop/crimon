/**
 * **最終確定候補だけ**で全コンテンツを測る、1枚にまとめるための実行。
 *
 *   npx tsx tools/finalCleanRun.ts --runs 200
 *   npx tsx tools/finalCleanRun.ts --only tower --runs 200
 *
 * 途中候補（防御低下50%/70%・DEFタイプ1.42・基礎DEF一律補正・旧PvE倍率など）は
 * **一切混ぜない。**ここで使うのは `finalCandidate.ts` の値と、下の `FLOOR_SCALE` だけ。
 *
 * 本番データは1つも変えない。`balanceFlags` に載せて測り、測定のたびに戻す。
 *
 * ## プレイヤー側162個体はこのツールで測らない
 *
 * `tools/playerTypeAbilityAudit.ts` が正。あちらは HP特化・DEF特化とも
 * **VITALITY4+GUARD2 で装備をそろえ、潜在覚醒を外して**いるので、
 * タイプ転生と能力付与の効果だけを切り出せる。
 */
import { balanceFlags, resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { AWAKENING_DEPTH_FLOORS } from "../src/data/awakeningDepths.js";
import {
  AWAKENING_PVE_TEAMS, PVE_DUNGEON_TEAMS, type PressureResult, type PressureTeam,
  measurePressure, measurePressureOnFloor,
} from "./dungeonPressure.js";
import { runMany } from "./battleLab/run.js";
import { findScenario } from "./battleLab/scenarios/index.js";
import type { GearGrade, Scenario } from "./battleLab/types.js";
import { FINAL_CANDIDATE } from "./finalCandidate.js";

const argv = process.argv.slice(2);
const arg = (n: string, f: string): string => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : f;
};
const RUNS = Number(arg("runs", "200"));
const ONLY = arg("only", "all");
const SEED = 20260913;

interface Scale { hp: number; def: number; atk: number }
const NONE: Scale = { hp: 1, def: 1, atk: 1 };

/**
 * 階ごとの敵倍率。**確定しているものだけ**を書く。
 * 塔60/80/99階は倍率の指定が無いので素のまま（`NONE`）で測る。
 */
const FLOOR_SCALE: Record<string, Scale> = {
  "tower-f60": NONE,
  "tower-f70": { hp: 0.95, def: 0.40, atk: 2.60 },
  "tower-f80": NONE,
  "tower-f90": { hp: 0.70, def: 0.25, atk: 2.50 },
  "tower-f99": NONE,
  "tower-f100": { hp: 1.00, def: 0.30, atk: 2.50 },
};
const DEMON_SCALE: Scale = { hp: 0.80, def: 0.30, atk: 2.20 };
/**
 * 魔人11Fだけの上乗せ（候補Q）。10F→11F→12Fの段差を埋めるために決めた値。
 * 魔人のATKだけを1.45倍にし、クリスタルはHP160,000・SPD170へ。
 * **クリスタルのATKは触らない**(11・12階とも10階の実効値で揃える設計)。
 */
const DEMON_F11: { bossHp: number; bossAtk: number; crystalHp: number; crystalSpd: number } =
  { bossHp: 1.10, bossAtk: 1.45, crystalHp: 160_000, crystalSpd: 170 };
const BEAST_SCALE: Scale = { hp: 0.80, def: 0.30, atk: 2.00 };
const AWAKENING_SCALE: Scale = { hp: 0.80, def: 0.30, atk: 2.20 };

const patchOf = (s: Scale) => (defs: MonsterDefinition[]): MonsterDefinition[] => defs.map((d) => ({
  ...d,
  stats: {
    ...d.stats,
    hp: Math.max(1, Math.round(d.stats.hp * s.hp)),
    def: Math.max(1, Math.round(d.stats.def * s.def)),
    atk: Math.max(1, Math.round(d.stats.atk * s.atk)),
  },
}));

function scaledScenario(id: string, s: Scale): Scenario {
  const b = findScenario(id);
  if (!b) throw new Error(`シナリオがない: ${id}`);
  if (s === NONE) return b;
  return {
    ...b,
    enemies: b.enemies.map((e) => ({
      ...e,
      stats: e.stats
        ? {
          ...e.stats,
          hp: Math.max(1, Math.round((e.stats.hp ?? 1) * s.hp)),
          def: Math.max(1, Math.round((e.stats.def ?? 1) * s.def)),
          atk: Math.max(1, Math.round((e.stats.atk ?? 1) * s.atk)),
        }
        : e.stats,
    })),
  } as Scenario;
}

interface Row { win: number; turnsMedian: number; turnsMean: number; wipe: number; timeout: number; enemyLeft: number; allyLeft: number }

const toRow = (r: PressureResult): Row => ({
  win: r.rate, turnsMedian: r.actions, turnsMean: r.actionsMean,
  wipe: r.wipeRate, timeout: r.timeoutRate, enemyLeft: r.enemyHpLeft, allyLeft: r.allyHpLeft,
});

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function show(label: string, r: Row): void {
  console.log(
    `  ${label.padEnd(30)} 勝率${pct(r.win).padStart(5)}  手数 中${String(r.turnsMedian).padStart(3)}/平${r.turnsMean.toFixed(0).padStart(3)}  ` +
    `全滅${pct(r.wipe).padStart(4)}  時間切${pct(r.timeout).padStart(4)}  敵残${pct1(r.enemyLeft).padStart(6)}  味方残${pct1(r.allyLeft).padStart(6)}`,
  );
}

/** 最終候補を載せて測り、必ず戻す */
function final<T>(fn: () => T): T {
  resetBalanceFlags();
  setBalanceFlags(FINAL_CANDIDATE);
  const out = fn();
  resetBalanceFlags();
  return out;
}

function header(t: string): void { console.log(`\n${"═".repeat(104)}\n■ ${t}\n${"═".repeat(104)}`); }

function towerRow(s: Scenario, gear: GearGrade): Row {
  const t = runMany(s, SEED, RUNS, undefined, gear);
  let wins = 0, wipe = 0, timeout = 0, eLeft = 0, aLeft = 0;
  const turns: number[] = [];
  for (const x of t) {
    if (x.winner === "PLAYER") wins += 1;
    turns.push(x.turns);
    const es = x.units.filter((u) => u.team === "ENEMY");
    const as = x.units.filter((u) => u.team === "PLAYER");
    const eMax = es.reduce((a, u) => a + u.maxHp, 0);
    const aMax = as.reduce((a, u) => a + u.maxHp, 0);
    eLeft += eMax > 0 ? es.reduce((a, u) => a + Math.max(0, u.hpLeft), 0) / eMax : 0;
    aLeft += aMax > 0 ? as.reduce((a, u) => a + Math.max(0, u.hpLeft), 0) / aMax : 0;
    if (as.every((u) => !u.alive)) wipe += 1;
    else if (x.winner !== "PLAYER") timeout += 1;
  }
  turns.sort((a, b) => a - b);
  const n = t.length;
  return {
    win: wins / n, turnsMedian: turns[Math.floor(n / 2)], turnsMean: turns.reduce((a, b) => a + b, 0) / n,
    wipe: wipe / n, timeout: timeout / n, enemyLeft: eLeft / n, allyLeft: aLeft / n,
  };
}

function runTower(): void {
  header(`試練の塔 / ${RUNS}戦・装備STRONG・seed${SEED}・階固有ギミック有効`);
  for (const floor of [60, 70, 80, 90, 99, 100]) {
    const id = `tower-f${floor}`;
    const s = FLOOR_SCALE[id];
    const tag = s === NONE ? "敵は素のまま(倍率の指定なし)" : `HP×${s.hp.toFixed(2)} DEF×${s.def.toFixed(2)} ATK×${s.atk.toFixed(2)}`;
    show(`${floor}階 ${tag}`, final(() => towerRow(scaledScenario(id, s), "STRONG")));
  }
}

/** 攻略高レアは指定どおり**水フェニックス入りだけ**を使う(他の版は混ぜない) */
function teamsFor(kind: "DEMON" | "BEAST"): [string, PressureTeam][] {
  const names = ["実戦通常", "実戦毒", "実戦耐久", "共通高レア",
    kind === "DEMON" ? "魔人攻略高レア(水フェニックス)" : "魔獣攻略高レア(水フェニックス)", "防御無視"];
  return names.map((n) => [n, PVE_DUNGEON_TEAMS[n]]).filter(([, t]) => t) as [string, PressureTeam][];
}

/** 魔人11Fだけ、確定倍率の上に候補Qを重ねる */
function demonF11Patch(s: Scale) {
  return (defs: MonsterDefinition[]): MonsterDefinition[] => defs.map((d, i) => {
    const isBoss = i === 0, isCrystal = i === 1;
    return { ...d, stats: {
      ...d.stats,
      hp: isCrystal ? DEMON_F11.crystalHp
        : Math.max(1, Math.round(d.stats.hp * s.hp * (isBoss ? DEMON_F11.bossHp : 1))),
      spd: isCrystal ? DEMON_F11.crystalSpd : d.stats.spd,
      def: Math.max(1, Math.round(d.stats.def * s.def)),
      atk: Math.max(1, Math.round(d.stats.atk * s.atk * (isBoss ? DEMON_F11.bossAtk : 1))),
    } };
  });
}

function runDungeon(kind: "DEMON" | "BEAST"): void {
  const s = kind === "DEMON" ? DEMON_SCALE : BEAST_SCALE;
  const patch = patchOf(s);
  const jp = kind === "DEMON" ? "魔人" : "魔獣";
  header(`${jp}のダンジョン / ${RUNS}戦・敵 HP×${s.hp} DEF×${s.def} ATK×${s.atk}`);
  for (const floor of [10, 11, 12]) {
    console.log(`  ── ${floor}階 / STRONG ──`);
    const usePatch = kind === "DEMON" && floor === 11 ? demonF11Patch(s) : patch;
    for (const [name, team] of teamsFor(kind)) {
      show(name, final(() => toRow(measurePressure(team, floor, "STRONG", RUNS, kind, SEED, usePatch))));
    }
    if (floor === 12) {
      console.log(`  ── 12階 / TYPICAL ──`);
      for (const [name, team] of teamsFor(kind)) {
        show(name, final(() => toRow(measurePressure(team, floor, "TYPICAL", RUNS, kind, SEED, usePatch))));
      }
    }
  }
}

function runAwakening(): void {
  const patch = patchOf(AWAKENING_SCALE);
  header(`目覚の深域 / ${RUNS}戦・敵 HP×${AWAKENING_SCALE.hp} DEF×${AWAKENING_SCALE.def} ATK×${AWAKENING_SCALE.atk}`);
  // 「実戦毒」「防御無視」は目覚側に定義が無いので、ダンジョン側の同名編成を借りる
  const teams: [string, PressureTeam][] = [
    ["集中型", AWAKENING_PVE_TEAMS["集中型"]],
    ["分散型", AWAKENING_PVE_TEAMS["分散型"]],
    ["耐久型", AWAKENING_PVE_TEAMS["耐久型"]],
    ["共通高レア", AWAKENING_PVE_TEAMS["共通高レア"]],
    ["攻略高レア(水フェニックス)", AWAKENING_PVE_TEAMS["高レアバランス型(水フェニックス)"]],
    ["実戦毒", PVE_DUNGEON_TEAMS["実戦毒"]],
    ["防御無視", PVE_DUNGEON_TEAMS["防御無視"]],
  ].filter(([, t]) => t) as [string, PressureTeam][];
  for (const floor of [8, 9, 10]) {
    console.log(`  ── ${floor}階 / STRONG ──`);
    const def = AWAKENING_DEPTH_FLOORS[floor - 1];
    for (const [name, team] of teams) {
      show(name, final(() => toRow(measurePressureOnFloor(team, def, "STRONG", RUNS, SEED, patch))));
    }
    if (floor === 10) {
      console.log(`  ── 10階 / TYPICAL ──`);
      for (const [name, team] of teams) {
        show(name, final(() => toRow(measurePressureOnFloor(team, def, "TYPICAL", RUNS, SEED, patch))));
      }
    }
  }
}

/** 防御低下75%の効き。**同じ編成のまま率だけ変える**(編成を変えると質の差が混ざる) */
function runDefDown(): void {
  header(`防御低下の効き / 同じ「共通高レア」編成のまま率だけ変える / ${RUNS}戦・STRONG`);
  const team = PVE_DUNGEON_TEAMS["共通高レア"];
  const cases: [string, (r: number) => Row][] = [
    ["魔人12階", (r) => { resetBalanceFlags(); setBalanceFlags({ ...FINAL_CANDIDATE, defDownRate: r }); const x = toRow(measurePressure(team, 12, "STRONG", RUNS, "DEMON", SEED, patchOf(DEMON_SCALE))); resetBalanceFlags(); return x; }],
    ["魔獣12階", (r) => { resetBalanceFlags(); setBalanceFlags({ ...FINAL_CANDIDATE, defDownRate: r }); const x = toRow(measurePressure(team, 12, "STRONG", RUNS, "BEAST", SEED, patchOf(BEAST_SCALE))); resetBalanceFlags(); return x; }],
    ["目覚10階", (r) => { resetBalanceFlags(); setBalanceFlags({ ...FINAL_CANDIDATE, defDownRate: r }); const x = toRow(measurePressureOnFloor(team, AWAKENING_DEPTH_FLOORS[9], "STRONG", RUNS, SEED, patchOf(AWAKENING_SCALE))); resetBalanceFlags(); return x; }],
    ["塔100階", (r) => { resetBalanceFlags(); setBalanceFlags({ ...FINAL_CANDIDATE, defDownRate: r }); const x = towerRow(scaledScenario("tower-f100", FLOOR_SCALE["tower-f100"]), "STRONG"); resetBalanceFlags(); return x; }],
  ];
  for (const [label, run] of cases) {
    console.log(`  ── ${label} ──`);
    for (const rate of [0, 0.5, 0.75]) {
      show(rate === 0 ? "防御低下なし(0%)" : `防御低下${rate * 100}%`, run(rate));
    }
    console.log("");
  }
}

console.log(`最終クリーン測定 / ${RUNS}戦 / seed${SEED}`);
console.log(`確定候補: ${JSON.stringify(FINAL_CANDIDATE)}`);
console.log(`塔60/80/99階は敵倍率の指定が無いため素のまま。70/90/100階と各ダンジョンは確定値を使用\n`);

if (ONLY === "all" || ONLY === "tower") runTower();
if (ONLY === "all" || ONLY === "demon") runDungeon("DEMON");
if (ONLY === "all" || ONLY === "beast") runDungeon("BEAST");
if (ONLY === "all" || ONLY === "awakening") runAwakening();
if (ONLY === "all" || ONLY === "defdown") runDefDown();

resetBalanceFlags();
console.log(`\n終了時のフラグ: ${JSON.stringify(balanceFlags)}`);
