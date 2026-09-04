import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { DamageEffect } from "../src/core/skill.js";
import { findMonsterById } from "../src/data/monsters.js";
import { buildEnemy } from "../tools/battleLab/build.js";
import { attachProbe } from "../tools/battleLab/hook.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import { buildTower70V6, TOWER70_HEAL_BLOCK_3, TOWER70_MIXED, TOWER70_POISON_3 } from "../tools/battleLab/scenarios/tower70v6.js";

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


/*
 * **計測はここから外した。**
 *
 * 元は「1000戦×5攻略順を実測してログへ出す」という `it` があったが、
 * 確かめていたのは `expect(rows).toHaveLength(5)` だけ——5回ループしたことしか
 * 見ておらず、肝心の数字は `console.log` へ流すだけだった。
 * そのために毎回のCIが約170秒(7件で)遅くなっていた。**測定はテストではない。**
 *
 * 数字が要る時は `npx tsx tools/battleLab/tower70/measure.ts` から回す。
 * ここに残すのは、壊れたら落ちる仕様の見張りだけ。
 */

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
});
