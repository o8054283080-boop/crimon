import { ELEMENT_JA } from "../core/element.js";
import { MonsterDefinition } from "../core/monster.js";
import { Skill } from "../core/skill.js";
import { chooseSkill, chooseTargets } from "./ai.js";
import { calcDamage } from "./damage.js";
import {
  BattleUnit,
  Team,
  applyDamage,
  applyHeal,
  createBattleUnit,
  getEffectiveStat,
  hpRatio,
  tickCooldownsAtTurnStart,
  tickEffectsAtTurnStart,
} from "./unit.js";

const ATB_THRESHOLD = 100;
const GAUGE_EPSILON = 1e-6;

export type BattleWinner = "PLAYER" | "ENEMY" | "DRAW";

export interface UnitSnapshot {
  instanceId: string;
  team: Team;
  currentHp: number;
  maxHp: number;
  gauge: number;
  alive: boolean;
}

/** ユニット1体の1手番分の記録。UIでのアニメーション再生に使う */
export interface TurnRecord {
  actorId: string;
  lines: string[];
  snapshot: UnitSnapshot[];
}

export interface BattleResult {
  winner: BattleWinner;
  log: string[];
  turnsTaken: number;
  turns: TurnRecord[];
}

export interface BattleEngineOptions {
  rng?: () => number;
  maxTurns?: number;
  /**
   * ステージの連戦などでウェーブをまたいでHPを持ち越す場合に指定する。
   * playerTeamと同じ並び順で、そのユニットの開始時HPを上書きする(最大HPでクランプ)。
   */
  initialPlayerHp?: number[];
}

/** 手動操作時にプレイヤーが選んだ行動。省略された場合はAIが代わりに決める */
export interface ManualChoice {
  skillIndex: 0 | 1 | 2;
  /** SINGLE_ENEMY/SINGLE_ALLYスキルの対象instanceId。それ以外の対象タイプでは無視される */
  targetId?: string;
}

export class BattleEngine {
  private readonly units: BattleUnit[];
  private readonly rng: () => number;
  private readonly maxTurns: number;
  private readonly log: string[] = [];
  private readonly turns: TurnRecord[] = [];
  /** getNextActor()/resolveTurn()による手動進行専用のキュー。run()は使わない */
  private interactiveQueue: BattleUnit[] = [];

  constructor(playerTeam: MonsterDefinition[], enemyTeam: MonsterDefinition[], options: BattleEngineOptions = {}) {
    if (playerTeam.length === 0 || enemyTeam.length === 0) {
      throw new Error("両チームとも1体以上のモンスターが必要です");
    }
    this.units = [
      ...playerTeam.map((def, i) => createBattleUnit(def, "PLAYER", `P${i + 1}`)),
      ...enemyTeam.map((def, i) => createBattleUnit(def, "ENEMY", `E${i + 1}`)),
    ];

    if (options.initialPlayerHp) {
      options.initialPlayerHp.forEach((hp, i) => {
        const unit = this.units[i];
        if (!unit) return;
        unit.currentHp = Math.max(1, Math.min(hp, unit.maxHp));
      });
    }
    this.rng = options.rng ?? Math.random;
    this.maxTurns = options.maxTurns ?? 300;
  }

  run(): BattleResult {
    let turnsTaken = 0;

    while (turnsTaken < this.maxTurns) {
      const winner = this.checkWinner();
      if (winner) {
        return { winner, log: this.log, turnsTaken, turns: this.turns };
      }

      const actingUnits = this.advanceGaugesToNextBatch();

      for (const unit of actingUnits) {
        if (!unit.alive) continue;
        unit.gauge -= ATB_THRESHOLD;

        const winnerMidLoop = this.checkWinner();
        if (winnerMidLoop) {
          return { winner: winnerMidLoop, log: this.log, turnsTaken, turns: this.turns };
        }

        const linesBefore = this.log.length;
        this.takeTurn(unit);
        this.turns.push({
          actorId: unit.instanceId,
          lines: this.log.slice(linesBefore),
          snapshot: this.snapshotUnits(),
        });

        turnsTaken += 1;
        if (turnsTaken >= this.maxTurns) break;
      }
    }

    return { winner: this.checkWinner() ?? "DRAW", log: this.log, turnsTaken, turns: this.turns };
  }

