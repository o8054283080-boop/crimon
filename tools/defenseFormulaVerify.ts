/**
 * **防御計算を入れ替えたら、各コンテンツの難易度がどう動くか**を本編のエンジンで測る。
 *
 *   npx tsx tools/defenseFormulaVerify.ts                    # 全部
 *   npx tsx tools/defenseFormulaVerify.ts --only tower       # 塔だけ
 *   npx tsx tools/defenseFormulaVerify.ts --runs 200
 *   npx tsx tools/defenseFormulaVerify.ts --only demon --def-scan
 *
 * ## 比べる4条件
 *
 *   旧式      いまの方式E。軽減が**攻める側の攻撃力との比**で決まる
 *   新式      1000 / (1000 + 1.2 * DEF)。攻撃力を見ない
 *   再設計    新式のまま、敵だけHP/DEF/ATKを検証用に補正
 *   再設計+統一 上に加えて、防御低下を一律50%・防御上昇を一律30%へ
 *
 * ## 同じ種を使う
 *
 * 条件ごとに乱数が変わると、差が式のせいなのか引きのせいなのか分からない。
 * **どの条件も同じ seed 群から始める。**装備の生成も seed から回るので、
 * 同じ seed なら同じ装備を着けた同じ編成が、同じ敵に挑む。
 *
 * ## 勝率が張り付いても読めるようにする
 *
 * 0%や100%に張り付くと勝率からは何も分からなくなる。
 * 敵残HP・味方残HP・手数・全滅率を必ず一緒に出す(`CLAUDE.md` の「測ってから判断する」)。
 */
import { balanceFlags, setBalanceFlags } from "../src/battle/balanceFlags.js";
import { BattleEngine } from "../src/battle/engine.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { AWAKENING_DEPTH_FLOORS } from "../src/data/awakeningDepths.js";
import { findDungeonFloor } from "../src/data/equipmentDungeon.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import { runMany } from "./battleLab/run.js";
import { findScenario } from "./battleLab/scenarios/index.js";
import type { GearGrade } from "./battleLab/types.js";
import {
  PVE_DUNGEON_TEAMS,
  measurePressure,
  summarizeTeamStats,
  type PressureResult,
  type PressureTeam,
} from "./dungeonPressure.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const RUNS = Number(arg("runs", "200"));
const ONLY = arg("only", "all");
const GEAR = arg("gear", "TYPICAL") as GearGrade;
const FLOOR_FILTER = arg("floors", "").split(",").filter(Boolean).map(Number);
const TEAM_FILTER = arg("team", "");
const DEF_SCAN = argv.includes("--def-scan");
const REDESIGN_SCAN = argv.includes("--redesign-scan");
const SCAN_RUNS = Number(arg("scan-runs", "40"));

interface EnemyScale {
  hp: number;
  def: number;
  atk: number;
}

const REQUESTED_SCALE: EnemyScale = {
  hp: Number(arg("enemy-hp", "0.60")),
  def: Number(arg("enemy-def", "0.20")),
  atk: Number(arg("enemy-atk", "1.60")),
};

/** `--candidates "0.8,0.3,2;0.8,0.25,2"` で絞り込み後の複数案を一度に再測定する。 */
const CANDIDATE_SCALES = arg("candidates", "")
  .split(";")
  .filter(Boolean)
  .map((entry) => {
    const [hp, def, atk] = entry.split(",").map(Number);
    if (![hp, def, atk].every(Number.isFinite)) throw new Error(`候補倍率の形式が不正: ${entry}`);
    return { hp, def, atk };
  });

const IDENTITY_SCALE: EnemyScale = { hp: 1, def: 1, atk: 1 };

function patchEnemyDefs(defs: MonsterDefinition[], scale: EnemyScale): MonsterDefinition[] {
  return defs.map((def) => ({
    ...def,
    stats: {
      ...def.stats,
      hp: Math.max(1, Math.round(def.stats.hp * scale.hp)),
      def: Math.max(0, Math.round(def.stats.def * scale.def)),
      atk: Math.max(0, Math.round(def.stats.atk * scale.atk)),
      // SPD・クリ率・クリダメ・命中・抵抗は意図的に変更しない
    },
  }));
}

