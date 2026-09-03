import type { BuffStat, EffectCondition } from "./skill.js";

/**
 * クリエイト拡張で個体ごとに保存する育成情報。
 *
 * 保存値とバランス設定の境界。調整中の倍率やコストを呼び出し側へ散らさないこと。
 */
export type MonsterType = "ATTACK" | "HP" | "DEFENSE" | "SUPPORT" | "DISRUPT" | "BALANCE";

export type AllocatableStat = "hp" | "atk" | "def" | "spd";

export type AbilityPointAllocation = Record<AllocatableStat, number>;

export interface MonsterDevelopment {
  /** 保存形式の移行単位。個別機能の実装時に必要な場合だけ上げる */
  schemaVersion: 1;
  /** タイプ転生を行うまでは未設定。未設定個体の補正は常にゼロとする */
  type: MonsterType | null;
  /** 能力ポイントの割り振り。換算後の能力ではなくポイント数を保存する */
  abilityPoints: AbilityPointAllocation;
  /** 選択した潜在能力の安定ID。未覚醒ならnull */
  latentAbilityId: string | null;
  /** 再覚醒の費用を支払い済みで、候補の再選択を待っている状態 */
  latentReselectPending: boolean;
  /**
   * 能力ポイントの配分を確定したか。
   *
   * **これが無い間は、何度でも自由に振り直せる**(初回配分)。
   * 確定したら固定され、変えるには `ABILITY_POINT_RESET_COST` を払う。
   *
   * ## なぜ要ったのか
   *
   * 以前は `setAbilityPoint` が下げる方向も素通ししていたので、
   * **HPを0へ戻して攻撃へ移す、を無料で何度でもできた。**
   * 有料のリセットは、その回り道があるせいで意味を成していなかった。
   *
   * 省略可にしてあるのは、**前から遊んでいる人の控えに無いから。**
   * 無い時は「1点でも振ってあれば確定済み」として読む
   * (`abilityPointsConfirmed()`)。既に配り終えた人を、
   * 無料で振り直せる状態のままにしないため。
   */
  abilityPointsConfirmed?: boolean;
}

/**
 * 確定した能力ポイントを振り直す費用。
 *
 * **初回の配分は無料。** ここで取るのは「一度決めたものを変える」代金で、
 * 決めること自体に金を取ると、触るのが怖くて誰も配らなくなる。
 */
export const ABILITY_POINT_RESET_COST = 300_000;

/** タイプ転生。能力ポイントも一緒に戻るので、リセットと同額に揃えてある */
export const TYPE_REINCARNATION_GOLD_COST = 300_000;

/** 星ごとの配分上限。能力ポイントは星4で解放される。 */
export const ABILITY_POINT_BUDGETS = { 1: 0, 2: 0, 3: 0, 4: 20, 5: 50, 6: 100 } as const;
/** @deprecated 星別上限には abilityPointBudget を使用する。 */
export const ABILITY_POINT_BUDGET = ABILITY_POINT_BUDGETS[6];

export function abilityPointBudget(star: keyof typeof ABILITY_POINT_BUDGETS): number {
  return ABILITY_POINT_BUDGETS[star];
}

/** 能力付与の正式換算値。必ずこの一か所から参照する。 */
export const ABILITY_POINT_VALUES: Readonly<Record<AllocatableStat, number>> = {
  hp: 20,
  atk: 2,
  def: 3,
  spd: 0.1,
};

/**
 * タイプの正式補正。保存済み個体にはタイプだけを保存し、数値は一元管理する。
 */
export interface MonsterTypeModifiers extends Record<AllocatableStat, number> {
  criRate: number;
  criDmg: number;
  accuracy: number;
  resistance: number;
}

