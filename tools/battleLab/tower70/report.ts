/**
 * 70階の実測をまとめて回し、表にする。
 *
 * ## なぜ専用の走らせ方が要るのか
 *
 * 普段の `--scenario` は「1つの盤面 × 狙う順」を測る。ここで見たいのは
 * **編成4つ × 狙う順5つ**の格子と、そこから1軸ずつ振ったスイープなので、
 * 同じ種で揃えて一気に回さないと比べられない。
 *
 * ## 勝率だけを見ない
 *
 * 勝率は両端で飽和する。仕上げた編成が下の盤面で100%に張り付いた時、
 * それは「簡単」ではなく「この物差しでは差が読めない」という意味しかない。
 * 決着ターン・本体の総回復量・シールドの吸収量・毒の割合まで並べて、
 * **どこで詰まったのか**が読めるようにしてある。
 */
import { runMany } from "../run.js";
import type { BattleTally, GearGrade } from "../types.js";
import { buildTower70, TOWER70_FOCUS, TOWER70_PARTIES } from "../scenarios/tower70.js";
import { TOWER70_BASE, TOWER70_SWEEPS, type Tower70Numbers } from "./spec.js";

export interface Tower70Row {
  party: string;
  focus: string;
  runs: number;
  winRate: number;
  lossRate: number;
  drawRate: number;
  avgTurns: number;
  avgWinTurns: number;
  /** 勝った戦いでの、決着時点の生存味方数 */
  avgSurvivorsOnWin: number;
  avgHpPercent: number;
  extra: Record<string, number>;
  /** 負けた理由の内訳(多い順) */
  losses: [string, number][];
}

const mean = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

function aggregateExtra(tallies: BattleTally[]): Record<string, number> {
  const keys = [...new Set(tallies.flatMap((tally) => Object.keys(tally.extra)))];
  const out: Record<string, number> = {};
  for (const key of keys) out[key] = mean(tallies.map((tally) => tally.extra[key] ?? 0));
  return out;
}

