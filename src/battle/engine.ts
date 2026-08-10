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

export interface BattleResult {
  winner: BattleWinner;
  log: string[];
  turnsTaken: number;
}

export interface BattleEngineOptions {
  rng?: () => number;
  maxTurns?: number;
}

export class BattleEngine {
  private readonly units: BattleUnit[];
  private readonly rng: () => number;
  private readonly maxTurns: number;
  private readonly log: string[] = [];

  constructor(playerTeam: MonsterDefinition[], enemyTeam: MonsterDefinition[], options: BattleEngineOptions = {}) {
    if (playerTeam.length === 0 || enemyTeam.length === 0) {
      throw new Error("両チームとも1体以上のモンスターが必要です");
    }
    this.units = [
      ...playerTeam.map((def, i) => createBattleUnit(def, "PLAYER", `P${i + 1}`)),
      ...enemyTeam.map((def, i) => createBattleUnit(def, "ENEMY", `E${i + 1}`)),
    ];
    this.rng = options.rng ?? Math.random;
    this.maxTurns = options.maxTurns ?? 300;
  }

  run(): BattleResult {
    let turnsTaken = 0;

    while (turnsTaken < this.maxTurns) {
      const winner = this.checkWinner();
      if (winner) {
        return { winner, log: this.log, turnsTaken };
      }

      const aliveUnits = this.units.filter((u) => u.alive);
      const speeds = aliveUnits.map((u) => Math.max(1, getEffectiveStat(u, "spd")));
      const ticksToReady = aliveUnits.map((u, i) => (ATB_THRESHOLD - u.gauge) / speeds[i]);
      const minTicks = Math.min(...ticksToReady);

      aliveUnits.forEach((u, i) => {
        u.gauge += speeds[i] * minTicks;
      });

      const actingUnits = aliveUnits
        .filter((u) => u.gauge >= ATB_THRESHOLD - GAUGE_EPSILON)
        .sort((a, b) => b.gauge - a.gauge || getEffectiveStat(b, "spd") - getEffectiveStat(a, "spd"));

      for (const unit of actingUnits) {
        if (!unit.alive) continue;
        unit.gauge -= ATB_THRESHOLD;

        const winnerMidLoop = this.checkWinner();
        if (winnerMidLoop) {
          return { winner: winnerMidLoop, log: this.log, turnsTaken };
        }

        this.takeTurn(unit);
        turnsTaken += 1;
        if (turnsTaken >= this.maxTurns) break;
      }
    }

    return { winner: this.checkWinner() ?? "DRAW", log: this.log, turnsTaken };
  }

  private checkWinner(): BattleWinner | null {
    const playerAlive = this.units.some((u) => u.team === "PLAYER" && u.alive);
    const enemyAlive = this.units.some((u) => u.team === "ENEMY" && u.alive);
    if (!playerAlive && !enemyAlive) return "DRAW";
    if (!playerAlive) return "ENEMY";
    if (!enemyAlive) return "PLAYER";
    return null;
  }

  private takeTurn(unit: BattleUnit): void {
    tickEffectsAtTurnStart(unit);
    tickCooldownsAtTurnStart(unit);

    if (unit.stunTurns > 0) {
      unit.stunTurns -= 1;
      this.push(`${this.label(unit)} はスタン中で行動できない！`);
      return;
    }

    const { skill, index } = chooseSkill(unit);
    const targets = chooseTargets(unit, skill, this.units);
    if (targets.length === 0) return;

    if (skill.cooldownTurns > 0) {
      unit.cooldowns[index] = skill.cooldownTurns;
    }

    this.push(`${this.label(unit)} の「${skill.name}」！`);
    for (const target of targets) {
      this.applySkillEffects(unit, target, skill);
    }
  }

  private applySkillEffects(source: BattleUnit, target: BattleUnit, skill: Skill): void {
    for (const effect of skill.effects) {
      if (!target.alive && effect.kind !== "HEAL") continue;

      switch (effect.kind) {
        case "DAMAGE": {
          const hits = effect.hits ?? 1;
          for (let h = 0; h < hits && target.alive; h += 1) {
            const result = calcDamage(source, target, effect, this.rng);
            applyDamage(target, result.damage);
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
          const healAmount = Math.round(target.maxHp * effect.healRate);
          applyHeal(target, healAmount);
          this.push(`  → ${this.label(target)} のHPが ${healAmount} 回復！ (${target.currentHp}/${target.maxHp})`);
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
          if (this.rng() < target.def.stats.resistance) {
            this.push(`  → ${this.label(target)} は効果を抵抗した！`);
            break;
          }
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
          if (this.rng() < target.def.stats.resistance) {
            this.push(`  → ${this.label(target)} は効果を抵抗した！`);
            break;
          }
          target.stunTurns = Math.max(target.stunTurns, effect.durationTurns);
          this.push(`  → ${this.label(target)} はスタンした！`);
          break;
        }
      }
    }
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
