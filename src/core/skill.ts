import { PassiveSpec, describePassiveLevel, passiveAtLevel } from "./passive.js";

export type TargetType =
  | "SINGLE_ENEMY"
  | "ALL_ENEMIES"
  | "SINGLE_ALLY"
  | "ALL_ALLIES"
  | "SELF";

/** BUFF/DEBUFFで操作できる能力値。atk/def/spdは倍率(乗算)、criRate/criDmgは加算で効く */
export type BuffStat = "atk" | "def" | "spd" | "criRate" | "criDmg";

export type StatusEffectType =
  | "CRIT_RATE_DOWN"
  | "ENDURE"
  | "REFLECT"
  | "REVIVE"
  | "INVINCIBLE"
  | "TAUNT"
  | "BUFF_BLOCK"
  | "SKILL_LOCK"
  | "CRIT_RATE_UP"
  /**
   * ターゲット集中。**敵の単体攻撃の対象を、この効果を持つ者へ固定する。**
   *
   * 挑発(TAUNT)は「かけた本人へ向かせる」デバフだが、こちらは
   * 「自分に向けさせる」自己バフ。**全体攻撃には一切影響しない。**
   * タンクが前に出る、という役割をプレイヤー側から作れるようにするためのもの。
   */
  | "FOCUS";

/**
 * 効果の向き先。省略した効果は「スキルの対象」にかかる。
 *
 * `LOWEST_HP_ALLY` は**術者の味方のうちHP割合が最も低い1体**。
 * 「敵を殴りながら、いちばん危ない味方を助ける」という支援の形を、
 * スキルの対象タイプを変えずに書けるようにするためのもの。
 */
export type EffectApplyTo = "SELF" | "ALLIES" | "LOWEST_HP_ALLY";

export type StatusEffectCategory = "BUFF" | "DEBUFF";

export const STATUS_EFFECT_CATEGORY: Record<StatusEffectType, StatusEffectCategory> = {
  CRIT_RATE_DOWN: "BUFF", ENDURE: "BUFF", REFLECT: "BUFF", REVIVE: "BUFF", INVINCIBLE: "BUFF",
  TAUNT: "DEBUFF", BUFF_BLOCK: "DEBUFF", SKILL_LOCK: "DEBUFF", CRIT_RATE_UP: "DEBUFF",
  FOCUS: "BUFF",
};

/**
 * 効果を出すかどうかの追加条件。
 *
 * 「速度低下している相手にだけスタンする」「1回でもクリティカルしたら
 * ゲージを得る」のような、**スキルの中で起きたことや相手の状態に依存する**
 * 効果を、専用のスキル型を増やさずに書けるようにするための共通語彙。
 *
 * 判定はスキル1回の解決の中で行う。多段攻撃でも**評価は1回だけ**で、
 * ヒットごとに繰り返し発動することはない(依頼主の指定)。
 */
export type EffectCondition =
  /** 対象に弱体効果が付いている */
  | "TARGET_HAS_DEBUFF"
  /** 対象が速度低下している */
  | "TARGET_SPD_DOWN"
  /** 対象が毒状態 */
  | "TARGET_POISONED"
  /** 対象が挑発状態 */
  | "TARGET_TAUNTED"
  /** 対象に強化効果が付いている */
  | "TARGET_HAS_BUFF"
  /** 対象のHPが50%以下 */
  | "TARGET_HP_BELOW_50"
  /** 対象のHPが30%以下 */
  | "TARGET_HP_BELOW_30"
  /** 対象のHP割合が自身より高い */
  | "TARGET_HP_ABOVE_SELF"
  /** 対象の行動ゲージが20%以下 */
  | "TARGET_GAUGE_BELOW_20"
  /** 対象に弱体効果が3個以上 */
  | "TARGET_DEBUFF_AT_LEAST_3"
  /** 自身のHPが50%以上 */
  | "SELF_HP_ABOVE_50"
  /** このスキルで1回以上クリティカルした */
  | "ANY_CRIT"
  /** このスキルで2回以上クリティカルした */
  | "CRITS_AT_LEAST_2"
  /** このスキルで3回以上クリティカルした */
  | "CRITS_AT_LEAST_3"
  /** 直前のスタンが失敗した(免疫・抵抗・確率のいずれでも) */
  | "STUN_FAILED"
  /** このスキルで相手を倒した */
  | "KILLED_TARGET";

export interface StatusEffect {
  kind: "STATUS";
  status: StatusEffectType;
  durationTurns: number;
  chance?: number;
  applyTo?: EffectApplyTo;
  /**
   * Lv5でも継続ターンを延ばさない印。
   *
   * **無敵1ターンは、Lv5で2ターンになった瞬間に別物になる。**
   * 強化阻害・回復阻害・スタンも同じで、1ターンという短さ自体が
   * 効果の重さと釣り合っている。伸ばしたくないものはここで止める。
   */
  fixedDuration?: true;
}

/**
 * 補正の基準になるステータス値。終盤に装備込みで到達する水準に合わせてある。
 *
 * 補正を「能力値1につき+○倍」で書いていた頃は、3つのステータスの桁が違うせいで
 * 意味が揃わなかった。HPは3万、防御は3500、速度は110なので、同じ係数を書いても
 * HP補正は+72、速度補正は+0.4にしかならず、**説明文の倍率が無意味になっていた**
 * (防御補正付きのゴーレムの通常攻撃と、ネメシスのCT5必殺技が同じダメージだった)。
 * 基準に対する割合にすることで、どのステータスでも同じ読み方ができる。
 */
