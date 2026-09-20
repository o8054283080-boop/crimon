import { balanceFlags } from "../core/balanceFlags.js";
import { MonsterDefinition } from "../core/monster.js";
import { PassiveLevelEffect, PassiveSpec, passiveAtLevel } from "../core/passive.js";
import { BuffStat, STATUS_EFFECT_CATEGORY, Skill, StatusEffectCategory, StatusEffectType } from "../core/skill.js";

export type Team = "PLAYER" | "ENEMY";

export interface ActiveEffect {
  stat: BuffStat;
  /** 符号付き変化量。バフは正、デバフは負 (例: +0.3 = ATK+30%) */
  amount: number;
  remainingTurns: number;
  kind: "BUFF" | "DEBUFF";
}

export interface ActiveStatusEffect {
  type: StatusEffectType;
  category: StatusEffectCategory;
  remainingTurns: number;
  /** 挑発だけが使用する。付与者のinstanceId。 */
  sourceId?: string;
}

export interface BattleUnit {
  curses?: { attack: number; turns: number; sourceId: string }[];
  skyStacks?: number;
  /**
   * ガッツチャージ(モッチー電気)の溜まり。**通常のターンが回った回数。**
   * 追加ターンでは増えない。同一戦闘中は維持し、戦闘が終われば消える。
   */
  gutsStacks?: number;
  /**
   * 深淵の主(グジラ闇)の溜まり。**敵のスキル攻撃を受けた回数。**
   * 多段でも1スキルにつき1つ。
   */
  abyssStacks?: number;
  /**
   * 同じチームの面々。**味方から受け取るオーラ(水の祝福)のためだけにある。**
   *
   * 被ダメージの計算は `damageTakenMultiplier(unit)` が単体で完結していて、
   * 戦場の他の面々を知らない。オーラは「誰かが生きている限り効く」ものなので、
   * 受け手の側から仲間を辿れる必要がある。戦闘開始時に engine が入れる。
   */
  alliesForAura?: BattleUnit[];
  instanceId: string;
  def: MonsterDefinition;
  team: Team;
  maxHp: number;
  currentHp: number;
  /** ATBゲージ。100に到達すると行動できる */
  gauge: number;
  /** スキルごとの残りクールタイム(0=使用可能)。index 0-2 が skill 0-2 に対応 */
  cooldowns: [number, number, number];
  stunTurns: number;
  /** 火傷の残りターン数。0より大きい間、自身の手番終了時に自分の攻撃力分のダメージを受ける */
  burnTurns: number;
  effects: ActiveEffect[];
  statusEffects: ActiveStatusEffect[];
  alive: boolean;
  /** 現在保持しているシールド量(実HP)。ダメージはHPより先にここから減る */
  shieldValue: number;
  /** シールドの残りターン数。0でシールド消滅 */
  shieldTurns: number;
  /** 状態異常免疫の残りターン数。0より大きい間、新たなスタン・火傷・デバフ・毒を防ぐ */
  immuneTurns: number;
  /** 継続回復の割合(最大HPに対する%)。regenTurnsが0より大きい間、自身の手番開始時に発動する */
  regenRate: number;
  /** 個別成長スキルの継続回復は指定回数ぶん発動してから終了する。 */
  regenIncludesLastTurn?: boolean;
  /** 継続回復の残りターン数 */
  regenTurns: number;
  /** 毒のスタック数(0-5)。多いほど手番開始時のダメージが大きくなる */
  poisonStacks: number;
  /** 毒の残りターン数(全スタック共通)。0でスタックも消滅する */
  poisonTurns: number;
  /** 毒1スタックあたりのダメージ割合(最大HPに対する%) */
  poisonDamageRate: number;
  /** 暗闇の残りターン数。0より大きい間、攻撃するたびに外れ判定が入る */
  blindTurns: number;
  /** 治癒阻害の残りターン。0より大きい間、受ける回復に healBlockMultiplier が掛かる */
  healBlockTurns: number;
  /** 治癒阻害中に受ける回復への倍率(0.5なら半減) */
  healBlockMultiplier: number;
  /**
   * 受けた攻撃の回数。**反撃を持つ相手のためだけに数えている。**
   * 手数で押す戦い方(小さい攻撃を何度も、毒を重ねる)に代償を作るための数。
   */
  hitsTaken: number;
  /**
   * ステータスへの**実数**の上乗せ。倍率のバフとは別に足す。
   *
   * 既存のバフは全部「何%上げる」なので、「攻撃力を2000上げる」が書けなかった。
   * 仲間が倒れるたびに強くなる相手を作るのに要る。
   */
  flatStatBonus: Partial<Record<BuffStat, number>>;

