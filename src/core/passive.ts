/**
 * パッシブスキル。
 *
 * ## なぜ「効果の配列」ではなく「種類ごとの型」なのか
 *
 * アクティブスキルは `SkillEffect[]` の組み合わせで書けている。同じやり方を
 * パッシブへ持ち込むと、**発動条件・発動単位・内部クールタイムまで
 * 効果1つずつに書くことになり、組み合わせのほとんどが意味を成さない。**
 * 「敵が毒ダメージを受けるたび」に回復や強化解除を載せられる形にしても、
 * 実際に要るのは「自身のゲージが上がる」ただ1つで、残りは
 * 誰も使わないのに全部の分岐を正しく保たなければならない負債になる。
 *
 * パッシブは11種それぞれが1つの決まった振る舞いなので、
 * **種類そのものを型にする。** 何が起きるかがデータを見れば分かり、
 * 戦闘側は種類ごとに1か所だけ書けば済む。
 *
 * ## レベル
 *
 * パッシブもLv1〜5を持つ。ただしアクティブのような一律の倍率成長
 * (`computeLeveledSkill`)ではなく、**Lv1〜5の値を5つ並べて書く。**
 * 「Lv5でクールタイムが1減る」「Lv5でターンが1延びる」といった
 * アクティブ側の規則は、パッシブには一切かからない。
 */

/** そのパッシブがいつ判定されるか。戦闘側のフックと1対1で対応する */
export type PassiveTrigger =
  /** 常時。ステータス補正やダメージ計算の補正に使う */
  | "ALWAYS"
  /** 敵が毒ダメージを受けた時。1回の敵の手番につき1度 */
  | "ENEMY_POISON_DAMAGE"
  /** 敵が行動した時。1回の手番につき1度 */
  | "ENEMY_ACTED"
  /** 味方が行動した時。1回の手番につき1度 */
  | "ALLY_ACTED"
  /** 自身が攻撃を受けた時。1回の敵の行動につき1度 */
  | "SELF_HIT"
  /** 味方(自身を含む)がHP閾値を下回った時 */
  | "ALLY_HP_THRESHOLD"
  /** 自身が攻撃スキルを使った時。多段でも1スキルにつき1度 */
  | "SELF_ATTACK_SKILL"
  /** 自身が敵を倒した時 */
  | "SELF_KILL";

/**
 * パッシブ1段(=1レベル)ぶんの中身。
 *
 * **1つの種類につき1つの形。** 使わない数値は書かない。
 */
export type PassiveLevelEffect =
  /**
   * マッシュルン「菌糸支配」。
   * 敵が毒ダメージを受けるたび、自身の行動ゲージが上がる。
   */
  | { kind: "GAUGE_ON_ENEMY_POISON"; gauge: number }
  /**
   * シェルタートル「最後の砦」。
   * HPが一定割合以下の間、防御力が上がり、受けるダメージが減る。
   */
  | { kind: "LAST_STAND"; hpRatio: number; defUp: number; damageTaken: number }
  /**
   * コボルト「獲物の匂い」。
   * HPが一定割合以下の敵への最終ダメージが上がる。
   */
  | { kind: "SCENT_OF_PREY"; hpRatio: number; damageUp: number }
  /**
   * バジリスク「蛇王の支配」。
   * 速度低下状態の敵が行動するたび、自身の行動ゲージが上がる。
   */
  | { kind: "GAUGE_ON_SLOWED_ENEMY_ACT"; gauge: number }
  /**
   * ミミック「偽りの財宝」。
   * 攻撃を受けた時に回復し、攻撃してきた相手の攻撃力を下げる。
   */
  | { kind: "FALSE_TREASURE"; heal: number; chance: number; atkDown: number; duration: number }
  /**
   * ヴァルキリア「戦乙女の誓い」。
   * 味方がHP閾値を下回った時、その味方へ1ターンの無敵と回復を与える。
   * **無敵は1ターン固定。** 内部クールタイムがある。
   */
  | { kind: "VALKYRIE_OATH"; hpRatio: number; heal: number; internalCooldown: number }
  /**
   * サンダービースト「雷の本能」(光専用)。
   * 常時クリダメと速度が上がり、攻撃スキルのクリティカル時に行動ゲージを吸収する。
   */
  | { kind: "THUNDER_INSTINCT"; critDmg: number; spd: number; drain: number }
  /**
   * アビスリーパー「死神の収穫」。
   * 攻撃スキル使用時、対象へ強化阻害と回復阻害(どちらも1ターン固定)を試み、
   * どちらかが成功したら自身が回復しゲージを得る。
   */
  | { kind: "REAPER_HARVEST"; chance: number; heal: number; gauge: number }
  /**
   * フェンリル「群狼の本能」。
   * クリダメが上がり、敵を倒すと追加ターンを得る(回数制限なし)。
   */
  | { kind: "PACK_INSTINCT"; critDmg: number }
  /**
   * クロノス「時の管理者」(闇専用)。
   * 味方が行動するたびゲージを得る。自身の攻撃スキルにゲージ吸収とスタンが乗る。
   */
  | { kind: "TIME_KEEPER"; allyGauge: number; drain: number; stunChance: number }
  /**
   * ベヒモス「古代巨獣」。
   * HPが減るほど被ダメージが減り、HP比例ダメージが増える。**段階は重複しない。**
   */
  | { kind: "ANCIENT_BEHEMOTH"; tiers: readonly { hpRatio: number; damageTaken: number; hpDamageUp: number }[] };