export const SCALE_REFERENCE: Record<"spd" | "def" | "hp", number> = {
  hp: 30000,
  def: 3500,
  // 速度の基準を110にしていたのは**素のステータスを見ていたから**で、
  // 実態と合っていなかった。★6装備の副効果を速度に寄せると
  // 素120のドラゴンが310まで伸びる(実測)。110を基準にすると、
  // 速度補正付きのスキルが終盤で想定の3倍近く効いてしまう。
  // 全員が速度を詰めるわけではないので、中間の200を基準に置く
  spd: 200,
};

export interface DamageEffect {
  kind: "DAMAGE";
  /** ATK に対する倍率。属性相性・防御力で更に補正される */
  multiplier: number;
  /** 命中回数 */
  hits?: number;
  /**
   * 追加ダメージ: 自身の能力値が高いほど倍率が上乗せされる。
   * `bonusAtReference` は**基準値のときに何倍ぶん上乗せするか**。
   * 例) `{ stat: "hp", bonusAtReference: 0.8 }` は、HP30000のとき+0.8倍。
   * HPがその半分なら+0.4倍になる。
   */
  scaleBonus?: { stat: "spd" | "def" | "hp"; bonusAtReference: number };
  /** 最大HPをATKとは独立した基礎ダメージ項として加える係数。 */
  hpCoefficient?: number;
  /** 戦闘時点の実効DEFをATKとは独立した基礎ダメージ項として加える係数。 */
  defCoefficient?: number;
  /** trueの場合、相手の防御力を完全に無視してダメージを計算する */
  ignoreDefense?: boolean;
  /** 0～1の部分防御無視率。 */
  ignoreDefenseRatio?: number;
  /** 対象に付与済みの弱体効果数による倍率（上限必須）。 */
  debuffDamageBonus?: { perDebuff: number; maxBonus: number };
  /**
   * 対象のHP割合に応じた最終ダメージの上乗せ。**上から順に見て、最初に当てはまった1つだけ**を使う。
   * 「HP50%以下で+20%、30%以下ならさらに+40%」のような重ねがけにしないのは、
   * 段が重なると終盤の削り合いが一撃で終わるため。
   */
  targetHpBonus?: readonly { hpRatio: number; bonus: number }[];
  /** 対象のHP割合に応じた防御無視。当てはまった時だけ `ignoreDefenseRatio` を上書きする */
  targetHpIgnoreDefense?: readonly { hpRatio: number; ratio: number }[];
  /** 自身が失ったHP割合に比例した上乗せ(上限必須)。`perLostRatio` は失った割合1.0あたりの倍率 */
  missingHpBonus?: { perLostRatio: number; maxBonus: number };
  /** 条件を満たした時だけ乗る最終ダメージの上乗せ */
  conditionalBonus?: readonly { when: EffectCondition; bonus: number }[];
  /** この効果を出す条件。満たさなければヒットそのものが起きない */
  requires?: EffectCondition;
  /**
   * 最終ダメージへの素の上乗せ。**スキル定義には書かない。**
   * 潜在能力で溜めた分など、戦闘中に決まる上乗せを戦闘側が差し込むための口。
   */
  finalDamageBonus?: number;
  /** ヒット1発ごとに、クリティカルしていたら自身の行動ゲージを増やす(0〜1)。**明記された技だけ** */
  gaugeOnCritPerHit?: number;
  /** 同じスキルで奪った強化効果1個につき乗る最終ダメージの上乗せ(上限必須) */
  stolenBuffBonus?: { perBuff: number; maxBonus: number };
}

export interface HealEffect {
  kind: "HEAL";
  /**
   * healRateの基準にする値。省略時(undefined)は対象の最大HPに対する割合。
   * "atk"/"def"を指定すると、施術者(スキルの使い手)の攻撃力/防御力に対する割合になる。
   */
  scaleStat?: "atk" | "def";
  /** scaleStat省略時は対象の最大HPに対する割合、指定時は施術者のその能力値に対する割合 */
  healRate: number;
  /**
   * 回復先。省略時はスキルの対象。
   * "SELF"は術者、"ALLIES"は術者の味方全体。
   *
   * **敵を狙う技に回復を置くときは必ず指定すること。**省略すると敵を回復する
   * (光スライムのセイントスラッシュが実際にそうなっていた)。
   * バフの applyTo と同じ書き方に揃えてある。
   */
  applyTo?: EffectApplyTo;
}

/** ライフスティール: 同じスキルのDAMAGE効果で与えたダメージの一部を自身が回復する */
export interface LifestealEffect {
  kind: "LIFESTEAL";
  /** 直前に与えたダメージに対する回復割合(例: 0.1で与ダメの10%回復) */
  healRate: number;
  /** 自身のHPがこの割合以下なら、回復割合をさらに増やす */
  selfLowHpExtra?: { hpRatio: number; extra: number };
}

export interface BuffEffect {
  kind: "BUFF";
  stat: BuffStat;
  /** 例: 0.3 で +30% */
  amount: number;
  durationTurns: number;
  /**
   * バフの適用先。省略時はスキルの対象。
   * "SELF"は術者、"ALLIES"は術者の味方全体にかかる。
   * 敵を攻撃しつつ味方を強化する、といったスキルに使う。
   */
  applyTo?: EffectApplyTo;
  /** Lv5でも継続ターンを延ばさない印 */
  fixedDuration?: true;
}

