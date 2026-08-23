import { ELEMENT_JA } from "../core/element.js";
import { MonsterDefinition } from "../core/monster.js";
import { Skill, SkillEffect } from "../core/skill.js";
import { chooseSkill, chooseTargets } from "./ai.js";
import { calcDamage } from "./damage.js";
import {
  ActiveEffect,
  BattleUnit,
  Team,
  applyDamage,
  applyHeal,
  createBattleUnit,
  getEffectiveStat,
  hpRatio,
  tickCooldownsAtTurnStart,
  tickEffectsAtTurnStart,
  tickBlindAtTurnStart,
  tickImmunityAtTurnStart,
  tickShieldAtTurnStart,
} from "./unit.js";

const ATB_THRESHOLD = 100;

/** 暗闇がかかっている時、攻撃が外れる確率 */
const BLIND_MISS_CHANCE = 0.5;
/** 暗闇で外した攻撃のダメージ減少率 */
const BLIND_DAMAGE_REDUCTION = 0.75;
const GAUGE_EPSILON = 1e-6;

/**
 * 「対象ではなく術者(またはその味方)に向いた効果」かどうか。
 *
 * 全体技は対象の数だけ効果解決が走るので、こうした効果をそのまま処理すると
 * 敵4体の技で自己バフが4重にかかる。呼び出し側はこれを見て、
 * 1回の使用につき1度だけ適用する。
 */
function isSourceScopedEffect(effect: SkillEffect): boolean {
  if (effect.kind === "HEAL") return effect.applyTo === "SELF" || effect.applyTo === "ALLIES";
  if (effect.kind === "BUFF") return effect.applyTo === "SELF" || effect.applyTo === "ALLIES";
  return false;
}

export type BattleWinner = "PLAYER" | "ENEMY" | "DRAW";

export interface UnitSnapshot {
  instanceId: string;
  team: Team;
  currentHp: number;
  maxHp: number;
  gauge: number;
  alive: boolean;
  /** 現在かかっているバフ/デバフ(演出用) */
  effects: ActiveEffect[];
  /** スタン残りターン(0=スタンしていない) */
  stunTurns: number;
  /** 火傷残りターン(0=火傷していない) */
  burnTurns: number;
  /** 現在のシールド量(0=シールドなし) */
  shieldValue: number;
  /** シールド残りターン */
  shieldTurns: number;
  /** 状態異常免疫の残りターン(0=免疫していない) */
  immuneTurns: number;
  /** 毒のスタック数(0=毒なし) */
  poisonStacks: number;
  /** 毒の残りターン */
  poisonTurns: number;
  /** 暗闇の残りターン(0=暗闇していない) */
  blindTurns: number;
}

/** 演出用: そのターンに起きたHP増減イベント1件分(ダメージ数値のポップアップ表示などに使う) */
export interface BattleEvent {
  targetId: string;
  kind: "DAMAGE" | "HEAL" | "DEATH" | "RESIST";
  amount?: number;
  isCrit?: boolean;
}

