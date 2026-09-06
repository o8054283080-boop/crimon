import type { BuffStat, EffectCondition } from "./skill.js";
import type { SkillTag } from "./skillTags.js";

/**
 * スキル才能とスキル覚醒。**スキル2・スキル3の枠に付ける。**
 *
 * ## なぜスキル1ではないのか
 *
 * スキル1は潜在覚醒が持っている。あちらは「1つ選んで終わり」で、
 * 枠が固定だからこそ候補を作り込める。こちらはクリエイト(継承)で
 * 中身が入れ替わる枠なので、**技そのものではなく技の性質(札)に才能を紐づける。**
 *
 * ## 効果は宣言で書く
 *
 * 「威力+10%」も「使用後に自分のゲージ+10%」も、ここでは**データ**として書き、
 * `applySkillTalents` がスキル定義を組み替える。戦闘エンジンを才能ごとに
 * 分岐させないための境界で、才能を増やしてもエンジンは触らずに済む
 * ——ただし、**組み替えでは表現しきれないもの**(このスキルだけ抵抗を低く扱う、
 * シールドが乗っている間の反射)は `talentMods` としてスキルに載せ、
 * エンジンがそこだけを読む。
 */

/* ==========================================================================
 * 才能が起こすこと
 * ========================================================================== */

export type SkillTalentEffect =
  /* --- 攻撃 --- */
  /** このスキルのダメージ倍率を (1 + value) 倍にする */
  | { kind: "DAMAGE_MULT"; value: number }
  /** このスキルのクリ率に足す */
  | { kind: "CRIT_RATE"; value: number }
  /** 条件を満たす相手への最終ダメージに足す */
  | { kind: "COND_DAMAGE"; when: EffectCondition; value: number }
  /** 防御無視率に足す */
  | { kind: "IGNORE_DEF"; value: number }
  /** 与えたダメージのこの割合ぶん自分が回復する */
  | { kind: "LIFESTEAL"; value: number }
  /* --- ゲージ(自分・対象) --- */
  /** 使用後、自分の行動ゲージを進める。`requires` を付ければ条件付きになる */
  | { kind: "SELF_GAUGE"; value: number; requires?: EffectCondition }
  /** スキルの対象の行動ゲージを進める */
  | { kind: "TARGET_GAUGE"; value: number }
  /* --- 回復 --- */
  /** 回復量を (1 + value) 倍にする */
  | { kind: "HEAL_MULT"; value: number }
  /** 受け手のHPがこの割合以下なら、回復量をさらに増やす */
  | { kind: "HEAL_LOW_HP"; hpRatio: number; extra: number }
  /** 使用時、自分も最大HPのこの割合を回復する */
  | { kind: "SELF_HEAL"; value: number }
  /** 単体回復の時、他の味方も本来回復量のこの割合で回復する */
  | { kind: "HEAL_SPLASH"; value: number }
  /* --- 解除・付与 --- */
  /** 確率で対象の弱体効果を解除する */
  | { kind: "CLEANSE"; count: number; chance: number }
  /** 攻撃/弱化の前に、確率で対象の強化効果を解除する */
  | { kind: "STRIP"; count: number; chance: number }
  /** 対象にシールドを張る */
  | { kind: "SHIELD"; rate: number; turns: number }
  /** 対象に継続回復を付ける */
  | { kind: "REGEN"; rate: number; turns: number }
  /** 自分に能力上昇を付ける */
  | { kind: "SELF_BUFF"; stat: BuffStat; amount: number; turns: number }
  /** 対象に確率で能力上昇を付ける */
  | { kind: "TARGET_BUFF"; stat: BuffStat; amount: number; turns: number; chance: number }
  /* --- 持続・確率 --- */
  /** このスキルが付ける強化の持続を、確率で1ターン延ばす */
  | { kind: "BUFF_EXTEND"; chance: number }
  /** このスキルが付ける弱体の持続を、確率で1ターン延ばす */
  | { kind: "DEBUFF_EXTEND"; chance: number }
  /** このスキルが張るシールドの持続を、確率で1ターン延ばす */
  | { kind: "SHIELD_EXTEND"; chance: number }
  /** このスキルが付ける数値型の強化の効果量を (1 + value) 倍にする */
  | { kind: "BUFF_AMOUNT"; value: number }
  /** このスキルが張るシールドの量を (1 + value) 倍にする */
  | { kind: "SHIELD_MULT"; value: number }
  /** このスキルの弱体の基礎発動率に足す */
  | { kind: "DEBUFF_CHANCE"; value: number }
  /** 条件を満たす相手に対してだけ、弱体の基礎発動率に足す */
  | { kind: "DEBUFF_CHANCE_WHEN"; when: EffectCondition; value: number }
  /** このスキルだけ、対象の抵抗をこの割合ぶん低く扱う */
  | { kind: "IGNORE_RESIST"; value: number }
  /* --- ゲージ増減の量 --- */
  /** このスキルのゲージ増減量を (1 + value) 倍にする */
  | { kind: "GAUGE_MULT"; value: number }
  /** 受け手のHPがこの割合以下なら、ゲージ増加量をさらに増やす */
  | { kind: "GAUGE_LOW_HP"; hpRatio: number; extra: number }
  /** 条件を満たす相手には、ゲージ減少量をさらに増やす */
  | { kind: "GAUGE_COND"; when: EffectCondition; value: number }
  /** 最もゲージが低い別の味方にも、この量だけ配る */
  | { kind: "GAUGE_CHAIN"; value: number }
  /** 減らした相手のゲージのうち、この割合を自分が得る */
  | { kind: "GAUGE_DRAIN_SHARE"; value: number }
  /* --- 弱化が通った時 --- */
  /** 弱体の付与に成功した時、自分のゲージを進める */
  | { kind: "SELF_GAUGE_ON_DEBUFF"; value: number }
  /** 弱体の付与に成功した時、対象のゲージを減らす */
  | { kind: "TARGET_GAUGE_ON_DEBUFF"; value: number }
  /** 攻撃が命中した時、確率で 敵のゲージを奪って自分に移す */
  | { kind: "GAUGE_STEAL"; chance: number; value: number }
  /** 単体の弱体が成功した時、確率でランダムな別の敵1体へ1つ波及する */
  | { kind: "DEBUFF_SPREAD"; chance: number }
  /* --- シールドが乗っている間 --- */
  /** このスキルのシールドが乗っている間の被ダメージ軽減 */
  | { kind: "SHIELD_MITIGATE"; value: number }
  /** このスキルのシールドが乗っている間、受けたダメージのこの割合を反射する */
  | { kind: "SHIELD_REFLECT"; value: number }
  /** シールド付与時、対象を最大HPのこの割合だけ回復する */
  | { kind: "SHIELD_HEAL"; value: number }
  /* --- 手番まわり --- */
  /** 確率でこのスキルのクールタイムを1縮める */
  | { kind: "COOLDOWN_REFUND"; chance: number }
  /** 使用後、確率でスキル1を追加で使う */
  | { kind: "FOLLOW_UP_S1"; chance: number }
  /** 使用時、確率で追加ターンを得る */
  | { kind: "EXTRA_TURN"; chance: number }
  /** 強化されている味方の与ダメージを、この量だけ上げる(ターン数付き) */
  | { kind: "BUFFED_ALLY_DAMAGE"; value: number; turns: number };