export function runTower70(options: {
  party: string;
  focus: string;
  runs: number;
  seed: number;
  numbers?: Tower70Numbers;
  grade?: GearGrade;
}): Tower70Row {
  const allies = TOWER70_PARTIES[options.party];
  if (!allies) throw new Error(`知らない編成: ${options.party}`);
  const pattern = TOWER70_FOCUS.find((entry) => entry.name === options.focus);
  if (!pattern) throw new Error(`知らない狙う順: ${options.focus}`);

  const scenario = buildTower70({ allies, numbers: options.numbers ?? TOWER70_BASE });
  const tallies = runMany(scenario, options.seed, options.runs, pattern.order, options.grade ?? "TYPICAL");

  const wins = tallies.filter((tally) => tally.winner === "PLAYER");
  const draws = tallies.filter((tally) => tally.winner === "DRAW");
  const lossCounts = new Map<string, number>();
  for (const tally of tallies) {
    if (tally.winner === "PLAYER") continue;
    lossCounts.set(tally.lossReason, (lossCounts.get(tally.lossReason) ?? 0) + 1);
  }

  return {
    party: options.party,
    focus: options.focus,
    runs: tallies.length,
    winRate: wins.length / tallies.length,
    lossRate: (tallies.length - wins.length - draws.length) / tallies.length,
    drawRate: draws.length / tallies.length,
    avgTurns: mean(tallies.map((tally) => tally.turns)),
    avgWinTurns: mean(wins.map((tally) => tally.turns)),
    avgSurvivorsOnWin: mean(wins.map((tally) => tally.units.filter((unit) => unit.team === "PLAYER" && unit.alive).length)),
    avgHpPercent: mean(tallies.map((tally) => {
      const players = tally.units.filter((unit) => unit.team === "PLAYER");
      const max = players.reduce((sum, unit) => sum + unit.maxHp, 0);
      return max > 0 ? players.reduce((sum, unit) => sum + Math.max(0, unit.hpLeft), 0) / max : 0;
    })),
    extra: aggregateExtra(tallies),
    losses: [...lossCounts.entries()].sort((a, b) => b[1] - a[1]),
  };
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const num = (value: number): string => Math.round(value).toLocaleString("ja-JP");

/** 編成 × 狙う順の格子 */
export function gridMarkdown(rows: Tower70Row[]): string {
  const lines: string[] = [];
  lines.push("| 編成 | 狙う順 | 戦数 | 勝率 | 敗北 | 引分 | 平均手数 | 勝利時手数 | 勝利時生存 | 味方残HP |");
  lines.push("|---|---|--:|--:|--:|--:|--:|--:|--:|--:|");
  for (const row of rows) {
    lines.push(
      `| ${row.party} | ${row.focus} | ${row.runs} | **${pct(row.winRate)}** | ${pct(row.lossRate)} | ${pct(row.drawRate)} `
      + `| ${row.avgTurns.toFixed(1)} | ${row.avgWinTurns.toFixed(1)} | ${row.avgSurvivorsOnWin.toFixed(2)} | ${pct(row.avgHpPercent)} |`,
    );
  }
  return lines.join("\n");
}

/** 1戦あたりに均した、階の中で起きたこと */
export function detailMarkdown(rows: Tower70Row[], keys: string[]): string {
  const lines: string[] = [];
  lines.push(`| 編成 | 狙う順 | ${keys.join(" | ")} |`);
  lines.push(`|---|---|${keys.map(() => "--:").join("|")}|`);
  for (const row of rows) {
    const cells = keys.map((key) => {
      const value = row.extra[key] ?? 0;
      return key.includes("割合") || key.includes("到達") ? pct(value) : num(value);
    });
    lines.push(`| ${row.party} | ${row.focus} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

export interface SweepRow {
  axis: string;
  label: string;
  value: string;
  base: boolean;
  winRate: number;
  avgTurns: number;
  bossHealed: number;
}

/** 1軸ずつ振って、どれが効いているのかを切り分ける */
export function runTower70Sweeps(options: { party: string; focus: string; runs: number; seed: number }): SweepRow[] {
  const out: SweepRow[] = [];
  for (const sweep of TOWER70_SWEEPS) {
    for (const numbers of sweep.values) {
      const row = runTower70({ ...options, numbers });
      out.push({
        axis: sweep.axis,
        label: sweep.label,
        value: describeAxis(sweep.axis, numbers),
        base: describeAxis(sweep.axis, numbers) === describeAxis(sweep.axis, TOWER70_BASE),
        winRate: row.winRate,
        avgTurns: row.avgTurns,
        bossHealed: row.extra["本体総回復量"] ?? 0,
      });
    }
  }
  return out;
}

function describeAxis(axis: string, numbers: Tower70Numbers): string {
  switch (axis) {
    case "HP": return numbers.bossHp.toLocaleString("ja-JP");
    case "ATK": return numbers.bossAtk.toLocaleString("ja-JP");
    case "REGEN": return `+${Math.round(numbers.lifeCrystalRegenBonus * 100)}%`;
    case "SHIELD": return `${Math.round(numbers.pulseShieldRate * 100)}%`;
    case "SPD": return `+${numbers.lowHpSpdBonus}`;
    default: return "";
  }
}

export function sweepMarkdown(rows: SweepRow[]): string {
  const lines: string[] = [];
  lines.push("| 軸 | 値 | 勝率 | 平均手数 | 本体総回復量 |");
  lines.push("|---|---|--:|--:|--:|");
  for (const row of rows) {
    const mark = row.base ? " ←基準" : "";
    lines.push(`| ${row.label} | ${row.value}${mark} | ${pct(row.winRate)} | ${row.avgTurns.toFixed(1)} | ${num(row.bossHealed)} |`);
  }
  return lines.join("\n");
}
