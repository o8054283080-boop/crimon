import { describe, expect, it } from "vitest";
import { auditLatentAwakening } from "../tools/latentAwakeningAudit.js";

describe("潜在覚醒216候補監査", () => {
  const audit = auditLatentAwakening();
  it("図鑑の全個体へ重複のない候補を3つずつ提供する", () => {
    // モンスターを足すたびに増える数。**3つずつ揃っていることと、idが重複しないこと**を見る
    expect(audit.monsterCount).toBeGreaterThanOrEqual(72); expect(audit.candidateCount).toBe(audit.monsterCount * 3); expect(audit.duplicateIds).toEqual([]);
    expect(Object.values(audit.candidatesPerMonster).every((count) => count === 3)).toBe(true);
  });
  it("主要な役割変更カテゴリを欠かさない", () => {
    for (const count of [audit.aoeConversionCount, audit.healBlockCount, audit.gaugeDownCount, audit.stripCount, audit.spdDownCount,
      audit.poisonCount, audit.stunCount, audit.ignoreDefenseCount, audit.buffBlockCount, audit.allyGaugeUpCount,
      audit.debuffExtendCount, audit.debuffCountDamageCount, audit.healSupportCount, audit.durabilityCount]) expect(count).toBeGreaterThan(0);
  });
});
