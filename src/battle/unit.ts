import { MonsterDefinition } from "../core/monster.js";
import { BuffStat } from "../core/skill.js";

export type Team = "PLAYER" | "ENEMY";

export interface ActiveEffect {
  stat: BuffStat;
  /** 符号付き変化量。バフは正、デバフは負 (例: +0.3 = ATK+30%) */
  amount: number;
  remainingTurns: number;
  kind: "BUFF" | "DEBUFF";
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
    alive: true,
    shieldValue: 0,
    shieldTurns: 0,
    immuneTurns: 0,
    regenRate: 0,
    regenTurns: 0,
    poisonStacks: 0,
    poisonTurns: 0,
    poisonDamageRate: 0,
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
export function applyDamage(unit: BattleUnit, amount: number): void {
  let remaining = amount;
  if (unit.shieldValue > 0) {
    const absorbed = Math.min(unit.shieldValue, remaining);
    unit.shieldValue -= absorbed;
    remaining -= absorbed;
  }
  if (remaining <= 0) return;
  unit.currentHp = Math.max(0, unit.currentHp - remaining);
  if (unit.currentHp === 0) unit.alive = false;
}

export function applyHeal(unit: BattleUnit, amount: number): void {
  if (!unit.alive) return;
  unit.currentHp = Math.min(unit.maxHp, unit.currentHp + amount);
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