/** 才能1つ分の定義 */
export interface SkillTalentDef {
  id: string;
  name: string;
  /** カードに出す効果の一行 */
  effectLabel: string;
  /** なぜこれを取るのか。編成を考えるための一言 */
  description: string;
  cost: number;
  /**
   * 出る条件。**すべての札を持っている技にだけ**候補として並ぶ。
   * 「単体の攻撃技だけ」なら ["attack", "single"]。
   */
  requiresTags: readonly SkillTag[];
  effects: readonly SkillTalentEffect[];
  /** スキル覚醒か。8pt・奇石3個・1体1つの枠を使う */
  awakening?: true;
}

/* ==========================================================================
 * 攻撃スキルの才能
 * ========================================================================== */

const ATTACK_TALENTS: readonly SkillTalentDef[] = [
  {
    id: "atk_power1", name: "威力強化I", effectLabel: "このスキルのダメージ +10%",
    description: "素直な底上げ。どの攻撃技にも乗る", cost: 2,
    requiresTags: ["attack"], effects: [{ kind: "DAMAGE_MULT", value: 0.10 }],
  },
  {
    id: "atk_power2", name: "威力強化II", effectLabel: "このスキルのダメージ +15%",
    description: "威力強化Iの上。両方取れば+25%", cost: 3,
    requiresTags: ["attack"], effects: [{ kind: "DAMAGE_MULT", value: 0.15 }],
  },
  {
    id: "atk_crit", name: "会心補助", effectLabel: "このスキルのクリ率 +15%",
    description: "クリダメを積んだ個体ほど伸びる", cost: 3,
    requiresTags: ["attack"], effects: [{ kind: "CRIT_RATE", value: 0.15 }],
  },
  {
    id: "atk_self_gauge", name: "自己加速", effectLabel: "使用後、自分のゲージ +10%",
    description: "手番の回りが速くなる。速度を積みきれない個体の補い", cost: 4,
    requiresTags: ["attack"], effects: [{ kind: "SELF_GAUGE", value: 0.10 }],
  },
  {
    id: "atk_vs_debuff", name: "弱点攻撃", effectLabel: "弱化状態の敵へのダメージ +12%",
    description: "妨害役と組ませる前提の火力", cost: 4,
    requiresTags: ["attack"], effects: [{ kind: "COND_DAMAGE", when: "TARGET_HAS_DEBUFF", value: 0.12 }],
  },
  {
    id: "atk_vs_buff", name: "強化敵特攻", effectLabel: "強化効果が付いている敵へのダメージ +15%",
    description: "自分を固める相手ほど痛い。塔の「守りの階」向け", cost: 5,
    requiresTags: ["attack"], effects: [{ kind: "COND_DAMAGE", when: "TARGET_HAS_BUFF", value: 0.15 }],
  },
  {
    id: "atk_execute", name: "瀕死追撃", effectLabel: "HP30%以下の敵へのダメージ +20%",
    description: "削り切る手。長引く戦いで効く", cost: 5,
    requiresTags: ["attack"], effects: [{ kind: "COND_DAMAGE", when: "TARGET_HP_BELOW_30", value: 0.20 }],
  },
  {
    id: "atk_momentum", name: "攻勢維持", effectLabel: "このスキルで敵を倒した時、自分のゲージ +25%",
    description: "倒し切れる編成ほど連鎖する", cost: 5,
    requiresTags: ["attack"],
    effects: [{ kind: "SELF_GAUGE", value: 0.25, requires: "KILLED_TARGET" }],
  },
  {
    id: "atk_pierce_small", name: "防御崩し補助", effectLabel: "このスキルは防御を10%無視する",
    description: "硬い相手ほど効く。倍率の底上げより安定する", cost: 6,
    requiresTags: ["attack"], effects: [{ kind: "IGNORE_DEF", value: 0.10 }],
  },
];