  /** 生存ユニットのATBゲージを、次に誰かが行動可能になるまで進め、行動可能になったユニット(行動順)を返す */
  private advanceGaugesToNextBatch(): BattleUnit[] {
    const aliveUnits = this.units.filter((u) => u.alive);
    const speeds = aliveUnits.map((u) => Math.max(1, getEffectiveStat(u, "spd")));
    const ticksToReady = aliveUnits.map((u, i) => (ATB_THRESHOLD - u.gauge) / speeds[i]);
    const minTicks = Math.min(...ticksToReady);

    aliveUnits.forEach((u, i) => {
      u.gauge += speeds[i] * minTicks;
    });

    return aliveUnits
      .filter((u) => u.gauge >= ATB_THRESHOLD - GAUGE_EPSILON)
      .sort((a, b) => b.gauge - a.gauge || getEffectiveStat(b, "spd") - getEffectiveStat(a, "spd"));
  }

  /** 手動操作/ライブ進行用: 現在の勝敗を返す(未決着ならnull) */
  getWinner(): BattleWinner | null {
    return this.checkWinner();
  }

  /**
   * 手動操作/ライブ進行用: 次に行動すべきユニットを返す(まだ行動は消費しない)。
   * 内部で必要な分だけ全ユニットのATBゲージを進める。勝敗が既についていればnullを返す。
   * 返されたユニットに対してresolveTurn()を呼ぶことで実際に行動を解決する。
   */
  getNextActor(): BattleUnit | null {
    if (this.checkWinner()) return null;
    for (;;) {
      this.interactiveQueue = this.interactiveQueue.filter((u) => u.alive);
      if (this.interactiveQueue.length > 0) return this.interactiveQueue[0];
      if (this.checkWinner()) return null;
      this.interactiveQueue = this.advanceGaugesToNextBatch();
    }
  }

  /**
   * 手動操作/ライブ進行用: 指定ユニットの手番を解決する。getNextActor()が返したユニットに対して呼ぶこと。
   * choiceを渡すとその内容で行動する(指定したスキルがクールタイム中ならAIにフォールバックする)。
   * choiceを省略した場合はAIが行動を決める(敵ユニットや、手動操作をしない時に使う)。
   */
  resolveTurn(unit: BattleUnit, choice?: ManualChoice): TurnRecord {
    const idx = this.interactiveQueue.indexOf(unit);
    if (idx >= 0) this.interactiveQueue.splice(idx, 1);
    unit.gauge -= ATB_THRESHOLD;

    const linesBefore = this.log.length;
    this.takeTurn(unit, choice);
    const record: TurnRecord = {
      actorId: unit.instanceId,
      lines: this.log.slice(linesBefore),
      snapshot: this.snapshotUnits(),
    };
    this.turns.push(record);
    return record;
  }

  private snapshotUnits(): UnitSnapshot[] {
    return this.units.map((u) => ({
      instanceId: u.instanceId,
      team: u.team,
      currentHp: u.currentHp,
      maxHp: u.maxHp,
      gauge: Math.round(u.gauge),
      alive: u.alive,
    }));
  }

  private checkWinner(): BattleWinner | null {
    const playerAlive = this.units.some((u) => u.team === "PLAYER" && u.alive);
    const enemyAlive = this.units.some((u) => u.team === "ENEMY" && u.alive);
    if (!playerAlive && !enemyAlive) return "DRAW";
    if (!playerAlive) return "ENEMY";
    if (!enemyAlive) return "PLAYER";
    return null;
  }

