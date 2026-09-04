import { describe, expect, it } from "vitest";
import { runMany } from "../tools/battleLab/run.js";
import { TOWER70_FOCUS } from "../tools/battleLab/scenarios/tower70.js";
import { TOWER70_HEAL_BLOCK_3 } from "../tools/battleLab/scenarios/tower70v6.js";
import { buildTower70V7, TOWER70_MIXED_A, TOWER70_MIXED_B, TOWER70_V7_NUMBERS } from "../tools/battleLab/scenarios/tower70v7.js";

const mean = (xs: number[]): number => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

function measure(label: string, allies: typeof TOWER70_HEAL_BLOCK_3, seed: number) {
  const scenario = buildTower70V7(allies);
  const rows = TOWER70_FOCUS.map((pattern) => {
    const tallies = runMany(scenario, seed, 1000, pattern.order, "TYPICAL");
    const wins = tallies.filter((t) => t.winner === "PLAYER").length;
    const losses = tallies.filter((t) => t.winner === "ENEMY").length;
    const draws = tallies.filter((t) => t.winner === "DRAW").length;
    const extraMean = (key: string) => mean(tallies.map((t) => t.extra[key] ?? 0));
    return {
      focus: pattern.name,
      runs: tallies.length,
      winRate: wins / tallies.length,
      lossRate: losses / tallies.length,
      drawRate: draws / tallies.length,
      avgTurns: mean(tallies.map((t) => t.turns)),
      bossHealed: extraMean("本体総回復量"),
      healBlockSuccess: extraMean("V4治癒阻害成功"),
      healBlockUptime: extraMean("V4治癒阻害稼働率"),
      preventedHealing: extraMean("V4阻害した回復量"),
      poisonDamage: extraMean("毒ダメージ"),
      crushUses: extraMean("命脈断ちの発動回数"),
    };
  });
  console.log(`${label}=` + JSON.stringify(rows));
  return rows;
}

describe("70階V7: HP17万 / ATK8000 / 回復阻害3体 vs 混合2型", () => {
  it("第7回は始祖ベヒモス HP170000 / ATK8000", () => {
    expect(TOWER70_V7_NUMBERS.bossHp).toBe(170_000);
    expect(TOWER70_V7_NUMBERS.bossAtk).toBe(8_000);
  });

  it("V7 回復阻害3体 1000戦×5攻略順", () => {
    const rows = measure("TOWER70_V7_HEAL_BLOCK3_RESULTS", TOWER70_HEAL_BLOCK_3, 20260908);
    expect(rows).toHaveLength(5);
  }, 180_000);

  it("V7 混合A安定型 1000戦×5攻略順", () => {
    const rows = measure("TOWER70_V7_MIXED_A_RESULTS", TOWER70_MIXED_A, 20260909);
    expect(rows).toHaveLength(5);
  }, 180_000);

  it("V7 混合B攻撃型 1000戦×5攻略順", () => {
    const rows = measure("TOWER70_V7_MIXED_B_RESULTS", TOWER70_MIXED_B, 20260910);
    expect(rows).toHaveLength(5);
  }, 180_000);
});