  /* ---- 目覚の深域。**取り巻きの死で本体に残る、割合の変化** ---- */
  /** 仲間が倒れて手に入れた部分防御無視率 */
  deathBoostDefenseIgnore?: number;
  /** 仲間が倒れて手に入れた被ダメージ倍率(0.85 で15%軽減) */
  deathBoostDamageTaken?: number;
  /**
   * 才能適応。**誰から何段ぶん適応しているか。**
   *
   * 同じ相手から連続で受けるほど積み上がり、
   * 別の味方から攻撃を受けると1段戻る。キーは攻撃側の instanceId。
   */
  adaptationStacks?: Map<string, number>;
  /** 最後にこの個体を攻撃した相手。**別人に変わった時に1段戻す**ための控え */
  lastAttackerId?: string;

  /* ---- 才能覚醒(スキル才能)がシールドに乗せる性質 ---- */
  /** シールドが乗っている間の被ダメージ軽減。盾が切れたら消える */
  shieldMitigate?: number;
  /** シールドが乗っている間、受けたダメージのこの割合を攻撃者へ返す */
  shieldReflect?: number;
  /** 高揚支援による与ダメージの上乗せ。残りターンが0になると消える */
  damageDealtBonus?: number;
  damageDealtBonusTurns?: number;

  /* ---- ここから下は今回の11種で足した状態。**どれも戦闘中だけのもので、セーブには出ない** ---- */

  /** 被ダメージ軽減の残りターン */
  mitigateTurns: number;
  /** 被ダメージ軽減の割合(0.15で15%減) */
  mitigateAmount: number;
  /** 挑発状態の相手から受けるダメージへの追加軽減 */
  mitigateVsTaunted: number;
  /** 自分を守ってくれている味方のinstanceId(かばう) */
  protectorId?: string;
  /** かばわれている残りターン */
  protectTurns: number;
  /** かばう側が肩代わりする割合 */
  protectShare: number;
  /** 反撃態勢の残りターン */
  counterTurns: number;
  /** 反撃のATK倍率 */
  counterMultiplier: number;
  /** 反撃へ加える最大HP比例の係数 */
  counterHpCoefficient: number;
  /** 反撃1回ごとに自身が回復する最大HP割合 */
  counterHealRate: number;
  /** パッシブの内部クールタイム(残りターン)。0で使える */
  passiveCooldown: number;
  /** 潜在能力の内部クールタイム(残りターン)。0で使える */
  latentCooldown: number;
  /**
   * 潜在能力で溜まる「次のスキル1への上乗せ」。
   * 被弾や会心のたびに増え、**スキル1を使うと0に戻る。**
   */
  latentChargeBonus: number;
  /** 戦闘中ずっと残る、潜在能力によるクリダメの上乗せ */
  latentCritDmgBonus: number;
  /** 1回だけ受けるダメージを軽減する量(被弾で消える) */
  latentOneShotMitigate: number;
  /** 被弾するたびに行動ゲージが進む状態の残りターン */
  hitGaugeTurns: number;
  /** 被弾1回ごとに進む行動ゲージ */
  hitGaugeAmount: number;
  /** 祝福セットの戦闘中1回を消費済みか。 */
  thresholdHealUsed: boolean;
  /** 味方回復型ボス特性の戦闘中1回を消費済みか。 */
  allyThresholdHealUsed: boolean;
}

/** 空の状態から作る時に使う、今回足した状態の初期値 */
function freshExtendedState() {
  return {
    mitigateTurns: 0,
    mitigateAmount: 0,
    mitigateVsTaunted: 0,
    protectTurns: 0,
    protectShare: 0,
    counterTurns: 0,
    counterMultiplier: 0,
    counterHpCoefficient: 0,
    counterHealRate: 0,
    passiveCooldown: 0,
    latentCooldown: 0,
    latentChargeBonus: 0,
    latentCritDmgBonus: 0,
    latentOneShotMitigate: 0,
    hitGaugeTurns: 0,
    hitGaugeAmount: 0,
    thresholdHealUsed: false,
    allyThresholdHealUsed: false,
  };
}

/** そのユニットが持つパッシブ(あれば)。3つの枠のうち最初に見つかったもの */
export function passiveSkillOf(unit: BattleUnit): Skill | undefined {
  return unit.def.skills.find((skill) => skill.passive !== undefined);
}

