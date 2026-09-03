/**
 * 集計と、その見せ方(表 / JSON)。
 *
 * ## 平均だけを見ない
 *
 * 勝率だけで難易度を比べると、上げすぎた時に全編成そろって0%へ張り付き、
 * どれが上かすら読めなくなる(この案件で実際に起きた)。
 * だから決着ターンの最短・最長、生存数、決着時点の敵残HPのように
 * **飽和しない値**を並べて出す。
 */
import type { BattleTally, UnitTally } from "./run.js";
import type { Scenario } from "./types.js";

export interface UnitSummary {
  id: string;
  name: string;
  team: "PLAYER" | "ENEMY";
  survivalRate: number;
  avgHpLeft: number;
  avgHpPercent: number;
  firstDownRate: number;
  avgActions: number;
  totalDamageDealt: number;
  avgDamageDealt: number;
  totalDamageTaken: number;
  totalHealed: number;
  buffsGiven: number;
  debuffsLanded: number;
  stunsLanded: number;
  stripsLanded: number;
  gaugeDrains: number;
  passiveGaugeGains: number;
  /** 敵だけ: 平均で何ターン目まで生きていたか(倒された順の平均) */
  avgKillOrder: number;
}

export interface SkillSummary {
  unitId: string;
  unitName: string;
  skillName: string;
  uses: number;
  /**
   * 1回**撃つ**ごとのダメージ。全体技では**対象ぜんぶの合計**になる。
   *
   * この列だけを見ると、3体に当たる技は1体あたりの3倍に見える。
   * 実際それで「120,000のHPを一撃で抜く」と読み違えた
   * (本当は2発かかっていた)。**1体あたりは `avgPerHit` を見ること。**
   */
  avgDamage: number;
  /** 1**発**あたりのダメージ。多段は1ヒット、全体技は1体ぶん */
  avgPerHit: number;
  /** 1回撃つと平均何発当たるか。全体技なら生きている敵の数に近づく */
  hitsPerUse: number;
  crits: number;
  critRate: number;
  debuffs: number;
  strips: number;
}

export interface CounterSummary {
  unitId: string;
  unitName: string;
  totalCounters: number;
  avgCountersPerBattle: number;
  bySkill: Record<string, number>;
}

export interface Summary {
  scenario: string;
  title: string;
  runs: number;
  seed: number;
  focus: string;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgTurns: number;
  minTurns: number;
  maxTurns: number;
  avgSurvivors: number;
  units: UnitSummary[];
  skills: SkillSummary[];
  counters: CounterSummary[];
  lossReasons: { reason: string; count: number; share: number }[];
  expect?: { minWinRate?: number; maxWinRate?: number };
  withinExpect: boolean;
}

const mean = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

