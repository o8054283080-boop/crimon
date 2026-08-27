import { ELEMENT_JA } from "../core/element.js";
import { MonsterDefinition } from "../core/monster.js";
import { STATUS_EFFECT_CATEGORY, STATUS_EFFECT_JA, Skill, SkillEffect } from "../core/skill.js";
import { chooseSkill, chooseTargets } from "./ai.js";
import { calcDamage } from "./damage.js";
import {
  ActiveEffect,
  BattleUnit,
  DamageApplicationResult,
  Team,
  applyDamage,
  applyStatus,
  applyHeal,
  createBattleUnit,
  getEffectiveStat,
  hasStatus,
  hpRatio,
  tickCooldownsAtTurnStart,
  tickEffectsAtTurnStart,
  tickBlindAtTurnStart,
  tickImmunityAtTurnStart,
  tickHealBlockAtTurnStart,
  tickShieldAtTurnStart,
  stripBuffs,
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
  if (effect.kind === "STATUS") return effect.applyTo === "SELF" || effect.applyTo === "ALLIES";
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
  statusEffects: BattleUnit["statusEffects"];
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
  /**
   * 試練の塔のように、階をまたいでスキルのクールタイムを持ち越す場合に指定する。
   * playerTeamと同じ並び順で、そのユニットの開始時クールタイムを上書きする。
   *
   * **HPだけを持ち越すと、強い技を毎階の頭で撃ち直せてしまう。**
   * 「強い技ほど間隔が長い」という決まりが階の境目で消え、
   * 持ち越しの緊張感がHPの一本道になる。
   */
  initialCooldowns?: [number, number, number][];
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
  /** プレイヤーAIの単体敵対スキルが優先する対象。 */
  private focusTargetId: string | null = null;

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
    if (options.initialCooldowns) {
      options.initialCooldowns.forEach((cooldowns, i) => {
        const unit = this.units[i];
        if (!unit) return;
        unit.cooldowns = cooldowns.map((c) => Math.max(0, Math.round(c))) as [number, number, number];
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

  setFocusTarget(instanceId: string | null): boolean {
    if (instanceId === null || instanceId === this.focusTargetId) {
      this.focusTargetId = null;
      return true;
    }
    const target = this.units.find((unit) => unit.instanceId === instanceId && unit.team === "ENEMY" && unit.alive);
    if (!target) return false;
    this.focusTargetId = instanceId;
    return true;
  }

  getFocusTarget(): string | null {
    const target = this.units.find((unit) => unit.instanceId === this.focusTargetId && unit.alive);
    if (!target) this.focusTargetId = null;
    return this.focusTargetId;
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
      statusEffects: u.statusEffects.map((e) => ({ ...e })),
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
    const victoryTargets = this.units.filter((u) => u.team === "ENEMY" && u.def.victoryTarget);
    const enemyAlive = victoryTargets.length > 0
      ? victoryTargets.some((u) => u.alive)
      : this.units.some((u) => u.team === "ENEMY" && u.alive);
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
    tickHealBlockAtTurnStart(unit);
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
    if (choice && unit.cooldowns[choice.skillIndex] === 0 && (!hasStatus(unit, "SKILL_LOCK") || choice.skillIndex === 0)) {
      skill = unit.def.skills[choice.skillIndex];
      index = choice.skillIndex;
    } else {
      if (choice && hasStatus(unit, "SKILL_LOCK") && choice.skillIndex !== 0) {
        this.push(`  → ${this.label(unit)} はスキル使用不可のためスキル1を使用する！`);
      }
      ({ skill, index } = chooseSkill(unit, this.units));
    }

    let targets: BattleUnit[];
    if (choice?.targetId && (skill.target === "SINGLE_ENEMY" || skill.target === "SINGLE_ALLY")) {
      const explicitTarget = this.units.find((u) => u.instanceId === choice.targetId && u.alive);
      targets = explicitTarget ? [explicitTarget] : chooseTargets(unit, skill, this.units);
    } else {
      targets = chooseTargets(unit, skill, this.units);
      if (unit.team === "PLAYER" && skill.target === "SINGLE_ENEMY" && !hasStatus(unit, "TAUNT")) {
        const focused = this.units.find((candidate) => candidate.instanceId === this.getFocusTarget() && candidate.alive);
        if (focused) targets = [focused];
      }
    }
    if (skill.target === "SINGLE_ENEMY") {
      const forced = chooseTargets(unit, skill, this.units)[0];
      const taunt = unit.statusEffects.some((effect) => effect.type === "TAUNT");
      if (taunt && forced && targets[0] !== forced) {
        targets = [forced];
        this.push(`  → 挑発により対象が ${this.label(forced)} へ変更された！`);
      }
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
    const burnDamage = Math.max(1, Math.round(getEffectiveStat(unit, "atk")));
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
    // 反撃は効果の解決の途中に割り込ませない(解決中に相手が動くと、
    // 残りの効果が誰に乗るのか分からなくなる)。数えておいて最後にまとめて返す
    const counterTargets = new Set<BattleUnit>();

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
            const applied = this.applyIncomingDamage(target, result.damage, source, "normal");
            damageDealtThisCall += applied.hpDamage;
            target.hitsTaken += 1;
            counterTargets.add(target);
            const critText = result.isCrit ? "会心の一撃！" : "";
            const affinityText =
              result.affinity === "ADVANTAGE" ? " 効果は抜群だ！" : result.affinity === "DISADVANTAGE" ? " 効果は今ひとつだ…" : "";
            this.push(
              `  → ${this.label(target)} に ${applied.hpDamage} ダメージ！${critText}${affinityText} (残りHP ${target.currentHp}/${target.maxHp})`,
            );
            this.pushEvent({ targetId: target.instanceId, kind: "DAMAGE", amount: applied.hpDamage, isCrit: result.isCrit });
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
            if (hasStatus(receiver, "BUFF_BLOCK")) {
              this.push(`  → ${this.label(receiver)} は強化不可でBUFF付与を防いだ！`);
              continue;
            }
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

        case "STATUS": {
          const category = STATUS_EFFECT_CATEGORY[effect.status];
          const receivers = effect.applyTo === "SELF" ? [source] : effect.applyTo === "ALLIES"
            ? this.units.filter((unit) => unit.team === source.team && unit.alive) : [target];
          for (const receiver of receivers) {
            if (category === "DEBUFF") {
              if (this.isImmune(receiver) || !this.rollEffectSuccess(source, receiver, effect.chance)) continue;
            }
            if (!applyStatus(receiver, effect.status, effect.durationTurns, source.instanceId)) {
              this.push(`  → ${this.label(receiver)} は強化不可でBUFF付与を防いだ！`);
              continue;
            }
            this.push(`  → ${this.label(receiver)} は${STATUS_EFFECT_JA[effect.status]}を得た！ (${effect.durationTurns}ターン)`);
          }
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
          if (hasStatus(target, "BUFF_BLOCK")) { this.push(`  → ${this.label(target)} は強化不可でBUFF付与を防いだ！`); break; }
          const shieldAmount = Math.round(target.maxHp * effect.shieldRate);
          target.shieldValue = Math.max(target.shieldValue, shieldAmount);
          target.shieldTurns = Math.max(target.shieldTurns, effect.durationTurns);
          this.push(`  → ${this.label(target)} にシールドが張られた！ (${shieldAmount}、${effect.durationTurns}ターン)`);
          break;
        }

        case "IMMUNITY": {
          if (!target.alive) break;
          if (hasStatus(target, "BUFF_BLOCK")) { this.push(`  → ${this.label(target)} は強化不可でBUFF付与を防いだ！`); break; }
          target.immuneTurns = Math.max(target.immuneTurns, effect.durationTurns);
          this.push(`  → ${this.label(target)} は状態異常免疫を得た！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "REGEN": {
          if (!target.alive) break;
          if (hasStatus(target, "BUFF_BLOCK")) { this.push(`  → ${this.label(target)} は強化不可でBUFF付与を防いだ！`); break; }
          target.regenRate = Math.max(target.regenRate, effect.healRate);
          target.regenTurns = Math.max(target.regenTurns, effect.durationTurns);
          this.push(`  → ${this.label(target)} は継続回復を得た！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "CLEANSE": {
          if (!target.alive) break;
          const hadDebuff = target.effects.some((e) => e.kind === "DEBUFF");
          target.effects = target.effects.filter((e) => e.kind !== "DEBUFF");
          const hadStatusDebuff = target.statusEffects.some((e) => e.category === "DEBUFF");
          target.statusEffects = target.statusEffects.filter((e) => e.category !== "DEBUFF");
          if (hadDebuff || hadStatusDebuff) this.push(`  → ${this.label(target)} のデバフが解除された！`);
          break;
        }

        case "STRIP": {
          if (this.isImmune(target)) break;
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          if (stripBuffs(target)) {
            this.push(`  → ${this.label(target)} の有利な効果が剥がされた！`);
          }
          break;
        }

        case "HEAL_BLOCK": {
          if (this.isImmune(target)) break;
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          target.healBlockTurns = Math.max(target.healBlockTurns, effect.durationTurns);
          // 複数から掛かったら、いちばんきついものが残る
          target.healBlockMultiplier = Math.min(target.healBlockMultiplier, effect.healMultiplier);
          this.push(
            `  → ${this.label(target)} は治癒阻害を受けた！ (${effect.durationTurns}ターン、回復${Math.round((1 - effect.healMultiplier) * 100)}%減)`,
          );
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

    for (const victim of counterTargets) this.tryCounter(victim, source);
  }

  /** 特殊ダメージにも共通の致死処理を通し、通常由来だけ反射を1段生成する。 */
  private applyIncomingDamage(
    target: BattleUnit,
    amount: number,
    source?: BattleUnit,
    sourceType: "normal" | "reflect" | "periodic" = "normal",
  ): DamageApplicationResult {
    const applied = applyDamage(target, amount);
    if (applied.invincible) this.push(`  → ${this.label(target)} は無敵でダメージを無効化した！`);
    if (applied.endured) this.push(`  → ${this.label(target)} は我慢でHP1に踏みとどまった！`);
    if (applied.revived) this.push(`  → ${this.label(target)} は最大HPの25%で復活した！`);
    if (applied.died) {
      this.push(`  → ${this.label(target)} は倒れた！`);
      this.pushEvent({ targetId: target.instanceId, kind: "DEATH" });
    }
    if (sourceType === "normal" && source?.alive && applied.hpDamage > 0 && hasStatus(target, "REFLECT")) {
      const reflected = Math.round(applied.hpDamage * 0.25);
      if (reflected > 0) {
        this.push(`  → ${this.label(target)} の反射！ ${this.label(source)} へ ${reflected} ダメージ！`);
        const reflectedResult = this.applyIncomingDamage(source, reflected, target, "reflect");
        this.pushEvent({ targetId: source.instanceId, kind: "DAMAGE", amount: reflectedResult.hpDamage });
      }
    }
    return applied;
  }

  /**
   * 反撃。**手数で押す戦い方に代償を作る。**
   *
   * 小さい攻撃を何度も当てる、多段で削る、毒を重ねる——どれも手数が要る。
   * 決めた回数を受けるたびに、受けた側が即座に殴り返す。
   *
   * 反撃そのものは反撃を呼ばない(呼ぶと相討ちが無限に続く)。
   */
  private tryCounter(defender: BattleUnit, attacker: BattleUnit): void {
    const traits = defender.def.bossTraits;
    const every = traits?.counterAfterHits ?? 0;
    if (every <= 0 || !defender.alive || !attacker.alive) return;
    if (defender.hitsTaken < every) return;

    defender.hitsTaken -= every;
    const result = calcDamage(defender, attacker, { kind: "DAMAGE", multiplier: traits?.counterMultiplier ?? 1.2 }, this.rng);
    applyDamage(attacker, result.damage);
    this.push(`  → ${this.label(defender)} の反撃！ ${this.label(attacker)} に ${result.damage} ダメージ (残りHP ${attacker.currentHp}/${attacker.maxHp})`);
    this.pushEvent({ targetId: attacker.instanceId, kind: "DAMAGE", amount: result.damage, isCrit: result.isCrit });
    if (!attacker.alive) {
      this.push(`  → ${this.label(attacker)} は倒れた！`);
      this.pushEvent({ targetId: attacker.instanceId, kind: "DEATH" });
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
