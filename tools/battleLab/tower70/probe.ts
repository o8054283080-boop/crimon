/**
 * 70階の、手番の境目でだけ効く挙動と、その計測(第2回改訂)。
 *
 * ## ここが受け持つもの
 *
 *   1. 始祖ベヒモスの自ターン終了時の回復(常時3% / 生命晶が生きていれば+4%)
 *   2. 「不滅の巨獣」の3段階 — **加算ではなく置き換え。HPが戻れば下がる**
 *        HP70%以下 …… 被ダメ-10% / SPD+10 / HP比例+10%
 *        HP50%以下 …… 被ダメ-10% / SPD+25 / HP比例+20%
 *        HP30%以下 …… 被ダメ-10% / SPD+45 / HP比例+35%
 *   3. 「始祖の咆哮」 — HP75%/50%/25%を初めて下回った時に1回ずつ
 *   4. 脈動晶の周期シールド
 *
 * どれも本編に機構が無い。代わりに、本編がすでに持っている口へ写している:
 *
 *   ・被ダメ減 → `mitigateTurns` / `mitigateAmount`(本編の軽減そのもの)
 *   ・速度 …… → `flatStatBonus.spd`(本編の実数加算そのもの)
 *   ・HP比例 → `hpCoefficient` を素の値から掛け直す(本編の式と数値が一致)
 *   ・咆哮 …… → `counterWithSkill`(手番もCTもゲージも消費しない本編の口)
 *
 * **ダメージ計算にも命中判定にも会心にも防御計算にもAIにも入らない。**
 *
 * ## 第1回からの直し
 *
 * HP比例の倍率を現在値へ掛けていたため、段が上がるたびに積み重なり、
 * HPが戻っても弱い段へ下がれなかった。今回は**素の定義から**掛け直す。
 */
import type { Skill } from "../../../src/core/skill.js";
import type { ScenarioProbe, TrackedUnit } from "../types.js";
import { TOWER70_ROAR, TOWER70_ROAR_THRESHOLDS, tower70TierAt, type Tower70Numbers } from "./spec.js";

const BOSS = "E1";
const LIFE = "E2";
const PULSE = "E3";

interface Context {
  unitOf(id: string): TrackedUnit | undefined;
  aliveOf(id: string): boolean;
}

/** 始祖の咆哮。**素の8%のまま**(段階のHP比例上乗せは掛けない) */
export function roarSkill(): Skill {
  return {
    id: "lab_t70_roar",
    name: "始祖の咆哮",
    description: "敵全体に攻撃力2.0倍と最大HP8%ぶんのダメージを与え、行動ゲージを50%減少させ、3ターン防御力を大きく低下させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: TOWER70_ROAR.multiplier, hpCoefficient: TOWER70_ROAR.hpCoefficient },
      { kind: "GAUGE", amount: -TOWER70_ROAR.gaugeDown },
      // 「100%」でも本編の命中/抵抗判定は通る。そこは本編の挙動に合わせる
      { kind: "DEBUFF", stat: "def", amount: TOWER70_ROAR.defDown, durationTurns: TOWER70_ROAR.defDownTurns, chance: 1 },
    ],
  };
}

interface Counters {
  bossHealed: number;
  bossRegenTicks: number;
  bossRegenWithLife: number;
  lifeBonusHealed: number;

  lifeCleanses: number;
  lifeCleansedDebuffs: number;
  lifeCleansedPoison: number;
  lifeCleansedPoisonStacks: number;
  /** 生命晶が生きていた手番の数 */
  lifeAliveTurns: number;
  pulseAliveTurns: number;

  pulseShields: number;
  pulseShieldsPeriodic: number;
  pulseShieldAbsorbed: number;

  /** 段階ごとの、本体が行動した手番の数 */
  actedTier70: number;
  actedTier50: number;
  actedTier30: number;
  /** 段階ごとの、本体が攻撃した回数(HP比例の上乗せが乗った攻撃) */
  attackedTier70: number;
  attackedTier50: number;
  attackedTier30: number;
  /** 到達(1なら到達した) */
  reached70: number;
  reached50: number;
  reached30: number;
  /** 回復して弱い段へ戻った回数 */
  tierDowngrades: number;
  recoveredFrom30: number;

  bossS3Uses: number;
  bossS3Cleansed: number;

  /** 咆哮 */
  roar75: number;
  roar50: number;
  roar25: number;
  roarDamage: number;
  roarKills: number;
  /** 咆哮でこちらが全滅した */
  roarWipe: number;
  /** 咆哮の直前と直後の、味方の残HP割合 */
  roarHpBefore: number;
  roarHpAfter: number;
  /** 3回すべて出た */
  roarAll3: number;
  /** 咆哮を受けた後に味方が誰か生き残っていた回数 */
  roarSurvived: number;

