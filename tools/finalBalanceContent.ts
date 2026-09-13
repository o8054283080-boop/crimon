/**
 * **最終候補を全部まとめて当てた状態**で、塔・魔人・魔獣・目覚の深域を測る。
 *
 *   npx tsx tools/finalBalanceContent.ts --runs 200
 *   npx tsx tools/finalBalanceContent.ts --only tower --runs 200
 *
 * 本番データは1つも変えない。`balanceFlags` に仮適用し、敵の倍率はこのファイルの中で
 * 掛けてから戦わせる。終わったら必ず元へ戻す。
 *
 * ## 編成は `buildAlly` で組む
 *
 * `dungeonPressure.ts` の編成は `createMonsterInstance` で作るため、
 * **タイプ転生も能力付与も既定のまま**になる。今回はその2つを動かすのが主題なので、
 * プリセットで型とAP配分を持つ `buildAlly` 側に統一した。
 */
import { balanceFlags, resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import { BattleEngine } from "../src/battle/engine.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { AWAKENING_DEPTH_FLOORS } from "../src/data/awakeningDepths.js";
import { findDungeonFloor } from "../src/data/equipmentDungeon.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import { runMany } from "./battleLab/run.js";
import { findScenario } from "./battleLab/scenarios/index.js";
import type { AllySpec, GearGrade } from "./battleLab/types.js";
import { FINAL_CANDIDATE } from "./finalBalanceAudit.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const RUNS = Number(arg("runs", "200"));
const ONLY = arg("only", "all");

/** 旧仕様 = いまの本番。防御式・タイプ・AP・防御低下50%、すべて現行 */
const LEGACY = { defenseFormula: "legacy" as const, unifyDefModifiers: false };

/**
 * 敵側の倍率。**依頼で指定された値**で、こちらが測って出した候補ではない。
 * 塔は指定が無いので素のまま測る。
 */
const ENEMY_SCALE = {
  DEMON: { hp: 0.80, def: 0.30, atk: 2.20 },
  BEAST: { hp: 0.80, def: 0.30, atk: 2.00 },
  AWAKENING: { hp: 0.80, def: 0.30, atk: 2.20 },
};

function scaleEnemies(defs: MonsterDefinition[], s: { hp: number; def: number; atk: number }): MonsterDefinition[] {
  return defs.map((d) => ({
    ...d,
    stats: {
      ...d.stats,
      hp: Math.max(1, Math.round(d.stats.hp * s.hp)),
      def: Math.max(1, Math.round(d.stats.def * s.def)),
      atk: Math.max(1, Math.round(d.stats.atk * s.atk)),
    },
  }));
}

const A = (templateId: string, element: string, preset: string, label?: string): AllySpec =>
  ({ templateId, element, preset, label } as AllySpec);

/**
 * 比べる編成。**「攻略高レア」は挑む相手の弱点属性へ寄せたもの**で、
 * 「共通高レア」は相手を選ばない汎用。分けないと、属性を当てた強さと
 * 編成そのものの強さが混ざる。
 */
const TEAMS: Record<string, AllySpec[]> = {
  // 通常モンスターだけで役割を分けた「本気の通常編成」
  "実戦通常": [
    A("knight", "WATER", "MAX_ATTACKER"), A("wolf", "GRASS", "MAX_ATTACKER"),
    A("imp", "ELECTRIC", "MAX_DEBUFFER"), A("fairy", "WATER", "MAX_SUPPORT"), A("wisp", "GRASS", "MAX_HEALER"),
  ],
  // **毒を実際に持つ個体で組む。**持たない3体を「毒編成」として測って嘘の結論を出した前例がある
  "実戦毒": [
    A("scorpion", "DARK", "MAX_DEBUFFER"), A("mushroon", "GRASS", "MAX_DEBUFFER"),
    A("slime", "DARK", "MAX_DEBUFFER"), A("abyssreaper", "LIGHT", "MAX_ATTACKER"), A("wisp", "WATER", "MAX_HEALER"),
  ],
  // 耐久。**削り役を必ず1体入れる**(殴る手の無い編成で測ると嘘が出る)
  "実戦耐久": [
    A("golem", "LIGHT", "MAX_TANK"), A("treant", "LIGHT", "MAX_TANK"),
    A("shellturtle", "WATER", "MAX_TANK"), A("seraph", "LIGHT", "MAX_HEALER"), A("dragon", "FIRE", "MAX_ATTACKER"),
  ],
  "共通高レア": [
    A("griffon", "GRASS", "MAX_ATTACKER"), A("dragon", "FIRE", "MAX_ATTACKER"),
    A("seraph", "WATER", "MAX_HEALER"), A("nemesis", "ELECTRIC", "MAX_DEBUFFER"), A("chronos", "ELECTRIC", "MAX_SPEED"),
  ],
  // **防御無視を実際に持つ個体だけで組む。**新式では軽減が一律に強いので、
  // 防御を抜く手段がどれだけ効くかは専用の編成で見ないと分からない
  "防御無視確認": [
    A("wolf", "FIRE", "MAX_ATTACKER"), A("fenrir", "FIRE", "MAX_ATTACKER"),
    A("kobold", "FIRE", "MAX_ATTACKER"), A("dragon", "DARK", "MAX_ATTACKER"), A("wisp", "WATER", "MAX_HEALER"),
  ],
};

/** 魔人は 10階=水 / 11階=電気 / 12階=草。弱点は 電気 / 草 / 火 */
const DEMON_ELITE: AllySpec[] = [
  A("dragon", "FIRE", "MAX_ATTACKER"), A("nemesis", "ELECTRIC", "MAX_ATTACKER"),
  A("griffon", "GRASS", "MAX_ATTACKER"), A("seraph", "WATER", "MAX_HEALER"), A("chronos", "ELECTRIC", "MAX_SPEED"),
];
/** 魔獣は 10階=闇 / 11階=草 / 12階=光。**水フェニックス入り**(依頼の指定) */
const BEAST_ELITE: AllySpec[] = [
  A("phoenix", "WATER", "MAX_ATTACKER"), A("seraph", "LIGHT", "MAX_ATTACKER"),
  A("dragon", "DARK", "MAX_ATTACKER"), A("wisp", "WATER", "MAX_HEALER"), A("chronos", "ELECTRIC", "MAX_SPEED"),
];
/** 目覚の深域。才能適応が乗り切らないよう攻撃役を分ける */
const AWAKENING_ELITE: AllySpec[] = [
  A("phoenix", "FIRE", "MAX_ATTACKER"), A("griffon", "GRASS", "MAX_ATTACKER"),
  A("nemesis", "ELECTRIC", "MAX_ATTACKER"), A("seraph", "LIGHT", "MAX_HEALER"), A("chronos", "ELECTRIC", "MAX_SPEED"),
];
/** 目覚の深域は既存の3編成も測る */
const AWAKENING_BASE: Record<string, AllySpec[]> = {
  "集中": [A("dragon", "FIRE", "MAX_ATTACKER"), A("wisp", "WATER", "MAX_HEALER"), A("golem", "GRASS", "MAX_TANK"), A("fairy", "LIGHT", "MAX_SUPPORT")],
  "分散": [A("dragon", "FIRE", "MAX_ATTACKER"), A("wolf", "ELECTRIC", "MAX_ATTACKER"), A("knight", "WATER", "MAX_ATTACKER"), A("wisp", "WATER", "MAX_HEALER")],
  "耐久": [A("golem", "GRASS", "MAX_TANK"), A("seraph", "LIGHT", "MAX_HEALER"), A("wisp", "WATER", "MAX_HEALER"), A("dragon", "FIRE", "MAX_ATTACKER")],
};

interface Row { win: number; enemyLeft: number; allyLeft: number; turnsMedian: number; turnsMean: number; wipe: number; timeout: number }

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function measure(specs: AllySpec[], enemies: () => MonsterDefinition[], runs: number, gear: GearGrade): Row {
  let wins = 0, eLeft = 0, aLeft = 0, wipe = 0, timeout = 0;
  const turns: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const rng = mulberry32(20260913 + i * 7919);
    const players = specs.map((s) => buildAlly(s as never, rng, gear));
    const res = new BattleEngine(players, enemies(), { rng, maxTurns: 300 }).run();
    if (res.winner === "PLAYER") wins += 1;
    turns.push(res.turnsTaken);
    const last = res.turns[res.turns.length - 1];
    const snap = last ? last.snapshot : [];
    const es = snap.filter((u) => u.team === "ENEMY");
    const as = snap.filter((u) => u.team === "PLAYER");
    const eMax = es.reduce((s, u) => s + u.maxHp, 0);
    const aMax = as.reduce((s, u) => s + u.maxHp, 0);
    eLeft += eMax > 0 ? es.reduce((s, u) => s + Math.max(0, u.currentHp), 0) / eMax : 0;
    aLeft += aMax > 0 ? as.reduce((s, u) => s + Math.max(0, u.currentHp), 0) / aMax : 0;
    if (as.length > 0 && as.every((u) => !u.alive)) wipe += 1;
    else if (res.winner !== "PLAYER") timeout += 1;
  }
  turns.sort((a, b) => a - b);
  return {
    win: wins / runs, enemyLeft: eLeft / runs, allyLeft: aLeft / runs,
    turnsMedian: turns[Math.floor(runs / 2)], turnsMean: turns.reduce((a, b) => a + b, 0) / runs,
    wipe: wipe / runs, timeout: timeout / runs,
  };
}