export const MONSTER_TYPE_STAT_MULTIPLIERS: Readonly<Record<MonsterType, Readonly<MonsterTypeModifiers>>> = {
  ATTACK: { hp: 0.85, atk: 1.20, def: 0.90, spd: 1, criRate: 0.10, criDmg: 0, accuracy: 0, resistance: -0.10 },
  HP: { hp: 1.20, atk: 0.85, def: 1, spd: 1, criRate: -0.05, criDmg: -0.10, accuracy: 0, resistance: 0.10 },
  DEFENSE: { hp: 1, atk: 0.90, def: 1.20, spd: 1, criRate: -0.10, criDmg: -0.10, accuracy: 0, resistance: 0.10 },
  SUPPORT: { hp: 1.10, atk: 0.85, def: 1, spd: 1.10, criRate: 0, criDmg: -0.15, accuracy: 0, resistance: 0.05 },
  DISRUPT: { hp: 1, atk: 0.85, def: 1, spd: 1.08, criRate: 0, criDmg: -0.15, accuracy: 0.15, resistance: -0.05 },
  BALANCE: { hp: 1, atk: 1, def: 1, spd: 1, criRate: 0, criDmg: 0, accuracy: 0, resistance: 0 },
};

export const MONSTER_TYPE_DESCRIPTIONS: Readonly<Record<MonsterType, string>> = {
  ATTACK: "長所: ATK +20%・クリ率 +10pt / 短所: HP -15%・DEF -10%・抵抗 -10pt",
  HP: "長所: HP +20%・抵抗 +10pt / 短所: ATK -15%・クリ率 -5pt・クリダメ -10pt",
  DEFENSE: "長所: DEF +20%・抵抗 +10pt / 短所: ATK -10%・クリ率 -10pt・クリダメ -10pt",
  SUPPORT: "長所: SPD +10%・HP +10%・抵抗 +5pt / 短所: ATK -15%・クリダメ -15pt",
  DISRUPT: "長所: SPD +8%・的中 +15pt / 短所: ATK -15%・クリダメ -15pt・抵抗 -5pt",
  BALANCE: "すべての能力補正なし。長所も短所もない標準型",
};

export const MONSTER_TYPE_LABELS: Readonly<Record<MonsterType, string>> = {
  ATTACK: "攻撃", HP: "体力", DEFENSE: "防御", SUPPORT: "補助", DISRUPT: "妨害", BALANCE: "バランス",
};

export type LatentAbilityCategory = "OFFENSE" | "DISRUPT" | "DURABILITY" | "SUPPORT" | "SPECIAL";
export type LatentAbilityEffectType =
  | "DAMAGE_UP" | "CRIT_TRIGGER" | "HP_SCALING" | "DEF_SCALING"
  | "DEBUFF_CHANCE_UP" | "ADD_DEBUFF" | "TURN_METER_DOWN"
  | "SELF_HEAL" | "ADD_BUFF" | "ALLY_SUPPORT" | "SHIELD" | "SPECIAL_TRIGGER";