/** 比べる条件。**旧式を必ず先頭に置く**(差分の基準になる) */
const BASE_CONDITIONS = [
  { key: "A旧式", flags: { defenseFormula: "legacy" as const, unifyDefModifiers: false }, scale: IDENTITY_SCALE },
  { key: "B新式", flags: { defenseFormula: "sw" as const, unifyDefModifiers: false }, scale: IDENTITY_SCALE },
];
const CONDITIONS = CANDIDATE_SCALES.length > 0
  ? [
    ...BASE_CONDITIONS,
    ...CANDIDATE_SCALES.map((scale, index) => ({
      key: `候補${index + 1}(${scale.hp}/${scale.def}/${scale.atk})`,
      flags: { defenseFormula: "sw" as const, unifyDefModifiers: false },
      scale,
    })),
  ]
  : [
    ...BASE_CONDITIONS,
    { key: "C1再設計", flags: { defenseFormula: "sw" as const, unifyDefModifiers: false }, scale: REQUESTED_SCALE },
    { key: "C2再設計+統一", flags: { defenseFormula: "sw" as const, unifyDefModifiers: true }, scale: REQUESTED_SCALE },
  ];

interface Row {
  win: number;
  enemyLeft: number;
  allyLeft: number;
  turnsMedian: number;
  turnsMean: number;
  wipe: number;
  timeout: number;
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function printHeader(title: string): void {
  console.log(`\n${"═".repeat(96)}\n■ ${title}\n${"═".repeat(96)}`);
}

function printRows(label: string, rows: Record<string, Row>): void {
  const base = rows["A旧式"];
  for (const cond of CONDITIONS) {
    const r = rows[cond.key];
    if (!r) continue;
    const delta = cond.key === "A旧式" ? "" : ` (勝率 ${r.win >= base.win ? "+" : ""}${((r.win - base.win) * 100).toFixed(0)}pt)`;
    console.log(
      `  ${label.padEnd(22)} ${cond.key.padEnd(9)} ` +
      `勝率${pct(r.win).padStart(5)}  敵残${pct1(r.enemyLeft).padStart(6)}  味方残${pct1(r.allyLeft).padStart(6)}  ` +
      `手数 中${String(r.turnsMedian).padStart(3)}/平${r.turnsMean.toFixed(0).padStart(3)}  ` +
      `全滅${pct(r.wipe).padStart(4)}  時間切${pct(r.timeout).padStart(4)}${delta}`,
    );
  }
}

/** 条件を切り替えて測る。**必ず最後に旧式へ戻す**(測り終えた後の状態を残さない) */
function underEachCondition<T>(measure: (scale: EnemyScale) => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const cond of CONDITIONS) {
    setBalanceFlags(cond.flags);
    out[cond.key] = measure(cond.scale);
  }
  setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false });
  return out;
}

// ───────────────────────────── 試練の塔 ─────────────────────────────

function towerRow(scenarioId: string, runs: number, scale: EnemyScale = IDENTITY_SCALE): Row {
  const scenario = findScenario(scenarioId);
  if (!scenario) throw new Error(`シナリオがない: ${scenarioId}`);
  const patchedScenario = scale === IDENTITY_SCALE ? scenario : {
    ...scenario,
    enemies: scenario.enemies.map((enemy) => ({
      ...enemy,
      stats: {
        ...enemy.stats,
        hp: Math.max(1, Math.round((enemy.stats?.hp ?? 1) * scale.hp)),
        def: Math.max(0, Math.round((enemy.stats?.def ?? 0) * scale.def)),
        atk: Math.max(0, Math.round((enemy.stats?.atk ?? 0) * scale.atk)),
      },
    })),
  };
  const tallies = runMany(patchedScenario, 20260913, runs, undefined, GEAR);
  let wins = 0, enemyLeft = 0, allyLeft = 0, wipe = 0, timeout = 0;
  const turns: number[] = [];
  for (const t of tallies) {
    if (t.winner === "PLAYER") wins += 1;
    turns.push(t.turns);
    const enemies = t.units.filter((u) => u.team === "ENEMY");
    const allies = t.units.filter((u) => u.team === "PLAYER");
    const eMax = enemies.reduce((s, u) => s + u.maxHp, 0);
    const aMax = allies.reduce((s, u) => s + u.maxHp, 0);
    enemyLeft += eMax > 0 ? enemies.reduce((s, u) => s + Math.max(0, u.hpLeft), 0) / eMax : 0;
    allyLeft += aMax > 0 ? allies.reduce((s, u) => s + Math.max(0, u.hpLeft), 0) / aMax : 0;
    if (allies.every((u) => !u.alive)) wipe += 1;
    else if (t.winner !== "PLAYER") timeout += 1;
  }
  turns.sort((a, b) => a - b);
  const n = tallies.length;
  return {
    win: wins / n, enemyLeft: enemyLeft / n, allyLeft: allyLeft / n,
    turnsMedian: turns[Math.floor(n / 2)], turnsMean: turns.reduce((a, b) => a + b, 0) / n,
    wipe: wipe / n, timeout: timeout / n,
  };
}