/* ==========================================================================
 * 回復スキルの才能
 * ========================================================================== */

const HEAL_TALENTS: readonly SkillTalentDef[] = [
  {
    id: "heal_boost1", name: "回復強化I", effectLabel: "回復量 +10%",
    description: "素直な底上げ", cost: 2,
    requiresTags: ["heal"], effects: [{ kind: "HEAL_MULT", value: 0.10 }],
  },
  {
    id: "heal_boost2", name: "回復強化II", effectLabel: "回復量 +15%",
    description: "回復強化Iの上。両方取れば+25%", cost: 3,
    requiresTags: ["heal"], effects: [{ kind: "HEAL_MULT", value: 0.15 }],
  },
  {
    id: "heal_emergency", name: "緊急回復", effectLabel: "HP50%以下の対象への回復量 +15%",
    description: "落ちかけを戻す力。塔のように持ち越す場所で効く", cost: 3,
    requiresTags: ["heal"], effects: [{ kind: "HEAL_LOW_HP", hpRatio: 0.5, extra: 0.15 }],
  },
  {
    id: "heal_self", name: "自己回復", effectLabel: "使用時、自分も最大HPの5%回復",
    description: "回復役が自分を守れないという穴を埋める", cost: 4,
    requiresTags: ["heal"], effects: [{ kind: "SELF_HEAL", value: 0.05 }],
  },
  {
    id: "heal_haste_small", name: "加速治療・小", effectLabel: "回復対象のゲージ +10%",
    description: "回復しながら手番を返す", cost: 4,
    requiresTags: ["heal"], effects: [{ kind: "TARGET_GAUGE", value: 0.10 }],
  },
  {
    id: "heal_cleanse_small", name: "浄化補助", effectLabel: "50%で弱化効果を1個解除",
    description: "解除役を別に置けない編成の保険", cost: 5,
    requiresTags: ["heal"], effects: [{ kind: "CLEANSE", count: 1, chance: 0.5 }],
  },
  {
    id: "heal_shield_small", name: "保護治療・小", effectLabel: "回復対象に最大HP8%のシールド(1ターン)",
    description: "戻したHPを次の一撃で持っていかれないように", cost: 5,
    requiresTags: ["heal"], effects: [{ kind: "SHIELD", rate: 0.08, turns: 1 }],
  },
  {
    id: "heal_regen", name: "再生付与", effectLabel: "回復対象に再生(1ターン)",
    description: "回復の手数を1つ増やすのと同じ", cost: 6,
    requiresTags: ["heal"], effects: [{ kind: "REGEN", rate: 0.08, turns: 1 }],
  },
];

/* ==========================================================================
 * バフスキルの才能
 * ========================================================================== */

const BUFF_TALENTS: readonly SkillTalentDef[] = [
  {
    id: "buff_extend_small", name: "持続補助", effectLabel: "付与する強化の持続が30%で+1ターン",
    description: "掛け直しの手番を減らせる", cost: 3,
    requiresTags: ["buff"], effects: [{ kind: "BUFF_EXTEND", chance: 0.30 }],
  },
  {
    id: "buff_self_gauge", name: "自己加速", effectLabel: "使用後、自分のゲージ +10%",
    description: "支援役が続けて動けるようになる", cost: 3,
    requiresTags: ["buff"], effects: [{ kind: "SELF_GAUGE", value: 0.10 }],
  },
  {
    id: "buff_target_gauge", name: "攻勢支援", effectLabel: "対象のゲージ +5%",
    description: "強化した相手をそのまま動かす", cost: 4,
    requiresTags: ["buff"], effects: [{ kind: "TARGET_GAUGE", value: 0.05 }],
  },
  {
    id: "buff_shield_small", name: "防護支援・小", effectLabel: "対象に最大HP5%のシールド(1ターン)",
    description: "強化と一緒に薄い盾が乗る", cost: 4,
    requiresTags: ["buff"], effects: [{ kind: "SHIELD", rate: 0.05, turns: 1 }],
  },
  {
    id: "buff_cleanse_small", name: "浄化補助", effectLabel: "対象の弱化効果を50%で1個解除",
    description: "強化を入れる前に、掛かっているものを剥がす", cost: 5,
    requiresTags: ["buff"], effects: [{ kind: "CLEANSE", count: 1, chance: 0.5 }],
  },
  {
    id: "buff_amount", name: "強化効率", effectLabel: "付与する数値型の強化の効果量 +10%",
    description: "攻撃アップ30%が33%になる、という上がり方", cost: 5,
    requiresTags: ["buff"], effects: [{ kind: "BUFF_AMOUNT", value: 0.10 }],
  },
  {
    id: "buff_self_def", name: "自己防護", effectLabel: "使用後、自分に防御アップ(1ターン)",
    description: "支援役が狙われた時に一手だけ耐える", cost: 5,
    requiresTags: ["buff"], effects: [{ kind: "SELF_BUFF", stat: "def", amount: 0.30, turns: 1 }],
  },
  {
    id: "buff_cd_refund", name: "再使用補助", effectLabel: "20%でこのスキルのCTを1短縮",
    description: "支援を切らさないための才能", cost: 6,
    requiresTags: ["buff"], effects: [{ kind: "COOLDOWN_REFUND", chance: 0.20 }],
  },
];

