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
  | { kind: "WEAK_POINT"; hpRatio: number; critRate: number; critDmg: number; ignore: number }
  | { kind: "SKY_RULER"; atk: number; critDmg: number }
  | { kind: "REBIRTH"; heal: number; damage: number; cooldown: number }
  | { kind: "ILLUSION"; damage: number; chance: number }
  | { kind: "CHEAT"; reduction: number }
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
  | { kind: "SCENT_OF_PREY"; hpRatio: number; damageUp: number; atkUp?: number; spd?: number; speedCoefficient?: number }
  /**
   * バジリスク「蛇王の支配」。
   * 速度低下状態の敵が行動するたび、自身の行動ゲージが上がる。
   */
  | { kind: "GAUGE_ON_SLOWED_ENEMY_ACT"; gauge: number }
  /**
   * ミミック「偽りの財宝」。
   * 攻撃を受けた時に回復し、攻撃してきた相手の攻撃力を下げる。
   */
  | {
    kind: "FALSE_TREASURE"; heal: number; chance: number; atkDown: number; duration: number;
    /** 攻撃者へ返す固定ダメージ(自身の最大HPに対する割合)。防御を通さない */
    counterHpRatio?: number;
  }
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
   * スキル1を使った後、`repeatS1Chance` でもう一度スキル1を使う(もう一度の方からは続かない)。
   */
  | { kind: "PACK_INSTINCT"; critDmg: number; repeatS1Chance: number }
  /**
   * クロノス「時の管理者」(闇専用)。
   * 味方が行動するたびゲージを得る。自身の攻撃スキルにゲージ吸収とスタンが乗る。
   */
  | { kind: "TIME_KEEPER"; allyGauge: number; drain: number; stunChance: number }
  /**
   * ベヒモス「古代巨獣」。
   * HPが減るほど被ダメージが減り、HP比例ダメージが増える。**段階は重複しない。**
   */
  | { kind: "ANCIENT_BEHEMOTH"; tiers: readonly { hpRatio: number; damageTaken: number; hpDamageUp: number }[] }
  /**
   * ガッツチャージ(モッチー電気)。**通常のターンが回ってくるたびに1つ溜まる。**
   *
   * **追加ターンでは溜まらない。**溜めた結果もう一度動けるようになる技と
   * 組み合わせると、1手で2つ3つと増えて青天井になるため。
   * 「順番が回ってきた回数」だけを数える。
   *
   * 速度の上がり幅は全レベル共通で、レベルで伸びるのは与ダメージのほう。
   * `gaugeAtMax` は最大まで溜めた時だけ1度もらえる行動ゲージ。
   */
  | { kind: "GUTS_CHARGE"; damageUp: number; spd: number; maxStacks: number; gaugeAtMax?: number }
  /**
   * 深淵の主(グジラ闇)。**敵のスキル攻撃を受けるたびに1つ溜まる。**
   *
   * **多段攻撃でも1スキルにつき1つ。**4回殴られても1つ。
   * ここを1ヒット1つにすると、全体多段の技1つで上限まで飛ぶ。
   *
   * 溜まるほど攻撃と速度が上がり、自分のターンの頭にHPが戻る。
   * 被ダメージ軽減はレベルで伸びる。
   */
  | { kind: "ABYSS_LORD"; damageTaken: number; atkPerStack: number; spdPerStack: number; maxStacks: number; healOnTurn: number }
  /**
   * 水の祝福(ウンディーネ水・草)。**生きている限り、自分以外の味方を守る。**
   *
   * **自分自身には軽減も被クリ率低下もかけない。**守る側が同時に
   * いちばん硬くなると、狙う場所が無くなって戦いが止まる。
   * 行動時の回復と攻撃UPは自分にも入る(こちらは守りではないため)。
   *
   * 回復量は**ウンディーネ自身の最大HP**が基準。
   */
  | { kind: "WATER_BLESSING"; damageTaken: number; critTaken: number; healOnAct: number; atkUpTurns: number }
  /**
   * 魅惑のまなこ(スエゾー光)。**攻撃するたびに、1スキルにつき1度ずつ効く。**
   *
   * 解除も気絶も追撃も**それぞれ1スキルにつき最大1回**。多段技で
   * 何度も起こさない。追撃からさらに追撃も起こさない。
   *
   * 的中とクリ率の上乗せは常時・全レベル固定。
   */
  | { kind: "CHARM_EYE"; accuracy: number; critRate: number; stripChance: number; stunChance: number; followUpMultiplier: number };

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
  const pct = (value: number) => `${Number((value * 100).toFixed(2))}%`;
  switch (effect.kind) {
    case "WEAK_POINT": return `HP${pct(effect.hpRatio)}以下の敵へクリ率+${pct(effect.critRate)}・クリダメ+${pct(effect.critDmg)}・防御${pct(effect.ignore)}無視`;
    case "SKY_RULER": return `敵を倒すたび攻撃+${pct(effect.atk)}・クリダメ+${pct(effect.critDmg)}(最大8スタック)。ウェーブを越えて維持、戦闘終了でリセット`;
    case "REBIRTH": return `自身のターン開始時、味方全体を自身最大HP${pct(effect.heal)}回復。敵の現在HP割合に応じ与ダメージ最大+${pct(effect.damage)}。HP0で全回復復活、ゲージ維持(CT${effect.cooldown}、戦闘不能中は進まない)`;
    case "ILLUSION": return `光闇からのダメージ50%軽減・光闇への最終ダメージ+50%。通常ターン開始時、敵全体に攻撃力${effect.damage}倍と${pct(effect.chance)}で呪い。追加ターンでは発動しない`;
    case "CHEAT": return `クリティカル被ダメージ${pct(effect.reduction)}軽減。クリティカル被弾時、最大HP10%回復(敵1スキルにつき1回、致死時は回復しない)。全攻撃スキルに自身最大HP7%を加算`;
    case "GAUGE_ON_ENEMY_POISON":
      return `敵が毒ダメージを受けるたび、自身の行動ゲージ+${pct(effect.gauge)}(敵1ターンにつき1回)`;
    case "LAST_STAND":
      return `自身のHPが${pct(effect.hpRatio)}以下の間、防御力+${pct(effect.defUp)}・受けるダメージ-${pct(effect.damageTaken)}`;
    case "SCENT_OF_PREY":
      return `HPが${pct(effect.hpRatio)}以下の敵への最終ダメージ+${pct(effect.damageUp)}。常時攻撃力+${pct(effect.atkUp ?? 0)}・速度+${effect.spd ?? 0}。すべての攻撃に速度比例を加算(速度200で倍率+${effect.speedCoefficient ?? 0})`;
    case "GAUGE_ON_SLOWED_ENEMY_ACT":
      return `速度低下状態の敵が行動するたび、自身の行動ゲージ+${pct(effect.gauge)}`;
    case "FALSE_TREASURE":
      return `攻撃を受けた時、自身のHPを最大HPの${pct(effect.heal)}回復し、${pct(effect.chance)}で攻撃者の攻撃力-${pct(effect.atkDown)}(${effect.duration}ターン)`
        + (effect.counterHpRatio ? `。攻撃者へ自身の最大HPの${pct(effect.counterHpRatio)}のダメージを返す(防御を無視)` : "")
        + "。敵1行動につき1回";
    case "VALKYRIE_OATH":
      return `味方のHPが${pct(effect.hpRatio)}以下になった時、その味方に1ターン無敵と自身の最大HPの${pct(effect.heal)}回復(内部クールタイム${effect.internalCooldown}ターン)`;
    case "THUNDER_INSTINCT":
      return `クリダメ+${pct(effect.critDmg)}・速度+${effect.spd}。攻撃スキルのクリティカル時、対象の行動ゲージを${pct(effect.drain)}吸収(1スキルにつき1回)`;
    case "REAPER_HARVEST":
      return `攻撃スキル使用時、${pct(effect.chance)}で対象に1ターンの強化阻害と回復阻害。成功時、自身のHPを最大HPの${pct(effect.heal)}回復し行動ゲージ+${pct(effect.gauge)}(多段技は対象に当たった回数だけ判定)`;
    case "PACK_INSTINCT":
      return `クリダメ+${pct(effect.critDmg)}。敵を倒すと追加ターンを得る。スキル1を使った後、${pct(effect.repeatS1Chance)}でもう一度スキル1を使う`;
    case "TIME_KEEPER":
      return `味方が行動するたび自身の行動ゲージ+${pct(effect.allyGauge)}。自身の攻撃スキルに行動ゲージ${pct(effect.drain)}吸収と${pct(effect.stunChance)}のスタンが乗る(1スキルにつき1回)`;
    case "GUTS_CHARGE":
      return `通常のターンが回るたび1スタック(最大${effect.maxStacks})。1スタックにつき与ダメージ+${pct(effect.damageUp)}・速度+${effect.spd}`
        + `${effect.gaugeAtMax ? `。最大まで溜まった時、行動ゲージ+${pct(effect.gaugeAtMax)}` : ""}`
        + "。追加ターンでは溜まらない。同一戦闘中は維持し、戦闘終了でリセット";
    case "ABYSS_LORD":
      return `受けるダメージ-${pct(effect.damageTaken)}。敵のスキル攻撃を受けるたび1スタック(多段でも1スキルにつき1、最大${effect.maxStacks})。`
        + `1スタックにつき攻撃+${pct(effect.atkPerStack)}・速度+${pct(effect.spdPerStack)}。自身のターン開始時、最大HPの${pct(effect.healOnTurn)}回復`;
    case "WATER_BLESSING":
      return `生存中、自分以外の味方全体が受けるダメージ-${pct(effect.damageTaken)}・被クリ率-${pct(effect.critTaken)}。`
        + `自身の行動時、味方全体を自身の最大HPの${pct(effect.healOnAct)}回復し攻撃力UP(${effect.atkUpTurns}ターン)`;
    case "CHARM_EYE":
      return `的中+${pct(effect.accuracy)}・クリ率+${pct(effect.critRate)}。攻撃スキル使用時、${pct(effect.stripChance)}で対象の強化1個を解除し、`
        + `${pct(effect.stunChance)}で1ターン気絶。そのスキルでクリティカルが出ていれば敵全体へ攻撃力${effect.followUpMultiplier}倍の追撃`
        + "(追撃で撃った敵にも同じ確率で解除と気絶。解除・気絶は1体につき1回、追撃は1スキルにつき1回で、追撃から追撃は起きない)";
    case "ANCIENT_BEHEMOTH":
      return effect.tiers
        .map((tier) => `HP${pct(tier.hpRatio)}以下: 受けるダメージ-${pct(tier.damageTaken)}・最大HP比例ダメージ+${pct(tier.hpDamageUp)}`)
        .join(" / ");
  }
}
