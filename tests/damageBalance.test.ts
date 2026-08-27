import { describe, expect, it } from "vitest";
import { dependentBase, multiHitDamage, simulatedDamage } from "../tools/damageBalance.js";

describe("damage balance simulation", () => {
  it("always returns a finite positive integer at boundaries", () => {
    for (const atk of [0, 1, 1000, 1e12, Number.POSITIVE_INFINITY])
      for (const def of [0, 1, 6500, 1e12, Number.POSITIVE_INFINITY])
        for (const mode of ["A", "B", "C", "D"] as const) {
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
});
