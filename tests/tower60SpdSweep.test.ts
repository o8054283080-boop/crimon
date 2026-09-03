import { describe, it } from "vitest";
import { runMany } from "../tools/battleLab/run.js";
import { TOWER60_V2 } from "../tools/battleLab/scenarios/tower60v2.js";
import type { Scenario } from "../tools/battleLab/types.js";

const RUNS = 1000;
const SEED = 20260903;

function withEscortEmpower(base: Scenario, spdBonus: number): Scenario {
  return {
    ...base,
    enemies: base.enemies.map((enemy, index) => {
      if (index === 1) {
        return { ...enemy, bossTraits: { ...enemy.bossTraits, empowerBossOnDeath: { atk: 1600 } } };
      }
      if (index === 2) {
        return { ...enemy, bossTraits: { ...enemy.bossTraits, empowerBossOnDeath: { spd: spdBonus } } };
      }
      return enemy;
    }),
  };
}

function summarize(spdBonus: number, focus: { name: string; order: string[] }) {
  const scenario = withEscortEmpower(TOWER60_V2, spdBonus);
  const tallies = runMany(scenario, SEED, RUNS, focus.order, "TYPICAL");
  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const wins = tallies.filter((t) => t.winner === "PLAYER").length;
  const losses = tallies.filter((t) => t.winner === "ENEMY").length;
  const draws = tallies.filter((t) => t.winner === "DRAW").length;
  const bossActions = avg(tallies.map((t) => t.units.find((u) => u.id === "E1")!.actions));
  const counters = avg(tallies.map((t) => t.counters.find((c) => c.unitId === "E1")?.counters ?? 0));
  return {
    spdBonus,
    focus: focus.name,
    wins,
    losses,
    draws,
    winRate: wins / RUNS,
    avgTurns: avg(tallies.map((t) => t.turns)),
    avgSurvivors: avg(tallies.map((t) => t.survivors)),
    bossAvgActions: bossActions,
    bossAvgCounters: counters,
  };
}

describe("tower60 SPD bonus sweep", () => {
  it("TYPICALで+50/+60/+70/+85を1000戦ずつ比較する", () => {
    const focusNames = ["豪魔人集中", "呪晶→魔晶→豪魔人"];
    const focuses = (TOWER60_V2.focusPatterns ?? []).filter((f) => focusNames.includes(f.name));
    const rows = [50, 60, 70, 85].flatMap((spd) => focuses.map((focus) => summarize(spd, focus)));
    console.log("TOWER60_SPD_SWEEP=" + JSON.stringify(rows));
  });
});