/** そのユニットのパッシブの、現在のレベルでの中身 */
export function passiveEffectOf(unit: BattleUnit): PassiveLevelEffect | undefined {
  const skill = passiveSkillOf(unit);
  if (!skill?.passive) return undefined;
  return passiveAtLevel(skill.passive as PassiveSpec, skill.passiveLevel ?? 1);
}

/**
 * パッシブによる能力値の上乗せ。
 *
 * **バフ/デバフとは別枠**にしてある。強化解除で剥がされるものではないし、
 * 「強化不可」でも止まらない。常にそのモンスターの一部として効く。
 */
export function passiveStatBonus(unit: BattleUnit, stat: BuffStat): { multiplier: number; add: number } {
  const effect = passiveEffectOf(unit);
  if (!effect) return { multiplier: 1, add: 0 };
  if (effect.kind === "SKY_RULER") {
    if (stat === "atk") return { multiplier: 1 + effect.atk * (unit.skyStacks ?? 0), add: 0 };
    if (stat === "criDmg") return { multiplier: 1, add: effect.critDmg * (unit.skyStacks ?? 0) };
  }
  if (effect.kind === "LAST_STAND" && stat === "def") {
    return unit.currentHp / unit.maxHp <= effect.hpRatio ? { multiplier: 1 + effect.defUp, add: 0 } : { multiplier: 1, add: 0 };
  }
  if (effect.kind === "THUNDER_INSTINCT") {
    if (stat === "criDmg") return { multiplier: 1, add: effect.critDmg };
    if (stat === "spd") return { multiplier: 1, add: effect.spd };
  }
  if (effect.kind === "SCENT_OF_PREY") {
    if (stat === "atk") return { multiplier: 1 + (effect.atkUp ?? 0), add: 0 };
    if (stat === "spd") return { multiplier: 1, add: effect.spd ?? 0 };
  }
  if (effect.kind === "PACK_INSTINCT" && stat === "criDmg") return { multiplier: 1, add: effect.critDmg };
  /*
   * ガッツチャージ。速度は**加算**、与ダメージは別の場所(最終ダメージ)で効く。
   * ここで攻撃力を上げないのは、仕様が「与えるダメージ+」だから——
   * 攻撃力を上げると防御で削られる前の値が動き、
   * 「与えるダメージが増える」より大きくも小さくもなってしまう。
   */
  if (effect.kind === "GUTS_CHARGE" && stat === "spd") {
    return { multiplier: 1, add: effect.spd * Math.min(effect.maxStacks, unit.gutsStacks ?? 0) };
  }
  /* 深淵の主。こちらは攻撃も速度も**割合**で上がる */
  if (effect.kind === "ABYSS_LORD") {
    const stacks = Math.min(effect.maxStacks, unit.abyssStacks ?? 0);
    if (stat === "atk") return { multiplier: 1 + effect.atkPerStack * stacks, add: 0 };
    if (stat === "spd") return { multiplier: 1 + effect.spdPerStack * stacks, add: 0 };
  }
  /*
   * 魅惑のまなこ。クリ率は常時・全レベル固定。
   * **的中はここでは扱えない**(`BuffStat` に含まれていない)ので、
   * 弱体の成否を決める側(`passiveAccuracyBonus`)で足す。
   */
  if (effect.kind === "CHARM_EYE" && stat === "criRate") return { multiplier: 1, add: effect.critRate };
  return { multiplier: 1, add: 0 };
}

/**
 * パッシブが上乗せする的中。**`BuffStat` に的中が無いので、ここだけ別口。**
 * 弱体が通るかを決める時に足す。
 */
export function passiveAccuracyBonus(unit: BattleUnit): number {
  const effect = passiveEffectOf(unit);
  return effect?.kind === "CHARM_EYE" ? effect.accuracy : 0;
}

export function createBattleUnit(def: MonsterDefinition, team: Team, instanceId: string): BattleUnit {
  const latent = def.latentAbility;
  const hpMultiplier = Math.max(0.1, latent?.hpMultiplier ?? 1);
  const defMultiplier = Math.max(0.1, latent?.defMultiplier ?? 1);
  const effectiveDef = defMultiplier === 1 ? def : { ...def, stats: { ...def.stats, def: Math.round(def.stats.def * defMultiplier) } };
  const maxHp = Math.round(def.stats.hp * hpMultiplier);
  return {
    instanceId,
    def: effectiveDef,
    team,
    maxHp,
    currentHp: maxHp,
    gauge: 0,
    cooldowns: [0, 0, 0],
    stunTurns: 0,
    burnTurns: 0,
    effects: [],
    statusEffects: [],
    alive: true,
    shieldValue: 0,
    shieldTurns: 0,
    immuneTurns: 0,
    regenRate: 0,
    regenTurns: 0,
    poisonStacks: 0,
    poisonTurns: 0,
    poisonDamageRate: 0,
    blindTurns: 0,
    healBlockTurns: 0,
    healBlockMultiplier: 1,
    hitsTaken: 0,
    flatStatBonus: {},
    adaptationStacks: new Map<string, number>(),
    ...freshExtendedState(),
  };
}