function runTower(runs: number): void {
  printHeader(`試練の塔 / ${runs}戦・装備${GEAR}・全回復から1戦だけ`);
  for (const floor of [60, 70, 80, 90, 100].filter((value) => FLOOR_FILTER.length === 0 || FLOOR_FILTER.includes(value))) {
    printRows(`${floor}階`, underEachCondition((scale) => towerRow(`tower-f${floor}`, runs, scale)));
    console.log("");
  }
  const normalFloors = [51, 61, 71, 81, 91, 99]
    .filter((value) => FLOOR_FILTER.length === 0 || FLOOR_FILTER.includes(value));
  if (normalFloors.length > 0) console.log("  ── 通常階(節目以外) ──");
  for (const floor of normalFloors) {
    printRows(`${floor}階`, underEachCondition((scale) => towerRow(`tower-f${floor}`, runs, scale)));
    console.log("");
  }
}

// ─────────────────────── 魔人・魔獣のダンジョン ───────────────────────

function dungeonRow(
  team: PressureTeam, floor: number, kind: "DEMON" | "BEAST", runs: number,
  patchEnemies?: (defs: MonsterDefinition[]) => MonsterDefinition[],
): Row & { pressure: PressureResult } {
  const r = measurePressure(team, floor, GEAR, runs, kind, 20260913, patchEnemies);
  return {
    win: r.rate, enemyLeft: r.enemyHpLeft, allyLeft: r.allyHpLeft,
    turnsMedian: r.actions, turnsMean: r.actionsMean, wipe: r.wipeRate, timeout: r.timeoutRate,
    pressure: r,
  };
}

function printPoisonRows(rows: Record<string, Row & { pressure: PressureResult }>): void {
  for (const cond of CONDITIONS) {
    const r = rows[cond.key]?.pressure;
    if (!r) continue;
    const death = (action: number | null, rate: number) =>
      action === null ? "なし" : `${action.toFixed(0)}手(${pct(rate)})`;
    console.log(
      `    毒詳細 ${cond.key}: 最大${r.maxPoisonOnEnemy} 平均${r.avgPoisonOnEnemy.toFixed(2)} ` +
      `付与戦${pct(r.poisonAppliedRate)} 毒ダメ比${pct1(r.poisonDamageShare)} ` +
      `回復役死亡${death(r.healerDeathAction, r.healerDeathRate)} ` +
      `毒主力死亡${death(r.poisonCarryDeathAction, r.poisonCarryDeathRate)}`,
    );
  }
}

function runDungeon(kind: "DEMON" | "BEAST", runs: number): void {
  printHeader(`${kind === "DEMON" ? "魔人" : "魔獣"}のダンジョン / ${runs}戦・BattleLab装備${GEAR}`);
  for (const floor of [10, 11, 12].filter((value) => FLOOR_FILTER.length === 0 || FLOOR_FILTER.includes(value))) {
    console.log(`  ── ${floor}階 ──`);
    for (const [name, team] of Object.entries(PVE_DUNGEON_TEAMS)) {
      if (TEAM_FILTER && name !== TEAM_FILTER) continue;
      const rows = underEachCondition((scale) => dungeonRow(
        team, floor, kind, runs,
        scale === IDENTITY_SCALE ? undefined : (defs) => patchEnemyDefs(defs, scale),
      ));
      printRows(name, rows);
      if (name.includes("毒")) printPoisonRows(rows);
      console.log("");
    }
  }
}

