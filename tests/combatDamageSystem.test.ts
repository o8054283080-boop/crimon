import { describe, expect, it } from "vitest";
import { calcDamage } from "../src/battle/damage.js";
import { applyDefenseE, calculateBaseDamage } from "../src/battle/damageFormula.js";
import { createBattleUnit } from "../src/battle/unit.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { Stats } from "../src/core/stats.js";

const stats = (overrides: Partial<Stats>): Stats => ({
  hp: 30000, atk: 2000, def: 3500, spd: 100, criRate: 0, criDmg: 1.5,
  resistance: 0, accuracy: 0, ...overrides,
});
const unit = (side: "PLAYER" | "ENEMY", overrides: Partial<Stats>) => createBattleUnit({
  id: `formula_${side}`, templateId: "formula", name: "式テスト", element: "FIRE", color: "#fff",
  role: "test", emoji: "x", stats: stats(overrides), skills: [] as unknown as MonsterDefinition["skills"],
}, side, side);

describe("production combat damage formula E", () => {
  it.each([
    [1000, 3000, 3, 409], [1000, 4000, 3, 321], [1000, 6500, 3, 209],
    [2000, 4000, 3, 1125], [4000, 6500, 3, 2618],
  ])("reproduces ATK %i / DEF %i / x%i", (atk, def, multiplier, expected) => {
    expect(Math.round(applyDefenseE(atk * multiplier, atk, def).afterDefense)).toBe(expected);
  });

  it("covers the requested ATK/DEF/multiplier/critical matrix without invalid damage", () => {
    for (const atk of [1000, 2000, 3000, 6000, 10000])
      for (const def of [0, 1000, 2000, 4000, 6500])
        for (const multiplier of [0.5, 1, 2, 3, 5])
          for (const crit of [1, 1.5, 2, 2.5, 3]) {
            const value = applyDefenseE(atk * multiplier, atk, def).afterDefense * crit;
            expect(Number.isFinite(value)).toBe(true);
            expect(Math.round(value)).toBeGreaterThan(1);
          }
  });

  it("applies flat defense once per target resolution while retaining per-hit critical rolls", () => {
    const attacker = unit("PLAYER", { atk: 2000, criRate: 0.5, criDmg: 2 });
    const defender = unit("ENEMY", { def: 4000 });
    for (const hits of [1, 3, 6]) {
      const effect = { kind: "DAMAGE", multiplier: 3 / hits, hits } as const;
      const damages = Array.from({ length: hits }, () => calcDamage(attacker, defender, effect, () => 0.99).damage);
      // Hit単位表示の整数丸めにより最大3差だが、固定軽減の重複による差はない。
      expect(Math.abs(damages.reduce((a, b) => a + b, 0) - 1125)).toBeLessThanOrEqual(3);
    }
    const rolls = [0.1, 0.9, 0.1];
    const criticals = rolls.map((roll) => calcDamage(attacker, defender, { kind: "DAMAGE", multiplier: 1, hits: 3 }, () => roll).isCrit);
    expect(criticals).toEqual([true, false, true]);
  });

  it("bypasses ratio and flat defense together", () => {
    expect(applyDefenseE(6000, 3000, 6500, true)).toEqual({ afterRatio: 6000, flatReduction: 0, afterDefense: 6000 });
  });

  it.each([[10000], [30000], [50000], [90000]])("uses maximum HP as an independent term (%i)", (hp) => {
    for (const [coefficient, expected] of [[0.03, 2000 + hp * 0.03], [0.04, 2000 + hp * 0.04], [0.05, 2000 + hp * 0.05]])
      expect(calculateBaseDamage(2000, 1, hp, coefficient)).toBe(expected);
  });

  it.each([[0.5, 3750], [0.75, 4625], [1, 5500]])("uses effective DEF as an independent term", (coefficient, expected) => {
    expect(calculateBaseDamage(2000, 1, 3500, coefficient)).toBe(expected);
  });
});
