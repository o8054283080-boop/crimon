import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { DamageEffect } from "../src/core/skill.js";
import { findMonsterById } from "../src/data/monsters.js";
import { buildEnemy } from "../tools/battleLab/build.js";
import { attachProbe } from "../tools/battleLab/hook.js";
import { runMany } from "../tools/battleLab/run.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import { TOWER70_FOCUS } from "../tools/battleLab/scenarios/tower70.js";
import { buildTower70V4, TOWER70_HEAL_BLOCK } from "../tools/battleLab/scenarios/tower70v4.js";

const mean = (xs: number[]): number => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

function healBlockEffects(monsterId: string) {
  const monster = findMonsterById(monsterId)!;
  return monster.skills.flatMap((skill) => skill.effects.filter((effect) => effect.kind === "HEAL_BLOCK"));
}

describe("70階V4: 回復阻害編成と終盤段階", () => {
  it("草マッシュルンと電気フェンリルは本編実在の治癒阻害を持つ", () => {
    const mush = healBlockEffects("mushroon_GRASS");
    const fenrir = healBlockEffects("fenrir_ELECTRIC");
    expect(mush.length).toBeGreaterThan(0);
    expect(fenrir.length).toBeGreaterThan(0);
    expect(mush.some((effect) => effect.kind === "HEAL_BLOCK" && effect.healMultiplier === 0.5)).toBe(true);
    expect(fenrir.some((effect) => effect.kind === "HEAL_BLOCK" && effect.healMultiplier === 0.5)).toBe(true);
    expect(TOWER70_HEAL_BLOCK).toHaveLength(5);
  });

  it("HP15%以下ではSPD+70 / HP比例+150%へ置き換わる", () => {
    const scenario = buildTower70V4();
    const enemies = scenario.enemies.map(buildEnemy);
    const dummy = findMonsterById("wolf_FIRE")!;
    const engine = new BattleEngine([dummy], enemies, { rng: mulberry32(1), maxTurns: 1 });
    const probe = attachProbe(engine, scenario.hook)!;
    const boss = engine.getUnits()[1];
    boss.currentHp = Math.round(boss.maxHp * 0.10);
    probe.beforeTurn("P1");
    probe.afterTurn("P1", []);
    expect(boss.flatStatBonus.spd).toBe(70);
    const s3Damage = boss.def.skills[2].effects.find((effect) => effect.kind === "DAMAGE") as DamageEffect;
    expect(s3Damage.hpCoefficient).toBeCloseTo(0.05 * 2.5, 6);
    expect(s3Damage.multiplier).toBe(1.2);
  });

  it("V4 HEAL_BLOCK 1000戦×5攻略順を実測してログへ出す", () => {
    const scenario = buildTower70V4();
    const rows: unknown[] = [];

    for (const pattern of TOWER70_FOCUS) {
      const tallies = runMany(scenario, 20260904, 1000, pattern.order, "TYPICAL");
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
        bossHealed: extraMean("本体総回復量"),
        healBlockSuccess: extraMean("V4治癒阻害成功"),
        healBlockUptime: extraMean("V4治癒阻害稼働率"),
        preventedHealing: extraMean("V4阻害した回復量"),
        bossActs15: extraMean("V4_HP15帯行動"),
        bossActs30: extraMean("V4_HP30帯行動"),
        bossActs50: extraMean("V4_HP50帯行動"),
        bossActs70: extraMean("V4_HP70帯行動"),
      });
    }

    console.log("TOWER70_V4_HEAL_BLOCK_RESULTS=" + JSON.stringify(rows));
    expect(rows).toHaveLength(5);
  }, 180_000);
});