/** バフ/デバフを反映した実効ステータス値を計算する。criRate/criDmgは加算、それ以外は乗算で効く */
export function getEffectiveStat(unit: BattleUnit, stat: BuffStat): number {
  const passive = passiveStatBonus(unit, stat);
  const flat = unit.flatStatBonus[stat] ?? 0;
  const base = unit.def.stats[stat] + flat + (stat === "spd" ? passive.add : 0);
  /*
   * 同じ能力にかかっているものを足し合わせる。
   *
   * **同じ向きは重ねがけしない**(`applyStatEffect`)ので、ここで足されるのは
   * 基本的に「強化1つ + 弱体1つ」の打ち消し合い。
   * 攻撃UP30%と攻撃DOWN50%が同時なら -20%になる。
   *
   * 塔100階の分身死亡時強化だけは階の仕掛けとして積み上がるため、
   * そこでは強化が複数並ぶ。
   *
   * `unifyDefModifiers` は**検証専用**。旧仕様と比べる時に防御の増減幅だけを
   * 揃えるためのもので、本番では立たない。
   */
  const totalRate = unit.effects
    .filter((e) => e.stat === stat)
    .reduce((sum, e) => {
      if (!balanceFlags.unifyDefModifiers || stat !== "def") return sum + e.amount;
      if (e.amount === 0) return sum;
      return sum + (e.amount < 0 ? -balanceFlags.defDownRate : balanceFlags.defUpRate);
    }, 0);

  if (stat === "criRate") {
    return Math.max(0, Math.min(1, base + totalRate + passive.add));
  }
  if (stat === "criDmg") {
    return Math.max(0, base + totalRate + passive.add + unit.latentCritDmgBonus);
  }

  const multiplier = Math.max(0.1, 1 + totalRate) * passive.multiplier;
  return Math.max(1, Math.round(base * multiplier));
}

export function hpRatio(unit: BattleUnit): number {
  return unit.currentHp / unit.maxHp;
}

/** ダメージを与える。シールドがあれば先にシールドから減り、余った分だけHPに通る */
export interface DamageApplicationResult {
  attemptedDamage: number;
  shieldAbsorbed: number;
  hpDamage: number;
  invincible: boolean;
  endured: boolean;
  revived: boolean;
  died: boolean;
}

export function hasStatus(unit: BattleUnit, type: StatusEffectType): boolean {
  return unit.statusEffects.some((effect) => effect.type === type && effect.remainingTurns > 0);
}

/**
 * 無敵・挑発などの状態を1つ付ける。**同名はスタックしない。**
 *
 * すでに付いている時は**残りターンの長い方**を採る。
 * 以前は新しい付与で上書きしていたので、フェニックスの無敵3ターンへ
 * ミミックの無敵1ターンを重ねると**1ターンに縮んでいた。**
 * 味方の支援が味方の支援を弱める形になっていたのを直した。
 *
 * 挑発元だけは新しい方を採る。**後から挑発した相手へ向く**方が自然なため。
 */
export function applyStatus(unit: BattleUnit, type: StatusEffectType, durationTurns: number, sourceId?: string): boolean {
  if (STATUS_EFFECT_CATEGORY[type] === "BUFF" && hasStatus(unit, "BUFF_BLOCK")) return false;
  const existing = unit.statusEffects.find((effect) => effect.type === type);
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, durationTurns);
    if (type === "TAUNT") existing.sourceId = sourceId;
    return true;
  }
  const next: ActiveStatusEffect = { type, category: STATUS_EFFECT_CATEGORY[type], remainingTurns: durationTurns };
  if (type === "TAUNT") next.sourceId = sourceId;
  unit.statusEffects.push(next);
  return true;
}