  private takeTurn(unit: BattleUnit, choice?: ManualChoice): void {
    tickEffectsAtTurnStart(unit);
    tickCooldownsAtTurnStart(unit);

    const turnHealPercent = unit.def.combatMods?.turnHealPercent ?? 0;
    if (turnHealPercent > 0 && unit.alive) {
      const healAmount = Math.round(unit.maxHp * turnHealPercent);
      applyHeal(unit, healAmount);
      this.push(`${this.label(unit)} は体力シリーズの効果でHPが ${healAmount} 回復！ (${unit.currentHp}/${unit.maxHp})`);
    }

    if (unit.stunTurns > 0) {
      unit.stunTurns -= 1;
      this.push(`${this.label(unit)} はスタン中で行動できない！`);
    } else {
      this.act(unit, choice);
    }

    this.applyBurnAtTurnEnd(unit);
  }

  private act(unit: BattleUnit, choice?: ManualChoice): void {
    let skill: Skill;
    let index: 0 | 1 | 2;
    if (choice && unit.cooldowns[choice.skillIndex] === 0) {
      skill = unit.def.skills[choice.skillIndex];
      index = choice.skillIndex;
    } else {
      ({ skill, index } = chooseSkill(unit));
    }

    let targets: BattleUnit[];
    if (choice?.targetId && (skill.target === "SINGLE_ENEMY" || skill.target === "SINGLE_ALLY")) {
      const explicitTarget = this.units.find((u) => u.instanceId === choice.targetId && u.alive);
      targets = explicitTarget ? [explicitTarget] : chooseTargets(unit, skill, this.units);
    } else {
      targets = chooseTargets(unit, skill, this.units);
    }
    if (targets.length === 0) return;

    if (skill.cooldownTurns > 0) {
      unit.cooldowns[index] = skill.cooldownTurns;
    }

    this.push(`${this.label(unit)} の「${skill.name}」！`);
    for (const target of targets) {
      this.applySkillEffects(unit, target, skill);
    }
  }

  /** 火傷している場合、手番の最後(行動の有無・スタンの有無を問わず)に自分の攻撃力分のダメージを受ける */
  private applyBurnAtTurnEnd(unit: BattleUnit): void {
    if (unit.burnTurns <= 0 || !unit.alive) return;
    unit.burnTurns -= 1;
    const burnDamage = Math.max(1, getEffectiveStat(unit, "atk"));
    applyDamage(unit, burnDamage);
    this.push(`  → ${this.label(unit)} は火傷でダメージを受けた！ ${burnDamage} (残りHP ${unit.currentHp}/${unit.maxHp})`);
    if (!unit.alive) {
      this.push(`  → ${this.label(unit)} は倒れた！`);
    }
  }