function printPair(label: string, legacy: Row, candidate: Row): void {
  const dWin = (candidate.win - legacy.win) * 100;
  const dTurn = legacy.turnsMedian > 0 ? (candidate.turnsMedian / legacy.turnsMedian - 1) * 100 : 0;
  const flag = Math.abs(dWin) >= 10 || Math.abs(dTurn) >= 20 ? " ⚠要調整" : "";
  for (const [key, r] of [["旧仕様", legacy], ["最終候補", candidate]] as [string, Row][]) {
    console.log(
      `  ${label.padEnd(18)} ${key.padEnd(8)} 勝率${pct(r.win).padStart(5)}  敵残${pct1(r.enemyLeft).padStart(6)}  味方残${pct1(r.allyLeft).padStart(6)}  ` +
      `手数 中${String(r.turnsMedian).padStart(3)}/平${r.turnsMean.toFixed(0).padStart(3)}  全滅${pct(r.wipe).padStart(4)}  時間切${pct(r.timeout).padStart(4)}`,
    );
  }
  console.log(`  ${" ".repeat(18)} 差       勝率 ${dWin >= 0 ? "+" : ""}${dWin.toFixed(0)}pt / 手数 ${dTurn >= 0 ? "+" : ""}${dTurn.toFixed(0)}%${flag}\n`);
}

