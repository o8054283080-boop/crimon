import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { DamageEffect } from "../src/core/skill.js";
import { findMonsterById } from "../src/data/monsters.js";
import { buildEnemy } from "../tools/battleLab/build.js";
import { attachProbe } from "../tools/battleLab/hook.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import { buildTower70V4, TOWER70_HEAL_BLOCK } from "../tools/battleLab/scenarios/tower70v4.js";


function healBlockEffects(monsterId: string) {
  const monster = findMonsterById(monsterId)!;
  return monster.skills.flatMap((skill) => skill.effects.filter((effect) => effect.kind === "HEAL_BLOCK"));
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
});