function printDungeonTeamStats(runs: number): void {
  printHeader(`実戦毒編成の最終ステータス / 装備${GEAR}・同一seed群${runs}個体の平均`);
  for (const row of summarizeTeamStats(PVE_DUNGEON_TEAMS["実戦毒"], GEAR, runs, 20260913)) {
    const s = row.stats;
    console.log(
      `  ${row.label.padEnd(18)} HP${s.hp.toFixed(0).padStart(7)} ATK${s.atk.toFixed(0).padStart(5)} ` +
      `DEF${s.def.toFixed(0).padStart(5)} SPD${s.spd.toFixed(0).padStart(4)} ` +
      `CR${pct(s.criRate).padStart(4)} CD${pct(s.criDmg).padStart(5)} ` +
      `的中${pct(s.accuracy).padStart(4)} 抵抗${pct(s.resistance).padStart(4)}`,
    );
  }
}

// ───────────────────────────── 目覚の深域 ─────────────────────────────

/** awakeningDepths.ts と同じ3編成。**削り役を必ず入れる**(殴る手の無い編成で測ると嘘が出る) */
const AWAKENING_TEAMS: Record<string, { templateId: string; element: string; preset: string }[]> = {
  "集中型": [
    { templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
    { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
    { templateId: "golem", element: "GRASS", preset: "MAX_TANK" },
    { templateId: "fairy", element: "LIGHT", preset: "MAX_SUPPORT" },
  ],
  "分散型": [
    { templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
    { templateId: "wolf", element: "ELECTRIC", preset: "MAX_ATTACKER" },
    { templateId: "knight", element: "WATER", preset: "MAX_ATTACKER" },
    { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  ],
  "耐久型": [
    { templateId: "golem", element: "GRASS", preset: "MAX_TANK" },
    { templateId: "seraph", element: "LIGHT", preset: "MAX_HEALER" },
    { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
    { templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
  ],
};

function awakeningRow(
  specs: { templateId: string; element: string; preset: string }[],
  floorIndex: number,
  runs: number,
  scale: EnemyScale = IDENTITY_SCALE,
): Row {
  const floor = AWAKENING_DEPTH_FLOORS[floorIndex - 1];
  let wins = 0, enemyLeft = 0, allyLeft = 0, wipe = 0, timeout = 0;
  const turns: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const rng = mulberry32(20260913 + i * 7919);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const players = specs.map((spec) => buildAlly(spec as any, rng, GEAR));
    const enemies = patchEnemyDefs(buildDungeonEnemyTeam(floor), scale);
    const res = new BattleEngine(players, enemies, { rng, maxTurns: 300 }).run();
    if (res.winner === "PLAYER") wins += 1;
    turns.push(res.turnsTaken);
    const last = res.turns[res.turns.length - 1];
    const snap = last ? last.snapshot : [];
    const es = snap.filter((u) => u.team === "ENEMY");
    const as = snap.filter((u) => u.team === "PLAYER");
    const eMax = es.reduce((s, u) => s + u.maxHp, 0);
    const aMax = as.reduce((s, u) => s + u.maxHp, 0);
    enemyLeft += eMax > 0 ? es.reduce((s, u) => s + Math.max(0, u.currentHp), 0) / eMax : 0;
    allyLeft += aMax > 0 ? as.reduce((s, u) => s + Math.max(0, u.currentHp), 0) / aMax : 0;
    if (as.length > 0 && as.every((u) => !u.alive)) wipe += 1;
    else if (res.winner !== "PLAYER") timeout += 1;
  }
  turns.sort((a, b) => a - b);
  return {
    win: wins / runs, enemyLeft: enemyLeft / runs, allyLeft: allyLeft / runs,
    turnsMedian: turns[Math.floor(runs / 2)], turnsMean: turns.reduce((a, b) => a + b, 0) / runs,
    wipe: wipe / runs, timeout: timeout / runs,
  };
}

function runAwakening(runs: number): void {
  printHeader(`目覚の深域 / ${runs}戦・装備${GEAR}`);
  for (const floor of [8, 9, 10].filter((value) => FLOOR_FILTER.length === 0 || FLOOR_FILTER.includes(value))) {
    console.log(`  ── ${floor}階 ──`);
    for (const [name, specs] of Object.entries(AWAKENING_TEAMS)) {
      if (TEAM_FILTER && name !== TEAM_FILTER) continue;
      printRows(name, underEachCondition((scale) => awakeningRow(specs, floor, runs, scale)));
      console.log("");
    }
  }
}

// ──────────────── PvE再設計倍率の粗いスキャン ────────────────

/**
 * 旧式との距離。周回時間を最重視し、中央値が1.3倍を超える候補へ追加罰を置く。
 * 勝率が同じでも手数2倍なら、手数項だけで十分に上位から外れる。
 */
function distance(base: Row, next: Row): number {
  const turnRatio = next.turnsMedian / Math.max(1, base.turnsMedian);
  const turnDistance = Math.abs(Math.log(turnRatio));
  const tooLong = Math.max(0, turnRatio - 1.3);
  return Math.abs(next.win - base.win) * 5
    + Math.abs(next.enemyLeft - base.enemyLeft) * 2
    + Math.abs(next.allyLeft - base.allyLeft)
    + turnDistance * 6
    + tooLong * 10
    + Math.abs(next.wipe - base.wipe) * 2
    + Math.abs(next.timeout - base.timeout) * 4;
}

function runRedesignScan(runs: number): void {
  printHeader(`PvE再設計倍率の粗いスキャン / 代表4対象・各${runs}戦`);
  const normal = PVE_DUNGEON_TEAMS["実戦通常"];
  const spread = AWAKENING_TEAMS["分散型"];
  setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false, swRatio: 1.2 });
  const bases = {
    demon10: dungeonRow(normal, 10, "DEMON", runs),
    tower60: towerRow("tower-f60", runs),
    tower90: towerRow("tower-f90", runs),
    awakening10: awakeningRow(spread, 10, runs),
  };
  const ranked: { scale: EnemyScale; score: number; rows: typeof bases }[] = [];
  setBalanceFlags({ defenseFormula: "sw", unifyDefModifiers: false, swRatio: 1.2 });
  for (const hp of [0.4, 0.5, 0.6, 0.7, 0.8]) {
    for (const def of [0.1, 0.15, 0.2, 0.25, 0.3]) {
      for (const atk of [1.2, 1.4, 1.6, 1.8, 2]) {
        const scale = { hp, def, atk };
        const patch = (defs: MonsterDefinition[]) => patchEnemyDefs(defs, scale);
        const rows = {
          demon10: dungeonRow(normal, 10, "DEMON", runs, patch),
          tower60: towerRow("tower-f60", runs, scale),
          tower90: towerRow("tower-f90", runs, scale),
          awakening10: awakeningRow(spread, 10, runs, scale),
        };
        const score = distance(bases.demon10, rows.demon10) * 1.5
          + distance(bases.tower60, rows.tower60)
          + distance(bases.tower90, rows.tower90)
          + distance(bases.awakening10, rows.awakening10) * 1.5;
        ranked.push({ scale, score, rows });
      }
    }
  }
  ranked.sort((a, b) => a.score - b.score);
  console.log("  順位  HP    DEF   ATK   スコア  魔人10(勝/手)  塔60(勝/手)  塔90(勝/手/時切)  目覚10分散(勝/手/時切)");
  ranked.slice(0, 10).forEach((entry, index) => {
    const r = entry.rows;
    console.log(
      `  ${String(index + 1).padStart(2)}  ×${entry.scale.hp.toFixed(2)} ×${entry.scale.def.toFixed(2)} ×${entry.scale.atk.toFixed(2)} ` +
      `${entry.score.toFixed(2).padStart(7)}  ` +
      `${pct(r.demon10.win)}/${r.demon10.turnsMedian}  ` +
      `${pct(r.tower60.win)}/${r.tower60.turnsMedian}  ` +
      `${pct(r.tower90.win)}/${r.tower90.turnsMedian}/${pct(r.tower90.timeout)}  ` +
      `${pct(r.awakening10.win)}/${r.awakening10.turnsMedian}/${pct(r.awakening10.timeout)}`,
    );
  });
  setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false, swRatio: 1.2 });
}

// ──────────────── ボスDEFの逆算(新式で旧式に近づける) ────────────────

/**
 * 新式のまま、ボスのDEFをどこまで下げれば旧式の難易度に戻るか。
 *
 * **勝率だけで合わせない。**張り付く帯では動かないので、
 * 敵残HPと手数も一緒に見て、旧式にいちばん近い点を選ぶ。
 */
function scanBossDef(kind: "DEMON" | "BEAST", floor: number, runs: number): void {
  const team = PVE_DUNGEON_TEAMS["実戦通常"];
  setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false });
  const base = dungeonRow(team, floor, kind, runs);
  const def0 = buildDungeonEnemyTeam(findDungeonFloor(floor, kind)!)[0].stats.def;
  console.log(`\n  ${kind === "DEMON" ? "魔人" : "魔獣"}${floor}階 (現在のボスDEF ${def0.toLocaleString()})`);
  console.log(`    旧式(基準)            勝率${pct(base.win).padStart(5)}  敵残${pct1(base.enemyLeft).padStart(6)}  手数${String(base.turnsMedian).padStart(4)}`);
  setBalanceFlags({ defenseFormula: "sw", unifyDefModifiers: false });
  for (const scale of [1, 0.75, 0.5, 0.35, 0.25, 0.15]) {
    // **敵全員のDEFを同じ割合で下げる。**ボスだけ下げるとお供が相対的に硬くなり、
    // 「どこを削れば勝てるか」の順番が変わってしまう
    const r = dungeonRow(team, floor, kind, runs, (defs) =>
      defs.map((d) => ({ ...d, stats: { ...d.stats, def: Math.round(d.stats.def * scale) } })));
    const near = Math.abs(r.win - base.win) <= 0.05 ? " ← 旧式に近い" : "";
    console.log(`    新式 DEF×${(scale * 100).toFixed(0).padStart(3)}% (ボス${String(Math.round(def0 * scale)).padStart(5)})  勝率${pct(r.win).padStart(5)}  敵残${pct1(r.enemyLeft).padStart(6)}  手数${String(r.turnsMedian).padStart(4)}${near}`);
  }
  setBalanceFlags({ defenseFormula: "legacy", unifyDefModifiers: false });
}

