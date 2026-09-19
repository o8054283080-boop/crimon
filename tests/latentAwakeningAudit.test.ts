import { describe, expect, it } from "vitest";
import { auditLatentAwakening } from "../tools/latentAwakeningAudit.js";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";

describe("潜在覚醒216候補監査", () => {
  const audit = auditLatentAwakening();

  /*
   * **候補の名前は種族名の表から作る。**表に無い種族を足すと
   * 「炎のundefined」という名前が図鑑の詳細に3つ並ぶ
   * (コラボ4種を入れた時に実際に出た。数も件数も正しいまま、名前だけが壊れる)。
   */
  it("候補の名前に undefined が混じっていない", () => {
    const broken: string[] = [];
    for (const [dexId, list] of Object.entries(LATENT_ABILITY_CANDIDATES)) {
      for (const ability of list) {
        if (ability.name.includes("undefined")) broken.push(`${dexId}: ${ability.name}`);
      }
    }
    expect(broken, `名前が壊れている候補:\n${broken.slice(0, 12).join("\n")}`).toEqual([]);
  });

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
