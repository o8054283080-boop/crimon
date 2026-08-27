import { MonsterDefinition } from "../core/monster.js";
import { BuffStat, STATUS_EFFECT_CATEGORY, StatusEffectCategory, StatusEffectType } from "../core/skill.js";

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
  /** 戦闘中1回の潜在が消費済みか（永続化しない）。 */
  latentOnceUsed: boolean;
}

export function createBattleUnit(def: MonsterDefinition, team: Team, instanceId: string): BattleUnit {
  return {
    instanceId,
    def,
    team,
    maxHp: def.stats.hp,
    currentHp: def.stats.hp,
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
    latentOnceUsed: false,
  };
}

/** バフ/デバフを反映した実効ステータス値を計算する。criRate/criDmgは加算、それ以外は乗算で効く */
export function getEffectiveStat(unit: BattleUnit, stat: BuffStat): number {
  const base = unit.def.stats[stat];
  const totalRate = unit.effects
    .filter((e) => e.stat === stat)
    .reduce((sum, e) => sum + e.amount, 0);

  if (stat === "criRate") {
    return Math.max(0, Math.min(1, base + totalRate));
  }
  if (stat === "criDmg") {
    return Math.max(0, base + totalRate);
  }

  const multiplier = Math.max(0.1, 1 + totalRate);
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

/** 同名はスタックせず、新しい付与で残りターンと挑発元を上書きする。 */
export function applyStatus(unit: BattleUnit, type: StatusEffectType, durationTurns: number, sourceId?: string): boolean {
  if (STATUS_EFFECT_CATEGORY[type] === "BUFF" && hasStatus(unit, "BUFF_BLOCK")) return false;
  const next: ActiveStatusEffect = { type, category: STATUS_EFFECT_CATEGORY[type], remainingTurns: durationTurns };
  if (type === "TAUNT") next.sourceId = sourceId;
  const index = unit.statusEffects.findIndex((effect) => effect.type === type);
  if (index >= 0) unit.statusEffects[index] = next;
  else unit.statusEffects.push(next);
  return true;
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
  if (unit.currentHp === 0 && hasStatus(unit, "REVIVE")) {
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

/**
 * 有利な効果をすべて剥がす。
 *
 * シールド・状態異常無効・能力上昇が対象。**張り直すだけの戦い方**に
 * 代償を作るための手段なので、中途半端に一部だけ残さない。
 */
export function stripBuffs(unit: BattleUnit): boolean {
  const hadBuff = unit.effects.some((e) => e.kind === "BUFF");
  const hadStatusBuff = unit.statusEffects.some((effect) => effect.category === "BUFF");
  const had = hadBuff || hadStatusBuff || unit.shieldTurns > 0 || unit.immuneTurns > 0 || unit.regenTurns > 0;
  unit.effects = unit.effects.filter((e) => e.kind !== "BUFF");
  unit.statusEffects = unit.statusEffects.filter((effect) => effect.category !== "BUFF");
  unit.shieldValue = 0;
  unit.shieldTurns = 0;
  unit.immuneTurns = 0;
  unit.regenTurns = 0;
  unit.regenRate = 0;
  return had;
}

/** そのユニットの手番開始時に呼ぶ。暗闇の残りターンを減らす */
export function tickBlindAtTurnStart(unit: BattleUnit): void {
  if (unit.blindTurns > 0) unit.blindTurns -= 1;
}
