import { describe, expect, test } from "vitest";
import { runMany } from "../tools/battleLab/run.js";
import { TALENT_TEMPLE_10_MEASURE } from "../tools/battleLab/scenarios/talentTemple10.measure.js";

const RUNS = 1000;
const SEED = 20260906;

function measure(name: string, order: string[]) {
  const rows = runMany(TALENT_TEMPLE_10_MEASURE, SEED, RUNS, order, "TYPICAL");
  const wins = rows.filter((r) => r.winner === "PLAYER").length;
  const losses = rows.filter((r) => r.winner === "ENEMY").length;
  const draws = rows.filter((r) => r.winner === "DRAW").length;
  const avgTurns = rows.reduce((sum, r) => sum + r.turns, 0) / rows.length;
  const avgSurvivors = rows.reduce((sum, r) => sum + r.survivors, 0) / rows.length;
  const boss = rows.map((r) => r.units.find((u) => u.id === "E1"));
  const avgBossHpLeft = boss.reduce((sum, u) => sum + (u?.hpLeft ?? 0), 0) / rows.length;
  const avgBossHpRatio = boss.reduce((sum, u) => sum + ((u?.hpLeft ?? 0) / Math.max(1, u?.maxHp ?? 1)), 0) / rows.length;
  const guardAwakenRate = rows.reduce((sum, r) => sum + (r.extra.guardAwakened ?? 0), 0) / rows.length;
  const lossesByReason = rows.filter((r) => r.winner !== "PLAYER").reduce<Record<string, number>>((acc, r) => {
    acc[r.lossReason] = (acc[r.lossReason] ?? 0) + 1;
    return acc;
  }, {});

  const result = {
    name,
    runs: RUNS,
    wins,
    losses,
    draws,
    winRate: wins / RUNS,
    avgTurns: Number(avgTurns.toFixed(1)),
    avgSurvivors: Number(avgSurvivors.toFixed(2)),
    avgBossHpLeft: Math.round(avgBossHpLeft),
    avgBossHpRatio: Number(avgBossHpRatio.toFixed(3)),
    guardAwakenRate: Number(guardAwakenRate.toFixed(3)),
    lossesByReason,
  };
  console.log(`TALENT10_MEASURE ${JSON.stringify(result)}`);
  return result;
}

describe("才能の神殿10F 仮測定", () => {
  test("塔60F想定装備(TYPICAL)で4つの狙い順を1000戦ずつ測る", () => {
    const patterns = [
      ["アルケオス集中", ["才能神獣 アルケオス"]],
      ["攻→護→アルケオス", ["才能晶・攻", "才能晶・護", "才能神獣 アルケオス"]],
      ["護→攻→アルケオス", ["才能晶・護", "才能晶・攻", "才能神獣 アルケオス"]],
      ["既存AIまかせ", []],
    ] as const;

    const results = patterns.map(([name, order]) => measure(name, [...order]));
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.runs === RUNS)).toBe(true);
  }, 240_000);
});