function under<T>(flags: object, fn: () => T): T {
  resetBalanceFlags();
  setBalanceFlags(flags as never);
  const out = fn();
  resetBalanceFlags();
  return out;
}

function header(title: string): void {
  console.log(`\n${"═".repeat(104)}\n■ ${title}\n${"═".repeat(104)}`);
}

// ───────────────────────────── 試練の塔 ─────────────────────────────

function towerRow(scenarioId: string, runs: number, gear: GearGrade): Row {
  const scenario = findScenario(scenarioId);
  if (!scenario) throw new Error(`シナリオがない: ${scenarioId}`);
  const t = runMany(scenario, 20260913, runs, undefined, gear);
  let wins = 0, eLeft = 0, aLeft = 0, wipe = 0, timeout = 0;
  const turns: number[] = [];
  for (const x of t) {
    if (x.winner === "PLAYER") wins += 1;
    turns.push(x.turns);
    const es = x.units.filter((u) => u.team === "ENEMY");
    const as = x.units.filter((u) => u.team === "PLAYER");
    const eMax = es.reduce((s, u) => s + u.maxHp, 0);
    const aMax = as.reduce((s, u) => s + u.maxHp, 0);
    eLeft += eMax > 0 ? es.reduce((s, u) => s + Math.max(0, u.hpLeft), 0) / eMax : 0;
    aLeft += aMax > 0 ? as.reduce((s, u) => s + Math.max(0, u.hpLeft), 0) / aMax : 0;
    if (as.every((u) => !u.alive)) wipe += 1;
    else if (x.winner !== "PLAYER") timeout += 1;
  }
  turns.sort((a, b) => a - b);
  const n = t.length;
  return {
    win: wins / n, enemyLeft: eLeft / n, allyLeft: aLeft / n,
    turnsMedian: turns[Math.floor(n / 2)], turnsMean: turns.reduce((a, b) => a + b, 0) / n,
    wipe: wipe / n, timeout: timeout / n,
  };
}