  poisonApplied: number;
  poisonDamage: number;
  poisonDamageBeforeLifeDeath: number;
  poisonDamageAfterLifeDeath: number;
  poisonKills: number;
  bossDamageTaken: number;
}

function newCounters(): Counters {
  return {
    bossHealed: 0, bossRegenTicks: 0, bossRegenWithLife: 0, lifeBonusHealed: 0,
    lifeCleanses: 0, lifeCleansedDebuffs: 0, lifeCleansedPoison: 0, lifeCleansedPoisonStacks: 0,
    lifeAliveTurns: 0, pulseAliveTurns: 0,
    pulseShields: 0, pulseShieldsPeriodic: 0, pulseShieldAbsorbed: 0,
    actedTier70: 0, actedTier50: 0, actedTier30: 0,
    attackedTier70: 0, attackedTier50: 0, attackedTier30: 0,
    reached70: 0, reached50: 0, reached30: 0, tierDowngrades: 0, recoveredFrom30: 0,
    bossS3Uses: 0, bossS3Cleansed: 0,
    roar75: 0, roar50: 0, roar25: 0, roarDamage: 0, roarKills: 0, roarWipe: 0,
    roarHpBefore: 0, roarHpAfter: 0, roarAll3: 0, roarSurvived: 0,
    poisonApplied: 0, poisonDamage: 0, poisonDamageBeforeLifeDeath: 0, poisonDamageAfterLifeDeath: 0,
    poisonKills: 0, bossDamageTaken: 0,
  };
}

