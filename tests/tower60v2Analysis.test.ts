import { describe, it } from "vitest";
import { runMany } from "../tools/battleLab/run.js";
import { TOWER60_V2 } from "../tools/battleLab/scenarios/tower60v2.js";
import type { GearGrade, Scenario } from "../tools/battleLab/types.js";

const RUNS = 1000;
const SEED = 20260903;

function withEscortEmpower(base: Scenario): Scenario {
  return {
    ...base,
    enemies: base.enemies.map((enemy, index) => {
      if (index === 1) {
        return {
          ...enemy,
          bossTraits: { ...enemy.bossTraits, empowerBossOnDeath: { atk: 1600 } },
        };
      }
      if (index === 2) {
        return {
          ...enemy,
          bossTraits: { ...enemy.bossTraits, empowerBossOnDeath: { spd: 85 } },
        };
      }
      return enemy;
    }),
  };
}

function swapDarkCore(base: Scenario): Scenario {
  return {
    ...base,
    allies: base.allies.map((ally) => {
      if (ally.templateId === "dragon") return { ...ally, element: "DARK" as const, label: "ドラゴン[闇]" };
      if (ally.templateId === "chronos") return { ...ally, element: "DARK" as const, label: "クロノス[闇]" };
      return ally;
    }),
  };
}

function summarize(label: string, grade: GearGrade, scenario: Scenario, focus: { name: string; order: string[] }) {
  const tallies = runMany(scenario, SEED, RUNS, focus.order, grade);
  const wins = tallies.filter((t) => t.winner === "PLAYER").length;
  const losses = tallies.filter((t) => t.winner === "ENEMY").length;
  const draws = tallies.filter((t) => t.winner === "DRAW").length;
  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const dragon = tallies.map((t) => t.units.find((u) => u.id === "P1")!);
  const chronos = tallies.map((t) => t.units.find((u) => u.id === "P3")!);
  const boss = tallies.map((t) => t.units.find((u) => u.id === "E1")!);
  const counters = tallies.map((t) => t.counters.find((c) => c.unitId === "E1")?.counters ?? 0);
  const enemyActions = ["E1", "E2", "E3"].map((id) => avg(tallies.map((t) => t.units.find((u) => u.id === id)!.actions)));
  return {
    label,
    grade,
    focus: focus.name,
    wins,
    losses,
    draws,
    winRate: wins / RUNS,
    avgTurns: avg(tallies.map((t) => t.turns)),
    avgSurvivors: avg(tallies.map((t) => t.survivors)),
    dragonSurvival: dragon.filter((u) => u.alive).length / RUNS,
    chronosSurvival: chronos.filter((u) => u.alive).length / RUNS,
    bossAvgActions: enemyActions[0],
    mashouAvgActions: enemyActions[1],
    jushouAvgActions: enemyActions[2],
    bossAvgCounters: avg(counters),
    bossSurvival: boss.filter((u) => u.alive).length / RUNS,
  };
}

describe("60F v2 analysis", () => {
  it("TYPICAL / MID / STRONG と撃破順4通りを1000戦ずつ実測する", () => {
    const scenario = withEscortEmpower(TOWER60_V2);
    const focuses = scenario.focusPatterns ?? [];
    const grades: GearGrade[] = ["STRONG", "TYPICAL", "MID"];
    const rows = grades.flatMap((grade) => focuses.map((focus) => summarize("fire+electric", grade, scenario, focus)));
    console.log("TOWER60_V2_ANALYSIS=" + JSON.stringify(rows));
  });

  it("TYPICALで火ドラ+電気クロノスと闇ドラ+闇クロノスを撃破順4通り比較する", () => {
    const base = withEscortEmpower(TOWER60_V2);
    const dark = swapDarkCore(base);
    const focuses = base.focusPatterns ?? [];
    const rows = [
      ...focuses.map((focus) => summarize("fire+electric", "TYPICAL", base, focus)),
      ...focuses.map((focus) => summarize("dark+dark", "TYPICAL", dark, focus)),
    ];
    console.log("TOWER60_V2_ELEMENT_ANALYSIS=" + JSON.stringify(rows));
  });
});
