import { describe, expect, test } from "vitest";
import { runMany } from "../tools/battleLab/run.js";
import { TALENT_TEMPLE_10_MEASURE } from "../tools/battleLab/scenarios/talentTemple10.measure.js";

const RUNS = 1000;
const SEED = 20260906;

function summarize(name: string, rows: ReturnType<typeof runMany>) {
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

  return {
    name,
    runs: rows.length,
    wins,
    losses,
    draws,
    winRate: wins / rows.length,
    avgTurns: Number(avgTurns.toFixed(1)),
    avgSurvivors: Number(avgSurvivors.toFixed(2)),
    avgBossHpLeft: Math.round(avgBossHpLeft),
    avgBossHpRatio: Number(avgBossHpRatio.toFixed(3)),
    guardAwakenRate: Number(guardAwakenRate.toFixed(3)),
    lossesByReason,
  };
}

function measure(name: string, order: string[]) {
  const rows = runMany(TALENT_TEMPLE_10_MEASURE, SEED, RUNS, order, "TYPICAL");
  const result = summarize(name, rows);
  console.log(`TALENT10_MEASURE ${JSON.stringify(result)}`);
  return result;
}

describe("才能の神殿10F 仮測定", () => {
  test("初期案を4つの狙い順で1000戦ずつ測る", () => {
    const patterns = [
      ["アルケオス集中", ["才能神獣 アルケオス"]],
      ["攻→護→アルケオス", ["才能晶・攻", "才能晶・護", "才能神獣 アルケオス"]],
      ["護→攻→アルケオス", ["才能晶・護", "才能晶・攻", "才能神獣 アルケオス"]],
      ["既存AIまかせ", []],
    ] as const;
    const results = patterns.map(([name, order]) => measure(name, [...order]));
    expect(results).toHaveLength(4);
  }, 240_000);

  test("HP×柔らかい反撃間隔を300戦ずつ振って60〜70%の帯を探す", () => {
    const hitIntervals = [8, 6, 5];
    const bossHps = [200_000, 230_000, 260_000];
    const focus = ["才能神獣 アルケオス"];
    const results = [];

    for (const hp of bossHps) {
      for (const counterAfterHits of hitIntervals) {
        const scenario = {
          ...TALENT_TEMPLE_10_MEASURE,
          enemies: TALENT_TEMPLE_10_MEASURE.enemies.map((enemy, index) => index === 0
            ? {
                ...enemy,
                stats: { ...enemy.stats, hp, atk: 8_000, spd: 185 },
                // 3.5倍単体反撃ではなく、S2「全体1.1倍＋ゲージ20%吸収」を返す。
                bossTraits: { counterAfterHits, counterSkillIndex: 1 as const },
              }
            : enemy),
        };
        const rows = runMany(scenario, SEED + hp + counterAfterHits, 300, focus, "TYPICAL");
        const result = summarize(`hp${hp}-counter${counterAfterHits}`, rows);
        console.log(`TALENT10_STRUCT_SWEEP ${JSON.stringify(result)}`);
        results.push(result);
      }
    }
    expect(results).toHaveLength(9);
  }, 240_000);
});
