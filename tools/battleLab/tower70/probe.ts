/**
 * 70階の、手番の境目でだけ効く挙動と、その計測。
 *
 * ## ここが受け持つのは4つだけ
 *
 *   1. 始祖ベヒモスの自ターン終了時の回復(常時3% / 生命晶が生きていれば+4%)
 *   2. HP70%以下の被ダメージ10%減
 *   3. HP50%以下のHP比例ダメージ+20%
 *   4. HP30%以下の速度+35
 *
 * どれも本編に機構が無い(2と3はベヒモスのパッシブにあるが、
 * **段が排他**で重ならないうえ、パッシブ枠を1つ潰す)。
 * 代わりに、本編がすでに持っている口へ写している:
 *
 *   ・2 → `mitigateTurns` / `mitigateAmount`(本編の軽減そのもの)
 *   ・3 → スキルの `hpCoefficient` を1.2倍(本編の式と数値が完全に一致)
 *   ・4 → `flatStatBonus.spd`(本編の実数加算そのもの)
 *
 * **ダメージ計算にも命中判定にもAIにも入らない。**
 *
 * ## 数えるほうが本体
 *
 * 勝率だけでは「本体が硬いのか、再生が効きすぎているのか」が分からない。
 * 再生量・シールドの吸収量・解除された弱化の数・段階の到達率まで数えて、
 * どこで詰まっているのかを読めるようにしてある。
 */
import type { ScenarioProbe, TrackedUnit } from "../types.js";
import { TOWER70_TIERS, type Tower70Numbers } from "./spec.js";

/** 敵の並び。`tower70Enemies` の順と対応する */
const BOSS = "E1";
const LIFE = "E2";
const PULSE = "E3";

interface Context {
  unitOf(id: string): TrackedUnit | undefined;
  aliveOf(id: string): boolean;
}

/** 数え上げ。すべて1戦ぶん */
interface Counters {
  /** 本体が自ターン終了時に戻したHPの合計 */
  bossHealed: number;
  /** その回数 */
  bossRegenTicks: number;
  /** そのうち生命晶が生きていた回数 */
  bossRegenWithLife: number;
  /** 生命晶が生きていたことで上乗せされたHPの合計 */
  lifeBonusHealed: number;

  /** 生命晶が全体解除を撃った回数 */
  lifeCleanses: number;
  /** その解除で消えた弱化の数(味方3体ぶんの合計) */
  lifeCleansedDebuffs: number;
  /** そのうち毒だったもの */
  lifeCleansedPoison: number;
  /** 解除で消えた本体の毒スタック数 */
  lifeCleansedPoisonStacks: number;

  /** 脈動晶がシールドを張った回数(固有の周期ぶん+スキルぶん) */
  pulseShields: number;
  /** そのうち固有の周期ぶん */
  pulseShieldsPeriodic: number;
  /** シールドが実際に肩代わりしたダメージの合計 */
  pulseShieldAbsorbed: number;

  /** 段階への到達(1なら到達した) */
  reached70: number;
  reached50: number;
  reached30: number;
  /** HP30%以下で行動した回数(速度+35が乗っていた手番の数と同じ) */
  actedBelow30: number;
  /** 一度30%以下まで落ちてから50%以上へ戻った回数 */
  recoveredFrom30: number;

  /** 本体がスキル3を撃った回数 */
  bossS3Uses: number;
  /** スキル3の自己解除で消えた弱化の数 */
  bossS3Cleansed: number;
  /** HP50%以下で攻撃した回数(HP比例+20%が乗っていた手番の数) */
  attacksWithHpBonus: number;

  /** 毒 */
  poisonApplied: number;
  poisonDamage: number;
  poisonDamageBeforeLifeDeath: number;
  poisonDamageAfterLifeDeath: number;
  poisonKills: number;
  /** 本体が受けた総ダメージ(毒の割合を出すのに使う) */
  bossDamageTaken: number;
}