export type LatentRuntimeEffect =
  | { kind: "DEBUFF"; status: "HEAL_BLOCK" | "SPD_DOWN" | "ATK_DOWN" | "DEF_DOWN" | "POISON" | "STUN" | "BUFF_BLOCK"; chance: number; duration: number; value?: number }
  | { kind: "STRIP"; chance: number; count: number }
  | { kind: "GAUGE_DOWN"; chance: number; value: number }
  | { kind: "ALLY_GAUGE_UP"; chance: number; value: number }
  | { kind: "DEBUFF_EXTEND"; chance: number; duration: number }
  | { kind: "HEAL_CLEANSE"; value: number }
  | { kind: "REGEN"; value: number; duration: number }
  | { kind: "SHIELD"; value: number; duration: number }
  /* ---- ここから下は11種の追加で足したもの ---- */
  /** 自身の行動ゲージを増やす */
  | { kind: "SELF_GAUGE"; value: number }
  /** 自身のHPを最大HPの割合で回復する */
  | { kind: "SELF_HEAL"; value: number }
  /** このスキルで与えたダメージの割合ぶん自身が回復する */
  | { kind: "LIFESTEAL"; value: number }
  /** 自身の弱体効果を解除する。内部クールタイムを持たせられる */
  | { kind: "SELF_CLEANSE"; count: number; internalCooldown?: number }
  /** HP割合が最も低い味方を回復する */
  | { kind: "LOWEST_ALLY_HEAL"; value: number }
  /** HP割合が最も低い味方の行動ゲージを増やす。閾値を切っていればさらに増やす */
  | { kind: "LOWEST_ALLY_GAUGE"; value: number; whenAllyHpBelow?: number; extra?: number }
  /** HP割合が最も低い味方の弱体効果を解除する */
  | { kind: "LOWEST_ALLY_CLEANSE"; count: number; internalCooldown?: number }
  /** HP割合が最も低い味方へ、自身の最大HPを基準にしたシールドを張る */
  | { kind: "LOWEST_ALLY_SHIELD"; value: number; duration: number }
  /** HP割合が最も低い味方へ被ダメージ軽減を与える */
  | { kind: "LOWEST_ALLY_MITIGATE"; value: number; duration: number }
  /** HP割合が最も低い味方へ能力上昇を与える */
  | { kind: "LOWEST_ALLY_BUFF"; stat: BuffStat; amount: number; duration: number }
  /** 味方全体を回復する */
  | { kind: "ALLY_HEAL"; value: number }
  /** 自身へシールドを張る */
  | { kind: "SELF_SHIELD"; value: number; duration: number }
  /** このスキルで減らした相手のゲージのうち、この割合を自身が吸収する */
  | { kind: "GAUGE_DRAIN_SHARE"; value: number }
  /** 相手の強化効果を1個奪って自身に付ける */
  | { kind: "STEAL_BUFF"; count: number; duration?: number };

/**
 * 潜在能力を出す条件。
 *
 * **「S1で毒が入った時」「HP50%以下の相手を殴った時」のような、
 * その一撃で何が起きたかに紐づく発動**を書けるようにするためのもの。
 * 依頼主の指定どおり、**低確率で体感しづらいものを増やすのではなく、
 * 条件を満たせば確実に効くもの**を主にしている。
 */
export type LatentCondition =
  | { kind: "ALWAYS" }
  /** このスキルでクリティカルしたら。atLeastでクリティカル回数の下限を指定できる */
  | { kind: "ON_CRIT"; atLeast?: number }
  /** このスキルでその弱体効果/解除が実際に入ったら */
  | { kind: "ON_APPLIED"; status: LatentAppliedStatus }
  /** このスキルで相手を倒したら */
  | { kind: "ON_KILL" }
  /** 対象のHPがこの割合以下なら */
  | { kind: "TARGET_HP_BELOW"; ratio: number }
  /** 対象が特定の状態なら */
  | { kind: "TARGET_STATE"; state: EffectCondition };

/** 潜在能力の発動条件で見る「実際に入ったもの」 */
export type LatentAppliedStatus =
  | "POISON" | "SPD_DOWN" | "ATK_DOWN" | "DEF_DOWN" | "TAUNT"
  | "HEAL_BLOCK" | "STUN" | "BLIND" | "STRIP" | "ANY_DEBUFF";