/**
 * 能力変化(攻撃・防御・速度・クリ率・クリダメ)の強化/弱体を1つ付ける。
 *
 * **同じ能力・同じ向きは重ねがけしない。**攻撃UP30%を2回受けても+30%のまま。
 * すでに付いていれば、**量は大きい方・残りターンは長い方**を採る。
 * 量は `core/statusValues.ts` で共通化してあるので通常は同値だが、
 * 塔の階専用スキルのように別の量を持つものが残っているため大きい方を採る。
 *
 * 強化と弱体は**別枠**。攻撃UPと攻撃DOWNは同時に付き、打ち消し合う。
 *
 * @param amount 強化なら正、弱体なら負の値を渡す
 */
export function applyStatEffect(
  unit: BattleUnit,
  stat: BuffStat,
  amount: number,
  remainingTurns: number,
  kind: "BUFF" | "DEBUFF",
): void {
  const existing = unit.effects.find((e) => e.stat === stat && e.kind === kind);
  if (existing) {
    if (Math.abs(amount) > Math.abs(existing.amount)) existing.amount = amount;
    existing.remainingTurns = Math.max(existing.remainingTurns, remainingTurns);
    return;
  }
  unit.effects.push({ stat, amount, remainingTurns, kind });
}

/**
 * **明示的な「延長」だけ**が通る道。残りターンへ加算する。
 * 通常の再付与(`applyStatEffect` / `applyStatus`)は長い方を採るだけで、加算しない。
 */
export function extendEffects(unit: BattleUnit, turns: number, category: "BUFF" | "DEBUFF"): number {
  let extended = 0;
  for (const e of unit.effects) {
    if (e.kind !== category) continue;
    e.remainingTurns += turns;
    extended += 1;
  }
  for (const e of unit.statusEffects) {
    if (e.category !== category) continue;
    e.remainingTurns += turns;
    extended += 1;
  }
  return extended;
}

/** 無敵→シールド→HP→我慢→復活の共通致死処理。 */
export function applyDamage(unit: BattleUnit, amount: number): DamageApplicationResult {
  const attemptedDamage = Math.max(0, Math.round(amount));
  const result: DamageApplicationResult = { attemptedDamage, shieldAbsorbed: 0, hpDamage: 0, invincible: false, endured: false, revived: false, died: false };
  if (!unit.alive || attemptedDamage <= 0) return result;
  if (hasStatus(unit, "INVINCIBLE")) {
    result.invincible = true;
    return result;
  }
  let remaining = attemptedDamage;
  if (unit.shieldValue > 0) {
    const absorbed = Math.min(unit.shieldValue, remaining);
    result.shieldAbsorbed = absorbed;
    unit.shieldValue -= absorbed;
    remaining -= absorbed;
  }
  if (remaining <= 0) return result;
  const before = unit.currentHp;
  if (remaining >= before && hasStatus(unit, "ENDURE")) {
    unit.currentHp = 1;
    result.endured = true;
  } else {
    unit.currentHp = Math.max(0, before - remaining);
  }
  result.hpDamage = before - unit.currentHp;
  const rebirth = passiveEffectOf(unit);
  if (unit.currentHp === 0 && rebirth?.kind === "REBIRTH" && unit.passiveCooldown <= 0) {
    unit.currentHp = unit.maxHp;
    unit.passiveCooldown = rebirth.cooldown;
    result.revived = true;
  } else if (unit.currentHp === 0 && hasStatus(unit, "REVIVE")) {
    unit.statusEffects = unit.statusEffects.filter((effect) => effect.type !== "REVIVE");
    unit.currentHp = Math.max(1, Math.round(unit.maxHp * 0.25));
    unit.alive = true;
    result.revived = true;
  } else if (unit.currentHp === 0) {
    unit.alive = false;
    result.died = true;
  }
  return result;
}

export function applyHeal(unit: BattleUnit, amount: number): void {
  if (!unit.alive) return;
  // 治癒阻害がかかっている間は回復が減る。**回復し続けて時間を稼ぐ戦い方への答え**なので、
  // 経路をここ1本に絞ってある(個別の回復処理で掛け忘れると効かなくなる)
  const effective = unit.healBlockTurns > 0 ? Math.floor(amount * unit.healBlockMultiplier) : amount;
  if (effective <= 0) return;
  unit.currentHp = Math.min(unit.maxHp, unit.currentHp + effective);
}