function runTower(): void {
  header(`19-20. 試練の塔 / ${RUNS}戦・装備STRONG・敵は素のまま(敵倍率の指定なし)`);
  for (const floor of [60, 70, 80, 90, 99, 100]) {
    const id = `tower-f${floor}`;
    printPair(`${floor}階`, under(LEGACY, () => towerRow(id, RUNS, "STRONG")), under(FINAL_CANDIDATE, () => towerRow(id, RUNS, "STRONG")));
  }
}

// ─────────────────── 魔人・魔獣・目覚の深域 ───────────────────

function runDungeon(kind: "DEMON" | "BEAST"): void {
  const scale = ENEMY_SCALE[kind];
  const jp = kind === "DEMON" ? "魔人" : "魔獣";
  header(`${kind === "DEMON" ? "21" : "22"}. ${jp}のダンジョン / ${RUNS}戦・装備STRONG・敵 HP×${scale.hp} DEF×${scale.def} ATK×${scale.atk}`);
  const teams: Record<string, AllySpec[]> = { ...TEAMS, [`${jp}攻略高レア`]: kind === "DEMON" ? DEMON_ELITE : BEAST_ELITE };
  for (const floor of [10, 11, 12]) {
    console.log(`  ── ${floor}階 ──`);
    const enemies = () => scaleEnemies(buildDungeonEnemyTeam(findDungeonFloor(floor, kind)!), scale);
    for (const [name, specs] of Object.entries(teams)) {
      printPair(name, under(LEGACY, () => measure(specs, enemies, RUNS, "STRONG")), under(FINAL_CANDIDATE, () => measure(specs, enemies, RUNS, "STRONG")));
    }
    if (floor === 12) {
      console.log(`  ── 12階 / 装備TYPICAL(項目27) ──`);
      for (const [name, specs] of Object.entries(teams)) {
        printPair(`${name}(TYPICAL)`, under(LEGACY, () => measure(specs, enemies, RUNS, "TYPICAL")), under(FINAL_CANDIDATE, () => measure(specs, enemies, RUNS, "TYPICAL")));
      }
    }
  }
}

function runAwakening(): void {
  const scale = ENEMY_SCALE.AWAKENING;
  header(`23. 目覚の深域 / ${RUNS}戦・装備STRONG・敵 HP×${scale.hp} DEF×${scale.def} ATK×${scale.atk}`);
  const teams: Record<string, AllySpec[]> = {
    "実戦通常": TEAMS["実戦通常"], ...AWAKENING_BASE,
    "共通高レア": TEAMS["共通高レア"], "攻略高レア": AWAKENING_ELITE, "防御無視確認": TEAMS["防御無視確認"],
  };
  for (const floor of [8, 9, 10]) {
    console.log(`  ── ${floor}階 ──`);
    const enemies = () => scaleEnemies(buildDungeonEnemyTeam(AWAKENING_DEPTH_FLOORS[floor - 1]), scale);
    for (const [name, specs] of Object.entries(teams)) {
      printPair(name, under(LEGACY, () => measure(specs, enemies, RUNS, "STRONG")), under(FINAL_CANDIDATE, () => measure(specs, enemies, RUNS, "STRONG")));
    }
    if (floor === 10) {
      console.log(`  ── 10階 / 装備TYPICAL(項目27) ──`);
      for (const [name, specs] of Object.entries(teams)) {
        printPair(`${name}(TYPICAL)`, under(LEGACY, () => measure(specs, enemies, RUNS, "TYPICAL")), under(FINAL_CANDIDATE, () => measure(specs, enemies, RUNS, "TYPICAL")));
      }
    }
  }
}