const ZERO: Counters = {
  bossHealed: 0, bossRegenTicks: 0, bossRegenWithLife: 0, lifeBonusHealed: 0,
  lifeCleanses: 0, lifeCleansedDebuffs: 0, lifeCleansedPoison: 0, lifeCleansedPoisonStacks: 0,
  pulseShields: 0, pulseShieldsPeriodic: 0, pulseShieldAbsorbed: 0,
  reached70: 0, reached50: 0, reached30: 0, actedBelow30: 0, recoveredFrom30: 0,
  bossS3Uses: 0, bossS3Cleansed: 0, attacksWithHpBonus: 0,
  poisonApplied: 0, poisonDamage: 0, poisonDamageBeforeLifeDeath: 0, poisonDamageAfterLifeDeath: 0,
  poisonKills: 0, bossDamageTaken: 0,
};

const POISON_DAMAGE = /は毒\((\d+)スタック\)でダメージを受けた！ (\d+)/;
const POISON_APPLIED = /は毒を受けた！ \((\d+)スタック/;
const DAMAGE_LINE = /に (\d+) ダメージ！/;

export function tower70Probe(context: Context, numbers: Tower70Numbers): ScenarioProbe {
  const counters: Counters = { ...ZERO };

  const boss = () => context.unitOf(BOSS);
  const lifeAlive = () => context.aliveOf(LIFE);

  /** 手番の直前に控えた値。直後との差で「何が起きたか」を読む */
  let beforeDebuffs = [0, 0, 0];
  let beforePoisonStacks = 0;
  let beforeShield = 0;
  let beforeBossHp = 0;
  let bossActing = false;
  /** HP比例+20%を掛け済みか。**二度掛けない** */
  let hpBonusApplied = false;
  /** 一度30%以下へ落ちたか(50%以上へ戻った回数を数えるのに使う) */
  let wasBelow30 = false;
  /** 生命晶が倒れたか(毒ダメージを前後で分けるのに使う) */
  let lifeDead = false;
  /** 脈動晶の手番の数。固有シールドはこの数で回る */
  let pulseTurns = 0;

  const debuffsOf = (): number[] => [BOSS, LIFE, PULSE].map((id) => context.unitOf(id)?.debuffCount ?? 0);

  /** HP割合に応じた段階を張り直す。**重なる**(30%以下なら3段とも効く) */
  const applyTiers = (unit: TrackedUnit): void => {
    const ratio = unit.currentHp / unit.maxHp;

    if (ratio <= TOWER70_TIERS.damageTakenBelow) {
      if (counters.reached70 === 0) counters.reached70 = 1;
      // 本編の軽減そのもの。切れないよう毎手番張り直す
      unit.mitigateAmount = TOWER70_TIERS.damageTakenCut;
      unit.mitigateTurns = 2;
    }

    if (ratio <= TOWER70_TIERS.hpDamageBelow) {
      if (counters.reached50 === 0) counters.reached50 = 1;
      if (!hpBonusApplied) {
        // HP比例の係数だけを1.2倍。ATK倍率の部分には触らない
        unit.scaleHpCoefficients(1 + TOWER70_TIERS.hpDamageUp);
        hpBonusApplied = true;
      }
    }

    if (ratio <= TOWER70_TIERS.spdBelow) {
      if (counters.reached30 === 0) counters.reached30 = 1;
      unit.flatStatBonus.spd = numbers.lowHpSpdBonus;
      wasBelow30 = true;
    } else {
      unit.flatStatBonus.spd = 0;
      if (wasBelow30 && ratio >= 0.5) {
        counters.recoveredFrom30 += 1;
        wasBelow30 = false;
      }
    }
  };

  return {
    beforeTurn(unitId) {
      const bossUnit = boss();
      if (!bossUnit) return;
      beforeDebuffs = debuffsOf();
      beforePoisonStacks = bossUnit.poisonStacks;
      beforeShield = bossUnit.shieldValue;
      beforeBossHp = bossUnit.currentHp;
      bossActing = unitId === BOSS;

      if (bossActing) {
        const ratio = bossUnit.currentHp / bossUnit.maxHp;
        if (ratio <= TOWER70_TIERS.spdBelow) counters.actedBelow30 += 1;
        if (ratio <= TOWER70_TIERS.hpDamageBelow) counters.attacksWithHpBonus += 1;
      }
    },

    afterTurn(unitId, lines) {
      const bossUnit = boss();
      if (!bossUnit) return;

      // --- ログから読む ---
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
      // 毒でとどめを刺したか。毒のダメージ行の直後に「倒れた」が来る
      for (let i = 1; i < lines.length; i += 1) {
        if (lines[i].includes("[敵:E1]") && lines[i].includes("は倒れた！") && POISON_DAMAGE.test(lines[i - 1])) {
          counters.poisonKills += 1;
        }
      }

      // --- 弱化の解除を、手番の前後の差で数える ---
      const afterDebuffs = debuffsOf();
      if (unitId === LIFE && lines.some((line) => line.includes("のデバフが解除された！"))) {
        counters.lifeCleanses += 1;
        for (let i = 0; i < 3; i += 1) {
          counters.lifeCleansedDebuffs += Math.max(0, beforeDebuffs[i] - afterDebuffs[i]);
        }
        const poisonGone = beforePoisonStacks > 0 && bossUnit.poisonStacks === 0;
        if (poisonGone) {
          counters.lifeCleansedPoison += 1;
          counters.lifeCleansedPoisonStacks += beforePoisonStacks;
        }
      }
      if (unitId === BOSS && lines.some((line) => line.includes("「天地崩壊」"))) {
        counters.bossS3Uses += 1;
        counters.bossS3Cleansed += Math.max(0, beforeDebuffs[0] - afterDebuffs[0]);
      }

      // --- シールドが肩代わりした分 ---
      if (bossUnit.shieldValue < beforeShield) {
        counters.pulseShieldAbsorbed += beforeShield - bossUnit.shieldValue;
      }
      if (unitId === PULSE && lines.some((line) => line.includes("にシールドが張られた！"))) {
        counters.pulseShields += 1;
      }

      if (!lifeAlive()) lifeDead = true;

      // --- ここから、手番の境目でだけ効く挙動 ---

      /*
       * 脈動晶の固有シールド。**本編に「一定の手番ごとに自動発動」が無い。**
       * 脈動晶の手番の数で回す(依頼の「3ターンごと」をこう読んだ)。
       * 本編の SHIELD と同じく `Math.max` で置くので、S2ぶんと重ならない
       */
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

      /*
       * 本体の自ターン終了時の回復。
       * **本編の REGEN は手番"開始"時で、しかも期限付き**なので、ここで直に戻す。
       * 生命晶が生きている間だけ上乗せがある(死ねば止まる)
       */
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

      if (bossUnit.alive) applyTiers(bossUnit);
      void beforeBossHp;
      void bossActing;
    },

    finish() {
      const poisonShare = counters.bossDamageTaken > 0 ? counters.poisonDamage / counters.bossDamageTaken : 0;
      return {
        本体総回復量: counters.bossHealed,
        再生発動回数: counters.bossRegenTicks,
        生命晶生存中の再生回数: counters.bossRegenWithLife,
        生命晶ぶんの回復量: counters.lifeBonusHealed,
        生命晶の全体解除回数: counters.lifeCleanses,
        解除された弱化数: counters.lifeCleansedDebuffs,
        毒が解除された回数: counters.lifeCleansedPoison,
        解除された毒スタック数: counters.lifeCleansedPoisonStacks,
        シールド発動回数: counters.pulseShields,
        うち周期ぶん: counters.pulseShieldsPeriodic,
        シールド吸収量: counters.pulseShieldAbsorbed,
        "HP70%以下到達": counters.reached70,
        "HP50%以下到達": counters.reached50,
        "HP30%以下到達": counters.reached30,
        "HP30%以下の行動回数": counters.actedBelow30,
        "30%から50%へ復帰": counters.recoveredFrom30,
        S3使用回数: counters.bossS3Uses,
        S3自己解除数: counters.bossS3Cleansed,
        "HP比例強化中の攻撃": counters.attacksWithHpBonus,
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
