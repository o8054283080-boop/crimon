import { describe, expect, it } from "vitest";
import { runMany } from "../tools/battleLab/run.js";
import { TOWER90_RUSH_FOCUS, TOWER90_SAFE_FOCUS } from "../tools/battleLab/scenarios/tower90v1.js";
import { TOWER90_RUSH_V2, TOWER90_SAFE_V2 } from "../tools/battleLab/scenarios/tower90v2.js";

const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

describe("90階V2 6000戦の一時測定", () => {
  it("安全処理3順+速攻3順を各1000戦", () => {
    const rows = [
      ...TOWER90_SAFE_FOCUS.map((focus, i) => ({ type: "SAFE", focus, scenario: TOWER90_SAFE_V2, seed: 20261990 + i * 10_000 })),
      ...TOWER90_RUSH_FOCUS.map((focus, i) => ({ type: "RUSH", focus, scenario: TOWER90_RUSH_V2, seed: 20271990 + i * 10_000 })),
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
        warDrumBuffUses: avg("戦鼓晶ATK/SPDバフ使用"),
        fangKills: avg("狂牙獣による撃破数"),
        bossHpRatio: avg("ボス残HP割合"),
      };
    });
    console.log("TOWER90_V2_RESULTS=" + JSON.stringify(rows));
    expect(rows).toHaveLength(6);
  }, 240_000);
});