/** ⑧-3の戦闘実装へそのまま渡せる、スキル1専用の宣言的な候補データ。 */
export interface LatentAbilityCandidate {
  id: string;
  name: string;
  description: string;
  skillSlot: 0;
  category: LatentAbilityCategory;
  effectType: LatentAbilityEffectType;
  /** 倍率・係数・ゲージ量。効果に数値が不要な場合は0。 */
  value: number;
  /** 0～1。確定発動も1と明記する。 */
  chance: number;
  duration: number;
  target: "SELF" | "TARGET" | "LOWEST_HP_ALLY" | "ALL_ALLIES";
  /** ADD_DEBUFF / ADD_BUFF 等が扱う状態ID。 */
  status?: string;
  /** 既存S1効果とは別判定か、既存確率への加算か。 */
  resolution: "ALWAYS" | "SEPARATE" | "ADD_TO_EXISTING" | "ON_CRIT" | "CONDITIONAL";
  /** S1使用単位で解決する追加効果。多段数には影響されない。 */
  runtimeEffects?: readonly LatentRuntimeEffect[];
  /**
   * `runtimeEffects` を出すための条件。省略時は常に出す。
   * **多段でも1スキル使用につき1回しか判定しない**(依頼主の指定)。
   */
  condition?: LatentCondition;
  /** 内部クールタイム(ターン)。0より大きいと、発動後その間は出ない */
  internalCooldown?: number;
  /** S1の最終ダメージへの素の上乗せ(条件なし) */
  flatDamageBonus?: number;
  /** 条件を満たした時だけ乗る、S1の最終ダメージへの上乗せ */
  damageBonusWhen?: readonly { when: EffectCondition; bonus: number }[];
  /** S1が持つ「対象HP割合による上乗せ」を、この内容で置き換える */
  replaceTargetHpBonus?: readonly { hpRatio: number; bonus: number }[];
  /** S1のDAMAGE効果へ、対象HP割合による防御無視を足す */
  addTargetHpIgnoreDefense?: readonly { hpRatio: number; ratio: number }[];
  /** S1のDAMAGE効果へ、能力比例の上乗せを足す(速度比例など) */
  scaleBonusAdd?: { stat: "spd" | "def" | "hp"; bonusAtReference: number };
  /**
   * ダメージ系の上乗せを、S1の**何番目のDAMAGE効果**に限るか(0始まり)。
   * 省略時は全部にかかる。「2撃目だけ強くなる」型の潜在に使う。
   */
  damageEffectIndex?: number;
  /** S1のGAUGE効果の増減量を、この値で置き換える */
  gaugeAmountOverride?: number;
  /** S1が持つ特定の効果の発動確率へ加算する */
  chanceBonus?: { effectKind: "POISON" | "DEBUFF" | "STUN" | "STATUS" | "BURN" | "BLIND" | "HEAL_BLOCK"; stat?: BuffStat; value: number };
  /** 攻撃を受けるたびに溜まり、次のスキル1で使い切る上乗せ */
  chargeOnHit?: { perHit: number; maxBonus: number };
  /** クリティカルするたびに溜まり、次のスキル1で使い切る上乗せ */
  chargeOnCrit?: { perHit: number; maxBonus: number };
  /** クリティカルするたびに増え、戦闘中ずっと残るクリダメ */
  critDmgGrowth?: { perCrit: number; maxBonus: number };
  /** スキル1の後、次に受けるダメージを1回だけ軽減する量 */
  oneShotMitigate?: number;
  aoeConversion?: { damageMultiplier: number; secondaryEffectChanceMultiplier?: number; nativeEffectTarget?: "ALL" | "PRIMARY_ONLY" };
  ignoreDefenseRatio?: number;
  debuffDamageBonus?: { perDebuff: number; maxBonus: number };
  hpMultiplier?: number;
  defMultiplier?: number;
  damageTakenMultiplier?: number;
  /** 監査用の候補品質。戦闘倍率そのものではない。 */
  grade?: "S" | "A" | "B" | "C";
}

export function createDefaultMonsterDevelopment(): MonsterDevelopment {
  return {
    schemaVersion: 1,
    type: null,
    abilityPoints: { hp: 0, atk: 0, def: 0, spd: 0 },
    latentAbilityId: null,
    latentReselectPending: false,
    /*
     * **新しい個体は必ず「未確定」から始める。**
     * ここを省くと、印が無い＝配分済みかどうかを配分量から推し量ることになり、
     * 1点振った瞬間に確定扱いになって残りが振れなくなる(実際にそうなった)。
     * 推し量るのは**印を知らない旧セーブだけ**の仕事。
     */
    abilityPointsConfirmed: false,
  };
}