/** そのユニットの手番開始時に呼ぶ。バフ/デバフの残りターンを減らし、失効したものを取り除く */
export function tickEffectsAtTurnStart(unit: BattleUnit): ActiveEffect[] {
  const expired: ActiveEffect[] = [];
  unit.effects = unit.effects.filter((e) => {
    e.remainingTurns -= 1;
    if (e.remainingTurns <= 0) {
      expired.push(e);
      return false;
    }
    return true;
  });
  unit.statusEffects = unit.statusEffects.filter((effect) => --effect.remainingTurns > 0);
  return expired;
}

/** そのユニットの手番開始時に呼ぶ。クールタイムを1減らす(0未満にはしない) */
export function tickCooldownsAtTurnStart(unit: BattleUnit): void {
  unit.cooldowns = unit.cooldowns.map((c) => Math.max(0, c - 1)) as [number, number, number];
}

/** そのユニットの手番開始時に呼ぶ。シールドの残りターンを減らし、0になったらシールド量も消滅させる */
export function tickShieldAtTurnStart(unit: BattleUnit): void {
  if (unit.shieldTurns <= 0) return;
  unit.shieldTurns -= 1;
  if (unit.shieldTurns <= 0) unit.shieldValue = 0;
}

/** そのユニットの手番開始時に呼ぶ。状態異常免疫の残りターンを減らす */
export function tickImmunityAtTurnStart(unit: BattleUnit): void {
  if (unit.immuneTurns > 0) unit.immuneTurns -= 1;
}

/** そのユニットの手番開始時に呼ぶ。治癒阻害の残りターンを減らす */
export function tickHealBlockAtTurnStart(unit: BattleUnit): void {
  if (unit.healBlockTurns <= 0) return;
  unit.healBlockTurns -= 1;
  if (unit.healBlockTurns <= 0) unit.healBlockMultiplier = 1;
}

/** 有利な効果を指定個数だけ解除する。省略時は既存STRIP互換ですべて解除する。実際に解除できた個数を返す。 */
export function stripBuffs(unit: BattleUnit, count = Number.POSITIVE_INFINITY): number {
  let remaining = Math.max(0, Math.floor(count));
  let removed = 0;
  // IMMUNITYを最優先にすることで、解除後に続くデバフが正式な免疫判定へ進める。
  if (remaining > 0 && unit.immuneTurns > 0) { unit.immuneTurns = 0; remaining -= 1; removed += 1; }
  if (remaining > 0 && unit.shieldTurns > 0) { unit.shieldValue = 0; unit.shieldTurns = 0; remaining -= 1; removed += 1; }
  if (remaining > 0 && unit.regenTurns > 0) { unit.regenTurns = 0; unit.regenRate = 0; remaining -= 1; removed += 1; }
  while (remaining > 0) {
    const index = unit.effects.findIndex((effect) => effect.kind === "BUFF");
    if (index < 0) break;
    unit.effects.splice(index, 1); remaining -= 1; removed += 1;
  }
  while (remaining > 0) {
    const index = unit.statusEffects.findIndex((effect) => effect.category === "BUFF");
    if (index < 0) break;
    unit.statusEffects.splice(index, 1); remaining -= 1; removed += 1;
  }
  const take = (active: boolean, clear: () => void) => { if (remaining > 0 && active) { clear(); remaining--; removed++; } };
  take((unit.damageDealtBonusTurns ?? 0) > 0, () => { unit.damageDealtBonus = 0; unit.damageDealtBonusTurns = 0; });
  take(unit.mitigateTurns > 0, () => { unit.mitigateTurns = 0; unit.mitigateAmount = 0; unit.mitigateVsTaunted = 0; });
  take(unit.protectTurns > 0, () => { unit.protectTurns = 0; unit.protectShare = 0; unit.protectorId = undefined; });
  take(unit.counterTurns > 0, () => { unit.counterTurns = 0; unit.counterMultiplier = 0; unit.counterHpCoefficient = 0; unit.counterHealRate = 0; });
  take(unit.hitGaugeTurns > 0, () => { unit.hitGaugeTurns = 0; unit.hitGaugeAmount = 0; });
  return removed;
}

/**
 * 有利な効果を奪う。**取り除くだけでなく、そのまま受け手へ移す。**
 *
 * 解除(stripBuffs)との違いはここだけ。相手の準備が自分の準備になるので、
 * 支えを重ねる相手ほど痛い一手になる。奪えた個数を返す。
 */