export interface DebuffEffect {
  kind: "DEBUFF";
  stat: BuffStat;
  /** 例: 0.3 で -30% */
  amount: number;
  durationTurns: number;
  /** この効果が発動を試みる基礎確率(0-1)。省略時は常に発動を試みる(その後、命中率/抵抗率判定を経る) */
  chance?: number;
  /** Lv5でも継続ターンを延ばさない印 */
  fixedDuration?: true;
}

export interface StunEffect {
  kind: "STUN";
  durationTurns: number;
  /** この効果が発動を試みる基礎確率(0-1)。省略時は常に発動を試みる(その後、命中率/抵抗率判定を経る) */
  chance?: number;
  /** この効果を出す条件。満たさなければ判定そのものを行わない */
  requires?: EffectCondition;
}

/** 火傷: 付与された相手が、自身の手番終了時に自分の攻撃力と同じ量のダメージを受ける */
export interface BurnEffect {
  kind: "BURN";
  durationTurns: number;
  /** この効果が発動を試みる基礎確率(0-1) */
  chance: number;
}

/** 行動ゲージ操作: 対象のATBゲージを即座に増減させる(例: 0.2で+20%進む) */
export interface GaugeEffect {
  kind: "GAUGE";
  amount: number;
  /**
   * trueなら「吸収」になり、対象から減らした分をそのまま術者へ移す。
   * 相手を遅らせつつ自分が早く動けるので、単なる増減より強い。
   */
  drain?: boolean;
  /**
   * 適用先。省略時はスキルの対象。
   * 「味方全体のゲージを上げ、自分だけさらに上げる」といった技に使う。
   */
  applyTo?: EffectApplyTo;
  /** この効果を出す条件。満たさなければ何もしない */
  requires?: EffectCondition;
  /** 条件を満たした相手/味方にだけ、さらにこの量を上乗せする */
  conditionalExtra?: { when: EffectCondition; amount: number };
  /** 受け手のHPがこの割合以下なら、さらにこの量を上乗せする(味方支援用) */
  lowHpExtra?: { hpRatio: number; amount: number };
}

/** シールド(バリア): 対象の最大HPに対する割合でダメージ肩代わり用のバリアを張る。HPより先にダメージを吸収する */
export interface ShieldEffect {
  kind: "SHIELD";
  shieldRate: number;
  durationTurns: number;
  /**
   * trueなら、シールド量を**術者の最大HP**から計算する。
   * 省略時は従来どおり受け手の最大HPから計算する。
   * 「自身の最大HPの15%を味方全体へ」という守り方をタンクに与えるためのもの。
   */
  fromSourceHp?: boolean;
  /** 適用先。省略時はスキルの対象 */
  applyTo?: EffectApplyTo;
  /** Lv5でも継続ターンを延ばさない印 */
  fixedDuration?: true;
}

/** 状態異常免疫: この間、新たなスタン・火傷・デバフ・毒の付与を防ぐ(既にかかっている効果は解除しない) */
export interface ImmunityEffect {
  kind: "IMMUNITY";
  durationTurns: number;
  /** Lv5でも継続ターンを延ばさない印 */
  fixedDuration?: true;
}

/** 継続回復: 対象の手番開始時、最大HPに対するこの割合を毎ターン回復する */
export interface RegenEffect {
  kind: "REGEN";
  healRate: number;
  durationTurns: number;
  /** 適用先。省略時はスキルの対象 */
  applyTo?: EffectApplyTo;
  /** Lv5でも継続ターンを延ばさない印 */
  fixedDuration?: true;
}

/**
 * 被ダメージ軽減。かかっている間、受けるダメージがこの割合だけ減る。
 *
 * シールドが「決まった量を肩代わりして無くなる」のに対し、こちらは
 * **量ではなく割合**なので、大きな一撃ほど効き目が大きい。
 * 守りの技に2つの選び方を残すために分けてある。
 */
export interface MitigateEffect {
  kind: "MITIGATE";
  /** 0.15で15%軽減 */
  amount: number;
  durationTurns: number;
  /** 挑発状態の相手から受けるダメージには、さらにこの割合だけ上乗せして軽減する */
  vsTauntedExtra?: number;
  /** 適用先。省略時はスキルの対象 */
  applyTo?: EffectApplyTo;
  /** Lv5でも継続ターンを延ばさない印 */
  fixedDuration?: true;
}

/**
 * かばう。**対象が受けるダメージの一部を、術者が代わりに受ける。**
 *
 * 軽減と違い、ダメージそのものは消えず引き受け先が変わるだけ。
 * 守る側が倒れれば守れなくなるので、「誰が前に立つか」の判断が生まれる。
 */
export interface ProtectEffect {
  kind: "PROTECT";
  /** 肩代わりする割合(0.5で半分) */
  share: number;
  durationTurns: number;
}

/**
 * 反撃態勢。かかっている間、攻撃を受けるたびに攻撃者へ反撃する。
 *
 * ボス固有の `bossTraits.counterAfterHits` と違い、**回数を溜めずに毎回返す**
 * 代わりに継続ターンが短い。反撃そのものは反撃を呼ばない。
 */
export interface CounterStanceEffect {
  kind: "COUNTER_STANCE";
  durationTurns: number;
  /** 反撃ダメージのATK倍率 */
  multiplier: number;
  /** 反撃ダメージへ加える最大HP比例の係数 */
  hpCoefficient?: number;
  /** 反撃1回ごとに自身が回復する最大HP割合 */
  healRate?: number;
}

