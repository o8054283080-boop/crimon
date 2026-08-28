import { describe, expect, it } from "vitest";
import { auditLatentCandidates } from "../tools/latentAwakeningAudit.js";

describe("潜在覚醒独立監査ツール", () => {
  it("現行72体216候補を重複なく分類する", () => {
    const audit = auditLatentCandidates();
    expect(audit.monsterCount).toBe(72);
    expect(audit.candidateCount).toBe(216);
    expect(audit.duplicateIdCount).toBe(0);
    expect(audit.candidatesPerMonster).toEqual({ 3: 72 });
    expect(Object.fromEntries(Object.entries(audit.categories).map(([key, ids]) => [key, ids.length]))).toEqual({
      aoe: 0, healBlock: 6, gaugeDown: 6, strip: 0, spdDown: 6, poison: 0, stun: 0,
      ignoreDefense: 0, buffBlock: 12, allyGauge: 6, debuffExtend: 0, debuffBonusDamage: 0,
      healSupport: 36, durability: 42, otherSpecial: 24,
    });
  });
});