export function stealBuffs(from: BattleUnit, to: BattleUnit, count = 1): number {
  let remaining = Math.max(0, Math.floor(count));
  let stolen = 0;
  const give = () => { remaining -= 1; stolen += 1; };
  if (remaining > 0 && from.immuneTurns > 0) {
    to.immuneTurns = Math.max(to.immuneTurns, from.immuneTurns);
    from.immuneTurns = 0; give();
  }
  if (remaining > 0 && from.shieldTurns > 0) {
    to.shieldValue = Math.max(to.shieldValue, from.shieldValue);
    to.shieldTurns = Math.max(to.shieldTurns, from.shieldTurns);
    from.shieldValue = 0; from.shieldTurns = 0; give();
  }
  if (remaining > 0 && from.regenTurns > 0) {
    to.regenRate = Math.max(to.regenRate, from.regenRate);
    to.regenTurns = Math.max(to.regenTurns, from.regenTurns);
    from.regenRate = 0; from.regenTurns = 0; give();
  }
  while (remaining > 0) {
    const index = from.effects.findIndex((effect) => effect.kind === "BUFF");
    if (index < 0) break;
    const [moved] = from.effects.splice(index, 1);
    to.effects.push({ ...moved });
    give();
  }
  while (remaining > 0) {
    const index = from.statusEffects.findIndex((effect) => effect.category === "BUFF");
    if (index < 0) break;
    const [moved] = from.statusEffects.splice(index, 1);
    applyStatus(to, moved.type, moved.remainingTurns, moved.sourceId);
    give();
  }
  return stolen;
}

/** その相手が有利な効果を持っているか。奪取・解除の条件判定に使う */
export function hasAnyBuff(unit: BattleUnit): boolean {
  return (unit.damageDealtBonusTurns ?? 0) > 0 || unit.mitigateTurns > 0 || unit.protectTurns > 0 || unit.counterTurns > 0 || unit.hitGaugeTurns > 0 || unit.immuneTurns > 0
    || unit.shieldTurns > 0
    || unit.regenTurns > 0
    || unit.effects.some((effect) => effect.kind === "BUFF")
    || unit.statusEffects.some((effect) => effect.category === "BUFF");
}

/** その相手が持っている弱体効果の数。ダメージ倍率や条件判定に使う */
export function countDebuffs(unit: BattleUnit): number {
  return (unit.curses?.length ?? 0) + unit.effects.filter((e) => e.kind === "DEBUFF").length
    + unit.statusEffects.filter((e) => e.category === "DEBUFF").length
    + Number(unit.poisonStacks > 0)
    + Number(unit.healBlockTurns > 0)
    + Number(unit.stunTurns > 0)
    + Number(unit.burnTurns > 0)
    + Number(unit.blindTurns > 0);
}

/** フィールド別に保持されるものも含め、弱体効果を指定個数だけ正式解除する。 */
export function cleanseDebuffs(unit: BattleUnit, count = Number.POSITIVE_INFINITY): number {
  let remaining = Math.max(0, Math.floor(count));
  let removed = 0;
  const take = (condition: boolean, clear: () => void) => {
    if (!condition || remaining <= 0) return;
    clear(); remaining -= 1; removed += 1;
  };
  while (remaining > 0) {
    const index = unit.effects.findIndex((effect) => effect.kind === "DEBUFF");
    if (index < 0) break;
    unit.effects.splice(index, 1); remaining -= 1; removed += 1;
  }
  while (remaining > 0) {
    const index = unit.statusEffects.findIndex((effect) => effect.category === "DEBUFF");
    if (index < 0) break;
    unit.statusEffects.splice(index, 1); remaining -= 1; removed += 1;
  }
  take(unit.poisonStacks > 0 || unit.poisonTurns > 0, () => { unit.poisonStacks = 0; unit.poisonTurns = 0; unit.poisonDamageRate = 0; });
  take(unit.healBlockTurns > 0, () => { unit.healBlockTurns = 0; unit.healBlockMultiplier = 1; });
  take(unit.stunTurns > 0, () => { unit.stunTurns = 0; });
  take(unit.burnTurns > 0, () => { unit.burnTurns = 0; });
  take(unit.blindTurns > 0, () => { unit.blindTurns = 0; });
  while (remaining > 0 && unit.curses?.length) { unit.curses.shift(); remaining--; removed++; }
  return removed;
}

/** そのユニットの手番開始時に呼ぶ。暗闇の残りターンを減らす */
export function tickBlindAtTurnStart(unit: BattleUnit): void {
  if (unit.blindTurns > 0) unit.blindTurns -= 1;
}

/**
 * そのユニットの手番開始時に呼ぶ。今回足した状態の残りターンをまとめて減らす。
 *
 * **1つの関数にまとめてある。** 個別に足していくと、新しい状態を増やした人が
 * 手番開始の呼び出し側に足し忘れ、その状態だけ永久に切れなくなる。
 */
