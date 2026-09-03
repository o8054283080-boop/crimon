/**
 * 70階の3体。**スキルは本編の効果種別だけで組んである。**
 *
 * ## 本編で表せたもの / 表せなかったもの
 *
 * 表せた(スキル定義そのままで動く):
 *   ・最大HP割合の加算ダメージ …… `DamageEffect.hpCoefficient`
 *   ・50%で2ターン挑発 …………… `STATUS` の `TAUNT`
 *   ・自身の弱化を全解除 ………… `CLEANSE` の `applyTo: "SELF"`
 *   ・自HP50%以上ならゲージ減 … `GAUGE` の `requires: "SELF_HP_ABOVE_50"`
 *   ・味方全体の弱化を全解除 …… `CLEANSE`(個数を書かなければ全部。毒も消える)
 *   ・シールドは重ならない ……… 本編が `Math.max` で上書きしている
 *
 * 表せなかった(`probe.ts` が手番の境目で受け持つ):
 *   ・自ターン終了時の回復 ……… 本編の `REGEN` は**手番開始時**で、期限付き
 *   ・取り巻きの生存で回復量が変わる
 *   ・一定の手番ごとに自動でシールド
 *   ・HP30%以下で速度を足す
 *
 * ## パッシブの枠が足りない
 *
 * 依頼の始祖ベヒモスは**アクティブ3つ+専用パッシブ**だが、本編の
 * `MonsterDefinition.skills` は3枠しか無く、パッシブはそのうち1つを潰す
 * (`passiveSkillOf` は `skills` から `passive` を持つものを探す)。
 * S1の挑発を捨てるとAIの狙い先が変わって測定そのものが濁るので、
 * ここではアクティブ3つを残し、パッシブ相当の4つは `probe.ts` が
 * **本編の既存の口**(軽減・実数速度・回復・HP比例係数)へ写して再現している。
 * 本編へ入れる時はこの枠の問題が必ず出る。報告に書くこと。
 */
import type { Skill } from "../../../src/core/skill.js";
import type { EnemySpec } from "../types.js";
import { TOWER70_ADDS, TOWER70_LABELS, type Tower70Numbers } from "./spec.js";

/** 始祖ベヒモスの3つ。クールタイムは本編のベヒモスに合わせてある */
export function progenitorSkills(): [Skill, Skill, Skill] {
  return [
    {
      id: "lab_t70_boss_s1",
      name: "巨獣の一撃",
      description: "敵単体に攻撃力0.55倍と最大HP3%ぶんのダメージを与え、50%で2ターン挑発する。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [
        { kind: "DAMAGE", multiplier: 0.55, hpCoefficient: 0.03 },
        { kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.5 },
      ],
    },
    {
      id: "lab_t70_boss_s2",
      name: "大地踏み",
      description: "敵全体に攻撃力0.8倍と最大HP4%ぶんのダメージを与え、70%で2ターン攻撃力を大きく低下させる。",
      target: "ALL_ENEMIES",
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 0.8, hpCoefficient: 0.04 },
        { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 0.7 },
      ],
    },
    {
      id: "lab_t70_boss_s3",
      name: "天地崩壊",
      description:
        "敵全体に攻撃力1.2倍と最大HP5%ぶんのダメージを与え、80%で2ターン防御力を大きく低下させる。"
        + "自身のHPが50%以上なら敵全体の行動ゲージを20%減少させる。使用時、自身の弱化をすべて解除する。",
      target: "ALL_ENEMIES",
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 1.2, hpCoefficient: 0.05 },
        { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.8 },
        // **HPが減ってからは止まる。**追い詰められた本体が手番まで奪い続けると、
        // 巻き返す隙が消えて「泥仕合か即死か」の二択になる
        { kind: "GAUGE", amount: -0.2, requires: "SELF_HP_ABOVE_50" },
        // 自分にかかった弱化を落とす。**味方は対象にしない**(取り巻きの解除は生命晶の仕事)
        { kind: "CLEANSE", applyTo: "SELF" },
      ],
    },
  ];
}