const POISON_DAMAGE = /は毒\((\d+)スタック\)でダメージを受けた！ (\d+)/;
const POISON_APPLIED = /は毒を受けた！ \((\d+)スタック/;
const DAMAGE_LINE = / に (\d+) ダメージ！/;
const PLAYER_IDS = ["P1", "P2", "P3", "P4", "P5"];

export function tower70Probe(context: Context, numbers: Tower70Numbers): ScenarioProbe {
  const counters = newCounters();

  const boss = () => context.unitOf(BOSS);
  const lifeAlive = () => context.aliveOf(LIFE);

  let beforeDebuffs = [0, 0, 0];
  let beforePoisonStacks = 0;
  let beforeShield = 0;
  /** すでに鳴らした咆哮の閾値 */
  const roared = new Set<number>();
  /** いま効いている段の hpRatio(null なら補正なし) */
  let currentTier: number | null = null;
  let wasBelow30 = false;
  let lifeDead = false;
  let pulseTurns = 0;

  const debuffsOf = (): number[] => [BOSS, LIFE, PULSE].map((id) => context.unitOf(id)?.debuffCount ?? 0);

  const playerHpRatio = (): number => {
    let current = 0;
    let max = 0;
    for (const id of PLAYER_IDS) {
      const unit = context.unitOf(id);
      if (!unit) continue;
      current += Math.max(0, unit.currentHp);
      max += unit.maxHp;
    }
    return max > 0 ? current / max : 0;
  };
  const playersAlive = (): number => PLAYER_IDS.filter((id) => context.aliveOf(id)).length;

  /**
   * HP割合に応じた段を張り直す。**置き換え式。**
   * 弱い段へ下がる時も、補正なしへ戻る時も、ここを通る。
   */
  const applyTier = (unit: TrackedUnit): void => {
    const ratio = unit.currentHp / unit.maxHp;
    const tier = tower70TierAt(ratio, numbers.tierProfile);

    if (tier === null) {
      if (currentTier !== null) counters.tierDowngrades += 1;
      currentTier = null;
      unit.flatStatBonus.spd = 0;
      unit.setHpCoefficientFactor(1);
      // 70%を上回ったら軽減も外す
      unit.mitigateTurns = 0;
      unit.mitigateAmount = 0;
    } else {
      if (currentTier !== null && tier.hpRatio > currentTier) counters.tierDowngrades += 1;
      currentTier = tier.hpRatio;
      unit.flatStatBonus.spd = tier.spd;
      unit.setHpCoefficientFactor(1 + tier.hpDamageUp);
      unit.mitigateAmount = tier.damageTakenCut;
      unit.mitigateTurns = 2;
      if (tier.hpRatio === 0.7) counters.reached70 = 1;
      if (tier.hpRatio <= 0.5) { counters.reached70 = 1; counters.reached50 = 1; }
      if (tier.hpRatio <= 0.3) { counters.reached30 = 1; wasBelow30 = true; }
    }

    if (wasBelow30 && ratio >= 0.5) {
      counters.recoveredFrom30 += 1;
      wasBelow30 = false;
    }
  };

  /**
   * 閾値を跨いだぶんだけ咆哮を鳴らす。
   *
   * **一撃で飛び越えても、飛び越えた数だけ上から順に出す。**
   * 高火力で75%と50%をまとめて抜いてもギミックを無視できないように。
   */
  const roarIfCrossed = (unit: TrackedUnit): void => {
    if (!numbers.roar || !unit.alive) return;
    for (const threshold of TOWER70_ROAR_THRESHOLDS) {
      if (roared.has(threshold)) continue;
      if (unit.currentHp / unit.maxHp > threshold) continue;
      roared.add(threshold);

      const hpBefore = playerHpRatio();
      const aliveBefore = playersAlive();
      const roarLines = unit.fireImmediate(roarSkill());
      const hpAfter = playerHpRatio();
      const aliveAfter = playersAlive();

      // 咆哮の打点は、その1発で増えたログから直に読む
      for (const line of roarLines) {
        if (!line.startsWith("  → [味方:")) continue;
        const damage = DAMAGE_LINE.exec(line);
        if (damage) counters.roarDamage += Number(damage[1]);
      }

      if (threshold === 0.75) counters.roar75 += 1;
      if (threshold === 0.5) counters.roar50 += 1;
      if (threshold === 0.25) counters.roar25 += 1;
      counters.roarHpBefore += hpBefore;
      counters.roarHpAfter += hpAfter;
      counters.roarKills += Math.max(0, aliveBefore - aliveAfter);
      if (aliveAfter === 0) counters.roarWipe += 1;
      else counters.roarSurvived += 1;

      // 全滅したらそこで打ち切る(残りの閾値は鳴らさない)
      if (aliveAfter === 0) return;
    }
  };

  return {
    beforeTurn(unitId) {
      const bossUnit = boss();
      if (!bossUnit) return;
      beforeDebuffs = debuffsOf();
      beforePoisonStacks = bossUnit.poisonStacks;
      beforeShield = bossUnit.shieldValue;

      if (lifeAlive()) counters.lifeAliveTurns += 1;
      if (context.aliveOf(PULSE)) counters.pulseAliveTurns += 1;

      if (unitId === BOSS && bossUnit.alive) {
        const tier = tower70TierAt(bossUnit.currentHp / bossUnit.maxHp, numbers.tierProfile);
        if (tier?.hpRatio === 0.7) { counters.actedTier70 += 1; counters.attackedTier70 += 1; }
        if (tier?.hpRatio === 0.5) { counters.actedTier50 += 1; counters.attackedTier50 += 1; }
        if (tier?.hpRatio === 0.3) { counters.actedTier30 += 1; counters.attackedTier30 += 1; }
      }
    },

    afterTurn(unitId, lines) {
      const bossUnit = boss();
      if (!bossUnit) return;

      for (const line of lines) {
        const poisonDamage = POISON_DAMAGE.exec(line);
        if (poisonDamage && line.includes("[敵:E1]")) {
          const amount = Number(poisonDamage[2]);
          counters.poisonDamage += amount;
          counters.bossDamageTaken += amount;
          if (lifeDead) counters.poisonDamageAfterLifeDeath += amount;
          else counters.poisonDamageBeforeLifeDeath += amount;
          continue;
        }
        if (POISON_APPLIED.test(line) && line.includes("[敵:E1]")) counters.poisonApplied += 1;
        const damage = DAMAGE_LINE.exec(line);
        if (damage && line.includes("[敵:E1]")) counters.bossDamageTaken += Number(damage[1]);
      }
      for (let i = 1; i < lines.length; i += 1) {
        if (lines[i].includes("[敵:E1]") && lines[i].includes("は倒れた！") && POISON_DAMAGE.test(lines[i - 1])) {
          counters.poisonKills += 1;
        }
      }

      const afterDebuffs = debuffsOf();
      if (unitId === LIFE && lines.some((line) => line.includes("のデバフが解除された！"))) {
        counters.lifeCleanses += 1;
        for (let i = 0; i < 3; i += 1) counters.lifeCleansedDebuffs += Math.max(0, beforeDebuffs[i] - afterDebuffs[i]);
        if (beforePoisonStacks > 0 && bossUnit.poisonStacks === 0) {
          counters.lifeCleansedPoison += 1;
          counters.lifeCleansedPoisonStacks += beforePoisonStacks;
        }
      }
      if (unitId === BOSS && lines.some((line) => line.includes("「天地崩壊」"))) {
        counters.bossS3Uses += 1;
        counters.bossS3Cleansed += Math.max(0, beforeDebuffs[0] - afterDebuffs[0]);
      }

      if (bossUnit.shieldValue < beforeShield) counters.pulseShieldAbsorbed += beforeShield - bossUnit.shieldValue;
      if (unitId === PULSE && lines.some((line) => line.includes("にシールドが張られた！"))) counters.pulseShields += 1;

      if (!lifeAlive()) lifeDead = true;

      if (unitId === PULSE && context.aliveOf(PULSE)) {
        pulseTurns += 1;
        if (pulseTurns % numbers.pulseShieldEveryTurns === 0 && bossUnit.alive) {
          const amount = Math.round(bossUnit.maxHp * numbers.pulseShieldRate);
          if (amount > bossUnit.shieldValue) bossUnit.shieldValue = amount;
          bossUnit.shieldTurns = Math.max(bossUnit.shieldTurns, 2);
          counters.pulseShields += 1;
          counters.pulseShieldsPeriodic += 1;
        }
      }

      if (!bossUnit.alive) return;

      /*
       * **咆哮がいちばん先。**
       *
       * 順番を「回復 → 咆哮」にしていて、閾値のすぐ上まで削れた本体が
       * 自分の手番で回復して**閾値を跨ぎ直し、咆哮が鳴らない**ことがあった
       * (HP74%→回復で81%)。削られて割った事実の方が先に起きているので、
       * 咆哮 → 回復 → 段の張り直し、の順で固定する
       */
      roarIfCrossed(bossUnit);

      if (unitId === BOSS && bossUnit.alive) {
        const rate = numbers.bossRegen + (lifeAlive() ? numbers.lifeCrystalRegenBonus : 0);
        const before = bossUnit.currentHp;
        bossUnit.currentHp = Math.min(bossUnit.maxHp, bossUnit.currentHp + Math.round(bossUnit.maxHp * rate));
        const healed = bossUnit.currentHp - before;
        counters.bossHealed += healed;
        counters.bossRegenTicks += 1;
        if (lifeAlive()) {
          counters.bossRegenWithLife += 1;
          counters.lifeBonusHealed += Math.round(healed * (numbers.lifeCrystalRegenBonus / rate));
        }
      }

      if (bossUnit.alive) applyTier(bossUnit);
    },

    finish() {
      const roars = counters.roar75 + counters.roar50 + counters.roar25;
      if (roars === 3) counters.roarAll3 = 1;
      const poisonShare = counters.bossDamageTaken > 0 ? counters.poisonDamage / counters.bossDamageTaken : 0;
      return {
        本体総回復量: counters.bossHealed,
        再生発動回数: counters.bossRegenTicks,
        生命晶生存中の再生回数: counters.bossRegenWithLife,
        生命晶ぶんの回復量: counters.lifeBonusHealed,

        生命晶の全体解除回数: counters.lifeCleanses,
        生命晶が1回以上解除: counters.lifeCleanses >= 1 ? 1 : 0,
        生命晶が2回以上解除: counters.lifeCleanses >= 2 ? 1 : 0,
        生命晶の生存手数: counters.lifeAliveTurns,
        解除された弱化数: counters.lifeCleansedDebuffs,
        毒が解除された回数: counters.lifeCleansedPoison,
        解除された毒スタック数: counters.lifeCleansedPoisonStacks,

        シールド発動回数: counters.pulseShields,
        うち周期ぶん: counters.pulseShieldsPeriodic,
        シールドが1回以上: counters.pulseShields >= 1 ? 1 : 0,
        シールド吸収量: counters.pulseShieldAbsorbed,
        脈動晶の生存手数: counters.pulseAliveTurns,

        "HP70%以下到達": counters.reached70,
        "HP50%以下到達": counters.reached50,
        "HP30%以下到達": counters.reached30,
        "70%帯の行動": counters.actedTier70,
        "50%帯の行動": counters.actedTier50,
        "30%帯の行動": counters.actedTier30,
        "HP比例+10%の攻撃": counters.attackedTier70,
        "HP比例+20%の攻撃": counters.attackedTier50,
        "HP比例+35%の攻撃": counters.attackedTier30,
        段が下がった回数: counters.tierDowngrades,
        "30%から50%へ復帰": counters.recoveredFrom30,
        S3使用回数: counters.bossS3Uses,
        S3自己解除数: counters.bossS3Cleansed,

        "咆哮75%": counters.roar75,
        "咆哮50%": counters.roar50,
        "咆哮25%": counters.roar25,
        咆哮回数: roars,
        咆哮3回そろった: counters.roarAll3,
        咆哮ダメージ: counters.roarDamage,
        咆哮の撃破数: counters.roarKills,
        咆哮で全滅: counters.roarWipe,
        咆哮前の味方HP: roars > 0 ? counters.roarHpBefore / roars : 0,
        咆哮後の味方HP: roars > 0 ? counters.roarHpAfter / roars : 0,
        咆哮を耐えた回数: counters.roarSurvived,

        毒付与成功: counters.poisonApplied,
        毒ダメージ: counters.poisonDamage,
        毒割合: poisonShare,
        生命晶撃破前の毒: counters.poisonDamageBeforeLifeDeath,
        生命晶撃破後の毒: counters.poisonDamageAfterLifeDeath,
        毒でとどめ: counters.poisonKills,
        本体被ダメージ: counters.bossDamageTaken,
      };
    },
  };
}