/** ユニット1体の1手番分の記録。UIでのアニメーション再生に使う */
export interface TurnRecord {
  actorId: string;
  lines: string[];
  snapshot: UnitSnapshot[];
  events: BattleEvent[];
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
  private readonly events: BattleEvent[] = [];
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
        const eventsBefore = this.events.length;
        this.takeTurn(unit);
        this.turns.push({
          actorId: unit.instanceId,
          lines: this.log.slice(linesBefore),
          events: this.events.slice(eventsBefore),
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
    // GAUGE効果などで既に閾値を超えているユニットがいても、他のユニットのゲージを巻き戻さない
    const minTicks = Math.max(0, Math.min(...ticksToReady));

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
    const eventsBefore = this.events.length;
    this.takeTurn(unit, choice);
    const record: TurnRecord = {
      actorId: unit.instanceId,
      lines: this.log.slice(linesBefore),
      events: this.events.slice(eventsBefore),
      snapshot: this.snapshotUnits(),
    };
    this.turns.push(record);
    return record;
  }

  private pushEvent(event: BattleEvent): void {
    this.events.push(event);
  }

  private snapshotUnits(): UnitSnapshot[] {
    return this.units.map((u) => ({
      instanceId: u.instanceId,
      team: u.team,
      currentHp: u.currentHp,
      maxHp: u.maxHp,
      gauge: Math.round(u.gauge),
      alive: u.alive,
      effects: u.effects.map((e) => ({ ...e })),
      stunTurns: u.stunTurns,
      burnTurns: u.burnTurns,
      shieldValue: u.shieldValue,
      shieldTurns: u.shieldTurns,
      immuneTurns: u.immuneTurns,
      poisonStacks: u.poisonStacks,
      poisonTurns: u.poisonTurns,
      blindTurns: u.blindTurns,
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
    tickShieldAtTurnStart(unit);
    tickImmunityAtTurnStart(unit);
    tickBlindAtTurnStart(unit);

    const turnHealPercent = unit.def.combatMods?.turnHealPercent ?? 0;
    if (turnHealPercent > 0 && unit.alive) {
      const healAmount = Math.round(unit.maxHp * turnHealPercent);
      applyHeal(unit, healAmount);
      this.push(`${this.label(unit)} は体力シリーズの効果でHPが ${healAmount} 回復！ (${unit.currentHp}/${unit.maxHp})`);
      this.pushEvent({ targetId: unit.instanceId, kind: "HEAL", amount: healAmount });
    }

    this.applyRegenAtTurnStart(unit);
    this.applyPoisonAtTurnStart(unit);

    if (!unit.alive) {
      // 毒などで手番開始時に力尽きた場合、この手番はここで終わる
    } else if (unit.stunTurns > 0) {
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

    // 暗闇がかかっていると、攻撃するたびに外れ判定が入る。
    // 外れた場合はこの手番のあいだ、ダメージが大きく下がり追加効果も乗らない。
    let missed = false;
    if (unit.blindTurns > 0 && this.rng() < BLIND_MISS_CHANCE) {
      missed = true;
      this.push(`  → ${this.label(unit)} は暗闇で手元が狂った！`);
    }

    // 効果の解決は対象ごとに1回ずつ走る。そのため「術者や味方に向いた効果」
    // (自己回復・applyToがSELF/ALLIESのバフ)を素直に処理すると、全体技では
    // 対象の数だけ重ねがけされてしまう(敵4体なら4倍)。
    // 向き先が対象でない効果は最初の1回だけ適用する。
    targets.forEach((target, i) => {
      this.applySkillEffects(unit, target, skill, missed, i === 0);
    });
  }

  /** 火傷している場合、手番の最後(行動の有無・スタンの有無を問わず)に自分の攻撃力分のダメージを受ける */
  private applyBurnAtTurnEnd(unit: BattleUnit): void {
    if (unit.burnTurns <= 0 || !unit.alive) return;
    unit.burnTurns -= 1;
    const burnDamage = Math.max(1, getEffectiveStat(unit, "atk"));
    applyDamage(unit, burnDamage);
    this.push(`  → ${this.label(unit)} は火傷でダメージを受けた！ ${burnDamage} (残りHP ${unit.currentHp}/${unit.maxHp})`);
    this.pushEvent({ targetId: unit.instanceId, kind: "DAMAGE", amount: burnDamage });
    if (!unit.alive) {
      this.push(`  → ${this.label(unit)} は倒れた！`);
      this.pushEvent({ targetId: unit.instanceId, kind: "DEATH" });
    }
  }

  /** 継続回復がかかっている場合、手番開始時に最大HPのregenRate分回復する */
  private applyRegenAtTurnStart(unit: BattleUnit): void {
    if (unit.regenTurns <= 0 || !unit.alive) return;
    unit.regenTurns -= 1;
    if (unit.regenTurns <= 0) unit.regenRate = 0;
    const healAmount = Math.round(unit.maxHp * unit.regenRate);
    if (healAmount <= 0) return;
    applyHeal(unit, healAmount);
    this.push(`  → ${this.label(unit)} は継続回復でHPが ${healAmount} 回復！ (${unit.currentHp}/${unit.maxHp})`);
    this.pushEvent({ targetId: unit.instanceId, kind: "HEAL", amount: healAmount });
  }

  /** 毒のスタックがある場合、手番開始時にスタック数×poisonDamageRate分のダメージを受ける */
  private applyPoisonAtTurnStart(unit: BattleUnit): void {
    if (unit.poisonStacks <= 0 || !unit.alive) return;
    unit.poisonTurns -= 1;
    const stacks = unit.poisonStacks;
    if (unit.poisonTurns <= 0) {
      unit.poisonStacks = 0;
      unit.poisonDamageRate = 0;
    }
    const poisonDamage = Math.max(1, Math.round(unit.maxHp * unit.poisonDamageRate * stacks));
    applyDamage(unit, poisonDamage);
    this.push(`  → ${this.label(unit)} は毒(${stacks}スタック)でダメージを受けた！ ${poisonDamage} (残りHP ${unit.currentHp}/${unit.maxHp})`);
    this.pushEvent({ targetId: unit.instanceId, kind: "DAMAGE", amount: poisonDamage });
    if (!unit.alive) {
      this.push(`  → ${this.label(unit)} は倒れた！`);
      this.pushEvent({ targetId: unit.instanceId, kind: "DEATH" });
    }
  }

  /**
   * @param sourceScoped この呼び出しで「術者/味方に向いた効果」を適用してよいか。
   *   全体技では対象ごとにこの関数が呼ばれるため、最初の対象のときだけtrueになる。
   *   ライフスティールは与えたダメージに比例するので、ここには含めず毎回適用する。
   */
  private applySkillEffects(
    source: BattleUnit,
    target: BattleUnit,
    skill: Skill,
    missed = false,
    sourceScoped = true,
  ): void {
    let damageDealtThisCall = 0;

    for (const effect of skill.effects) {
      if (!target.alive && effect.kind !== "HEAL" && effect.kind !== "LIFESTEAL") continue;
      // 暗闇で外した場合、ダメージ以外の効果は一切乗らない
      if (missed && effect.kind !== "DAMAGE" && effect.kind !== "LIFESTEAL") continue;
      if (!sourceScoped && isSourceScopedEffect(effect)) continue;

      switch (effect.kind) {
        case "DAMAGE": {
          const hits = effect.hits ?? 1;
          for (let h = 0; h < hits && target.alive; h += 1) {
            const result = calcDamage(source, target, effect, this.rng);
            // 暗闇で外した攻撃はかすり傷程度にしかならない
            if (missed) result.damage = Math.max(1, Math.round(result.damage * (1 - BLIND_DAMAGE_REDUCTION)));
            applyDamage(target, result.damage);
            damageDealtThisCall += result.damage;
            const critText = result.isCrit ? "会心の一撃！" : "";
            const affinityText =
              result.affinity === "ADVANTAGE" ? " 効果は抜群だ！" : result.affinity === "DISADVANTAGE" ? " 効果は今ひとつだ…" : "";
            this.push(
              `  → ${this.label(target)} に ${result.damage} ダメージ！${critText}${affinityText} (残りHP ${target.currentHp}/${target.maxHp})`,
            );
            this.pushEvent({ targetId: target.instanceId, kind: "DAMAGE", amount: result.damage, isCrit: result.isCrit });
            if (!target.alive) {
              this.push(`  → ${this.label(target)} は倒れた！`);
              this.pushEvent({ targetId: target.instanceId, kind: "DEATH" });
            }
          }
          break;
        }

        case "HEAL": {
          // 回復先はスキルの対象とは限らない。敵を殴りながら味方を癒す技がある
          const receivers =
            effect.applyTo === "SELF"
              ? [source]
              : effect.applyTo === "ALLIES"
                ? this.units.filter((u) => u.team === source.team && u.alive)
                : [target];
          for (const receiver of receivers) {
            if (!receiver.alive) continue;
            const healBase =
              effect.scaleStat === "atk"
                ? getEffectiveStat(source, "atk")
                : effect.scaleStat === "def"
                  ? getEffectiveStat(source, "def")
                  : receiver.maxHp;
            const healAmount = Math.round(healBase * effect.healRate);
            if (healAmount <= 0) continue;
            applyHeal(receiver, healAmount);
            this.push(`  → ${this.label(receiver)} のHPが ${healAmount} 回復！ (${receiver.currentHp}/${receiver.maxHp})`);
            this.pushEvent({ targetId: receiver.instanceId, kind: "HEAL", amount: healAmount });
          }
          break;
        }

        case "LIFESTEAL": {
          if (!source.alive || damageDealtThisCall <= 0) break;
          const healAmount = Math.round(damageDealtThisCall * effect.healRate);
          if (healAmount <= 0) break;
          applyHeal(source, healAmount);
          this.push(`  → ${this.label(source)} は与えたダメージの一部でHPが ${healAmount} 回復！ (${source.currentHp}/${source.maxHp})`);
          this.pushEvent({ targetId: source.instanceId, kind: "HEAL", amount: healAmount });
          break;
        }

        case "BUFF": {
          // 適用先を選べる。敵を攻撃しつつ味方を強化するスキルなどで使う
          const receivers =
            effect.applyTo === "SELF"
              ? [source]
              : effect.applyTo === "ALLIES"
                ? this.units.filter((u) => u.team === source.team && u.alive)
                : [target];
          for (const receiver of receivers) {
            receiver.effects.push({
              stat: effect.stat,
              amount: effect.amount,
              remainingTurns: effect.durationTurns,
              kind: "BUFF",
            });
            this.push(`  → ${this.label(receiver)} の ${effect.stat.toUpperCase()} が上昇！ (${effect.durationTurns}ターン)`);
          }
          break;
        }

        case "DEBUFF": {
          if (this.isImmune(target)) break;
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
          if (this.isImmune(target)) break;
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          target.stunTurns = Math.max(target.stunTurns, effect.durationTurns);
          this.push(`  → ${this.label(target)} はスタンした！`);
          break;
        }

        case "BURN": {
          if (this.isImmune(target)) break;
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          target.burnTurns = Math.max(target.burnTurns, effect.durationTurns);
          this.push(`  → ${this.label(target)} は火傷を負った！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "GAUGE": {
          if (!target.alive) break;
          if (effect.drain) {
            // 吸収: 対象から減らした分をそのまま術者へ移す
            const before = target.gauge;
            target.gauge = Math.max(0, target.gauge - effect.amount * ATB_THRESHOLD);
            const stolen = before - target.gauge;
            source.gauge = Math.max(0, source.gauge + stolen);
            this.push(`  → ${this.label(source)} が ${this.label(target)} の行動ゲージを吸収した！`);
            break;
          }
          target.gauge = Math.max(0, target.gauge + effect.amount * ATB_THRESHOLD);
          const verb = effect.amount >= 0 ? "進んだ" : "後退した";
          this.push(`  → ${this.label(target)} の行動ゲージが${verb}！`);
          break;
        }

        case "BLIND": {
          if (this.isImmune(target)) break;
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          target.blindTurns = Math.max(target.blindTurns, effect.durationTurns);
          this.push(`  → ${this.label(target)} は暗闇に包まれた！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "SHIELD": {
          if (!target.alive) break;
          const shieldAmount = Math.round(target.maxHp * effect.shieldRate);
          target.shieldValue = Math.max(target.shieldValue, shieldAmount);
          target.shieldTurns = Math.max(target.shieldTurns, effect.durationTurns);
          this.push(`  → ${this.label(target)} にシールドが張られた！ (${shieldAmount}、${effect.durationTurns}ターン)`);
          break;
        }

        case "IMMUNITY": {
          if (!target.alive) break;
          target.immuneTurns = Math.max(target.immuneTurns, effect.durationTurns);
          this.push(`  → ${this.label(target)} は状態異常免疫を得た！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "REGEN": {
          if (!target.alive) break;
          target.regenRate = Math.max(target.regenRate, effect.healRate);
          target.regenTurns = Math.max(target.regenTurns, effect.durationTurns);
          this.push(`  → ${this.label(target)} は継続回復を得た！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "CLEANSE": {
          if (!target.alive) break;
          const hadDebuff = target.effects.some((e) => e.kind === "DEBUFF");
          target.effects = target.effects.filter((e) => e.kind !== "DEBUFF");
          if (hadDebuff) this.push(`  → ${this.label(target)} のデバフが解除された！`);
          break;
        }

        case "COOLDOWN_EXTEND": {
          if (!target.alive) break;
          // 他のデバフと同じ判定を通す。ここを素通りさせると、
          // 状態異常無効も抵抗も効かない唯一の妨害になってしまう
          if (this.isImmune(target)) break;
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          target.cooldowns = target.cooldowns.map((c) => c + effect.turns) as [number, number, number];
          this.push(`  → ${this.label(target)} のスキルのクールタイムが ${effect.turns}ターン延長された！`);
          break;
        }

        case "POISON": {
          if (this.isImmune(target)) break;
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          target.poisonStacks = Math.min(5, target.poisonStacks + 1);
          target.poisonTurns = Math.max(target.poisonTurns, effect.durationTurns);
          target.poisonDamageRate = Math.max(target.poisonDamageRate, effect.damageRatePerStack);
          this.push(`  → ${this.label(target)} は毒を受けた！ (${target.poisonStacks}スタック、${effect.durationTurns}ターン)`);
          break;
        }
      }
    }
  }

  /** 状態異常免疫中かどうかを判定する。免疫中ならログを出してtrueを返す(呼び出し側はこの後の付与処理をスキップすること) */
  private isImmune(target: BattleUnit): boolean {
    if (target.immuneTurns <= 0) return false;
    this.push(`  → ${this.label(target)} は状態異常免疫で無効化した！`);
    return true;
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
    this.pushEvent({ targetId: target.instanceId, kind: "RESIST" });
    const healOnResistPercent = target.def.combatMods?.healOnResistPercent ?? 0;
    if (healOnResistPercent > 0 && target.alive) {
      const healAmount = Math.round(target.maxHp * healOnResistPercent);
      applyHeal(target, healAmount);
      this.push(`  → ${this.label(target)} は抵抗シリーズの効果でHPが ${healAmount} 回復！ (${target.currentHp}/${target.maxHp})`);
      this.pushEvent({ targetId: target.instanceId, kind: "HEAL", amount: healAmount });
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
