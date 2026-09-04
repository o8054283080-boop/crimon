import type { ScenarioProbe, TrackedUnit } from "../types.js";
import { tower70V5Probe } from "./probeV5.js";
import type { Tower70Numbers } from "./spec.js";

const BOSS = "E1";

const V6_TIERS = [
  { hpRatio: 0.30, atk: 1500, spd: 45, hpFactor: 2.50 },
  { hpRatio: 0.50, atk: 1000, spd: 25, hpFactor: 1.60 },
  { hpRatio: 0.70, atk: 500, spd: 10, hpFactor: 1.30 },
] as const;

/**
 * 第6回:
 * - 被ダメージ軽減を完全削除
 * - HP70%以下: ATK+500 / HP比例+30%
 * - HP50%以下: ATK+1000 / HP比例+60%
 * - HP30%以下: ATK+1500 / HP比例+150%
 * - SPDは従来の +10 / +25 / +45 を維持
 * - 段階は加算ではなく置き換え、回復で上の帯へ戻れば補正も戻る
 */
export function tower70V6Probe(
  context: { unitOf(id: string): TrackedUnit | undefined; aliveOf(id: string): boolean },
  numbers: Tower70Numbers,
): ScenarioProbe {
  const base = tower70V5Probe(context, numbers);

  const applyV6Tier = (): void => {
    const boss = context.unitOf(BOSS);
    if (!boss?.alive) return;
    const ratio = boss.currentHp / boss.maxHp;
    const tier = V6_TIERS.find((candidate) => ratio <= candidate.hpRatio) ?? null;

    boss.mitigateAmount = 0;
    boss.mitigateTurns = 0;

    if (!tier) {
      boss.flatStatBonus.atk = 0;
      boss.flatStatBonus.spd = 0;
      boss.setHpCoefficientFactor(1);
      return;
    }

    boss.flatStatBonus.atk = tier.atk;
    boss.flatStatBonus.spd = tier.spd;
    boss.setHpCoefficientFactor(tier.hpFactor);
  };

  return {
    beforeTurn(unitId) {
      base.beforeTurn(unitId);
      applyV6Tier();
    },
    afterTurn(unitId, lines) {
      base.afterTurn(unitId, lines);
      applyV6Tier();
    },
    finish() {
      return base.finish();
    },
  };
}
