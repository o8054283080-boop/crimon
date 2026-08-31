import { describe, expect, it } from "vitest";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import { describeLatentEffect } from "../src/web/views/monsterCreate.js";

describe("潜在候補の表示と宣言値の整合", () => {
  const all = Object.values(LATENT_ABILITY_CANDIDATES).flat();
  it("攻勢候補に説明外の一律damage bonusがない", () => {
    for (const candidate of all.filter((value) => value.id.endsWith("_latent_1"))) {
      /*
       * 能力比例を伸ばす候補(HP比例・防御比例)は、**説明文でそう言っている**ので
       * ここでは通す。見張りたいのは「説明に無い一律のダメージ増」なので、
       * 素の DAMAGE_UP に紛れ込んだ value != 0 だけを落とす。
       */
      if (candidate.effectType === "HP_SCALING" || candidate.effectType === "DEF_SCALING") {
        expect(candidate.description, candidate.id).toContain("比例");
        continue;
      }
      expect(candidate.effectType).toBe("DAMAGE_UP");
      expect(candidate.value).toBe(0);
    }
  });
  it("全体化説明と主・副対象の倍率が70%で一致する", () => {
    for (const candidate of all.filter((value) => value.aoeConversion)) {
      expect(candidate.aoeConversion?.damageMultiplier).toBe(.7);
      expect(candidate.description).toContain("威力70%");
      expect(describeLatentEffect(candidate)).toContain("主対象・副対象とも威力70%");
    }
  });
  it("runtime effectの実確率・数値・ターンを日本語表示する", () => {
    const expectations = { HEAL_BLOCK: "80%", SPD_DOWN: "75%", POISON: "70%", STUN: "45%", BUFF_BLOCK: "70%" };
    for (const [status, chance] of Object.entries(expectations)) {
      const candidate = all.find((value) => value.runtimeEffects?.some((effect) => effect.kind === "DEBUFF" && effect.status === status))!;
      const text = describeLatentEffect(candidate);
      expect(text).toContain(chance); expect(text).not.toContain("確定発動");
    }
    for (const kind of ["STRIP", "GAUGE_DOWN"] as const) {
      const candidate = all.find((value) => value.runtimeEffects?.some((effect) => effect.kind === kind))!;
      expect(describeLatentEffect(candidate)).toContain("80%の確率");
    }
  });
  it("守護膜に隠れHP補正がなく、不屈装甲は全効果を表示する", () => {
    const guardian = all.find((candidate) => candidate.name.endsWith("守護膜"))!;
    expect(guardian.hpMultiplier).toBeUndefined();
    expect(describeLatentEffect(guardian)).toContain("10%シールド（2ターン）");
    const armor = all.find((candidate) => candidate.name.endsWith("不屈装甲"))!;
    const text = describeLatentEffect(armor);
    expect(text).toContain("6%シールド（1ターン）"); expect(text).toContain("最大HP+10%");
    expect(text).toContain("防御力+12%"); expect(text).toContain("受けるダメージ-8%");
  });
});
