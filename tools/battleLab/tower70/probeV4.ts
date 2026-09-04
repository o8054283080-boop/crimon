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
 * 3. 攻略AIは「攻撃対象とは別に回復阻害だけ始祖ベヒモスへ維持する」手動攻略を近似する
 *
 * Battle Labの既存focus AIは単体スキルの対象をすべて同じ相手へ向けるため、
 * 生命晶を殴っている最中は回復阻害まで生命晶へ飛ぶ。実プレイヤーは回復阻害だけ
 * ボスへ入れられるので、成功ログが出た回復阻害はボスに維持したものとして追跡する。
 * ダメージ部分までボスへ移さないため、火力面では保守的な近似になっている。
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

      // プレイヤー側で治癒阻害の付与が成功したら、手動攻略ではボスへ入れたものとして扱う。
      // 確率・命中・抵抗の成功判定自体はBattleEngineが出した実ログを使う。
      if (unitId.startsWith("P") && lines.some((line) => line.includes("治癒阻害を受けた"))) {
        manualHealBlockTurns = Math.max(manualHealBlockTurns, 2);
        healBlockMultiplier = 0;
        healBlockApplied += 1;
      }

      // 生命晶がS2「生命の律動」を使えば、ボスへ維持している回復阻害も全解除される。
      if (unitId === LIFE && lines.some((line) => line.includes("「生命の律動」"))) {
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