/**
 * クールタイム短縮。対象の全スキルのクールタイムをこのターン数だけ縮める。
 *
 * **0未満にはしない。** 縮めた結果が負になると、次に使った時の
 * クールタイム設定と噛み合わず、実質「常時使える」技が生まれる。
 */
export interface CooldownReduceEffect {
  kind: "COOLDOWN_REDUCE";
  turns: number;
  /** 適用先。省略時はスキルの対象 */
  applyTo?: EffectApplyTo;
  /** 縮める枠を1つに絞る。省略時は全スキル */
  slot?: 0 | 1 | 2;
  /** この効果を出す条件 */
  requires?: EffectCondition;
}

/**
 * 被弾するたびに行動ゲージが進む状態。
 *
 * 「狙われることで得をする」というタンクの動機を作るためのもの。
 * ターゲット集中と組み合わせると、**前に出るほど手番が早く回る。**
 */
export interface GaugeOnHitEffect {
  kind: "GAUGE_ON_HIT";
  /** 1回被弾するごとに進むゲージ(0〜1) */
  amount: number;
  durationTurns: number;
  /** 適用先。省略時はスキルの対象 */
  applyTo?: EffectApplyTo;
}

/**
 * 強化奪取。対象にかかっている有利な効果を取り上げ、**そのまま自分に移す。**
 *
 * 解除(STRIP)は相手から消すだけだが、こちらは自分が得る。
 * 相手の準備を自分の準備に変えるので、支えを持つ相手ほど痛い。
 */
export interface StealBuffEffect {
  kind: "STEAL_BUFF";
  /** 奪う個数。省略時は1個 */
  count?: number;
  /** この効果が発動を試みる基礎確率(0-1) */
  chance?: number;
}

/**
 * 協力攻撃。指定した味方を呼び、**同じ相手へそれぞれのスキル1で攻撃させる。**
 *
 * 呼ばれた側のスキル1の追加効果も潜在能力も普通に乗る。
 * ただし**協力攻撃が協力攻撃を呼ぶことはない**(無限に連鎖するため)。
 */
export interface CoopAttackEffect {
  kind: "COOP_ATTACK";
  /** 呼ぶ味方の人数 */
  allies: number;
  /** 呼ばれた味方のクールタイムをこのターン数だけ縮める */
  allyCooldownReduce?: number;
}

/**
 * バフ解除: 対象にかかっている**有利な効果**を取り除く。
 *
 * デバフ解除の逆。シールド・状態異常無効・能力上昇を剥がす。
 * これが無いと、**シールドを張り直し続けるだけの戦い方**が
 * どんな相手にも通ってしまう(サマナーズウォーの巨人ダンジョンでも、
 * ボス側の強化を剥がす役が攻略の要になっている)。
 */
export interface StripEffect {
  kind: "STRIP";
  /** この効果が発動を試みる基礎確率(0-1) */
  chance?: number;
  /**
   * 解除する個数。**省略時は従来どおり全部**。
   * 既存スキルの意味を変えないため、既定値は残してある。
   */
  count?: number;
  /** 解除に成功した1個につき、術者の行動ゲージを増やす */
  selfGaugePerRemoved?: number;
}

/**
 * 治癒阻害: かかっている間、受ける回復量が減る。
 *
 * **耐久で押し切る戦い方への答え。**回復し続けて時間を稼ぐ相手に対して、
 * 「削り切れない」を「削り切れる」に変えるための唯一の手段になる。
 */
export interface HealBlockEffect {
  kind: "HEAL_BLOCK";
  /** 回復量に掛かる倍率(0.5なら回復半減)。0にすると完全に回復できなくなる */
  healMultiplier: number;
  durationTurns: number;
  /** この効果が発動を試みる基礎確率(0-1) */
  chance?: number;
  /** Lv5でも継続ターンを延ばさない印 */
  fixedDuration?: true;
}

/** デバフ解除: 対象にかかっているデバフ(DEBUFF効果)を取り除く */
export interface CleanseEffect {
  kind: "CLEANSE";
  /**
   * 解除する個数。**省略時は従来どおり全部**。
   * 既存スキルの意味を変えないため、既定値は残してある。
   */
  count?: number;
  /** 適用先。省略時はスキルの対象 */
  applyTo?: EffectApplyTo;
}

/**
 * クールタイム延長: 対象の全スキルのクールタイムをこのターン数だけ延長する(封印効果)。
 *
 * **これだけが免疫も抵抗も無視して必ず当たっていた。**他のデバフは
 * `isImmune` と命中/抵抗の判定を通るのに、ここだけ素通りしていたため、
 * 状態異常無効を張っても、抵抗を積んでも防げない唯一の妨害になっていた。
 * しかもデバフ解除でも消せない(解除はDEBUFF効果だけを対象にする)。
 * 確率を持たせ、他と同じ土俵に載せる。
 */
export interface CooldownExtendEffect {
  kind: "COOLDOWN_EXTEND";
  turns: number;
  /** この効果が発動を試みる基礎確率(0-1)。省略時は常に発動を試みる(その後、命中率/抵抗率判定を経る) */
  chance?: number;
}

/**
 * 暗闇: かかっている間、そのモンスターの攻撃が当たらなくなることがある。
 * 攻撃するたびに判定し、失敗するとダメージが大きく下がり、
 * そのスキルの追加効果(デバフ・スタンなど)も一切乗らない。
 */
