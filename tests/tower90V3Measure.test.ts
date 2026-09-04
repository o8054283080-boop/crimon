import { describe, expect, it } from "vitest";
import { runMany } from "../tools/battleLab/run.js";
import { TOWER90_RUSH_FOCUS, TOWER90_SAFE_FOCUS } from "../tools/battleLab/scenarios/tower90v1.js";
import { TOWER90_ENEMIES_V3, TOWER90_RUSH_V3, TOWER90_SAFE_V3 } from "../tools/battleLab/scenarios/tower90v3.js";

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

describe("90階V3 6000戦の一時測定", () => {
  it("V3ステータスを固定する", () => {
    expect(TOWER90_ENEMIES_V3.map((e) => [e.stats?.hp, e.stats?.atk, e.stats?.def, e.stats?.spd])).toEqual([
      [400_000, 9_000, 4_200, 200],
      [210_000, 7_000, 3_200, 175],
      [200_000, 7_500, 3_000, 185],
      [190_000, 8_500, 2_600, 190],
      [220_000, 6_500, 3_800, 165],
    ]);
  });

  it("安全処理3順+速攻3順を各1000戦", () => {
    const rows = [
      ...TOWER90_SAFE_FOCUS.map((focus, i) => ({ type: "SAFE", focus, scenario: TOWER90_SAFE_V3, seed: 20290990 + i * 10_000 })),
      ...TOWER90_RUSH_FOCUS.map((focus, i) => ({ type: "RUSH", focus, scenario: TOWER90_RUSH_V3, seed: 20300990 + i * 10_000 })),
    ].map(({ type, focus, scenario, seed }) => {
      const tallies = runMany(scenario, seed, 1000, focus.order, "TYPICAL");
      const wins = tallies.filter((t) => t.winner === "PLAYER").length;
      const losses = tallies.filter((t) => t.winner === "ENEMY").length;
      const draws = tallies.filter((t) => t.winner === "DRAW").length;
      const avg = (key: string) => mean(tallies.map((t) => t.extra[key] ?? 0));
      return {
        type,
        focus: focus.name,
        winRate: wins / tallies.length,
        lossRate: losses / tallies.length,
        drawRate: draws / tallies.length,
        avgTurns: mean(tallies.map((t) => t.turns)),
        avgSurvivors: mean(tallies.map((t) => t.survivors)),
        reached40: avg("HP40%以下へ到達"),
        reached20: avg("HP20%以下へ到達"),
        wipeAfter40: avg("HP40%以下後の全滅"),
        wipeAfter20: avg("HP20%以下後の全滅"),
        escortsKilled: avg("倒したお供の数"),
        escortRageAtk: avg("お供死亡狂化ATK"),
        escortRageSpd: avg("お供死亡狂化SPD"),
        warDrumBuffUses: avg("戦鼓晶ATK/SPDバフ使用"),
        fangKills: avg("狂牙獣による撃破数"),
        bossHpRatio: avg("ボス残HP割合"),
      };
    });
    console.log("TOWER90_V3_RESULTS=" + JSON.stringify(rows));
    expect(rows).toHaveLength(6);
  }, 240_000);
});
