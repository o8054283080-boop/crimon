import { describe, expect, it } from "vitest";
import { dependentBase, multiHitDamage, simulatedDamage, simulatedDamageBreakdown } from "../tools/damageBalance.js";

describe("damage balance simulation", () => {
  it("always returns a finite positive integer at boundaries", () => {
    for (const atk of [0, 1, 1000, 1e12, Number.POSITIVE_INFINITY])
      for (const def of [0, 1, 6500, 1e12, Number.POSITIVE_INFINITY])
        for (const mode of ["A", "B", "C", "D", "E"] as const) {
          const value = simulatedDamage({ atk, def, multiplier: 3, crit: 3, mode });
          expect(Number.isFinite(value)).toBe(true); expect(value).toBeGreaterThanOrEqual(1);
        }
  });
  it("defense ignore bypasses both reductions", () => {
    expect(simulatedDamage({ atk: 3000, def: 1e9, multiplier: 3, mode: "C", ignoreDefense: true })).toBe(9000);
  });
  it("supports extreme HP/DEF dependent bases without NaN", () => {
    expect(dependentBase(1000, 1, 1e9, 0.15)).toBe(150001000);
    expect(dependentBase(0, 1, Number.POSITIVE_INFINITY, 3)).toBe(0);
  });
  it("one skill-level flat reduction avoids the multi-hit penalty", () => {
    const input = { atk: 3000, def: 2000, multiplier: 3, mode: "C" as const };
    expect(multiHitDamage(input, 6, false)).toBeGreaterThan(multiHitDamage(input, 6, true));
  });
  it("E caps flat reduction at a configurable share of post-ratio damage", () => {
    const result = simulatedDamageBreakdown({ atk: 1000, def: 4000, skillMultiplier: 1, mode: "E", flatCap: 0.25 });
    expect(result.flatReduction).toBeCloseTo(result.afterRatio * 0.25);
    expect(result.damage).toBe(107);
    expect(simulatedDamage({ atk: 1000, def: 4000, skillMultiplier: 1, mode: "C" })).toBe(1);
  });
  it("same total multiplier is invariant across hit counts", () => {
    for (const mode of ["C", "E"] as const) {
      const values = [1, 3, 6].map((hits) => multiHitDamage({ atk: 2000, def: 4000, skillMultiplier: 3, mode }, hits));
      expect(new Set(values).size).toBe(1);
    }
  });
  it("supports aliases, HP ratio and configurable defense coefficient", () => {
    const legacy = simulatedDamage({ atk: 4000, def: 6500, multiplier: 3, crit: 2, mode: "E" });
    const configured = simulatedDamageBreakdown({ atk: 4000, def: 6500, hp: 50000, skillMultiplier: 3, critMultiplier: 2, mode: "E", defenseRatio: 1.5 });
    expect(configured.damage).toBe(legacy);
    expect(configured.hpRatio).toBeCloseTo(configured.damage / 50000);
  });
  it("zero attack, zero defense and invalid inputs never produce NaN/Infinity", () => {
    for (const input of [
      { atk: 0, def: 0, skillMultiplier: 0.5 },
      { atk: 10000, def: 0, skillMultiplier: 5 },
      { atk: 1, def: 1e12, skillMultiplier: 0.5 },
      { atk: Number.NaN, def: Number.POSITIVE_INFINITY, skillMultiplier: Number.NaN },
    ]) for (const mode of ["C", "E"] as const) {
      const value = simulatedDamage({ ...input, mode, critMultiplier: 3, hits: 6 });
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
    }
  });
});