export interface BlindEffect {
  kind: "BLIND";
  durationTurns: number;
  /** この効果が発動を試みる基礎確率(0-1)。省略時は常に発動を試みる */
  chance?: number;
}

/** 毒: 1スタックにつき、対象の手番開始時に最大HPのdamageRatePerStack分のダメージを受ける(最大5スタックまで重複) */
export interface PoisonEffect {
  kind: "POISON";
  damageRatePerStack: number;
  durationTurns: number;
  /** この効果が発動を試みる基礎確率(0-1)。省略時は常に発動を試みる(その後、命中率/抵抗率判定を経る) */
  chance?: number;
  /** 付与する重ね数。省略時は1 */
  stacks?: number;
  /** 対象が既に毒状態なら、さらにこの数だけ重ねる */
  extraStacksIfPoisoned?: number;
  /** Lv5でも継続ターンを延ばさない印 */
  fixedDuration?: true;
}

export type SkillEffect =
  | DamageEffect
  | HealEffect
  | LifestealEffect
  | BuffEffect
  | DebuffEffect
  | StunEffect
  | BurnEffect
  | GaugeEffect
  | ShieldEffect
  | ImmunityEffect
  | RegenEffect
  | CleanseEffect
  | StripEffect
  | HealBlockEffect
  | CooldownExtendEffect
  | PoisonEffect
  | BlindEffect
  | StatusEffect
  | MitigateEffect
  | ProtectEffect
  | CounterStanceEffect
  | CooldownReduceEffect
  | StealBuffEffect
  | CoopAttackEffect
  | GaugeOnHitEffect;

export interface Skill {
  id: string;
  name: string;
  description: string;
  target: TargetType;
  /** このスキルが使えるようになるまでのクールタイム(ターン数)。0ならクールタイム無し */
  cooldownTurns: number;
  effects: SkillEffect[];
  /**
   * パッシブ。**この枠は行動として選ばれない。**
   *
   * 常に効いている、あるいは決まった出来事で自動的に発動するので、
   * 手番に「使う」ものではない。継承(クリエイト)の**移し元にもならない**が、
   * パッシブが入っている枠そのものは、別の継承できるスキルへ変更できる
   * (依頼主の指定)。
   */
  passive?: PassiveSpec;
  /**
   * そのパッシブの現在のレベル(1〜5)。`computeLeveledSkill` が焼き込む。
   * 静的なスキル定義には無く、個体から作った戦闘用の定義にだけ入る。
   */
  passiveLevel?: number;
}

/** そのスキルがパッシブか */
export function isPassiveSkill(skill: Skill): boolean {
  return skill.passive !== undefined;
}

export function isOffCooldownSkill(skill: Skill): boolean {
  return skill.cooldownTurns > 0;
}

/** スキルレベルの上限 */
export const MAX_SKILL_LEVEL = 5;

/** レベル2〜4の間、1レベルごとにダメージ倍率・回復量・発動確率がこの割合ずつ上昇する */
const SKILL_POWER_GROWTH_PER_LEVEL = 0.06;

/**
 * クールタイムが無いスキル(スキル1)は、Lv5になってもクールタイム短縮の恩恵を受けられず、
 * バフ/デバフ/スタンを持たない純粋な攻撃技だと何も変化しなかったため、Lv5到達時にさらに
 * もう一段成長するようにしてある(通常のLv2〜4と同じ上昇幅を追加で1回分)。
 */
const NO_COOLDOWN_LV5_BONUS_GROWTH = SKILL_POWER_GROWTH_PER_LEVEL;