export interface PassiveSpec {
  trigger: PassiveTrigger;
  /** Lv1〜Lv5の5段。必ず5つ並べる */
  levels: readonly [PassiveLevelEffect, PassiveLevelEffect, PassiveLevelEffect, PassiveLevelEffect, PassiveLevelEffect];
}

/** パッシブのレベルの上限。アクティブと同じ5 */
export const MAX_PASSIVE_LEVEL = 5;

/** そのレベルでのパッシブの中身。範囲外のレベルは端に丸める */
export function passiveAtLevel(spec: PassiveSpec, level: number): PassiveLevelEffect {
  const index = Math.max(1, Math.min(MAX_PASSIVE_LEVEL, Math.round(level))) - 1;
  return spec.levels[index];
}

/** UI表示用に、パッシブ1段の中身を短い日本語にする */
export function describePassiveLevel(effect: PassiveLevelEffect): string {
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  switch (effect.kind) {
    case "GAUGE_ON_ENEMY_POISON":
      return `敵が毒ダメージを受けるたび、自身の行動ゲージ+${pct(effect.gauge)}(敵1ターンにつき1回)`;
    case "LAST_STAND":
      return `自身のHPが${pct(effect.hpRatio)}以下の間、防御力+${pct(effect.defUp)}・受けるダメージ-${pct(effect.damageTaken)}`;
    case "SCENT_OF_PREY":
      return `HPが${pct(effect.hpRatio)}以下の敵への最終ダメージ+${pct(effect.damageUp)}`;
    case "GAUGE_ON_SLOWED_ENEMY_ACT":
      return `速度低下状態の敵が行動するたび、自身の行動ゲージ+${pct(effect.gauge)}`;
    case "FALSE_TREASURE":
      return `攻撃を受けた時、自身のHPを最大HPの${pct(effect.heal)}回復し、${pct(effect.chance)}で攻撃者の攻撃力-${pct(effect.atkDown)}(${effect.duration}ターン)。敵1行動につき1回`;
    case "VALKYRIE_OATH":
      return `味方のHPが${pct(effect.hpRatio)}以下になった時、その味方に1ターン無敵と自身の最大HPの${pct(effect.heal)}回復(内部クールタイム${effect.internalCooldown}ターン)`;
    case "THUNDER_INSTINCT":
      return `クリダメ+${pct(effect.critDmg)}・速度+${effect.spd}。攻撃スキルのクリティカル時、対象の行動ゲージを${pct(effect.drain)}吸収(1スキルにつき1回)`;
    case "REAPER_HARVEST":
      return `攻撃スキル使用時、${pct(effect.chance)}で対象に1ターンの強化阻害と回復阻害。成功時、自身のHPを最大HPの${pct(effect.heal)}回復し行動ゲージ+${pct(effect.gauge)}(1スキルにつき1回)`;
    case "PACK_INSTINCT":
      return `クリダメ+${pct(effect.critDmg)}。敵を倒すと追加ターンを得る`;
    case "TIME_KEEPER":
      return `味方が行動するたび自身の行動ゲージ+${pct(effect.allyGauge)}。自身の攻撃スキルに行動ゲージ${pct(effect.drain)}吸収と${pct(effect.stunChance)}のスタンが乗る(1スキルにつき1回)`;
    case "ANCIENT_BEHEMOTH":
      return effect.tiers
        .map((tier) => `HP${pct(tier.hpRatio)}以下: 受けるダメージ-${pct(tier.damageTaken)}・最大HP比例ダメージ+${pct(tier.hpDamageUp)}`)
        .join(" / ");
  }
}