  private applySkillEffects(source: BattleUnit, target: BattleUnit, skill: Skill): void {
    let damageDealtThisCall = 0;

    for (const effect of skill.effects) {
      if (!target.alive && effect.kind !== "HEAL" && effect.kind !== "LIFESTEAL") continue;

      switch (effect.kind) {
        case "DAMAGE": {
          const hits = effect.hits ?? 1;
          for (let h = 0; h < hits && target.alive; h += 1) {
            const result = calcDamage(source, target, effect, this.rng);
            applyDamage(target, result.damage);
            damageDealtThisCall += result.damage;
            const critText = result.isCrit ? "会心の一撃！" : "";
            const affinityText =
              result.affinity === "ADVANTAGE" ? " 効果は抜群だ！" : result.affinity === "DISADVANTAGE" ? " 効果は今ひとつだ…" : "";
            this.push(
              `  → ${this.label(target)} に ${result.damage} ダメージ！${critText}${affinityText} (残りHP ${target.currentHp}/${target.maxHp})`,
            );
            if (!target.alive) {
              this.push(`  → ${this.label(target)} は倒れた！`);
            }
          }
          break;
        }

        case "HEAL": {
          if (!target.alive) break;
          const healBase =
            effect.scaleStat === "atk"
              ? getEffectiveStat(source, "atk")
              : effect.scaleStat === "def"
                ? getEffectiveStat(source, "def")
                : target.maxHp;
          const healAmount = Math.round(healBase * effect.healRate);
          applyHeal(target, healAmount);
          this.push(`  → ${this.label(target)} のHPが ${healAmount} 回復！ (${target.currentHp}/${target.maxHp})`);
          break;
        }

        case "LIFESTEAL": {
          if (!source.alive || damageDealtThisCall <= 0) break;
          const healAmount = Math.round(damageDealtThisCall * effect.healRate);
          if (healAmount <= 0) break;
          applyHeal(source, healAmount);
          this.push(`  → ${this.label(source)} は与えたダメージの一部でHPが ${healAmount} 回復！ (${source.currentHp}/${source.maxHp})`);
          break;
        }

        case "BUFF": {
          target.effects.push({
            stat: effect.stat,
            amount: effect.amount,
            remainingTurns: effect.durationTurns,
            kind: "BUFF",
          });
          this.push(`  → ${this.label(target)} の ${effect.stat.toUpperCase()} が上昇！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "DEBUFF": {
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          target.effects.push({
            stat: effect.stat,
            amount: -effect.amount,
            remainingTurns: effect.durationTurns,
            kind: "DEBUFF",
          });
          this.push(`  → ${this.label(target)} の ${effect.stat.toUpperCase()} が低下！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "STUN": {
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          target.stunTurns = Math.max(target.stunTurns, effect.durationTurns);
          this.push(`  → ${this.label(target)} はスタンした！`);
          break;
        }

        case "BURN": {
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          target.burnTurns = Math.max(target.burnTurns, effect.durationTurns);
          this.push(`  → ${this.label(target)} は火傷を負った！ (${effect.durationTurns}ターン)`);
          break;
        }
      }
    }
  }

  /**
   * 状態異常(デバフ・スタン・火傷)の発動判定。まずスキル自体の発動確率(chance、省略時は必ず発動を試みる)を
   * 判定し、成功したら続けて命中率/抵抗率による的中判定を行う。的中率は
   * (1 - 相手の効果抵抗率 + 自分の効果命中率) / (1 + 自分の効果命中率) で求まり、
   * 命中率を最大まで積んでも相手の抵抗率を完全には無効化できない(必ず一定の抵抗余地が残る)。
   * 的中シリーズ(4個セット)を装着していれば相手の抵抗率をさらに一部無視する。
   * 抵抗成功時、抵抗シリーズ(4個セット)を装着していればHPが回復する。
   */
  private rollEffectSuccess(source: BattleUnit, target: BattleUnit, baseChance: number | undefined): boolean {
    const procChance = baseChance ?? 1;
    if (this.rng() >= procChance) return false;

    const ignoreRatio = source.def.combatMods?.ignoreResistancePercent ?? 0;
    const effectiveResistance = target.def.stats.resistance * (1 - ignoreRatio);
    const accuracy = source.def.stats.accuracy;
    const hitChance = Math.max(0, Math.min(1, (1 - effectiveResistance + accuracy) / (1 + accuracy)));

    if (this.rng() < hitChance) return true;

    this.push(`  → ${this.label(target)} は効果を抵抗した！`);
    const healOnResistPercent = target.def.combatMods?.healOnResistPercent ?? 0;
    if (healOnResistPercent > 0 && target.alive) {
      const healAmount = Math.round(target.maxHp * healOnResistPercent);
      applyHeal(target, healAmount);
      this.push(`  → ${this.label(target)} は抵抗シリーズの効果でHPが ${healAmount} 回復！ (${target.currentHp}/${target.maxHp})`);
    }
    return false;
  }

  private label(unit: BattleUnit): string {
    return `[${unit.team === "PLAYER" ? "味方" : "敵"}:${unit.instanceId}] ${unit.def.name}(${ELEMENT_JA[unit.def.element]})`;
  }

  private push(message: string): void {
    this.log.push(message);
  }

  getUnits(): readonly BattleUnit[] {
    return this.units;
  }
}

export function summarizeUnit(unit: BattleUnit): string {
  return `${unit.def.name} HP:${unit.currentHp}/${unit.maxHp} (${Math.round(hpRatio(unit) * 100)}%)`;
}
