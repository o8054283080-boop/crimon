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
  | "CRIT_RATE_UP";

export type StatusEffectCategory = "BUFF" | "DEBUFF";

export const STATUS_EFFECT_CATEGORY: Record<StatusEffectType, StatusEffectCategory> = {
  CRIT_RATE_DOWN: "BUFF", ENDURE: "BUFF", REFLECT: "BUFF", REVIVE: "BUFF", INVINCIBLE: "BUFF",
  TAUNT: "DEBUFF", BUFF_BLOCK: "DEBUFF", SKILL_LOCK: "DEBUFF", CRIT_RATE_UP: "DEBUFF",
};

export interface StatusEffect {
  kind: "STATUS";
  status: StatusEffectType;
  durationTurns: number;
  chance?: number;
  applyTo?: "SELF" | "ALLIES";
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
  applyTo?: "SELF" | "ALLIES";
}

/** ライフスティール: 同じスキルのDAMAGE効果で与えたダメージの一部を自身が回復する */
export interface LifestealEffect {
  kind: "LIFESTEAL";
  /** 直前に与えたダメージに対する回復割合(例: 0.1で与ダメの10%回復) */
  healRate: number;
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
  applyTo?: "SELF" | "ALLIES";
}

export interface DebuffEffect {
  kind: "DEBUFF";
  stat: BuffStat;
  /** 例: 0.3 で -30% */
  amount: number;
  durationTurns: number;
  /** この効果が発動を試みる基礎確率(0-1)。省略時は常に発動を試みる(その後、命中率/抵抗率判定を経る) */
  chance?: number;
}

export interface StunEffect {
  kind: "STUN";
  durationTurns: number;
  /** この効果が発動を試みる基礎確率(0-1)。省略時は常に発動を試みる(その後、命中率/抵抗率判定を経る) */
  chance?: number;
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
}

/** シールド(バリア): 対象の最大HPに対する割合でダメージ肩代わり用のバリアを張る。HPより先にダメージを吸収する */
export interface ShieldEffect {
  kind: "SHIELD";
  shieldRate: number;
  durationTurns: number;
}

/** 状態異常免疫: この間、新たなスタン・火傷・デバフ・毒の付与を防ぐ(既にかかっている効果は解除しない) */
export interface ImmunityEffect {
  kind: "IMMUNITY";
  durationTurns: number;
}

/** 継続回復: 対象の手番開始時、最大HPに対するこの割合を毎ターン回復する */
export interface RegenEffect {
  kind: "REGEN";
  healRate: number;
  durationTurns: number;
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
}

/** デバフ解除: 対象にかかっているデバフ(DEBUFF効果)を全て取り除く */
export interface CleanseEffect {
  kind: "CLEANSE";
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
  | StatusEffect;

export interface Skill {
  id: string;
  name: string;
  description: string;
  target: TargetType;
  /** このスキルが使えるようになるまでのクールタイム(ターン数)。0ならクールタイム無し */
  cooldownTurns: number;
  effects: SkillEffect[];
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
  if (clampedLevel === 1) return skill;

  const growth = powerGrowthFactor(clampedLevel, skill.cooldownTurns === 0);
  const isMaxLevel = clampedLevel >= MAX_SKILL_LEVEL;