export function summarize(
  scenario: Scenario,
  tallies: BattleTally[],
  options: { seed: number; focus: string },
): Summary {
  const runs = tallies.length;
  const wins = tallies.filter((t) => t.winner === "PLAYER").length;
  const draws = tallies.filter((t) => t.winner === "DRAW").length;
  const losses = runs - wins - draws;
  const turns = tallies.map((t) => t.turns);

  const ids = [...new Set(tallies.flatMap((t) => t.units.map((u) => u.id)))];
  const units: UnitSummary[] = ids.map((id) => {
    const rows = tallies.map((t) => t.units.find((u) => u.id === id)).filter((u): u is UnitTally => u !== undefined);
    const first = rows[0]!;
    const firstDowns = tallies.filter((t) => {
      const dead = t.units.filter((u) => u.team === first.team && u.deathOrder > 0);
      if (dead.length === 0) return false;
      return dead.reduce((a, b) => (a.deathOrder <= b.deathOrder ? a : b)).id === id;
    }).length;
    const killOrders = rows.filter((r) => r.deathOrder > 0).map((r) => r.deathOrder);
    return {
      id,
      name: first.name,
      team: first.team,
      survivalRate: rows.filter((r) => r.alive).length / runs,
      avgHpLeft: Math.round(mean(rows.map((r) => r.hpLeft))),
      avgHpPercent: mean(rows.map((r) => (r.maxHp > 0 ? r.hpLeft / r.maxHp : 0))),
      firstDownRate: firstDowns / runs,
      avgActions: mean(rows.map((r) => r.actions)),
      totalDamageDealt: rows.reduce((a, r) => a + r.damageDealt, 0),
      avgDamageDealt: mean(rows.map((r) => r.damageDealt)),
      totalDamageTaken: rows.reduce((a, r) => a + r.damageTaken, 0),
      totalHealed: rows.reduce((a, r) => a + r.healed, 0),
      buffsGiven: rows.reduce((a, r) => a + r.buffsGiven, 0),
      debuffsLanded: rows.reduce((a, r) => a + r.debuffsLanded, 0),
      stunsLanded: rows.reduce((a, r) => a + r.stunsLanded, 0),
      stripsLanded: rows.reduce((a, r) => a + r.stripsLanded, 0),
      gaugeDrains: rows.reduce((a, r) => a + r.gaugeDrains, 0),
      passiveGaugeGains: rows.reduce((a, r) => a + r.passiveGaugeGains, 0),
      avgKillOrder: mean(killOrders),
    };
  });

  const nameOf = (id: string): string => units.find((u) => u.id === id)?.name ?? id;

  const skillMap = new Map<string, SkillSummary & { damage: number; hits: number }>();
  for (const tally of tallies) {
    for (const skill of tally.skills) {
      const key = `${skill.unitId}:${skill.skillName}`;
      let entry = skillMap.get(key);
      if (!entry) {
        entry = {
          unitId: skill.unitId, unitName: nameOf(skill.unitId), skillName: skill.skillName,
          uses: 0, avgDamage: 0, avgPerHit: 0, hitsPerUse: 0, crits: 0, critRate: 0, debuffs: 0, strips: 0, damage: 0, hits: 0,
        };
        skillMap.set(key, entry);
      }
      entry.uses += skill.uses;
      entry.damage += skill.damage;
      entry.hits += skill.hits;
      entry.crits += skill.crits;
      entry.debuffs += skill.debuffs;
      entry.strips += skill.strips;
    }
  }
  const skills: SkillSummary[] = [...skillMap.values()]
    .map(({ damage, hits, ...rest }) => ({
      ...rest,
      avgDamage: rest.uses > 0 ? Math.round(damage / rest.uses) : 0,
      avgPerHit: hits > 0 ? Math.round(damage / hits) : 0,
      hitsPerUse: rest.uses > 0 ? hits / rest.uses : 0,
      critRate: hits > 0 ? rest.crits / hits : 0,
    }))
    .sort((a, b) => b.uses - a.uses);

  const counterMap = new Map<string, CounterSummary>();
  for (const tally of tallies) {
    for (const counter of tally.counters) {
      let entry = counterMap.get(counter.unitId);
      if (!entry) {
        entry = { unitId: counter.unitId, unitName: nameOf(counter.unitId), totalCounters: 0, avgCountersPerBattle: 0, bySkill: {} };
        counterMap.set(counter.unitId, entry);
      }
      entry.totalCounters += counter.counters;
      for (const [name, count] of Object.entries(counter.bySkill)) {
        entry.bySkill[name] = (entry.bySkill[name] ?? 0) + count;
      }
    }
  }
  const counters = [...counterMap.values()].map((c) => ({ ...c, avgCountersPerBattle: c.totalCounters / runs }));

  const reasonMap = new Map<string, number>();
  for (const tally of tallies) {
    if (!tally.lossReason) continue;
    reasonMap.set(tally.lossReason, (reasonMap.get(tally.lossReason) ?? 0) + 1);
  }
  const lossReasons = [...reasonMap.entries()]
    .map(([reason, count]) => ({ reason, count, share: losses + draws > 0 ? count / (losses + draws) : 0 }))
    .sort((a, b) => b.count - a.count);

  const winRate = runs > 0 ? wins / runs : 0;
  const expect = scenario.expect;
  const withinExpect =
    !expect
    || ((expect.minWinRate === undefined || winRate >= expect.minWinRate)
      && (expect.maxWinRate === undefined || winRate <= expect.maxWinRate));

  return {
    scenario: scenario.id,
    title: scenario.title,
    runs,
    seed: options.seed,
    focus: options.focus,
    wins, losses, draws, winRate,
    avgTurns: mean(turns),
    minTurns: Math.min(...turns),
    maxTurns: Math.max(...turns),
    avgSurvivors: mean(tallies.map((t) => t.survivors)),
    units, skills, counters, lossReasons,
    expect,
    withinExpect,
  };
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const num = (value: number, digits = 1): string => value.toFixed(digits);

export function toMarkdown(summary: Summary): string {
  const out: string[] = [];
  out.push(`# ${summary.title} (${summary.scenario})`);
  out.push("");
  out.push(`Runs: ${summary.runs} / Seed: ${summary.seed} / 狙う順: ${summary.focus}`);
  out.push("");
  out.push(`**勝率 ${pct(summary.winRate)}** (勝ち ${summary.wins} / 負け ${summary.losses} / 引き分け ${summary.draws})`);
  out.push("");
  out.push("| | |");
  out.push("|---|---:|");
  out.push(`| 平均ターン | ${num(summary.avgTurns)} |`);
  out.push(`| 最短ターン | ${summary.minTurns} |`);
  out.push(`| 最長ターン | ${summary.maxTurns} |`);
  out.push(`| 平均生存数 | ${num(summary.avgSurvivors, 2)} |`);
  out.push("");

  out.push("## 味方");
  out.push("");
  out.push("| モンスター | 生存率 | 平均残HP | 最初に落ちた率 | 平均行動 | 総与ダメ | 平均与ダメ | 総被ダメ | 回復 | バフ | デバフ | スタン | 解除 |");
  out.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const unit of summary.units.filter((u) => u.team === "PLAYER")) {
    out.push(
      `| ${unit.name} | ${pct(unit.survivalRate)} | ${unit.avgHpLeft} (${pct(unit.avgHpPercent)}) | ${pct(unit.firstDownRate)} `
      + `| ${num(unit.avgActions)} | ${unit.totalDamageDealt.toLocaleString("ja-JP")} | ${Math.round(unit.avgDamageDealt).toLocaleString("ja-JP")} `
      + `| ${unit.totalDamageTaken.toLocaleString("ja-JP")} | ${unit.totalHealed.toLocaleString("ja-JP")} `
      + `| ${unit.buffsGiven} | ${unit.debuffsLanded} | ${unit.stunsLanded} | ${unit.stripsLanded} |`,
    );
  }
  out.push("");

  out.push("## 敵");
  out.push("");
  out.push("| 敵 | 生存率 | 平均撃破順 | 平均行動 | 総与ダメ | 総被ダメ |");
  out.push("|---|---:|---:|---:|---:|---:|");
  for (const unit of summary.units.filter((u) => u.team === "ENEMY")) {
    out.push(
      `| ${unit.name} | ${pct(unit.survivalRate)} | ${unit.avgKillOrder > 0 ? num(unit.avgKillOrder, 2) : "—"} `
      + `| ${num(unit.avgActions)} | ${unit.totalDamageDealt.toLocaleString("ja-JP")} | ${unit.totalDamageTaken.toLocaleString("ja-JP")} |`,
    );
  }
  out.push("");

  out.push("## スキル");
  out.push("");
  out.push("1発あたり = 1体に入った1回ぶん。1回あたり = 撃った1回ぶん(全体技は対象ぜんぶの合計)");
  out.push("");
  out.push("| 使い手 | スキル | 使用 | 1発あたり | 発/回 | 1回あたり | 会心 | 会心率 | デバフ成功 | 解除成功 |");
  out.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const skill of summary.skills) {
    out.push(
      `| ${skill.unitName} | ${skill.skillName} | ${skill.uses} | ${skill.avgPerHit.toLocaleString("ja-JP")} `
      + `| ${num(skill.hitsPerUse, 2)} | ${skill.avgDamage.toLocaleString("ja-JP")} `
      + `| ${skill.crits} | ${pct(skill.critRate)} | ${skill.debuffs} | ${skill.strips} |`,
    );
  }
  out.push("");

  if (summary.counters.length > 0) {
    out.push("## 溜めた反撃");
    out.push("");
    out.push("| 使い手 | 発動回数 | 1戦あたり | 内訳 |");
    out.push("|---|---:|---:|---|");
    for (const counter of summary.counters) {
      const detail = Object.entries(counter.bySkill).map(([name, count]) => `${name} ${count}`).join(" / ");
      out.push(`| ${counter.unitName} | ${counter.totalCounters} | ${num(counter.avgCountersPerBattle, 2)} | ${detail} |`);
    }
    out.push("");
  }

  if (summary.lossReasons.length > 0) {
    out.push("## 敗因");
    out.push("");
    out.push("| 見出し | 件数 | 敗北のうち |");
    out.push("|---|---:|---:|");
    for (const reason of summary.lossReasons) {
      out.push(`| ${reason.reason} | ${reason.count} | ${pct(reason.share)} |`);
    }
    out.push("");
  }

  if (summary.expect && !summary.withinExpect) {
    const min = summary.expect.minWinRate;
    const max = summary.expect.maxWinRate;
    out.push(`> **WARN:** ${summary.scenario} win rate ${pct(summary.winRate)} is outside expected range `
      + `${min !== undefined ? pct(min) : "—"}-${max !== undefined ? pct(max) : "—"}`);
    out.push("");
  }

  return out.join("\n");
}

/** 見比べの表。同じ条件で数字だけ変えた結果を並べる */
export function compareMarkdown(title: string, rows: { label: string; summary: Summary }[]): string {
  const out: string[] = [];
  out.push(`# ${title}`);
  out.push("");
  out.push("| 条件 | 勝率 | 平均ターン | 平均生存数 | 主な敗因 |");
  out.push("|---|---:|---:|---:|---|");
  for (const row of rows) {
    const reason = row.summary.lossReasons[0]?.reason ?? "—";
    out.push(
      `| ${row.label} | ${pct(row.summary.winRate)} | ${num(row.summary.avgTurns)} `
      + `| ${num(row.summary.avgSurvivors, 2)} | ${reason} |`,
    );
  }
  return out.join("\n");
}