export function tickExtendedStateAtTurnStart(unit: BattleUnit): void {
  if (unit.damageDealtBonusTurns && unit.damageDealtBonusTurns > 0) {
    unit.damageDealtBonusTurns -= 1;
    if (unit.damageDealtBonusTurns <= 0) unit.damageDealtBonus = 0;
  }
  /*
   * シールドに乗せた性質は**盾が消えたら一緒に消す。**
   * 残すと、盾が割れた後も反射だけが効き続ける。
   */
  if (unit.shieldTurns <= 0 || unit.shieldValue <= 0) {
    unit.shieldMitigate = 0;
    unit.shieldReflect = 0;
  }
  if (unit.mitigateTurns > 0) {
    unit.mitigateTurns -= 1;
    if (unit.mitigateTurns <= 0) { unit.mitigateAmount = 0; unit.mitigateVsTaunted = 0; }
  }
  if (unit.protectTurns > 0) {
    unit.protectTurns -= 1;
    if (unit.protectTurns <= 0) { unit.protectorId = undefined; unit.protectShare = 0; }
  }
  if (unit.counterTurns > 0) {
    unit.counterTurns -= 1;
    if (unit.counterTurns <= 0) { unit.counterMultiplier = 0; unit.counterHpCoefficient = 0; unit.counterHealRate = 0; }
  }
  if (unit.hitGaugeTurns > 0) {
    unit.hitGaugeTurns -= 1;
    if (unit.hitGaugeTurns <= 0) unit.hitGaugeAmount = 0;
  }
  if (unit.passiveCooldown > 0) unit.passiveCooldown -= 1;
  if (unit.latentCooldown > 0) unit.latentCooldown -= 1;
}

/**
 * そのユニットが受けるダメージに掛かる倍率。
 * 軽減(MITIGATE)と、HPが減るほど硬くなるパッシブをここ1本にまとめてある。
 *
 * @param fromTaunted 攻撃者が挑発状態か。挑発状態の相手からは追加で軽減する技がある
 */
export function damageTakenMultiplier(unit: BattleUnit, fromTaunted = false): number {
  let reduction = unit.mitigateTurns > 0 ? unit.mitigateAmount : 0;
  if (fromTaunted && unit.mitigateTurns > 0) reduction += unit.mitigateVsTaunted;
  const passive = passiveEffectOf(unit);
  const ratio = unit.currentHp / unit.maxHp;
  if (passive?.kind === "LAST_STAND" && ratio <= passive.hpRatio) reduction += passive.damageTaken;
  if (passive?.kind === "ANCIENT_BEHEMOTH") {
    // 段階は重複しない。**当てはまるうち最も低い閾値の段だけ**が効く
    const tier = [...passive.tiers].sort((a, b) => a.hpRatio - b.hpRatio).find((t) => ratio <= t.hpRatio);
    if (tier) reduction += tier.damageTaken;
  }
  /* 深淵の主(グジラ闇)。HPに関係なく常に効く */
  if (passive?.kind === "ABYSS_LORD") reduction += passive.damageTaken;
  /*
   * 水の祝福(ウンディーネ)。**守っているのは自分ではない。**
   * 生きている味方のウンディーネから受け取る。自分自身は対象外なので、
   * `holder !== unit` で弾く——守る側が同時にいちばん硬くなると、
   * 狙う場所が無くなって戦いが止まる。
   */
  for (const holder of unit.alliesForAura ?? []) {
    if (!holder.alive || holder === unit) continue;
    const aura = passiveEffectOf(holder);
    if (aura?.kind === "WATER_BLESSING") reduction += aura.damageTaken;
  }
  if (unit.latentOneShotMitigate > 0) reduction += unit.latentOneShotMitigate;
  return Math.max(0.05, 1 - Math.min(0.9, reduction));
}

/** ベヒモスの「古代巨獣」による、最大HP比例ダメージの上乗せ */
export function passiveHpDamageBonus(unit: BattleUnit): number {
  const passive = passiveEffectOf(unit);
  if (passive?.kind !== "ANCIENT_BEHEMOTH") return 0;
  const ratio = unit.currentHp / unit.maxHp;
  const tier = [...passive.tiers].sort((a, b) => a.hpRatio - b.hpRatio).find((t) => ratio <= t.hpRatio);
  return tier?.hpDamageUp ?? 0;
}