/* ==========================================================================
 * デバフスキルの才能
 * ========================================================================== */

const DEBUFF_TALENTS: readonly SkillTalentDef[] = [
  {
    id: "deb_chance1", name: "弱化成功I", effectLabel: "弱化成功率 +10%",
    description: "通らなければ何も始まらない。まずここから", cost: 2,
    requiresTags: ["debuff"], effects: [{ kind: "DEBUFF_CHANCE", value: 0.10 }],
  },
  {
    id: "deb_chance2", name: "弱化成功II", effectLabel: "弱化成功率 +15%",
    description: "弱化成功Iの上。両方取れば+25%", cost: 3,
    requiresTags: ["debuff"], effects: [{ kind: "DEBUFF_CHANCE", value: 0.15 }],
  },
  {
    id: "deb_self_gauge", name: "追圧", effectLabel: "弱化成功時、自分のゲージ +5%",
    description: "通るほど手番が増える", cost: 3,
    requiresTags: ["debuff"], effects: [{ kind: "SELF_GAUGE_ON_DEBUFF", value: 0.05 }],
  },
  {
    id: "deb_gauge_down_small", name: "ゲージ抑制・小", effectLabel: "弱化成功時、対象のゲージ -5%",
    description: "弱化そのものが遅延になる", cost: 4,
    requiresTags: ["debuff"], effects: [{ kind: "TARGET_GAUGE_ON_DEBUFF", value: 0.05 }],
  },
  {
    id: "deb_extend_small", name: "弱化延長補助", effectLabel: "30%で弱化効果 +1ターン",
    description: "掛け直しの手番が浮く", cost: 4,
    requiresTags: ["debuff"], effects: [{ kind: "DEBUFF_EXTEND", chance: 0.30 }],
  },
  {
    id: "deb_ignore_resist_small", name: "抵抗崩し・小", effectLabel: "このスキルだけ対象の抵抗を10%低く扱う",
    description: "抵抗の高いボスに弱化を通すための才能", cost: 5,
    requiresTags: ["debuff"], effects: [{ kind: "IGNORE_RESIST", value: 0.10 }],
  },
  {
    id: "deb_chain", name: "連続妨害", effectLabel: "対象に弱化が2個以上あるなら成功率 +15%",
    description: "重ねるほど通りやすくなる", cost: 5,
    requiresTags: ["debuff"],
    effects: [{ kind: "DEBUFF_CHANCE_WHEN", when: "TARGET_DEBUFF_AT_LEAST_2", value: 0.15 }],
  },
  {
    id: "deb_strip_small", name: "強化解除補助", effectLabel: "50%で弱化の前に強化を1個解除",
    description: "免疫や無敵を剥がしてから通す", cost: 6,
    requiresTags: ["debuff"], effects: [{ kind: "STRIP", count: 1, chance: 0.5 }],
  },
];

/* ==========================================================================
 * ゲージ増加スキルの才能
 * ========================================================================== */

const GAUGE_UP_TALENTS: readonly SkillTalentDef[] = [
  {
    id: "gup_boost1", name: "ゲージ強化I", effectLabel: "ゲージ増加量 +5%",
    description: "素直な底上げ", cost: 2,
    requiresTags: ["gauge_up"], effects: [{ kind: "GAUGE_MULT", value: 0.05 }],
  },
  {
    id: "gup_boost2", name: "ゲージ強化II", effectLabel: "ゲージ増加量 +10%",
    description: "ゲージ強化Iの上", cost: 3,
    requiresTags: ["gauge_up"], effects: [{ kind: "GAUGE_MULT", value: 0.10 }],
  },
  {
    id: "gup_self", name: "自己充填・小", effectLabel: "使用後、自分のゲージ +10%",
    description: "配る側も動けるようになる", cost: 3,
    requiresTags: ["gauge_up"], effects: [{ kind: "SELF_GAUGE", value: 0.10 }],
  },
  {
    id: "gup_low_hp", name: "緊急加速", effectLabel: "HP50%以下の対象にはさらに +10%",
    description: "落ちかけの味方に手番を返す", cost: 4,
    requiresTags: ["gauge_up"], effects: [{ kind: "GAUGE_LOW_HP", hpRatio: 0.5, extra: 0.10 }],
  },
  {
    id: "gup_atk_buff", name: "攻勢加速・小", effectLabel: "対象に攻撃アップ(1ターン)を30%で付与",
    description: "動かすついでに火力を乗せる", cost: 5,
    requiresTags: ["gauge_up"],
    effects: [{ kind: "TARGET_BUFF", stat: "atk", amount: 0.30, turns: 1, chance: 0.30 }],
  },
  {
    id: "gup_spd_buff", name: "迅速加速・小", effectLabel: "対象に速度アップ(1ターン)を30%で付与",
    description: "次の手番も早く回る", cost: 5,
    requiresTags: ["gauge_up"],
    effects: [{ kind: "TARGET_BUFF", stat: "spd", amount: 0.30, turns: 1, chance: 0.30 }],
  },
  {
    id: "gup_chain", name: "支援連鎖", effectLabel: "最もゲージが低い別の味方にも +5%",
    description: "単体加速でも編成全体が回る", cost: 6,
    requiresTags: ["gauge_up"], effects: [{ kind: "GAUGE_CHAIN", value: 0.05 }],
  },
];

