import { describe, expect, it } from "vitest";
import { auditLatentAwakening } from "../tools/latentAwakeningAudit.js";

describe("潜在覚醒216候補監査", () => {
  const audit = auditLatentAwakening();
  it("72体へ重複のない216候補を3つずつ提供する", () => {
    expect(audit.monsterCount).toBe(72); expect(audit.candidateCount).toBe(216); expect(audit.duplicateIds).toEqual([]);
    expect(Object.values(audit.candidatesPerMonster).every((count) => count === 3)).toBe(true);
  });
  it("主要な役割変更カテゴリを欠かさない", () => {
    for (const count of [audit.aoeConversionCount, audit.healBlockCount, audit.gaugeDownCount, audit.stripCount, audit.spdDownCount,
      audit.poisonCount, audit.stunCount, audit.ignoreDefenseCount, audit.buffBlockCount, audit.allyGaugeUpCount,
      audit.debuffExtendCount, audit.debuffCountDamageCount, audit.healSupportCount, audit.durabilityCount]) expect(count).toBeGreaterThan(0);
  });
});
