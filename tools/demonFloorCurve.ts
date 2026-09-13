/**
 * 魔人ダンジョン 10F→11F→12F の難易度曲線を滑らかにするための検証。
 *
 *   npx tsx tools/demonFloorCurve.ts --runs 200
 *   npx tsx tools/demonFloorCurve.ts --runs 200 --only stats   # ステータス比較だけ
 *
 * **周回コンテンツなので手数の絶対値も見る。**勝率が階段になっても、
 * 1戦が長くなりすぎたら周回の道具として壊れる。
 *
 * プレイヤー側は採用候補で固定(`finalCandidate.ts`)。変更しない。
 * 敵側は確定倍率 HP×0.80 DEF×0.30 ATK×2.20 の上に、階ごとの候補倍率を重ねる。
 */
import { resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { findDungeonFloor } from "../src/data/equipmentDungeon.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { PVE_DUNGEON_TEAMS, type PressureResult, type PressureTeam, measurePressure } from "./dungeonPressure.js";
import type { GearGrade } from "./battleLab/types.js";
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
/** 全階に掛かる確定倍率 */
const BASE: Scale = { hp: 0.80, def: 0.30, atk: 2.20 };

/** 階ごとの追加倍率。**11Fと12Fだけを動かす**(10Fは基準として固定) */
interface Plan {
  label: string;
  f11: Scale;
  f12: Scale;
  note: string;
  /**
   * 12Fの倍率を掛けない敵の添字。**クリスタルは触らない。**
   * ATKは10階の実効値で揃える設計、HPは「古代の加護を撃たせる」ための値で、
   * どちらも階の階段とは別の理由で決まっている。
   */
  f12Skip?: number[];
  /**
   * 11Fのクリスタルだけを直接置き換える。
   *
   * **11Fと12Fの本当の差は倍率ではない。**12Fのクリスタルは HP280,000 / SPD200 で
   * 生き残って「古代の加護」でボスへゲージを配るが、11Fは HP96,000 / SPD145 で
   * 巻き込みに落ちて一度も動かない。倍率を1.25倍にしても勝率が100%から動かないのは
   * そのせいなので、**クリスタルが動くかどうか**を直接振る。
   */
  f11Crystal?: { hp: number; spd: number };
}

/**
 * **クリスタルのATKだけは、どの階でも倍率を掛けない。**
 *
 * 11・12階のクリスタルATKは10階の実効値(1,394)で揃えてある。
 * 支援役の攻撃力で階の順番を作らない、という既存の設計で、
 * ここへ階ごとの倍率を掛けると11階が12階を追い越してしまう。
 */
const CRYSTAL_INDEX = 1;
const ONE: Scale = { hp: 1, def: 1, atk: 1 };

const PLANS: Plan[] = [
  { label: "現行", f11: ONE, f12: ONE, note: "いまの確定倍率のまま" },
  { label: "A: 11F ×1.10", f11: { hp: 1.10, def: 1.00, atk: 1.10 }, f12: ONE, note: "12F据え置き" },
  { label: "B: 11F ×1.15", f11: { hp: 1.15, def: 1.05, atk: 1.15 }, f12: ONE, note: "12F据え置き" },
  { label: "C: 11F ×1.20", f11: { hp: 1.20, def: 1.10, atk: 1.20 }, f12: ONE, note: "12F据え置き。呪晶が12Fを超える" },
  { label: "D: 11F ×1.25", f11: { hp: 1.25, def: 1.10, atk: 1.25 }, f12: ONE, note: "12F据え置き。呪晶が12Fを超える" },
  // 12Fのお供が11Fに対して伸びていない(呪晶HP1.17倍/ATK1.14倍)ので、そこを埋める案
  { label: "C+: 11F×1.20 / 12F魔人・呪晶×1.15", f11: { hp: 1.20, def: 1.10, atk: 1.20 }, f12: { hp: 1.15, def: 1.00, atk: 1.15 }, f12Skip: [1], note: "12Fも引き上げる。クリスタルは触らない" },
  { label: "D+: 11F×1.25 / 12F魔人・呪晶×1.20", f11: { hp: 1.25, def: 1.10, atk: 1.25 }, f12: { hp: 1.20, def: 1.00, atk: 1.20 }, f12Skip: [1], note: "同上" },
  // ここから: クリスタルを「動く」側へ寄せる案。12F(HP280,000/SPD200)の手前に置く
  { label: "E: 11F×1.10 / クリスタル HP15万 SPD165", f11: { hp: 1.10, def: 1.00, atk: 1.10 }, f12: ONE, f11Crystal: { hp: 150_000, spd: 165 }, note: "クリスタルが時々動く" },
  { label: "F: 11F×1.10 / クリスタル HP20万 SPD180", f11: { hp: 1.10, def: 1.00, atk: 1.10 }, f12: ONE, f11Crystal: { hp: 200_000, spd: 180 }, note: "クリスタルがそこそこ動く" },
  { label: "G: 11F×1.15 / クリスタル HP20万 SPD180", f11: { hp: 1.15, def: 1.05, atk: 1.15 }, f12: ONE, f11Crystal: { hp: 200_000, spd: 180 }, note: "E/Fに倍率を少し足す" },
];

function combined(base: Scale, extra: Scale): Scale {
  return { hp: base.hp * extra.hp, def: base.def * extra.def, atk: base.atk * extra.atk };
}

const patchOf = (s: Scale, skip: number[] = [], baseAtk = BASE.atk) => (defs: MonsterDefinition[]): MonsterDefinition[] =>
  defs.map((d, i) => (skip.includes(i) ? d : {
    ...d,
    stats: {
      ...d.stats,
      hp: Math.max(1, Math.round(d.stats.hp * s.hp)),
      def: Math.max(1, Math.round(d.stats.def * s.def)),
      // クリスタルのATKには階ごとの倍率を掛けない(確定倍率だけ)
      atk: Math.max(1, Math.round(d.stats.atk * (i === CRYSTAL_INDEX ? baseAtk : s.atk))),
    },
  }));

/** 測る編成。指定の6つ */
const TEAM_NAMES = ["実戦通常", "実戦毒", "実戦耐久", "共通高レア", "魔人攻略高レア(水フェニックス)", "防御無視"];
/** TYPICALで測る3つ */
const TYPICAL_NAMES = ["実戦通常", "魔人攻略高レア(水フェニックス)", "実戦毒"];

const teams = (names: string[]): [string, PressureTeam][] =>
  names.map((n) => [n, PVE_DUNGEON_TEAMS[n]]).filter(([, t]) => t) as [string, PressureTeam][];

interface Row { win: number; turnsMedian: number; turnsMean: number; wipe: number; timeout: number; enemyLeft: number; allyLeft: number }
const toRow = (r: PressureResult): Row => ({
  win: r.rate, turnsMedian: r.actions, turnsMean: r.actionsMean,
  wipe: r.wipeRate, timeout: r.timeoutRate, enemyLeft: r.enemyHpLeft, allyLeft: r.allyHpLeft,
});

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function final<T>(fn: () => T): T {
  resetBalanceFlags();
  setBalanceFlags(FINAL_CANDIDATE);
  const out = fn();
  resetBalanceFlags();
  return out;
}

function scaleFor(plan: Plan, floor: number): Scale {
  if (floor === 11) return combined(BASE, plan.f11);
  if (floor === 12) return combined(BASE, plan.f12);
  return BASE;
}

/** その階で倍率を掛けない敵の添字。12Fのクリスタルだけが対象になりうる */
function skipFor(plan: Plan, floor: number): number[] {
  return floor === 12 ? (plan.f12Skip ?? []) : [];
}

/** 12Fでクリスタルを外す時は、確定倍率だけを当てた値に戻す */
function patchFor(plan: Plan, floor: number) {
  const skip = skipFor(plan, floor);
  const main = patchOf(scaleFor(plan, floor), skip);
  const baseOnly = patchOf(BASE);
  const crystal = floor === 11 ? plan.f11Crystal : undefined;
  if (skip.length === 0 && !crystal) return main;
  return (defs: MonsterDefinition[]): MonsterDefinition[] => {
    const scaled = main(defs);
    const base = baseOnly(defs);
    return scaled.map((d, i) => {
      if (skip.includes(i)) return base[i];
      if (crystal && i === CRYSTAL_INDEX) return { ...d, stats: { ...d.stats, hp: crystal.hp, spd: crystal.spd } };
      return d;
    });
  };
}

// ───────────────────── ステータス比較(上限チェック) ─────────────────────

function showStats(): void {
  console.log(`\n${"═".repeat(96)}\n■ 敵ステータス比較 / 確定倍率と候補倍率を当てた後\n${"═".repeat(96)}`);
  for (const plan of PLANS) {
    console.log(`\n【${plan.label}】 ${plan.note}`);
    console.log("  敵              10F HP/ATK/DEF        11F HP/ATK/DEF        12F HP/ATK/DEF      11F<12F");
    const rows: Record<number, { name: string; hp: number; atk: number; def: number }[]> = {};
    for (const f of [10, 11, 12]) {
      const s = scaleFor(plan, f);
      const skip = skipFor(plan, f);
      rows[f] = buildDungeonEnemyTeam(findDungeonFloor(f, "DEMON")!).map((d, i) => {
        const use = skip.includes(i) ? BASE : s;
        const atkScale = i === CRYSTAL_INDEX ? BASE.atk : use.atk;
        const c = f === 11 && i === CRYSTAL_INDEX ? plan.f11Crystal : undefined;
        return {
          name: d.name.replace(/\[.*/, ""),
          hp: c ? c.hp : Math.round(d.stats.hp * use.hp),
          atk: Math.round(d.stats.atk * atkScale),
          def: Math.round(d.stats.def * use.def),
        };
      });
    }
    for (let i = 0; i < 3; i += 1) {
      const [a, b, c] = [rows[10][i], rows[11][i], rows[12][i]];
      /*
       * **同値は超過ではない。**クリスタルのATKは11・12階とも10階の実効値で
       * 揃えてある(支援役なので階で伸ばさない、という既存の設計)。
       * ここを「超過」と読むと、触ってはいけない値を触る判断に化ける。
       */
      const over: string[] = [];
      if (b.hp > c.hp) over.push("HP");
      if (b.atk > c.atk) over.push("ATK");
      if (b.def > c.def) over.push("DEF");
      const ok = over.length === 0;
      console.log(
        `  ${b.name.padEnd(14)} ${`${a.hp.toLocaleString()}/${a.atk.toLocaleString()}/${a.def}`.padEnd(22)}` +
        `${`${b.hp.toLocaleString()}/${b.atk.toLocaleString()}/${b.def}`.padEnd(22)}` +
        `${`${c.hp.toLocaleString()}/${c.atk.toLocaleString()}/${c.def}`.padEnd(20)}${ok ? "✓" : `✗ ${over.join(",")}が超過`}`,
      );
    }
  }
}

// ───────────────────────────── 測定 ─────────────────────────────

function showRow(label: string, r: Row): void {
  console.log(
    `    ${label.padEnd(28)} 勝率${pct(r.win).padStart(5)}  手数 中${String(r.turnsMedian).padStart(3)}/平${r.turnsMean.toFixed(0).padStart(3)}  ` +
    `全滅${pct(r.wipe).padStart(4)}  時間切${pct(r.timeout).padStart(4)}  敵残${pct1(r.enemyLeft).padStart(6)}  味方残${pct1(r.allyLeft).padStart(6)}`,
  );
}

/**
 * **判断は TYPICAL と MID で行う。**
 * 装備ダンジョンは周回コンテンツなので、STRONG(完成育成)で100%なのは正常。
 * 階段が見えるべきなのはその手前の装備段階。
 */
const JUDGE_GRADES: GearGrade[] = ["TYPICAL", "MID"];

function runPlan(plan: Plan): void {
  console.log(`\n${"═".repeat(96)}\n■ ${plan.label} — ${plan.note} / ${RUNS}戦\n${"═".repeat(96)}`);
  for (const grade of JUDGE_GRADES) {
    console.log(`\n  ═══ ${grade} ═══`);
    for (const [name, team] of teams(TEAM_NAMES)) {
      console.log(`  ── ${name} ──`);
      const rows: Record<number, Row> = {};
      for (const f of [10, 11, 12]) {
        rows[f] = final(() => toRow(measurePressure(team, f, grade, RUNS, "DEMON", SEED, patchFor(plan, f))));
        showRow(`${f}F`, rows[f]);
      }
      const lo = rows[10].turnsMedian, hi = rows[12].turnsMedian, mid = rows[11].turnsMedian;
      const pos = hi !== lo ? (mid - lo) / (hi - lo) : NaN;
      const judge = Number.isNaN(pos) ? "(10Fと12Fの手数が同じ)"
        : pos < 0 ? "11Fが10Fより短い ✗"
          : pos > 1 ? "11Fが12Fより長い ✗"
            : pos >= 0.30 && pos <= 0.70 ? `手数の位置 ${(pos * 100).toFixed(0)}% ← 目安帯`
              : `手数の位置 ${(pos * 100).toFixed(0)}%`;
      console.log(`    ${" ".repeat(28)} ${judge}\n`);
    }
  }
  console.log(`\n  ═══ STRONG(参考。周回コンテンツなので100%で正常) ═══`);
  for (const [name, team] of teams(TEAM_NAMES)) {
    console.log(`  ── ${name} ──`);
    const rows: Record<number, Row> = {};
    for (const f of [10, 11, 12]) {
      rows[f] = final(() => toRow(measurePressure(team, f, "STRONG", RUNS, "DEMON", SEED, patchFor(plan, f))));
      showRow(`${f}F`, rows[f]);
    }
    // 11Fの手数が10Fと12Fのどのあたりか(30〜70%地点が目安)
    const lo = rows[10].turnsMedian, hi = rows[12].turnsMedian, mid = rows[11].turnsMedian;
    const pos = hi !== lo ? (mid - lo) / (hi - lo) : NaN;
    const judge = Number.isNaN(pos) ? "(10Fと12Fの手数が同じで測れない)"
      : pos < 0 ? "11Fが10Fより短い ✗"
        : pos > 1 ? "11Fが12Fより長い ✗"
          : pos >= 0.30 && pos <= 0.70 ? `手数の位置 ${(pos * 100).toFixed(0)}% ← 目安帯`
            : `手数の位置 ${(pos * 100).toFixed(0)}%`;
    console.log(`    ${" ".repeat(28)} ${judge}\n`);
  }
}

console.log(`魔人ダンジョン 10F→11F→12F の曲線検証 / ${RUNS}戦 / seed${SEED}`);
console.log(`プレイヤー側は採用候補で固定。敵は確定倍率 HP×${BASE.hp} DEF×${BASE.def} ATK×${BASE.atk} の上に候補倍率を重ねる`);

if (ONLY === "all" || ONLY === "stats") showStats();
if (ONLY === "all" || ONLY === "run") for (const plan of PLANS) runPlan(plan);

resetBalanceFlags();
console.log("\n(終了時のフラグは現行仕様へ戻してある)");