// ───────── 24. 防御低下75%が強すぎないか(付ける / 付けない) ─────────

function runDefDownImpact(): void {
  header("24. 防御低下75%の効き — 防御低下を持つ編成と、持たない編成で手数を比べる");
  console.log("  **同じ最終候補のまま、編成側の防御低下の有無だけを変える。**");
  console.log("  「防御低下あり」= ドラゴン(全属性が防御低下を持つ)を含む編成\n");
  const withDown = TEAMS["共通高レア"];                       // ドラゴン・ネメシス入り
  const withoutDown = [
    A("griffon", "GRASS", "MAX_ATTACKER"), A("phoenix", "FIRE", "MAX_ATTACKER"),
    A("valkyria", "FIRE", "MAX_ATTACKER"), A("seraph", "WATER", "MAX_HEALER"), A("chronos", "ELECTRIC", "MAX_SPEED"),
  ];
  const cases: [string, () => MonsterDefinition[]][] = [
    ["魔人12階", () => scaleEnemies(buildDungeonEnemyTeam(findDungeonFloor(12, "DEMON")!), ENEMY_SCALE.DEMON)],
    ["魔獣12階", () => scaleEnemies(buildDungeonEnemyTeam(findDungeonFloor(12, "BEAST")!), ENEMY_SCALE.BEAST)],
    ["目覚10階", () => scaleEnemies(buildDungeonEnemyTeam(AWAKENING_DEPTH_FLOORS[9]), ENEMY_SCALE.AWAKENING)],
  ];
  for (const [label, enemies] of cases) {
    const on = under(FINAL_CANDIDATE, () => measure(withDown, enemies, RUNS, "STRONG"));
    const off = under(FINAL_CANDIDATE, () => measure(withoutDown, enemies, RUNS, "STRONG"));
    console.log(`  ${label}`);
    console.log(`    防御低下あり  勝率${pct(on.win).padStart(5)}  敵残${pct1(on.enemyLeft).padStart(6)}  手数 中${String(on.turnsMedian).padStart(3)}`);
    console.log(`    防御低下なし  勝率${pct(off.win).padStart(5)}  敵残${pct1(off.enemyLeft).padStart(6)}  手数 中${String(off.turnsMedian).padStart(3)}`);
    const ratio = off.turnsMedian > 0 ? on.turnsMedian / off.turnsMedian : 1;
    console.log(`    → 防御低下を入れると手数が ${(ratio * 100).toFixed(0)}% (1.0未満なら速くなっている)\n`);
  }
  // 塔100階は敵倍率なし
  const t100on = under(FINAL_CANDIDATE, () => towerRow("tower-f100", RUNS, "STRONG"));
  console.log(`  塔100階(基準編成・敵は素のまま) 勝率${pct(t100on.win)} 手数 中${t100on.turnsMedian}`);
}

// ───────────────────────────── 実行 ─────────────────────────────

console.log(`最終総合検証 / ${RUNS}戦`);
console.log(`最終候補: ${JSON.stringify(FINAL_CANDIDATE)}`);
console.log(`旧仕様: 現行の方式E・タイプ現行・AP DEF=3・防御低下はスキルごとの値のまま`);

if (ONLY === "all" || ONLY === "tower") runTower();
if (ONLY === "all" || ONLY === "demon") runDungeon("DEMON");
if (ONLY === "all" || ONLY === "beast") runDungeon("BEAST");
if (ONLY === "all" || ONLY === "awakening") runAwakening();
if (ONLY === "all" || ONLY === "defdown") runDefDownImpact();

resetBalanceFlags();
console.log(`\n終了時のフラグ: ${JSON.stringify(balanceFlags)}`);
