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
  effects: ActiveEffect[];
  alive: boolean;
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
    effects: [],
    alive: true,
  };
}

/** バフ/デバフを反映した実効ステータス値を計算する */
export function getEffectiveStat(unit: BattleUnit, stat: BuffStat): number {
  const base = unit.def.stats[stat];
  const totalRate = unit.effects
    .filter((e) => e.stat === stat)
    .reduce((sum, e) => sum + e.amount, 0);
  const multiplier = Math.max(0.1, 1 + totalRate);
  return Math.max(1, Math.round(base * multiplier));
}

export function hpRatio(unit: BattleUnit): number {
  return unit.currentHp / unit.maxHp;
}

export function applyDamage(unit: BattleUnit, amount: number): void {
  unit.currentHp = Math.max(0, unit.currentHp - amount);
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
