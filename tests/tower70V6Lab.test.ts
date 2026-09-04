import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { DamageEffect } from "../src/core/skill.js";
import { findMonsterById } from "../src/data/monsters.js";
import { buildEnemy } from "../tools/battleLab/build.js";
import { attachProbe } from "../tools/battleLab/hook.js";
import { runMany } from "../tools/battleLab/run.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import { TOWER70_FOCUS } from "../tools/battleLab/scenarios/tower70.js";
import { buildTower70V6, TOWER70_HEAL_BLOCK_3, TOWER70_MIXED, TOWER70_POISON_3 } from "../tools/battleLab/scenarios/tower70v6.js";

const mean = (xs: number[]): number => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

function hasHealBlock(id: string): boolean {
  const monster = findMonsterById(id)!;
  return monster.skills.some((skill) => skill.effects.some((effect) => effect.kind === "HEAL_BLOCK"));
}

function tierRig(ratio: number) {
  const scenario = buildTower70V6(TOWER70_HEAL_BLOCK_3);
  const enemies = scenario.enemies.map(buildEnemy);
  const dummy = findMonsterById("wolf_FIRE")!;
  const engine = new BattleEngine([dummy], enemies, { rng: mulberry32(1), maxTurns: 1 });
  const probe = attachProbe(engine, scenario.hook)!;
  const boss = engine.getUnits()[1];
  boss.currentHp = Math.round(boss.maxHp * ratio);
  probe.beforeTurn("P1");
  probe.afterTurn("P1", []);
  const s3 = boss.def.skills[2].effects.find((effect) => effect.kind === "DAMAGE") as DamageEffect;
  return { boss, s3 };
}

function measureScenario(label: string, allies: typeof TOWER70_HEAL_BLOCK_3, seed: number) {
  const scenario = buildTower70V6(allies);
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
      poisonApplied: extraMean("毒付与数"),
      poisonDamage: extraMean("毒ダメージ"),
      poisonKills: extraMean("毒フィニッシュ"),
      crushUses: extraMean("命脈断ちの発動回数"),
    };
  });
  console.log(label + "=" + JSON.stringify(rows));
  return rows;
}

describe("70階V6: 攻撃型パッシブ + 回復阻害/毒/混合", () => {
  it("回復阻害3体編成は実在する回復阻害を3体とも持つ", () => {
    expect(TOWER70_HEAL_BLOCK_3).toHaveLength(5);
    expect(hasHealBlock("mushroon_GRASS")).toBe(true);
    expect(hasHealBlock("fenrir_ELECTRIC")).toBe(true);
    expect(hasHealBlock("wolf_ELECTRIC")).toBe(true);
  });

  it("混合型は5体で、回復阻害2体+毒2体+回復役1体", () => {
    expect(TOWER70_MIXED).toHaveLength(5);
    expect(hasHealBlock("mushroon_GRASS")).toBe(true);
    expect(hasHealBlock("wolf_ELECTRIC")).toBe(true);
    expect(findMonsterById("mushroon_FIRE")!.skills.some((skill) => skill.effects.some((effect) => effect.kind === "POISON"))).toBe(true);
    expect(findMonsterById("slime_GRASS")!.skills.some((skill) => skill.effects.some((effect) => effect.kind === "POISON"))).toBe(true);
  });

  it("70%以下は軽減なし / ATK+500 / SPD+10 / HP比例+30%", () => {
    const { boss, s3 } = tierRig(0.65);
    expect(boss.mitigateAmount).toBe(0);
    expect(boss.mitigateTurns).toBe(0);
    expect(boss.flatStatBonus.atk).toBe(500);
    expect(boss.flatStatBonus.spd).toBe(10);
    expect(s3.hpCoefficient).toBeCloseTo(0.05 * 1.3, 6);
  });

  it("50%以下は軽減なし / ATK+1000 / SPD+25 / HP比例+60%", () => {
    const { boss, s3 } = tierRig(0.45);
    expect(boss.mitigateAmount).toBe(0);
    expect(boss.flatStatBonus.atk).toBe(1000);
    expect(boss.flatStatBonus.spd).toBe(25);
    expect(s3.hpCoefficient).toBeCloseTo(0.05 * 1.6, 6);
  });

  it("30%以下は軽減なし / ATK+1500 / SPD+45 / HP比例+150%", () => {
    const { boss, s3 } = tierRig(0.25);
    expect(boss.mitigateAmount).toBe(0);
    expect(boss.flatStatBonus.atk).toBe(1500);
    expect(boss.flatStatBonus.spd).toBe(45);
    expect(s3.hpCoefficient).toBeCloseTo(0.05 * 2.5, 6);
  });

  it("70%超へ回復すると攻撃補正・速度補正・HP比例補正が全て戻る", () => {
    const { boss, s3 } = tierRig(0.80);
    expect(boss.flatStatBonus.atk ?? 0).toBe(0);
    expect(boss.flatStatBonus.spd ?? 0).toBe(0);
    expect(boss.mitigateAmount).toBe(0);
    expect(s3.hpCoefficient).toBeCloseTo(0.05, 6);
  });

  it("V6 回復阻害3体 1000戦×5攻略順", () => {
    expect(measureScenario("TOWER70_V6_HEAL_BLOCK3_RESULTS", TOWER70_HEAL_BLOCK_3, 20260906)).toHaveLength(5);
  }, 180_000);

  it("V6 毒3体 1000戦×5攻略順", () => {
    expect(measureScenario("TOWER70_V6_POISON3_RESULTS", TOWER70_POISON_3, 20260907)).toHaveLength(5);
  }, 180_000);

  it("V6 回復阻害+毒混合 1000戦×5攻略順", () => {
    expect(measureScenario("TOWER70_V6_MIXED_RESULTS", TOWER70_MIXED, 20260908)).toHaveLength(5);
  }, 180_000);
});
