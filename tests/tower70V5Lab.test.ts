import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { findMonsterById } from "../src/data/monsters.js";
import { buildEnemy } from "../tools/battleLab/build.js";
import { attachProbe } from "../tools/battleLab/hook.js";
import { runMany } from "../tools/battleLab/run.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import { TOWER70_FOCUS } from "../tools/battleLab/scenarios/tower70.js";
import { buildTower70V5 } from "../tools/battleLab/scenarios/tower70v5.js";

const mean = (xs: number[]): number => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const CRUSH_LINE = '[敵:E3] 古代の脈動晶(闇) は 「命脈断ち」 を使った！';

describe("70階V5: 完全回復阻害 + 3体命脈断ち", () => {
  it("命脈断ちは発動時の現在HP上位3体を同時に半分にする", () => {
    const scenario = buildTower70V5();
    const enemies = scenario.enemies.map(buildEnemy);
    const wolf = findMonsterById("wolf_FIRE")!;
    const allies = [100_000, 90_000, 80_000, 70_000, 60_000].map(() => ({
      ...wolf,
      stats: { ...wolf.stats, hp: 500_000, atk: 1, spd: 1 },
    }));
    const engine = new BattleEngine(allies, enemies, { rng: mulberry32(1), maxTurns: 1 });
    const probe = attachProbe(engine, scenario.hook)!;
    const players = engine.getUnits().filter((unit) => unit.team === "PLAYER");
    [100_000, 90_000, 80_000, 70_000, 60_000].forEach((hp, i) => { players[i].currentHp = hp; });

    probe.beforeTurn("E3");
    probe.afterTurn("E3", [CRUSH_LINE]);

    expect(players.map((unit) => unit.currentHp)).toEqual([50_000, 45_000, 40_000, 70_000, 60_000]);
    expect(players.every((unit) => unit.alive)).toBe(true);
  });

  it("V5 1000戦×5攻略順を実測してログへ出す", () => {
    const scenario = buildTower70V5();
    const rows: unknown[] = [];

    for (const pattern of TOWER70_FOCUS) {
      const tallies = runMany(scenario, 20260905, 1000, pattern.order, "TYPICAL");
      const wins = tallies.filter((tally) => tally.winner === "PLAYER").length;
      const losses = tallies.filter((tally) => tally.winner === "ENEMY").length;
      const draws = tallies.filter((tally) => tally.winner === "DRAW").length;
      const extraMean = (key: string) => mean(tallies.map((tally) => tally.extra[key] ?? 0));
      rows.push({
        focus: pattern.name,
        runs: tallies.length,
        winRate: wins / tallies.length,
        lossRate: losses / tallies.length,
        drawRate: draws / tallies.length,
        avgTurns: mean(tallies.map((tally) => tally.turns)),
        bossHealed: extraMean("本体総回復量") - extraMean("V4阻害した回復量"),
        healBlockSuccess: extraMean("V4治癒阻害成功"),
        healBlockUptime: extraMean("V4治癒阻害稼働率"),
        preventedHealing: extraMean("V4阻害した回復量"),
        crushUses: extraMean("命脈断ちの発動回数"),
        crushExtraTargets: extraMean("V5命脈断ち追加対象数"),
        crushExtraRemoved: extraMean("V5命脈断ち追加削り"),
        bossActs15: extraMean("V4_HP15帯行動"),
        bossActs30: extraMean("V4_HP30帯行動"),
      });
    }

    console.log("TOWER70_V5_RESULTS=" + JSON.stringify(rows));
    expect(rows).toHaveLength(5);
  }, 180_000);
});