/* ==========================================================================
 * ゲージ減少スキルの才能
 * ========================================================================== */

const GAUGE_DOWN_TALENTS: readonly SkillTalentDef[] = [
  {
    id: "gdn_boost1", name: "減少強化I", effectLabel: "ゲージ減少量 +5%",
    description: "素直な底上げ", cost: 2,
    requiresTags: ["gauge_down"], effects: [{ kind: "GAUGE_MULT", value: 0.05 }],
  },
  {
    id: "gdn_boost2", name: "減少強化II", effectLabel: "ゲージ減少量 +10%",
    description: "減少強化Iの上", cost: 3,
    requiresTags: ["gauge_down"], effects: [{ kind: "GAUGE_MULT", value: 0.10 }],
  },
  {
    id: "gdn_self_gauge", name: "自己加速", effectLabel: "成功時、自分のゲージ +5%",
    description: "遅らせながら自分が前に出る", cost: 3,
    requiresTags: ["gauge_down"], effects: [{ kind: "SELF_GAUGE", value: 0.05 }],
  },
  {
    id: "gdn_vs_high", name: "高ゲージ特攻", effectLabel: "対象のゲージが50%以上なら減少量 +10%",
    description: "動く直前の相手を止める", cost: 4,
    requiresTags: ["gauge_down"],
    effects: [{ kind: "GAUGE_COND", when: "TARGET_GAUGE_ABOVE_50", value: 0.10 }],
  },
  {
    id: "gdn_spd_down", name: "速度妨害", effectLabel: "成功時30%で速度ダウン(1ターン)",
    description: "一度きりの遅延を、続く遅延に変える", cost: 5,
    requiresTags: ["gauge_down"],
    effects: [{ kind: "TARGET_BUFF", stat: "spd", amount: -0.30, turns: 1, chance: 0.30 }],
  },
  {
    id: "gdn_drain_small", name: "奪取・小", effectLabel: "減らしたゲージの25%を自分が得る",
    description: "相手を遅らせた分だけ自分が早くなる", cost: 5,
    requiresTags: ["gauge_down"], effects: [{ kind: "GAUGE_DRAIN_SHARE", value: 0.25 }],
  },
  {
    id: "gdn_strip_small", name: "強化解除補助", effectLabel: "50%で減少の前に強化を1個解除",
    description: "免疫を剥がしてから遅らせる", cost: 6,
    requiresTags: ["gauge_down"], effects: [{ kind: "STRIP", count: 1, chance: 0.5 }],
  },
];

/* ==========================================================================
 * シールドスキルの才能
 * ========================================================================== */

const SHIELD_TALENTS: readonly SkillTalentDef[] = [
  {
    id: "shd_boost1", name: "盾強化I", effectLabel: "シールド量 +10%",
    description: "素直な底上げ", cost: 2,
    requiresTags: ["shield"], effects: [{ kind: "SHIELD_MULT", value: 0.10 }],
  },
  {
    id: "shd_boost2", name: "盾強化II", effectLabel: "シールド量 +15%",
    description: "盾強化Iの上。両方取れば+25%", cost: 3,
    requiresTags: ["shield"], effects: [{ kind: "SHIELD_MULT", value: 0.15 }],
  },
  {
    id: "shd_heal_small", name: "治癒障壁・小", effectLabel: "付与時に最大HP4%回復",
    description: "盾を張りながら削れた分も戻す", cost: 4,
    requiresTags: ["shield"], effects: [{ kind: "SHIELD_HEAL", value: 0.04 }],
  },
  {
    id: "shd_gauge_small", name: "加速障壁・小", effectLabel: "付与時、対象のゲージ +5%",
    description: "守った相手をそのまま動かす", cost: 4,
    requiresTags: ["shield"], effects: [{ kind: "TARGET_GAUGE", value: 0.05 }],
  },
  {
    id: "shd_extend_small", name: "長期障壁補助", effectLabel: "30%で持続 +1ターン",
    description: "掛け直しの手番が浮く", cost: 5,
    requiresTags: ["shield"], effects: [{ kind: "SHIELD_EXTEND", chance: 0.30 }],
  },
  {
    id: "shd_mitigate_small", name: "防御障壁・小", effectLabel: "シールド中の被ダメージ -3%",
    description: "盾が割れるまでの時間が延びる", cost: 5,
    requiresTags: ["shield"], effects: [{ kind: "SHIELD_MITIGATE", value: 0.03 }],
  },
  {
    id: "shd_reflect_small", name: "反射障壁・小", effectLabel: "シールド中、受けたダメージの5%を反射",
    description: "守りが攻めに変わる", cost: 6,
    requiresTags: ["shield"], effects: [{ kind: "SHIELD_REFLECT", value: 0.05 }],
  },
];

/* ==========================================================================
 * スキル覚醒
 *
 * **どれも8pt。1体に1つだけ。**値段で優劣を作らないのは、
 * 「どれを選ぶか」を編成の話にしたいから(値段の話にすると安い方が正解になる)。
 * ========================================================================== */