  const effects = skill.effects.map((effect): SkillEffect => {
    switch (effect.kind) {
      case "DAMAGE":
        return { ...effect, multiplier: round2(effect.multiplier * growth) };
      case "HEAL":
        return { ...effect, healRate: round3(effect.healRate * growth) };
      case "LIFESTEAL":
        return { ...effect, healRate: round3(effect.healRate * growth) };
      case "BUFF":
        return isMaxLevel ? { ...effect, durationTurns: effect.durationTurns + 1 } : effect;
      case "STATUS": {
        const withChance = effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
        return isMaxLevel ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
      }
      case "DEBUFF": {
        const withChance = effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
        return isMaxLevel ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
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
        return isMaxLevel ? { ...withRate, durationTurns: withRate.durationTurns + 1 } : withRate;
      }
      case "IMMUNITY":
        return isMaxLevel ? { ...effect, durationTurns: effect.durationTurns + 1 } : effect;
      case "REGEN": {
        const withRate = { ...effect, healRate: round3(effect.healRate * growth) };
        return isMaxLevel ? { ...withRate, durationTurns: withRate.durationTurns + 1 } : withRate;
      }
      case "POISON": {
        const withRate = { ...effect, damageRatePerStack: round3(effect.damageRatePerStack * growth) };
        const withChance = withRate.chance !== undefined ? { ...withRate, chance: growChance(withRate.chance, growth) } : withRate;
        return isMaxLevel ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
      }
      case "STRIP":
        return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
      case "HEAL_BLOCK": {
        const withChance = effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
        return isMaxLevel ? { ...withChance, durationTurns: withChance.durationTurns + 1 } : withChance;
      }
      case "COOLDOWN_EXTEND":
        // 延長ターン数は伸ばさない。1増えるだけで妨害の重さが跳ね上がる
        return effect.chance !== undefined ? { ...effect, chance: growChance(effect.chance, growth) } : effect;
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
};

const SCALE_BONUS_STAT_JA: Record<"spd" | "def" | "hp", string> = {
  spd: "速度",
  def: "防御力",
  hp: "最大HP",
};

function chanceSuffix(chance: number | undefined): string {
  return chance !== undefined ? `${Math.round(chance * 100)}%で` : "";
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
      const ignoreDefenseText = effect.ignoreDefense ? "(防御力無視)" : "";
      return `ダメージ倍率 ${effect.multiplier.toFixed(2)}倍${effect.hits && effect.hits > 1 ? ` × ${effect.hits}回` : ""}${scaleText}${ignoreDefenseText}`;
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
      return `${chanceSuffix(effect.chance)}スタン (${effect.durationTurns}ターン)`;
    case "BURN":
      return `${chanceSuffix(effect.chance)}火傷 (${effect.durationTurns}ターン、自身のターン終了時に自身の攻撃力分のダメージ)`;
    case "GAUGE":
      if (effect.drain) return `行動ゲージを${Math.round(effect.amount * 100)}%吸収`;
      return `行動ゲージ+${Math.round(effect.amount * 100)}%`;
    case "SHIELD":
      return `シールド 最大HPの${Math.round(effect.shieldRate * 100)}% (${effect.durationTurns}ターン、ダメージを肩代わり)`;
    case "IMMUNITY":
      return `状態異常無効 (${effect.durationTurns}ターン)`;
    case "REGEN":
      return `継続回復 最大HPの${(effect.healRate * 100).toFixed(1)}% (${effect.durationTurns}ターン、自身のターン開始時)`;
    case "CLEANSE":
      return `デバフを解除`;
    case "STRIP":
      return `${chanceSuffix(effect.chance)}有利な効果(シールド・無効・能力上昇)を解除`;
    case "HEAL_BLOCK":
      return `${chanceSuffix(effect.chance)}治癒阻害 (${effect.durationTurns}ターン、受ける回復が${Math.round((1 - effect.healMultiplier) * 100)}%減る)`;
    case "COOLDOWN_EXTEND":
      return `${chanceSuffix(effect.chance)}敵の全スキルのクールタイムを${effect.turns}ターン延長`;
    case "BLIND":
      return `${chanceSuffix(effect.chance)}暗闇 (${effect.durationTurns}ターン、攻撃時50%でダメージ-75%・追加効果なし)`;
    case "POISON":
      return `${chanceSuffix(effect.chance)}毒 (1スタックにつき最大HPの${Math.round(effect.damageRatePerStack * 100)}%、最大5スタック、${effect.durationTurns}ターン)`;
  }
}
