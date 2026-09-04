import type { ScenarioProbe, TrackedUnit } from "../types.js";
import { tower70Probe } from "./probe.js";
import type { Tower70Numbers } from "./spec.js";

const BOSS = "E1";
const LIFE = "E2";

/** 第4回以降の終盤段階。上から順に最も厳しい段を1つだけ使う。 */
const V4_TIERS = [
  { hpRatio: 0.15, spd: 70, hpFactor: 2.50 },
  { hpRatio: 0.30, spd: 45, hpFactor: 2.00 },
  { hpRatio: 0.50, spd: 25, hpFactor: 1.50 },
  { hpRatio: 0.70, spd: 10, hpFactor: 1.20 },
] as const;

/**
 * 回復阻害攻略と終盤火力を測る専用probe。
 *
 * 1. HP比例ダメージを 70%:+20 / 50%:+50 / 30%:+100 / 15%:+150 へ強化
 * 2. 治癒阻害がボスに付いている間、3%+生命晶4%の特殊再生も完全に0にする
 *
 * ここでの治癒阻害は第5回検証仕様「回復完全不可」。
 * 生命晶の全解除で解除された場合は追跡側も解除する。
 */
export function tower70V4Probe(
  context: { unitOf(id: string): TrackedUnit | undefined; aliveOf(id: string): boolean },
  numbers: Tower70Numbers,
): ScenarioProbe {
  const base = tower70Probe(context, numbers);

  let manualHealBlockTurns = 0;
  let healBlockMultiplier = 1;
  let bossTurnHealMultiplier = 1;
  let blockedHealing = 0;
  let healBlockApplied = 0;
  let healBlockBossTurns = 0;
  let bossTurns = 0;

  let acted15 = 0;
  let acted30 = 0;
  let acted50 = 0;
  let acted70 = 0;

  const tierOf = (unit: TrackedUnit) => {
    const ratio = unit.currentHp / unit.maxHp;
    return V4_TIERS.find((tier) => ratio <= tier.hpRatio) ?? null;
  };

  const applyV4Tier = (unit: TrackedUnit): void => {
    const tier = tierOf(unit);
    if (!tier) return;
    unit.flatStatBonus.spd = tier.spd;
    unit.setHpCoefficientFactor(tier.hpFactor);
    unit.mitigateAmount = 0.10;
    unit.mitigateTurns = 2;
  };

  return {
    beforeTurn(unitId) {
      base.beforeTurn(unitId);
      const boss = context.unitOf(BOSS);
      if (!boss?.alive || unitId !== BOSS) return;

      bossTurns += 1;
      if (manualHealBlockTurns > 0) {
        manualHealBlockTurns -= 1;
        if (manualHealBlockTurns <= 0) healBlockMultiplier = 1;
      }
      bossTurnHealMultiplier = manualHealBlockTurns > 0 ? healBlockMultiplier : 1;
      if (bossTurnHealMultiplier < 1) healBlockBossTurns += 1;

      const ratio = boss.currentHp / boss.maxHp;
      if (ratio <= 0.15) acted15 += 1;
      else if (ratio <= 0.30) acted30 += 1;
      else if (ratio <= 0.50) acted50 += 1;
      else if (ratio <= 0.70) acted70 += 1;
    },

    afterTurn(unitId, lines) {
      const bossBeforeBase = context.unitOf(BOSS)?.currentHp ?? 0;

      base.afterTurn(unitId, lines);

      const boss = context.unitOf(BOSS);
      if (!boss) return;

      // 実戦で成功した付与だけをログから拾う。第5回は「完全回復不可」として扱う。
      for (const line of lines) {
        if (line.includes("[敵:E1]") && line.includes("治癒阻害を受けた")) {
          manualHealBlockTurns = Math.max(manualHealBlockTurns, 2);
          healBlockMultiplier = 0;
          healBlockApplied += 1;
        }
      }

      // 生命晶S2でボスの弱化が全解除されたら、追跡側も解除する。
      if (unitId === LIFE && lines.some((line) => line.includes("[敵:E1]") && line.includes("デバフが解除された"))) {
        manualHealBlockTurns = 0;
        healBlockMultiplier = 1;
        bossTurnHealMultiplier = 1;
      }

      // base probeが直接加えた特殊再生へ治癒阻害を適用。0なら全回復を取り消す。
      if (unitId === BOSS && boss.alive && bossTurnHealMultiplier < 1) {
        const healedByBase = Math.max(0, boss.currentHp - bossBeforeBase);
        const allowed = Math.floor(healedByBase * bossTurnHealMultiplier);
        const prevented = healedByBase - allowed;
        if (prevented > 0) {
          boss.currentHp = Math.max(1, boss.currentHp - prevented);
          blockedHealing += prevented;
        }
      }

      if (boss.alive) applyV4Tier(boss);
    },

    finish() {
      const original = base.finish();
      return {
        ...original,
        V4治癒阻害成功: healBlockApplied,
        V4治癒阻害中ボス手番: healBlockBossTurns,
        V4ボス総手番: bossTurns,
        V4治癒阻害稼働率: bossTurns > 0 ? healBlockBossTurns / bossTurns : 0,
        V4阻害した回復量: blockedHealing,
        "V4_HP70帯行動": acted70,
        "V4_HP50帯行動": acted50,
        "V4_HP30帯行動": acted30,
        "V4_HP15帯行動": acted15,
      };
    },
  };
}