const AWAKENINGS: readonly SkillTalentDef[] = [
  /* --- 攻撃 --- */
  {
    id: "awk_atk_pierce", name: "貫通化", effectLabel: "対象の防御力を20%無視する",
    description: "硬い相手ほど効く。倍率では届かない層へ届く", cost: 8, awakening: true,
    requiresTags: ["attack"], effects: [{ kind: "IGNORE_DEF", value: 0.20 }],
  },
  {
    id: "awk_atk_strip", name: "強化破壊", effectLabel: "攻撃前に対象の強化効果を1個解除",
    description: "免疫・無敵・防御アップを剥がしてから殴る", cost: 8, awakening: true,
    requiresTags: ["attack"], effects: [{ kind: "STRIP", count: 1, chance: 1 }],
  },
  {
    id: "awk_atk_follow", name: "追加攻撃", effectLabel: "使用後、30%でスキル1を追加使用",
    description: "手数が増える。スキル1が育っているほど効く", cost: 8, awakening: true,
    requiresTags: ["attack"], effects: [{ kind: "FOLLOW_UP_S1", chance: 0.30 }],
  },
  {
    id: "awk_atk_extra_turn", name: "再行動", effectLabel: "使用時、10%で追加ターンを獲得",
    description: "低い確率だが、当たれば1手まるごと増える", cost: 8, awakening: true,
    requiresTags: ["attack"], effects: [{ kind: "EXTRA_TURN", chance: 0.10 }],
  },
  {
    id: "awk_atk_lifesteal", name: "吸血化", effectLabel: "与えたダメージの20%だけHPを回復",
    description: "攻撃役が回復役を兼ねる。塔のように持ち越す場所で効く", cost: 8, awakening: true,
    requiresTags: ["attack"], effects: [{ kind: "LIFESTEAL", value: 0.20 }],
  },
  {
    id: "awk_atk_gauge_steal", name: "ゲージ奪取", effectLabel: "命中時70%で 敵ゲージ-15% / 自分ゲージ+15%",
    description: "殴りながら手番を奪う", cost: 8, awakening: true,
    requiresTags: ["attack"], effects: [{ kind: "GAUGE_STEAL", chance: 0.70, value: 0.15 }],
  },
  /* --- 回復 --- */
  {
    id: "awk_heal_cleanse", name: "浄化治療", effectLabel: "回復前に弱化効果を1個解除",
    description: "回復阻害を剥がしてから回復できる", cost: 8, awakening: true,
    requiresTags: ["heal"], effects: [{ kind: "CLEANSE", count: 1, chance: 1 }],
  },
  {
    id: "awk_heal_emergency", name: "緊急治療", effectLabel: "HP50%以下の対象への回復量 +30%",
    description: "落ちかけを一度で戻す", cost: 8, awakening: true,
    requiresTags: ["heal"], effects: [{ kind: "HEAL_LOW_HP", hpRatio: 0.5, extra: 0.30 }],
  },
  {
    id: "awk_heal_haste", name: "加速治療", effectLabel: "回復対象のゲージ +20%",
    description: "回復が支援を兼ねる", cost: 8, awakening: true,
    requiresTags: ["heal"], effects: [{ kind: "TARGET_GAUGE", value: 0.20 }],
  },
  {
    id: "awk_heal_shield", name: "防護治療", effectLabel: "回復後、回復量の50%のシールド(1ターン)",
    description: "戻したHPをそのまま守りに変える", cost: 8, awakening: true,
    requiresTags: ["heal"], effects: [{ kind: "SHIELD", rate: 0.12, turns: 1 }],
  },
  {
    id: "awk_heal_splash", name: "波及治療", effectLabel: "単体回復時、他の味方も本来回復量の25%回復",
    description: "単体回復が全体回復に近づく", cost: 8, awakening: true,
    requiresTags: ["heal", "single"], effects: [{ kind: "HEAL_SPLASH", value: 0.25 }],
  },
  {
    id: "awk_heal_regen", name: "再生治療", effectLabel: "回復対象に再生(2ターン)",
    description: "回復の手数が2手ぶん増える", cost: 8, awakening: true,
    requiresTags: ["heal"], effects: [{ kind: "REGEN", rate: 0.10, turns: 2 }],
  },
  /* --- バフ --- */
  {
    id: "awk_buff_extend", name: "延長支援", effectLabel: "付与する強化の持続 +1ターン",
    description: "掛け直しの手番がまるごと浮く", cost: 8, awakening: true,
    requiresTags: ["buff"], effects: [{ kind: "BUFF_EXTEND", chance: 1 }],
  },
  {
    id: "awk_buff_haste", name: "加速支援", effectLabel: "単体ならゲージ+15% / 全体なら+10%",
    description: "強化した相手をそのまま動かす", cost: 8, awakening: true,
    requiresTags: ["buff"], effects: [{ kind: "TARGET_GAUGE", value: 0.15 }],
  },
  {
    id: "awk_buff_shield", name: "防護支援", effectLabel: "対象に最大HP10%のシールド(1ターン)",
    description: "強化と守りを1手でまとめる", cost: 8, awakening: true,
    requiresTags: ["buff"], effects: [{ kind: "SHIELD", rate: 0.10, turns: 1 }],
  },
  {
    id: "awk_buff_cleanse", name: "浄化支援", effectLabel: "強化付与前に弱化効果を1個解除",
    description: "強化阻害を剥がしてから掛けられる", cost: 8, awakening: true,
    requiresTags: ["buff"], effects: [{ kind: "CLEANSE", count: 1, chance: 1 }],
  },
  {
    id: "awk_buff_elation", name: "高揚支援", effectLabel: "強化された味方の与ダメージ +10%(1ターン)",
    description: "支援役が編成全体の火力を押し上げる", cost: 8, awakening: true,
    requiresTags: ["buff"], effects: [{ kind: "BUFFED_ALLY_DAMAGE", value: 0.10, turns: 1 }],
  },
  {
    id: "awk_buff_self_gauge", name: "自己加速", effectLabel: "使用後、自分のゲージ +25%",
    description: "支援を続けて撃てるようになる", cost: 8, awakening: true,
    requiresTags: ["buff"], effects: [{ kind: "SELF_GAUGE", value: 0.25 }],
  },
  /* --- デバフ --- */
  {
    id: "awk_deb_strip", name: "強化解除", effectLabel: "弱化付与前に強化効果を1個解除",
    description: "免疫を剥がしてから通す。確実に効く", cost: 8, awakening: true,
    requiresTags: ["debuff"], effects: [{ kind: "STRIP", count: 1, chance: 1 }],
  },
  {
    id: "awk_deb_gauge_down", name: "ゲージ抑制", effectLabel: "弱化成功時、対象のゲージ -15%",
    description: "弱化が遅延を兼ねる", cost: 8, awakening: true,
    requiresTags: ["debuff"], effects: [{ kind: "TARGET_GAUGE_ON_DEBUFF", value: 0.15 }],
  },
  {
    id: "awk_deb_extend", name: "弱化延長", effectLabel: "付与する弱化効果 +1ターン",
    description: "妨害の密度が上がる", cost: 8, awakening: true,
    requiresTags: ["debuff"], effects: [{ kind: "DEBUFF_EXTEND", chance: 1 }],
  },
  {
    id: "awk_deb_self_gauge", name: "追撃妨害", effectLabel: "弱化成功時、自分のゲージ +20%",
    description: "通るほど手番が増える", cost: 8, awakening: true,
    requiresTags: ["debuff"], effects: [{ kind: "SELF_GAUGE_ON_DEBUFF", value: 0.20 }],
  },
  {
    id: "awk_deb_spread", name: "弱化拡散", effectLabel: "単体弱化時、50%で別の敵1体にも1つ波及",
    description: "単体妨害が全体妨害に近づく", cost: 8, awakening: true,
    requiresTags: ["debuff", "single"], effects: [{ kind: "DEBUFF_SPREAD", chance: 0.50 }],
  },
  {
    id: "awk_deb_ignore_resist", name: "抵抗崩し", effectLabel: "このスキルだけ対象の抵抗を20%低く扱う",
    description: "抵抗を積んだボスにも弱化が通る", cost: 8, awakening: true,
    requiresTags: ["debuff"], effects: [{ kind: "IGNORE_RESIST", value: 0.20 }],
  },
  /* --- ゲージ増加 --- */
  {
    id: "awk_gup_boost", name: "過剰加速", effectLabel: "ゲージ上昇量 +15%",
    description: "配る量そのものを増やす", cost: 8, awakening: true,
    requiresTags: ["gauge_up"], effects: [{ kind: "GAUGE_MULT", value: 0.15 }],
  },
  {
    id: "awk_gup_atk", name: "攻勢加速", effectLabel: "対象に攻撃アップ(1ターン)を追加",
    description: "動かした相手の一撃も重くなる", cost: 8, awakening: true,
    requiresTags: ["gauge_up"],
    effects: [{ kind: "TARGET_BUFF", stat: "atk", amount: 0.30, turns: 1, chance: 1 }],
  },
  {
    id: "awk_gup_spd", name: "迅速加速", effectLabel: "対象に速度アップ(1ターン)を追加",
    description: "次の手番も早く回る", cost: 8, awakening: true,
    requiresTags: ["gauge_up"],
    effects: [{ kind: "TARGET_BUFF", stat: "spd", amount: 0.30, turns: 1, chance: 1 }],
  },
  {
    id: "awk_gup_self", name: "自己充填", effectLabel: "使用後、自分のゲージ +25%",
    description: "配る側が続けて動ける", cost: 8, awakening: true,
    requiresTags: ["gauge_up"], effects: [{ kind: "SELF_GAUGE", value: 0.25 }],
  },
  {
    id: "awk_gup_low_hp", name: "緊急加速", effectLabel: "HP50%以下へのゲージ増加量 さらに +20%",
    description: "落ちかけの味方を確実に動かす", cost: 8, awakening: true,
    requiresTags: ["gauge_up"], effects: [{ kind: "GAUGE_LOW_HP", hpRatio: 0.5, extra: 0.20 }],
  },
  /* --- ゲージ減少 --- */
  {
    id: "awk_gdn_boost", name: "大幅抑制", effectLabel: "ゲージ減少量 +15%",
    description: "止める量そのものを増やす", cost: 8, awakening: true,
    requiresTags: ["gauge_down"], effects: [{ kind: "GAUGE_MULT", value: 0.15 }],
  },
  {
    id: "awk_gdn_drain", name: "奪取", effectLabel: "減らしたゲージの50%を自分が得る",
    description: "遅らせた分の半分が自分の手番になる", cost: 8, awakening: true,
    requiresTags: ["gauge_down"], effects: [{ kind: "GAUGE_DRAIN_SHARE", value: 0.50 }],
  },
  {
    id: "awk_gdn_spd_down", name: "速度抑制", effectLabel: "成功時、速度ダウン(1ターン)を追加",
    description: "一度きりの遅延が続く遅延になる", cost: 8, awakening: true,
    requiresTags: ["gauge_down"],
    effects: [{ kind: "TARGET_BUFF", stat: "spd", amount: -0.30, turns: 1, chance: 1 }],
  },
  {
    id: "awk_gdn_strip", name: "強化妨害", effectLabel: "ゲージ減少前に強化効果を1個解除",
    description: "免疫を剥がしてから遅らせる", cost: 8, awakening: true,
    requiresTags: ["gauge_down"], effects: [{ kind: "STRIP", count: 1, chance: 1 }],
  },
  {
    id: "awk_gdn_chain", name: "連続抑制", effectLabel: "対象のゲージが50%以上ならさらに -10%",
    description: "動く直前の相手を確実に止める", cost: 8, awakening: true,
    requiresTags: ["gauge_down"],
    effects: [{ kind: "GAUGE_COND", when: "TARGET_GAUGE_ABOVE_50", value: 0.10 }],
  },
  /* --- シールド --- */
  {
    id: "awk_shd_boost", name: "強固障壁", effectLabel: "シールド量 +25%",
    description: "盾の厚みそのものを増やす", cost: 8, awakening: true,
    requiresTags: ["shield"], effects: [{ kind: "SHIELD_MULT", value: 0.25 }],
  },
  {
    id: "awk_shd_extend", name: "長期障壁", effectLabel: "シールド持続 +1ターン",
    description: "掛け直しの手番が浮く", cost: 8, awakening: true,
    requiresTags: ["shield"], effects: [{ kind: "SHIELD_EXTEND", chance: 1 }],
  },
  {
    id: "awk_shd_heal", name: "治癒障壁", effectLabel: "付与時、最大HP8%回復",
    description: "盾を張りながら削れた分も戻す", cost: 8, awakening: true,
    requiresTags: ["shield"], effects: [{ kind: "SHIELD_HEAL", value: 0.08 }],
  },
  {
    id: "awk_shd_gauge", name: "加速障壁", effectLabel: "付与時、対象のゲージ +10%",
    description: "守った相手をそのまま動かす", cost: 8, awakening: true,
    requiresTags: ["shield"], effects: [{ kind: "TARGET_GAUGE", value: 0.10 }],
  },
  {
    id: "awk_shd_mitigate", name: "防御障壁", effectLabel: "シールド中、被ダメージ さらに -5%",
    description: "盾が割れるまでの時間が延びる", cost: 8, awakening: true,
    requiresTags: ["shield"], effects: [{ kind: "SHIELD_MITIGATE", value: 0.05 }],
  },
  {
    id: "awk_shd_reflect", name: "反射障壁", effectLabel: "シールド中、受けたダメージの10%を反射",
    description: "守りが攻めに変わる", cost: 8, awakening: true,
    requiresTags: ["shield"], effects: [{ kind: "SHIELD_REFLECT", value: 0.10 }],
  },
];