function powerGrowthFactor(level: number, hasNoCooldown: boolean): number {
  const cappedLevel = Math.min(level, 4);
  let growth = 1 + SKILL_POWER_GROWTH_PER_LEVEL * (cappedLevel - 1);
  if (level >= MAX_SKILL_LEVEL && hasNoCooldown) {
    growth += NO_COOLDOWN_LV5_BONUS_GROWTH;
  }
  return growth;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function growChance(chance: number, growth: number): number {
  return Math.min(1, round3(chance * growth));
}

/**
 * スキルレベルを反映した実効スキルを計算する。
 * レベル2〜4: ダメージ倍率・回復量・(デバフ/スタン/火傷の)発動確率が少しずつ上昇する。
 * レベル5到達時: それ以上の威力上昇はせず(クールタイム無しのスキルを除く)、代わりにクールタイムが
 * 1ターン短縮され、バフ・デバフの継続ターンが1ターン延びる。ただしスタン・火傷は強力すぎるため、
 * 継続ターンはレベルによらず常に一定(発動確率のみ成長する)。
 */
export function computeLeveledSkill(skill: Skill, level: number): Skill {
  const clampedLevel = Math.max(1, Math.min(level, MAX_SKILL_LEVEL));
  /*
   * パッシブはアクティブと成長のしかたが違う。
   * 倍率を掛けるのでもクールタイムを縮めるのでもなく、
   * **Lv1〜5の値がそれぞれ別に書いてある**(`src/core/passive.ts`)。
   * ここではレベルだけを焼き込み、効果には一切触れない。
   */
  if (skill.passive) return { ...skill, passiveLevel: clampedLevel };
  if (clampedLevel === 1) return skill;

  const growth = powerGrowthFactor(clampedLevel, skill.cooldownTurns === 0);
  const isMaxLevel = clampedLevel >= MAX_SKILL_LEVEL;
  /**
   * Lv5でターン数を延ばしてよいか。
   * `fixedDuration` が立っている効果は、**スキルMAXでも書いたターン数のまま**。
   * 無敵1ターン・強化阻害1ターンなどは、その短さ自体が効果の重さと釣り合っている。
   */
  const extend = (effect: { fixedDuration?: true }) => isMaxLevel && !effect.fixedDuration;

  const effects = skill.effects.map((effect): SkillEffect => {
    switch (effect.kind) {
      case "DAMAGE":
        return { ...effect, multiplier: round2(effect.multiplier * growth) };
      case "HEAL":
        return { ...effect, healRate: round3(effect.healRate * growth) };
      case "LIFESTEAL":
        return { ...effect, healRate: round3(effect.healRate * growth) };
      case "BUFF":
        return extend(effect) ? { ...effect, durationTurns: effect.durationTurns + 1 } : effect;
      case "STATUS": {
        const withChance = effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
        return extend(withChance) ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
      }
      case "DEBUFF": {
        const withChance = effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
        return extend(withChance) ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
      }
      case "STUN":
        return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
      case "BLIND":
        // 暗闇は攻撃を丸ごと潰しうるため、継続ターンは伸ばさず確率だけ成長させる
        return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
      case "BURN":
        return { ...effect, chance: growChance(effect.chance, growth) };
      case "GAUGE":
        return { ...effect, amount: round3(effect.amount * growth) };
      case "SHIELD": {
        const withRate = { ...effect, shieldRate: round3(effect.shieldRate * growth) };
        return extend(withRate) ? { ...withRate, durationTurns: withRate.durationTurns + 1 } : withRate;
      }
      case "IMMUNITY":
        return extend(effect) ? { ...effect, durationTurns: effect.durationTurns + 1 } : effect;
      case "REGEN": {
        const withRate = { ...effect, healRate: round3(effect.healRate * growth) };
        return extend(withRate) ? { ...withRate, durationTurns: withRate.durationTurns + 1 } : withRate;
      }
      case "POISON": {
        const withRate = { ...effect, damageRatePerStack: round3(effect.damageRatePerStack * growth) };
        const withChance = withRate.chance !== undefined ? { ...withRate, chance: growChance(withRate.chance, growth) } : withRate;
        return extend(withChance) ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
      }
      case "STRIP":
        return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
      case "STEAL_BUFF":
        return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
      case "HEAL_BLOCK": {
        const withChance = effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
        return extend(withChance) ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
      }
      case "COOLDOWN_EXTEND":
        // 延長ターン数は伸ばさない。1増えるだけで妨害の重さが跳ね上がる
        return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
      case "MITIGATE":
        return extend(effect) ? { ...effect, durationTurns: effect.durationTurns + 1 } : effect;
      case "PROTECT":
        // 肩代わりは割合も期間も伸ばさない。守り役が一方的に強くなりすぎる
        return effect;
      case "COUNTER_STANCE":
        return { ...effect, multiplier: round2(effect.multiplier * growth) };
      case "COOLDOWN_REDUCE":
        // 縮めるターン数は伸ばさない。1増えるだけで必殺技の間隔の意味が消える
        return effect;
      case "GAUGE_ON_HIT":
        return extend(effect as { fixedDuration?: true }) ? { ...effect, durationTurns: effect.durationTurns + 1 } : effect;
      default:
        return effect;
    }
  });

  const cooldownTurns = isMaxLevel ? Math.max(0, skill.cooldownTurns - 1) : skill.cooldownTurns;

  return { ...skill, cooldownTurns, effects };
}

export const BUFF_STAT_JA: Record<BuffStat, string> = {
  atk: "攻撃力",
  def: "防御力",
  spd: "速度",
  criRate: "クリ率",
  criDmg: "クリダメ",
};

export const STATUS_EFFECT_JA: Record<StatusEffectType, string> = {
  CRIT_RATE_DOWN: "被クリ率ダウン", ENDURE: "我慢", REFLECT: "反射", REVIVE: "復活", INVINCIBLE: "無敵",
  TAUNT: "挑発", BUFF_BLOCK: "強化不可", SKILL_LOCK: "スキル使用不可", CRIT_RATE_UP: "被クリ率アップ",
  FOCUS: "ターゲット集中",
};

export const EFFECT_CONDITION_JA: Record<EffectCondition, string> = {
  TARGET_HAS_DEBUFF: "対象が弱体状態なら",
  TARGET_SPD_DOWN: "対象が速度低下状態なら",
  TARGET_POISONED: "対象が毒状態なら",
  TARGET_TAUNTED: "対象が挑発状態なら",
  TARGET_HAS_BUFF: "対象が強化状態なら",
  TARGET_HP_BELOW_50: "対象のHPが50%以下なら",
  TARGET_HP_BELOW_30: "対象のHPが30%以下なら",
  TARGET_HP_ABOVE_SELF: "対象のHP割合が自身より高いなら",
  TARGET_GAUGE_BELOW_20: "対象の行動ゲージが20%以下なら",
  TARGET_DEBUFF_AT_LEAST_3: "対象の弱体効果が3個以上なら",
  SELF_HP_ABOVE_50: "自身のHPが50%以上なら",
  ANY_CRIT: "1回以上クリティカルしたら",
  CRITS_AT_LEAST_2: "2回以上クリティカルしたら",
  CRITS_AT_LEAST_3: "3回以上クリティカルしたら",
  STUN_FAILED: "スタンが失敗したら",
  KILLED_TARGET: "相手を倒したら",
};

const SCALE_BONUS_STAT_JA: Record<"spd" | "def" | "hp", string> = {
  spd: "速度",
  def: "防御力",
  hp: "最大HP",
};

function chanceSuffix(chance: number | undefined): string {
  return chance !== undefined ? `${Math.round(chance * 100)}%で` : "";
}

function conditionPrefix(condition: EffectCondition | undefined): string {
  return condition ? EFFECT_CONDITION_JA[condition] : "";
}

/** UI表示用に、スキル効果1件を短い日本語テキストに変換する */
export function describeSkillEffect(effect: SkillEffect): string {
  switch (effect.kind) {
    case "DAMAGE": {
      const scaleText = effect.scaleBonus
        ? `(自身の${SCALE_BONUS_STAT_JA[effect.scaleBonus.stat]}が高いほど上昇)`
        : effect.hpCoefficient !== undefined
          ? `(最大HP×${effect.hpCoefficient}を加算)`
          : effect.defCoefficient !== undefined
            ? `(防御力×${effect.defCoefficient}を加算)`
            : "";
      const ignoreDefenseText = effect.ignoreDefense
        ? "(防御力無視)"
        : effect.ignoreDefenseRatio
          ? `(防御力${Math.round(effect.ignoreDefenseRatio * 100)}%無視)`
          : "";
      const hpBonusText = (effect.targetHpBonus ?? [])
        .map((tier) => ` 対象HP${Math.round(tier.hpRatio * 100)}%以下で最終ダメージ+${Math.round(tier.bonus * 100)}%`)
        .join("");
      const hpIgnoreText = (effect.targetHpIgnoreDefense ?? [])
        .map((tier) => ` 対象HP${Math.round(tier.hpRatio * 100)}%以下で防御力${Math.round(tier.ratio * 100)}%無視`)
        .join("");
      const condBonusText = (effect.conditionalBonus ?? [])
        .map((entry) => ` ${EFFECT_CONDITION_JA[entry.when]}最終ダメージ+${Math.round(entry.bonus * 100)}%`)
        .join("");
      const missingText = effect.missingHpBonus
        ? ` 自身が失ったHPが多いほど最終ダメージ上昇(最大+${Math.round(effect.missingHpBonus.maxBonus * 100)}%)`
        : "";
      const debuffBonusText = effect.debuffDamageBonus
        ? ` 対象の弱体効果1個につき最終ダメージ+${Math.round(effect.debuffDamageBonus.perDebuff * 100)}%(最大+${Math.round(effect.debuffDamageBonus.maxBonus * 100)}%)`
        : "";
      const critGaugeText = effect.gaugeOnCritPerHit
        ? ` 各ヒットのクリティカルで自身の行動ゲージ+${Math.round(effect.gaugeOnCritPerHit * 100)}%`
        : "";
      const requiresText = conditionPrefix(effect.requires);
      return `${requiresText}ダメージ倍率 ${effect.multiplier.toFixed(2)}倍${effect.hits && effect.hits > 1 ? ` × ${effect.hits}回` : ""}${scaleText}${ignoreDefenseText}${hpBonusText}${hpIgnoreText}${condBonusText}${missingText}${debuffBonusText}${critGaugeText}`;
    }
    case "HEAL": {
      const who = effect.applyTo === "SELF" ? "自身を" : effect.applyTo === "ALLIES" ? "味方全体を" : "";
      if (effect.scaleStat === "atk") return `${who}回復 自身の攻撃力の${(effect.healRate * 100).toFixed(0)}%`;
      if (effect.scaleStat === "def") return `${who}回復 自身の防御力の${(effect.healRate * 100).toFixed(0)}%`;
      return `${who}回復 最大HPの${(effect.healRate * 100).toFixed(1)}%`;
    }
    case "LIFESTEAL":
      return `与えたダメージの${(effect.healRate * 100).toFixed(0)}%を自身が回復`;
    case "BUFF": {
      const scope = effect.applyTo === "ALLIES" ? "味方全体の" : effect.applyTo === "SELF" ? "自身の" : "";
      return `${scope}${BUFF_STAT_JA[effect.stat]}+${Math.round(effect.amount * 100)}% (${effect.durationTurns}ターン)`;
    }
    case "DEBUFF":
      return `${chanceSuffix(effect.chance)}${BUFF_STAT_JA[effect.stat]}-${Math.round(effect.amount * 100)}% (${effect.durationTurns}ターン)`;
    case "STATUS": {
      const scope = effect.applyTo === "ALLIES" ? "味方全体に" : effect.applyTo === "SELF" ? "自身に" : "";
      return `${chanceSuffix(effect.chance)}${scope}${STATUS_EFFECT_JA[effect.status]} (${effect.durationTurns}ターン)`;
    }
    case "STUN":
      return `${conditionPrefix(effect.requires)}${chanceSuffix(effect.chance)}スタン (${effect.durationTurns}ターン)`;
    case "BURN":
      return `${chanceSuffix(effect.chance)}火傷 (${effect.durationTurns}ターン、自身のターン終了時に自身の攻撃力分のダメージ)`;
    case "GAUGE": {
      const scope = effect.applyTo === "ALLIES" ? "味方全体の" : effect.applyTo === "SELF" ? "自身の" : "";
      const extra = effect.conditionalExtra
        ? ` (${EFFECT_CONDITION_JA[effect.conditionalExtra.when]}さらに${Math.round(Math.abs(effect.conditionalExtra.amount) * 100)}%)`
        : effect.lowHpExtra
          ? ` (HP${Math.round(effect.lowHpExtra.hpRatio * 100)}%以下ならさらに${Math.round(effect.lowHpExtra.amount * 100)}%)`
          : "";
      const head = conditionPrefix(effect.requires);
      if (effect.drain) return `${head}${scope}行動ゲージを${Math.round(effect.amount * 100)}%吸収${extra}`;
      const verb = effect.amount >= 0 ? `+${Math.round(effect.amount * 100)}%` : `-${Math.round(-effect.amount * 100)}%`;
      return `${head}${scope}行動ゲージ${verb}${extra}`;
    }
    case "SHIELD": {
      const scope = effect.applyTo === "ALLIES" ? "味方全体に" : effect.applyTo === "SELF" ? "自身に" : "";
      const base = effect.fromSourceHp ? "自身の最大HP" : "最大HP";
      return `${scope}シールド ${base}の${Math.round(effect.shieldRate * 100)}% (${effect.durationTurns}ターン、ダメージを肩代わり)`;
    }
    case "IMMUNITY":
      return `状態異常無効 (${effect.durationTurns}ターン)`;
    case "REGEN":
      return `継続回復 最大HPの${(effect.healRate * 100).toFixed(1)}% (${effect.durationTurns}ターン、自身のターン開始時)`;
    case "CLEANSE": {
      const scope = effect.applyTo === "ALLIES" ? "味方全体の" : effect.applyTo === "SELF" ? "自身の" : "";
      return effect.count === undefined ? `${scope}デバフを解除` : `${scope}デバフを${effect.count}個解除`;
    }
    case "STRIP":
      return effect.count === undefined
        ? `${chanceSuffix(effect.chance)}有利な効果(シールド・無効・能力上昇)を解除`
        : `${chanceSuffix(effect.chance)}有利な効果を${effect.count}個解除`;
    case "STEAL_BUFF":
      return `${chanceSuffix(effect.chance)}有利な効果を${effect.count ?? 1}個奪って自身に付与`;
    case "MITIGATE": {
      const scope = effect.applyTo === "ALLIES" ? "味方全体の" : effect.applyTo === "SELF" ? "自身の" : "";
      const extra = effect.vsTauntedExtra ? `(挑発状態の敵からはさらに${Math.round(effect.vsTauntedExtra * 100)}%軽減)` : "";
      return `${scope}受けるダメージ-${Math.round(effect.amount * 100)}% (${effect.durationTurns}ターン)${extra}`;
    }
    case "PROTECT":
      return `保護 (${effect.durationTurns}ターン、対象が受けるダメージの${Math.round(effect.share * 100)}%を自身が肩代わり)`;
    case "COUNTER_STANCE": {
      const hp = effect.hpCoefficient ? `(最大HP×${effect.hpCoefficient}を加算)` : "";
      const heal = effect.healRate ? ` 反撃のたび自身のHPを最大HPの${Math.round(effect.healRate * 100)}%回復` : "";
      return `${effect.durationTurns}ターン、攻撃を受けるたび攻撃者へ攻撃力${effect.multiplier.toFixed(2)}倍の反撃${hp}${heal}`;
    }
    case "COOLDOWN_REDUCE": {
      const scope = effect.applyTo === "ALLIES" ? "味方全体の" : effect.applyTo === "SELF" ? "自身の" : "";
      return `${scope}全スキルのクールタイムを${effect.turns}ターン短縮`;
    }
    case "COOP_ATTACK": {
      const cd = effect.allyCooldownReduce ? `(参加した味方のクールタイム-${effect.allyCooldownReduce})` : "";
      return `味方${effect.allies}体とともに同じ相手へスキル1で協力攻撃${cd}`;
    }
    case "GAUGE_ON_HIT":
      return `${effect.durationTurns}ターン、攻撃を受けるたび行動ゲージ+${Math.round(effect.amount * 100)}%`;
    case "HEAL_BLOCK":
      return `${chanceSuffix(effect.chance)}治癒阻害 (${effect.durationTurns}ターン、受ける回復が${Math.round((1 - effect.healMultiplier) * 100)}%減る)`;
    case "COOLDOWN_EXTEND":
      return `${chanceSuffix(effect.chance)}敵の全スキルのクールタイムを${effect.turns}ターン延長`;
    case "BLIND":
      return `${chanceSuffix(effect.chance)}暗闇 (${effect.durationTurns}ターン、攻撃時50%でダメージ-75%・追加効果なし)`;
    case "POISON": {
      const stacks = effect.stacks && effect.stacks > 1 ? `${effect.stacks}スタック` : "1スタック";
      const extra = effect.extraStacksIfPoisoned ? ` (既に毒状態ならさらに${effect.extraStacksIfPoisoned}スタック)` : "";
      return `${chanceSuffix(effect.chance)}毒${stacks} (1スタックにつき最大HPの${Math.round(effect.damageRatePerStack * 100)}%、最大5スタック、${effect.durationTurns}ターン)${extra}`;
    }
  }
}

/**
 * UI表示用に、スキル1つの中身を行の配列にする。
 * パッシブはそのレベルの中身を1行で返す(効果の配列を持たないため)。
 */
export function describeSkillLines(skill: Skill): string[] {
  if (skill.passive) return [describePassiveLevel(passiveAtLevel(skill.passive, skill.passiveLevel ?? 1))];
  return skill.effects.map(describeSkillEffect);
}