// ───────────────────────────── 実行 ─────────────────────────────

console.log(`防御計算の検証 / ${RUNS}戦 / 装備${GEAR}`);
const scaleSummary = CONDITIONS.slice(2).map((condition) => `${condition.key}=敵HP×${condition.scale.hp}, DEF×${condition.scale.def}, ATK×${condition.scale.atk}`).join(" / ");
console.log(`旧式 = 方式E / 新式 = 1000/(1000+1.2*DEF) / ${scaleSummary}`);
console.log(`検証開始時のフラグ: ${JSON.stringify(balanceFlags)}`);

if (ONLY === "all" || ONLY === "tower") runTower(RUNS);
if (ONLY === "all" || ONLY === "demon") runDungeon("DEMON", RUNS);
if (ONLY === "all" || ONLY === "beast") runDungeon("BEAST", RUNS);
if (ONLY === "all" || ONLY === "demon") printDungeonTeamStats(RUNS);
if (ONLY === "all" || ONLY === "awakening") runAwakening(RUNS);
if (DEF_SCAN) {
  printHeader("ボスDEFの逆算(新式のまま、旧式の難易度へ戻すには)");
  for (const floor of [10, 11, 12]) scanBossDef("DEMON", floor, RUNS);
  for (const floor of [10, 11, 12]) scanBossDef("BEAST", floor, RUNS);
}
if (REDESIGN_SCAN) runRedesignScan(SCAN_RUNS);

console.log(`\n終了時のフラグ: ${JSON.stringify(balanceFlags)} (旧式へ戻っていること)`);