/** 古代の生命晶。S2の全体解除が本体 */
export function lifeCrystalSkills(): [Skill, Skill, Skill] {
  return [
    {
      id: "lab_t70_life_s1",
      name: "生命の灯",
      description: "敵単体に攻撃力0.7倍のダメージを与え、50%で2ターン攻撃力を低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [
        { kind: "DAMAGE", multiplier: 0.7 },
        { kind: "DEBUFF", stat: "atk", amount: 0.3, durationTurns: 2, chance: 0.5 },
      ],
    },
    {
      id: "lab_t70_life_s2",
      name: "生命の律動",
      description: "味方全体の弱化効果をすべて解除する。",
      target: "ALL_ALLIES",
      cooldownTurns: 3,
      /*
       * 個数を書かない=全部。本編の `cleanseDebuffs` は毒スタックも消すので、
       * **毒編成にとって一番の関門**になる。ここを個数制限にすると
       * 「生命晶を先に倒す意味」が薄れて、階の狙いごと消える
       */
      effects: [{ kind: "CLEANSE" }],
    },
    {
      /*
       * 固有支援効果の札。**AIの行動候補にしない**ので、
       * S2(CT3の全体解除)が実際に撃たれる最上位のスキルになる。
       * 中身は `probe.ts` が受け持つ(本編に「味方の生存で他者の回復量が変わる」機構が無い)
       */
      id: "lab_t70_life_s3",
      name: "生命の共鳴",
      description: "自身が生存している間、始祖ベヒモスの自ターン終了時の回復量が増加する。",
      target: "SELF",
      cooldownTurns: 0,
      automatic: true,
      effects: [],
    },
  ];
}

/** 古代の脈動晶。シールドと軽減で本体の寿命を延ばす */
export function pulseCrystalSkills(rate: number): [Skill, Skill, Skill] {
  return [
    {
      id: "lab_t70_pulse_s1",
      name: "脈動の衝",
      description: "敵単体に攻撃力0.7倍のダメージを与え、50%で2ターン速度を低下させる。",
      target: "SINGLE_ENEMY",
      cooldownTurns: 0,
      effects: [
        { kind: "DAMAGE", multiplier: 0.7 },
        { kind: "DEBUFF", stat: "spd", amount: 0.3, durationTurns: 2, chance: 0.5 },
      ],
    },
    {
      /*
       * **受け手の最大HP基準**でシールドを張る(`fromSourceHp` を書かない)。
       * 対象は「HP割合が最も低い味方」=ほぼ必ず殴られている始祖ベヒモス。
       * 本編の SHIELD は `Math.max` で上書きするので、重ねても増えない
       */
      id: "lab_t70_pulse_s2",
      name: "脈動の護り",
      description: `味方単体に、その最大HPの${Math.round(rate * 100)}%ぶんのシールドを2ターン張る。`,
      target: "SINGLE_ALLY",
      cooldownTurns: 4,
      effects: [{ kind: "SHIELD", shieldRate: rate, durationTurns: 2 }],
    },
    {
      id: "lab_t70_pulse_s3",
      name: "不動の脈",
      description: "味方全体の防御力を2ターン上昇させ、受けるダメージを2ターン15%軽減する。",
      target: "ALL_ALLIES",
      cooldownTurns: 6,
      effects: [
        { kind: "BUFF", stat: "def", amount: 0.5, durationTurns: 2 },
        // 依頼は「始祖ベヒモスへ軽減」だが、本編の適用先は SELF/ALLIES/最低HP味方 の3つだけで
        // 特定の1体を名指しできない。味方全体へ配る形にしてある(取り巻きにも乗る)
        { kind: "MITIGATE", amount: 0.15, durationTurns: 2 },
      ],
    },
  ];
}

/**
 * 3体の並び。**始祖ベヒモスが `victoryTarget`。**
 * 取り巻きを残したままでも、本体を倒せばその時点で勝ち。
 */
export function tower70Enemies(numbers: Tower70Numbers): EnemySpec[] {
  return [
    {
      label: TOWER70_LABELS.boss,
      templateId: "behemoth",
      element: "DARK",
      stats: {
        hp: numbers.bossHp,
        atk: numbers.bossAtk,
        def: numbers.bossDef,
        spd: numbers.bossSpd,
        criRate: 0.2,
        criDmg: 1.6,
        accuracy: 0.35,
        resistance: 0.4,
      },
      skills: progenitorSkills(),
      victoryTarget: true,
    },
    {
      label: TOWER70_LABELS.life,
      templateId: "fairy",
      element: "LIGHT",
      stats: {
        hp: TOWER70_ADDS.life.hp,
        atk: TOWER70_ADDS.life.atk,
        def: TOWER70_ADDS.life.def,
        spd: TOWER70_ADDS.life.spd,
        criRate: 0.1,
        criDmg: 1.5,
        accuracy: 0.3,
        resistance: 0.3,
      },
      skills: lifeCrystalSkills(),
    },
    {
      label: TOWER70_LABELS.pulse,
      templateId: "golem",
      element: "DARK",
      stats: {
        hp: TOWER70_ADDS.pulse.hp,
        atk: TOWER70_ADDS.pulse.atk,
        def: TOWER70_ADDS.pulse.def,
        spd: TOWER70_ADDS.pulse.spd,
        criRate: 0.1,
        criDmg: 1.5,
        accuracy: 0.3,
        resistance: 0.3,
      },
      skills: pulseCrystalSkills(numbers.pulseShieldRate),
    },
  ];
}