/** スキル才能(覚醒でないもの)の全部 */
export const SKILL_TALENTS: readonly SkillTalentDef[] = [
  ...ATTACK_TALENTS, ...HEAL_TALENTS, ...BUFF_TALENTS, ...DEBUFF_TALENTS,
  ...GAUGE_UP_TALENTS, ...GAUGE_DOWN_TALENTS, ...SHIELD_TALENTS,
];

/** スキル覚醒の全部 */
export const SKILL_AWAKENINGS: readonly SkillTalentDef[] = AWAKENINGS;

const ALL_BY_ID = new Map<string, SkillTalentDef>(
  [...SKILL_TALENTS, ...SKILL_AWAKENINGS].map((def) => [def.id, def]),
);

export function findSkillTalent(id: string): SkillTalentDef | undefined {
  return ALL_BY_ID.get(id);
}

/** 取得IDからptを引く。知らないIDは0(消えた才能でptを取り上げない) */
export function skillTalentCost(id: string): number {
  return ALL_BY_ID.get(id)?.cost ?? 0;
}

/**
 * その技に付けられる才能を並べる。
 *
 * **必要な札を全部持っている技だけ**が対象。
 * 「単体の回復技」にしか付かない波及治療は、全体回復には並ばない。
 */
export function availableSkillTalents(
  tags: ReadonlySet<SkillTag>,
  pool: readonly SkillTalentDef[] = SKILL_TALENTS,
): SkillTalentDef[] {
  return pool.filter((def) => def.requiresTags.every((tag) => tags.has(tag)));
}

/** その技に付けられるスキル覚醒 */
export function availableSkillAwakenings(tags: ReadonlySet<SkillTag>): SkillTalentDef[] {
  return availableSkillTalents(tags, SKILL_AWAKENINGS);
}

/** その才能が、今のその技にまだ付けられるか(継承で中身が変わった時の判定) */
export function isSkillTalentApplicable(id: string, tags: ReadonlySet<SkillTag>): boolean {
  const def = ALL_BY_ID.get(id);
  if (!def) return false;
  return def.requiresTags.every((tag) => tags.has(tag));
}
