import { ELEMENT_JA } from "../core/element.js";
import { MonsterDefinition } from "../core/monster.js";
import { LatentAbilityCandidate } from "../core/monsterDevelopment.js";
import { PassiveLevelEffect } from "../core/passive.js";
import { EffectApplyTo, EffectCondition, STATUS_EFFECT_CATEGORY, STATUS_EFFECT_JA, Skill, SkillEffect } from "../core/skill.js";
import {
  TOWER70_BOSS_REGEN,
  TOWER70_LIFE_REGEN_BONUS,
  TOWER70_PULSE_CRUSH_RATIO,
  TOWER70_ROAR_DEF_DOWN,
  TOWER70_ROAR_DEF_DOWN_TURNS,
  TOWER70_ROAR_GAUGE_DOWN,
  TOWER70_ROAR_HP_COEFFICIENT,
  TOWER70_ROAR_MULTIPLIER,
  TOWER70_ROAR_THRESHOLDS,
} from "../data/trialTowerFloor70.js";
import {
  TOWER90_EARLY_DAMAGE_FACTOR,
  TOWER90_ESCORT_DEATH_ATK,
  TOWER90_ESCORT_DEATH_CRI_DMG,
  TOWER90_ESCORT_DEATH_CRI_RATE,
  TOWER90_ESCORT_DEATH_SPD,
  TOWER90_FANG_EXECUTE_RAGE_MULTIPLIER,
  TOWER90_FANG_EXECUTE_SKILL_ID,
  TOWER90_FANG_RAGE_ATK,
  TOWER90_FANG_RAGE_SPD,
  TOWER90_RAGE_HP20_ATK,
  TOWER90_RAGE_HP20_DAMAGE_FACTOR,
  TOWER90_RAGE_HP20_SPD,
  TOWER90_RAGE_HP40_ATK,
  TOWER90_RAGE_HP40_DAMAGE_FACTOR,
  TOWER90_RAGE_HP40_SPD,
  TOWER90_RAGE_HP70_ATK,
  TOWER90_RAGE_HP70_SPD,
  TOWER90_WAR_DRUM_BOSS_COOLDOWN,
  TOWER90_WAR_DRUM_BOSS_GAUGE,
  TOWER90_WAR_DRUM_TEMPO_SKILL_ID,
} from "../data/trialTowerFloor90.js";
import { chooseSkill, chooseTargets } from "./ai.js";
import { calcDamage, evaluateTargetCondition } from "./damage.js";
import {
  ActiveEffect,
  BattleUnit,
  DamageApplicationResult,
  Team,
  applyDamage,
  applyStatus,
  applyHeal,
  cleanseDebuffs,
  countDebuffs,
  createBattleUnit,
  damageTakenMultiplier,
  getEffectiveStat,
  hasAnyBuff,
  hasStatus,
  hpRatio,
  passiveEffectOf,
  stealBuffs,
  tickCooldownsAtTurnStart,
  tickEffectsAtTurnStart,
  tickBlindAtTurnStart,
  tickExtendedStateAtTurnStart,
  tickImmunityAtTurnStart,
  tickHealBlockAtTurnStart,
  tickShieldAtTurnStart,
  stripBuffs,
} from "./unit.js";

const ATB_THRESHOLD = 100;

/**
 * 1回の追加ターンの連鎖に許す上限。
 *
 * フェンリルの「群狼の本能」は**回数制限なし**が仕様(依頼主の指定)なので、
 * ここは遊びの制限ではなく**暴走の止め金**。倒すたびに追加ターンが来るので、
 * 何かの拍子に「倒していないのに倒したと数える」不具合が入ると
 * その場で無限ループになり、画面が固まって原因も分からなくなる。
 */
/**
 * スキル1回の解決の中で起きたことを覚えておく入れ物。
 *
 * **多段攻撃で追加効果が何度も出ないようにするための要。**
 * 依頼主の指定どおり、ゲージ吸収・追加デバフ・潜在能力の追加効果は
 * 明記が無いかぎり**1スキル使用につき1回**しか判定しない。
 * 「何回当たったか」ではなく「何が起きたか」をここに集めて、
 * 解決の最後に1度だけ使う。
 */
interface SkillResolution {
  /** 1回でもクリティカルしたか */
  anyCrit: boolean;
  /** クリティカルした回数 */
  critCount: number;
  /** 弱体効果を1つでも入れられたか */
  debuffApplied: boolean;
  /** 直前のスタンが失敗したか(確率・免疫・抵抗のいずれでも) */
  stunFailed: boolean;
  /** このスキルで奪った強化効果の数 */
  stolenBuffs: number;
  /** このスキルで解除に成功した相手の数 */
  strippedTargets: number;
  /** このスキルで与えたHPダメージの合計 */
  damageDealt: number;
  /** このスキルで倒した相手の数 */
  kills: number;
  /** 術者側のパッシブで「1スキル1回」のものを、もう使ったか */
  sourcePassiveUsed: boolean;
  /** 受け手側のパッシブを既に出した相手(instanceId)。全体技でも1体につき1回に保つ */
  readonly victimPassiveUsed: Set<string>;
  /** このスキルで実際に入った弱体効果/解除の種類。潜在能力の発動条件に使う */
  readonly applied: Set<string>;
  /** このスキルで相手から減らした行動ゲージの合計(0〜1の割合) */
  gaugeRemoved: number;
  /**
   * 解決を始めた時点の、対象ごとのHP割合。
   * **倒した後のHPは0なので、「HP50%以下の相手に当てたら」という条件が
   * 必ず真になってしまう。** 殴る前の状態で判定するために控えておく。
   */
  readonly targetHpBefore: Map<string, number>;
  /** 同一対象で共有するスキル効果の基礎発動判定。 */
  readonly chanceGroups: Map<string, boolean>;
}

function newResolution(): SkillResolution {
  return {
    anyCrit: false, critCount: 0, debuffApplied: false, stunFailed: false,
    stolenBuffs: 0, strippedTargets: 0, damageDealt: 0, kills: 0,
    sourcePassiveUsed: false, victimPassiveUsed: new Set(), applied: new Set(), gaugeRemoved: 0,
    targetHpBefore: new Map(), chanceGroups: new Map(),
  };
}

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
  switch (effect.kind) {
    case "HEAL": case "BUFF": case "STATUS": case "GAUGE": case "SHIELD":
    case "REGEN": case "MITIGATE": case "CLEANSE": case "COOLDOWN_REDUCE": case "GAUGE_ON_HIT":
      return effect.applyTo !== undefined;
    // 協力攻撃・反撃態勢は術者そのものに1度だけかかる
    case "COOP_ATTACK": case "COUNTER_STANCE":
      return true;
    default:
      return false;
  }
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
  /** 試練の塔だけが指定する階番号。通常戦闘へ特殊ボス規則を漏らさない。 */
  trialTowerFloor?: number;
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
  private readonly consumedLatents = new Set<string>();
  private readonly trialTowerFloor?: number;
  private trialBossTurns = 0;
  /** 70階「始祖の咆哮」を既に発動したHP閾値。回復して跨ぎ直しても再発動しない。 */
  private readonly tower70RoaredThresholds = new Set<number>();
  /**
   * 90階で一度でも倒れたお供。**戻さない。**
   * 生存数から引く形にすると、蘇生や再計算で狂化が戻ってしまう。
   * このエンジン1戦ぶんの記録なので、戦闘をやり直せば白紙から始まる
   * (= リトライで狂化が二重に乗ることはない)。
   */
  private readonly tower90DeadEscortIds = new Set<string>();
  /** 撃破で得た追加ターン待ちのユニット。手番の直後にまとめて処理する */
  private pendingExtraTurns: BattleUnit[] = [];
  /** 協力攻撃の入れ子の深さ。0でないときは協力攻撃を呼ばない(無限に連鎖するため) */
  private coopDepth = 0;
  /** 溜めた反撃の入れ子の深さ。0でないときは反撃を呼ばない(反射と往復し続けるため) */
  private counterDepth = 0;
  /** `empowerBossOnDeath` を処理し終えた個体。同じ死で二度強くしない */
  private readonly mournedDeaths = new Set<string>();
  /** いま解決中のスキル。パッシブの「1スキル1回」を数えるのに使う */
  private resolution: SkillResolution | null = null;

  constructor(playerTeam: MonsterDefinition[], enemyTeam: MonsterDefinition[], options: BattleEngineOptions = {}) {
    if (playerTeam.length === 0 || enemyTeam.length === 0) {
      throw new Error("両チームとも1体以上のモンスターが必要です");
    }
    this.units = [
      ...playerTeam.map((def, i) => createBattleUnit(def, "PLAYER", `P${i + 1}`)),
      ...enemyTeam.map((def, i) => createBattleUnit(def, "ENEMY", `E${i + 1}`)),
    ];

    this.units.forEach((unit) => {
      if (unit.def.initialCooldowns) unit.cooldowns = [...unit.def.initialCooldowns];
      const mods = unit.def.combatMods;
      const startShield = mods?.battleStartShieldPercent ?? 0;
      if (startShield > 0) {
        unit.shieldValue = Math.round(unit.maxHp * startShield);
        unit.shieldTurns = (mods?.battleStartShieldTurns ?? 0) + 1;
      }
      const startImmunity = mods?.battleStartImmunityTurns ?? 0;
      if (startImmunity > 0) {
        unit.immuneTurns = startImmunity + 1;
      }
    });

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
    this.trialTowerFloor = options.trialTowerFloor;
    if (options.trialTowerFloor === 80) { const boss = this.trialBoss(); if (boss) boss.immuneTurns = 3; }
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

        this.recordTurn(unit);
        this.applyAllyDeathBoosts();
        turnsTaken += 1;
        if (turnsTaken >= this.maxTurns) break;

        // 撃破で得た追加ターンは、次の人へ回さずその場で続けて動く。
        // 「倒したから、もう一度動ける」という手応えは、順番が飛ぶと消える
        while (this.pendingExtraTurns.length > 0 && turnsTaken < this.maxTurns) {
          const extra = this.pendingExtraTurns.shift()!;
          if (!extra.alive) continue;
          this.push(`${this.label(extra)} は追加ターンを得た！`);
          this.recordTurn(extra);
          turnsTaken += 1;
        }
        this.pendingExtraTurns = [];
        if (turnsTaken >= this.maxTurns) break;
      }
    }

    return { winner: this.checkWinner() ?? "DRAW", log: this.log, turnsTaken, turns: this.turns };
  }

  /** 1手番を解決し、演出用の記録を1件積む */
  private recordTurn(unit: BattleUnit, choice?: ManualChoice): TurnRecord {
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

    const record = this.recordTurn(unit, choice);
    // 追加ターンは列の先頭へ戻す。ライブ進行でも「続けてもう一度動く」を保つ
    while (this.pendingExtraTurns.length > 0) {
      const extra = this.pendingExtraTurns.pop()!;
      if (!extra.alive) continue;
      extra.gauge += ATB_THRESHOLD;
      this.interactiveQueue.unshift(extra);
    }
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
    tickExtendedStateAtTurnStart(unit);

    const turnHealPercent = unit.def.combatMods?.turnHealPercent ?? 0;
    if (turnHealPercent > 0 && unit.alive) {
      const healAmount = Math.round(unit.maxHp * turnHealPercent);
      applyHeal(unit, healAmount);
      this.push(`${this.label(unit)} は体力シリーズの効果でHPが ${healAmount} 回復！ (${unit.currentHp}/${unit.maxHp})`);
      this.pushEvent({ targetId: unit.instanceId, kind: "HEAL", amount: healAmount });
    }

    this.applyRegenAtTurnStart(unit);
    this.applyPoisonAtTurnStart(unit);

    let acted = false;
    if (!unit.alive) {
      // 毒などで手番開始時に力尽きた場合、この手番はここで終わる
    } else if (unit.stunTurns > 0) {
      unit.stunTurns -= 1;
      this.push(`${this.label(unit)} はスタン中で行動できない！`);
    } else {
      this.applyTrialBossAction(unit);
      this.act(unit, choice);
      acted = true;
    }

    this.applyBurnAtTurnEnd(unit);
    if (acted) this.onUnitActed(unit);
  }

  /* ============================ パッシブ ============================ */

  /**
   * 誰かが1手番を終えた時に呼ぶ。「味方が行動するたび」「敵が行動するたび」の
   * パッシブをここ1か所で捌く。
   *
   * **手番の単位で1回。** 行動の中の1発ごとに数えると、多段攻撃を持つ相手が
   * 動いただけでゲージが満ちてしまう。
   */
  private onUnitActed(actor: BattleUnit): void {
    // 70階の再生は「始祖ベヒモス自身が実際に行動した手番の終了時」だけ。
    // スタンで行動できなかった時や、取り巻きの手番では進めない。
    if (this.isTower70Boss(actor)) this.applyTower70BossRegen(actor);

    const extraTurnChance = Math.max(actor.def.combatMods?.extraTurnChance ?? 0, actor.def.bossTraits?.extraTurnChance ?? 0);
    if (actor.alive && extraTurnChance > 0 && this.rng() < extraTurnChance) {
      this.pendingExtraTurns.push(actor);
    }
    for (const holder of this.units) {
      if (!holder.alive || holder === actor) continue;
      const passive = passiveEffectOf(holder);
      if (!passive) continue;
      if (passive.kind === "TIME_KEEPER" && holder.team === actor.team) {
        this.gainGauge(holder, passive.allyGauge, `${this.label(holder)} の「時の管理者」で行動ゲージが進んだ！`);
      }
      if (passive.kind === "GAUGE_ON_SLOWED_ENEMY_ACT" && holder.team !== actor.team) {
        const slowed = actor.effects.some((effect) => effect.kind === "DEBUFF" && effect.stat === "spd");
        if (slowed) this.gainGauge(holder, passive.gauge, `${this.label(holder)} の「蛇王の支配」で行動ゲージが進んだ！`);
      }
    }
  }

  /** 敵が毒ダメージを受けた時に呼ぶ。**その敵の手番につき1回**(毒は手番開始時にしか刻まれない) */
  private onPoisonDamage(victim: BattleUnit): void {
    for (const holder of this.units) {
      if (!holder.alive || holder.team === victim.team) continue;
      const passive = passiveEffectOf(holder);
      if (passive?.kind !== "GAUGE_ON_ENEMY_POISON") continue;
      this.gainGauge(holder, passive.gauge, `${this.label(holder)} の「菌糸支配」で行動ゲージが進んだ！`);
    }
  }

  /**
   * 攻撃を受けた時に呼ぶ。**1回の攻撃(=攻撃者の1行動)につき1度だけ。**
   * 多段で殴られるたびに回復や反撃が返ると、手数の多い相手ほど損をする。
   */
  private onDamaged(victim: BattleUnit, attacker: BattleUnit | undefined, resolutionKey: SkillResolution | null): void {
    // 潜在能力で溜まる「次のスキル1への上乗せ」は、被弾のたびに1段ずつ増える
    const latent = victim.def.latentAbility;
    if (latent?.chargeOnHit) {
      victim.latentChargeBonus = Math.min(latent.chargeOnHit.maxBonus, victim.latentChargeBonus + latent.chargeOnHit.perHit);
    }
    if (victim.hitGaugeTurns > 0 && victim.alive) this.gainGauge(victim, victim.hitGaugeAmount);
    if (!attacker?.alive || !victim.alive) return;
    const passive = passiveEffectOf(victim);
    const already = resolutionKey?.victimPassiveUsed.has(victim.instanceId) ?? false;
    if (passive?.kind === "FALSE_TREASURE" && !already) {
      resolutionKey?.victimPassiveUsed.add(victim.instanceId);
      const healAmount = Math.round(victim.maxHp * passive.heal);
      applyHeal(victim, healAmount);
      this.push(`  → ${this.label(victim)} の「偽りの財宝」でHPが ${healAmount} 回復！ (${victim.currentHp}/${victim.maxHp})`);
      this.pushEvent({ targetId: victim.instanceId, kind: "HEAL", amount: healAmount });
      if (!this.isImmune(attacker) && this.rollEffectSuccess(victim, attacker, passive.chance)) {
        attacker.effects.push({ stat: "atk", amount: -passive.atkDown, remainingTurns: passive.duration, kind: "DEBUFF" });
        this.push(`  → ${this.label(attacker)} の ATK が低下！ (${passive.duration}ターン)`);
      }
    }
  }

  /** 味方(自分を含む)がHP閾値を割った時に呼ぶ。ヴァルキリアの「戦乙女の誓い」 */
  private onAllyHpThreshold(victim: BattleUnit): void {
    if (!victim.alive) return;
    for (const holder of this.units) {
      if (!holder.alive || holder.team !== victim.team) continue;
      const passive = passiveEffectOf(holder);
      if (passive?.kind !== "VALKYRIE_OATH") continue;
      if (holder.passiveCooldown > 0) continue;
      if (hpRatio(victim) > passive.hpRatio) continue;
      holder.passiveCooldown = passive.internalCooldown;
      // 無敵は1ターン固定。Lv5でも伸ばさない(依頼主の指定)
      applyStatus(victim, "INVINCIBLE", 1, holder.instanceId);
      const healAmount = Math.round(holder.maxHp * passive.heal);
      applyHeal(victim, healAmount);
      this.push(`  → ${this.label(holder)} の「戦乙女の誓い」！ ${this.label(victim)} は1ターン無敵になり、HPが ${healAmount} 回復！`);
      this.pushEvent({ targetId: victim.instanceId, kind: "HEAL", amount: healAmount });
      return;
    }
  }

  /** 敵を倒した時に呼ぶ。フェンリルの「群狼の本能」は倒すたびに追加ターンを得る */
  private onKill(killer: BattleUnit | undefined): void {
    if (!killer?.alive) return;
    const passive = passiveEffectOf(killer);
    if (passive?.kind !== "PACK_INSTINCT") return;
    this.pendingExtraTurns.push(killer);
  }

  /** 攻撃1回の解決後に、祝福セットと支援型魔獣の一度きり回復を判定する。 */
  private tryThresholdHeals(victim: BattleUnit): void {
    if (!victim.alive) return;

    const mods = victim.def.combatMods;
    if (!victim.thresholdHealUsed
      && (mods?.thresholdHealPercent ?? 0) > 0
      && hpRatio(victim) <= (mods?.thresholdHealHpRatio ?? 0)
      && !(victim.healBlockTurns > 0 && victim.healBlockMultiplier <= 0)) {
      victim.thresholdHealUsed = true;
      const before = victim.currentHp;
      applyHeal(victim, Math.round(victim.maxHp * (mods?.thresholdHealPercent ?? 0)));
      const healed = victim.currentHp - before;
      this.push(`  → ${this.label(victim)} の祝福が発動！ HPが ${healed} 回復！`);
      this.pushEvent({ targetId: victim.instanceId, kind: "HEAL", amount: healed });
    }

    for (const holder of this.units) {
      const trait = holder.def.bossTraits?.allyThresholdHeal;
      if (!trait || holder.team !== victim.team || !holder.alive || holder.allyThresholdHealUsed) continue;
      if (hpRatio(victim) > trait.hpRatio) continue;
      if (victim.healBlockTurns > 0 && victim.healBlockMultiplier <= 0) continue;
      holder.allyThresholdHealUsed = true;
      const before = victim.currentHp;
      applyHeal(victim, Math.round(victim.maxHp * trait.healPercent));
      const healed = victim.currentHp - before;
      this.push(`  → ${this.label(holder)} の「生命の祝福」！ ${this.label(victim)} のHPが ${healed} 回復！`);
      this.pushEvent({ targetId: victim.instanceId, kind: "HEAL", amount: healed });
      break;
    }
  }

  /**
   * 効果の向き先から、実際の受け手を決める。
   *
   * **ここ1本に集約してある。** 効果ごとに三項演算子を書き写していた頃は、
   * 新しい向き先を足すたびに書き漏らした場所だけが古い挙動のまま残った。
   */
  private receiversFor(source: BattleUnit, target: BattleUnit, applyTo: EffectApplyTo | undefined): BattleUnit[] {
    if (applyTo === "SELF") return [source];
    if (applyTo === "ALLIES") return this.units.filter((unit) => unit.team === source.team && unit.alive);
    if (applyTo === "LOWEST_HP_ALLY") {
      const allies = this.units.filter((unit) => unit.team === source.team && unit.alive);
      if (allies.length === 0) return [];
      return [allies.reduce((lowest, unit) => (hpRatio(unit) < hpRatio(lowest) ? unit : lowest), allies[0])];
    }
    return [target];
  }

  /** ゲージを増やす。100を超えて溜め込まないよう、増やす側は必ずここを通す */
  private gainGauge(unit: BattleUnit, amount: number, message?: string): void {
    if (!unit.alive || amount === 0) return;
    unit.gauge = Math.max(0, Math.min(ATB_THRESHOLD, unit.gauge + amount * ATB_THRESHOLD));
    if (message) this.push(`  → ${message}`);
  }

  private trialBoss(): BattleUnit | undefined {
    return this.units.find((u) => u.team === "ENEMY" && u.def.victoryTarget);
  }

  private isTower70Boss(unit: BattleUnit): boolean {
    return this.trialTowerFloor === 70 && unit === this.trialBoss();
  }

  /** 70階のHP帯強化。段階は加算ではなく置き換え。 */
  private tower70Tier(unit: BattleUnit): { atk: number; spd: number; hpFactor: number } {
    const ratio = hpRatio(unit);
    if (ratio <= 0.30) return { atk: 1500, spd: 45, hpFactor: 2.50 };
    if (ratio <= 0.50) return { atk: 1000, spd: 25, hpFactor: 1.60 };
    if (ratio <= 0.70) return { atk: 500, spd: 10, hpFactor: 1.30 };
    return { atk: 0, spd: 0, hpFactor: 1 };
  }

  private syncTower70BossTier(unit: BattleUnit): void {
    if (!this.isTower70Boss(unit) || !unit.alive) return;
    const tier = this.tower70Tier(unit);
    unit.flatStatBonus.atk = tier.atk;
    unit.flatStatBonus.spd = tier.spd;
  }

  private tower70HpCoefficientFactor(unit: BattleUnit): number {
    return this.isTower70Boss(unit) ? this.tower70Tier(unit).hpFactor : 1;
  }

  /* ======================================================================
   * 90階「狂化」。**お供を倒すとボスが強くなる階。**
   *
   * ここに書いてあるのは、3スキル枠に収まらない階固有の仕掛けだけ。
   * ダメージ計算も命中も抵抗もエンジンのまま——独自の計算式は1つも足さない。
   * **どのメソッドも `trialTowerFloor === 90` で入口を閉じてある。**
   * =================================================================== */

  private isTower90Boss(unit: BattleUnit): boolean {
    return this.trialTowerFloor === 90 && unit === this.trialBoss();
  }

  /** その名前のお供が生きているか。並び順ではなくスキルIDで見分ける */
  private tower90EscortAlive(skillId: string): boolean {
    return this.units.some((unit) =>
      unit.team === "ENEMY" && unit.alive && unit.def.skills.some((skill) => skill.id === skillId));
  }

  /**
   * 倒したお供の数。**一度倒れた相手を覚えておく。**
   *
   * 生存数から引く形にすると、蘇生や再戦で数が戻った時に狂化も戻ってしまう。
   * 「1体倒すごとに永久加算」なので、**戻らないこと**が仕様の一部。
   * 覚えておく場所はエンジンのインスタンスなので、
   * 戦闘をやり直せば新しいエンジンとともに白紙へ戻る(二重適用しない)。
   */
  private tower90CountEscortDeaths(): number {
    if (this.trialTowerFloor !== 90) return 0;
    for (const unit of this.units) {
      if (unit.team !== "ENEMY" || unit.alive || unit.def.victoryTarget) continue;
      this.tower90DeadEscortIds.add(unit.instanceId);
    }
    return this.tower90DeadEscortIds.size;
  }

  /**
   * ボスの狂化を張り直す。**HP帯とお供死亡は別枠で、同時に効く。**
   * HP帯は加算式(70%以下 +1,000 / 40%以下 さらに +2,000 / 20%以下 さらに +2,000)。
   */
  private syncTower90Boss(unit: BattleUnit): void {
    if (!this.isTower90Boss(unit) || !unit.alive) return;
    const ratio = hpRatio(unit);
    let atk = 0;
    let spd = 0;
    if (ratio <= 0.70) { atk += TOWER90_RAGE_HP70_ATK; spd += TOWER90_RAGE_HP70_SPD; }
    if (ratio <= 0.40) { atk += TOWER90_RAGE_HP40_ATK; spd += TOWER90_RAGE_HP40_SPD; }
    if (ratio <= 0.20) { atk += TOWER90_RAGE_HP20_ATK; spd += TOWER90_RAGE_HP20_SPD; }

    const kills = this.tower90CountEscortDeaths();
    unit.flatStatBonus.atk = atk + kills * TOWER90_ESCORT_DEATH_ATK;
    unit.flatStatBonus.spd = spd + kills * TOWER90_ESCORT_DEATH_SPD;
    unit.flatStatBonus.criRate = kills * TOWER90_ESCORT_DEATH_CRI_RATE;
    unit.flatStatBonus.criDmg = kills * TOWER90_ESCORT_DEATH_CRI_DMG;
  }

  /**
   * ボスの与ダメージ倍率。**段階式で、掛け算では積まない。**
   * 40%以下は×1.25、20%以下は×1.5(1.25×1.5=1.875 にはしない)。
   * 40%より上の×0.90は序盤の抑制で、これが無いと判断する前に押し切られる。
   */
  private tower90BossDamageFactor(unit: BattleUnit): number {
    if (!this.isTower90Boss(unit)) return 1;
    const ratio = hpRatio(unit);
    if (ratio <= 0.20) return TOWER90_RAGE_HP20_DAMAGE_FACTOR;
    if (ratio <= 0.40) return TOWER90_RAGE_HP40_DAMAGE_FACTOR;
    return TOWER90_EARLY_DAMAGE_FACTOR;
  }

  /** 戦鼓晶が倒れた後、狂牙獣が生きている間だけ乗る強化 */
  private syncTower90Fang(): void {
    if (this.trialTowerFloor !== 90) return;
    const fang = this.units.find((unit) =>
      unit.team === "ENEMY" && unit.def.skills.some((skill) => skill.id === TOWER90_FANG_EXECUTE_SKILL_ID));
    if (!fang) return;
    const enraged = fang.alive && !this.tower90EscortAlive(TOWER90_WAR_DRUM_TEMPO_SKILL_ID);
    fang.flatStatBonus.atk = enraged ? TOWER90_FANG_RAGE_ATK : 0;
    fang.flatStatBonus.spd = enraged ? TOWER90_FANG_RAGE_SPD : 0;
  }

  /** 戦鼓晶が倒れていて狂牙獣が生きているか(処刑突撃だけを2.9倍にする条件) */
  private isTower90FangEnraged(unit: BattleUnit): boolean {
    if (this.trialTowerFloor !== 90 || !unit.alive) return false;
    if (!unit.def.skills.some((skill) => skill.id === TOWER90_FANG_EXECUTE_SKILL_ID)) return false;
    return !this.tower90EscortAlive(TOWER90_WAR_DRUM_TEMPO_SKILL_ID);
  }

  /**
   * 戦鼓晶S3「血戦共鳴」の、**ボスにだけ渡すぶん。**
   * 全体へのゲージ30%はスキル定義の側が配る。ここはボス限定の上乗せで、
   * お供へCT短縮を配ってしまうと縛晶の妨害まで回転が上がって別物の階になる。
   */
  private applyTower90WarDrumTempo(): void {
    const boss = this.trialBoss();
    if (!boss || !boss.alive) return;
    boss.gauge = Math.min(ATB_THRESHOLD, boss.gauge + TOWER90_WAR_DRUM_BOSS_GAUGE * ATB_THRESHOLD);
    for (let i = 0; i < boss.cooldowns.length; i += 1) {
      boss.cooldowns[i] = Math.max(0, boss.cooldowns[i] - TOWER90_WAR_DRUM_BOSS_COOLDOWN);
    }
    this.push(`  → ${this.label(boss)} は血戦共鳴で行動ゲージとスキルの回転を得た！`);
  }

  private applyTower70BossRegen(boss: BattleUnit): void {
    if (!boss.alive) return;
    const lifeAlive = this.units.some((unit) => unit.team === "ENEMY" && unit.alive && unit.def.skills.some((skill) => skill.id === "tower70_life_s2"));
    const rate = TOWER70_BOSS_REGEN + (lifeAlive ? TOWER70_LIFE_REGEN_BONUS : 0);
    const before = boss.currentHp;
    applyHeal(boss, Math.round(boss.maxHp * rate));
    const healed = boss.currentHp - before;
    if (healed > 0) {
      this.push(`${this.label(boss)} の「不滅の巨獣」でHPが ${healed} 回復！ (${boss.currentHp}/${boss.maxHp})`);
      this.pushEvent({ targetId: boss.instanceId, kind: "HEAL", amount: healed });
    } else if (before < boss.maxHp && boss.healBlockTurns > 0) {
      this.push(`${this.label(boss)} の再生は回復阻害で封じられた！`);
    }
    this.syncTower70BossTier(boss);
  }

  /** 脈動晶S2。通常ダメージではなく、現在HPの実数上位3体をその場で半分にする。 */
  private applyTower70PulseCrush(): void {
    const ranked = this.units
      .map((unit, slot) => ({ unit, slot }))
      .filter(({ unit }) => unit.team === "PLAYER" && unit.alive)
      .sort((a, b) => b.unit.currentHp - a.unit.currentHp || a.slot - b.slot)
      .slice(0, 3);
    for (const { unit } of ranked) {
      const before = unit.currentHp;
      unit.currentHp = Math.max(1, Math.floor(unit.currentHp * TOWER70_PULSE_CRUSH_RATIO));
      const removed = before - unit.currentHp;
      this.push(`  → ${this.label(unit)} の命脈が断たれ、現在HPが半減！ (${unit.currentHp}/${unit.maxHp})`);
      if (removed > 0) this.pushEvent({ targetId: unit.instanceId, kind: "DAMAGE", amount: removed });
    }
  }

  /** 始祖ベヒモスのHPが減った直後に段階更新と75/50/25%咆哮を処理する。 */
  private afterTower70BossHpChanged(boss: BattleUnit): void {
    if (!this.isTower70Boss(boss) || !boss.alive) return;
    this.syncTower70BossTier(boss);
    for (const threshold of TOWER70_ROAR_THRESHOLDS) {
      if (hpRatio(boss) > threshold || this.tower70RoaredThresholds.has(threshold)) continue;
      this.tower70RoaredThresholds.add(threshold);
      this.push(`${this.label(boss)} の「始祖の咆哮」！`);
      const targets = this.units.filter((unit) => unit.team === "PLAYER" && unit.alive);
      for (const target of targets) {
        const result = calcDamage(boss, target, {
          kind: "DAMAGE",
          multiplier: TOWER70_ROAR_MULTIPLIER,
          hpCoefficient: TOWER70_ROAR_HP_COEFFICIENT,
        }, this.rng);
        // 咆哮は割り込み攻撃。通常攻撃への反撃・反射を再帰的に呼ばない。
        const applied = this.applyIncomingDamage(target, result.damage, boss, "reflect");
        this.push(`  → ${this.label(target)} に ${applied.hpDamage} ダメージ！ (残りHP ${target.currentHp}/${target.maxHp})`);
        this.pushEvent({ targetId: target.instanceId, kind: "DAMAGE", amount: applied.hpDamage, isCrit: result.isCrit });
        target.gauge = Math.max(0, target.gauge - TOWER70_ROAR_GAUGE_DOWN * ATB_THRESHOLD);
        if (target.alive) {
          const existingDefDown = target.effects.find((effect) =>
            effect.kind === "DEBUFF"
            && effect.stat === "def"
            && effect.amount === -TOWER70_ROAR_DEF_DOWN
          );
          if (existingDefDown) {
            existingDefDown.remainingTurns = Math.max(existingDefDown.remainingTurns, TOWER70_ROAR_DEF_DOWN_TURNS);
          } else {
            target.effects.push({
              kind: "DEBUFF",
              stat: "def",
              amount: -TOWER70_ROAR_DEF_DOWN,
              remainingTurns: TOWER70_ROAR_DEF_DOWN_TURNS,
            });
          }
        }
      }
    }
  }

  /** 実際に行動できるボスターンだけ発火する。従ってスタン中は70F超再生も進行しない。 */
  private applyTrialBossAction(unit: BattleUnit): void {
    if (!this.trialTowerFloor || unit !== this.trialBoss()) return;
    this.trialBossTurns += 1;
    const ratio = hpRatio(unit);
    if (this.trialTowerFloor === 70) {
      // 旧実装の「毎手番72%超再生」は廃止。V7確定仕様は行動終了時3%（生命晶生存中は7%）。
      this.syncTower70BossTier(unit);
      return;
    }
    const healing = this.trialTowerFloor === 100 && ratio >= 0.7;
    if (healing) {
      const before = unit.currentHp;
      applyHeal(unit, Math.round(unit.maxHp * 0.72));
      const amount = unit.currentHp - before;
      this.push(`${this.label(unit)} の超再生が発動！ HPが ${amount} 回復！`);
      this.pushEvent({ targetId: unit.instanceId, kind: "HEAL", amount });
    }
    const immunity = this.trialTowerFloor === 80 || (this.trialTowerFloor === 100 && ratio < 0.7 && ratio >= 0.4);
    if (immunity && (this.trialBossTurns === 1 || this.trialBossTurns % 4 === 0)) {
      unit.immuneTurns = Math.max(unit.immuneTurns, 3);
      this.push(`${this.label(unit)} は状態異常免疫を展開した！`);
    }
    if (this.trialTowerFloor === 90) {
      /*
       * **旧実装の「8手番目にATK+200%/SPD+100%」は廃止。**
       * V7の狂化はHP帯とお供の死亡で決まるので、手番数では動かさない。
       */
      this.syncTower90Boss(unit);
      this.syncTower90Fang();
      return;
    }
    const enrage = this.trialTowerFloor === 100 && ratio < 0.4 && !unit.effects.some((e) => e.remainingTurns === 999);
    if (enrage) {
      unit.effects.push({ kind: "BUFF", stat: "atk", amount: 2, remainingTurns: 999 });
      unit.effects.push({ kind: "BUFF", stat: "spd", amount: 1, remainingTurns: 999 });
      this.push(`${this.label(unit)} は狂化段階へ移行した！`);
    }
    if (this.trialTowerFloor === 100 && ratio < 0.1 && !unit.effects.some((e) => e.stat === "def" && e.remainingTurns === 998)) {
      unit.effects.push({ kind: "BUFF", stat: "atk", amount: 2, remainingTurns: 998 });
      unit.effects.push({ kind: "BUFF", stat: "def", amount: 2, remainingTurns: 998 });
      unit.effects.push({ kind: "BUFF", stat: "spd", amount: 1, remainingTurns: 998 });
      this.push(`${this.label(unit)} は最終強化段階へ移行した！`);
    }
  }

  private act(unit: BattleUnit, choice?: ManualChoice): void {
    let skill: Skill;
    let index: 0 | 1 | 2;
    // パッシブの枠は「使う」ものではない。手で選ばれてもAIの判断へ落とす
    const passiveChoice = choice !== undefined && (unit.def.skills[choice.skillIndex]?.passive !== undefined || unit.def.skills[choice.skillIndex]?.automatic === true);
    if (!passiveChoice && choice && unit.cooldowns[choice.skillIndex] === 0 && (!hasStatus(unit, "SKILL_LOCK") || choice.skillIndex === 0)) {
      skill = unit.def.skills[choice.skillIndex];
      index = choice.skillIndex;
    } else {
      if (choice && hasStatus(unit, "SKILL_LOCK") && choice.skillIndex !== 0) {
        this.push(`  → ${this.label(unit)} はスキル使用不可のためスキル1を使用する！`);
      }
      ({ skill, index } = chooseSkill(unit, this.units));
    }

    const latent = index === 0 && unit.def.latentAbility?.skillSlot === 0 ? unit.def.latentAbility : undefined;
    /*
     * 潜在能力で溜めた「次のスキル1への上乗せ」は、**スキル1を撃った時に使い切る。**
     * 溜まったまま他の技へ持ち越すと、被弾を重ねてから必殺技、という一方通行になる。
     */
    const charge = index === 0 ? unit.latentChargeBonus : 0;
    let resolvedSkill = this.applyChargeToSkill(latent ? this.applyLatentToSkill(skill, latent) : skill, charge);
    // 70階はHPが減るほど「HP比例部分だけ」が30%/60%/150%強くなる。
    // 咆哮はここを通らないので、咆哮の最大HP5%は常に固定。
    if (this.isTower70Boss(unit)) {
      this.syncTower70BossTier(unit);
      const hpFactor = this.tower70HpCoefficientFactor(unit);
      if (hpFactor !== 1) {
        resolvedSkill = {
          ...resolvedSkill,
          effects: resolvedSkill.effects.map((effect) => effect.kind === "DAMAGE" && effect.hpCoefficient !== undefined
            ? { ...effect, hpCoefficient: effect.hpCoefficient * hpFactor }
            : effect),
        };
      }
    }
    /*
     * 90階。**ボスは与ダメージの倍率そのものが動く。**
     * HP40%より上は×0.90(序盤の抑制)、40%以下は×1.25、20%以下は×1.5。
     * 段階式なので 1.25×1.5 にはならない。
     */
    if (this.isTower90Boss(unit)) {
      this.syncTower90Boss(unit);
      const factor = this.tower90BossDamageFactor(unit);
      if (factor !== 1) {
        resolvedSkill = {
          ...resolvedSkill,
          effects: resolvedSkill.effects.map((effect) => effect.kind === "DAMAGE"
            ? { ...effect, multiplier: effect.multiplier * factor }
            : effect),
        };
      }
    }
    /*
     * 狂牙獣の処刑突撃だけ 2.6 → 2.9 倍。**S1・S2は据え置く。**
     * 全部を底上げすると「瀕死を刈る役」ではなくただの高火力役になる。
     */
    if (skill.id === TOWER90_FANG_EXECUTE_SKILL_ID && this.isTower90FangEnraged(unit)) {
      resolvedSkill = {
        ...resolvedSkill,
        effects: resolvedSkill.effects.map((effect) => effect.kind === "DAMAGE"
          ? { ...effect, multiplier: TOWER90_FANG_EXECUTE_RAGE_MULTIPLIER }
          : effect),
      };
    }
    const tower70BossS3AboveHalf = this.isTower70Boss(unit)
      && skill.id === "tower70_behemoth_s3"
      && hpRatio(unit) >= 0.5;
    const ignoreChance = Math.max(unit.def.combatMods?.defenseIgnoreChance ?? 0, unit.def.bossTraits?.defenseIgnoreChance ?? 0);
    const ignoreRatio = Math.max(unit.def.combatMods?.defenseIgnoreRatio ?? 0, unit.def.bossTraits?.defenseIgnoreRatio ?? 0);
    if (ignoreChance > 0 && ignoreRatio > 0 && resolvedSkill.effects.some((effect) => effect.kind === "DAMAGE") && this.rng() < ignoreChance) {
      resolvedSkill = { ...resolvedSkill, effects: resolvedSkill.effects.map((effect) => effect.kind === "DAMAGE"
        ? { ...effect, ignoreDefenseRatio: Math.max(effect.ignoreDefenseRatio ?? 0, ignoreRatio) }
        : effect) };
    }
    if (index === 0) unit.latentChargeBonus = 0;
    let targets: BattleUnit[];
    if (skill.randomEnemyHits) {
      const enemies = this.units.filter((candidate) => candidate.team !== unit.team && candidate.alive);
      const hitCount = resolvedSkill.effects.find((effect) => effect.kind === "DAMAGE")?.hits ?? 1;
      targets = Array.from({ length: hitCount }, () => enemies[Math.floor(this.rng() * enemies.length)]).filter(Boolean);
      resolvedSkill = { ...resolvedSkill, effects: resolvedSkill.effects.map((effect) => effect.kind === "DAMAGE" ? { ...effect, hits: 1 } : effect) };
    } else if (choice?.targetId && (skill.target === "SINGLE_ENEMY" || skill.target === "SINGLE_ALLY")) {
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
    const aoeConverted = Boolean(latent?.aoeConversion && skill.target === "SINGLE_ENEMY");
    if (aoeConverted && targets[0]) {
      const primary = targets[0];
      targets = [primary, ...this.units.filter((candidate) => candidate.team !== unit.team && candidate.alive && candidate !== primary)];
    }
    if (targets.length === 0) return;

    if (skill.cooldownTurns > 0) {
      unit.cooldowns[index] = skill.cooldownTurns;
    }

    this.push(`${this.label(unit)} の「${skill.name}」！`);

    if (this.trialTowerFloor === 70 && unit.team === "ENEMY" && skill.id === "tower70_pulse_s2") {
      this.applyTower70PulseCrush();
      return;
    }
    // 90階の戦鼓晶S3。全体ゲージ30%はスキル定義が配り、ここはボス限定の上乗せ
    const tower90WarDrumTempo = this.trialTowerFloor === 90
      && unit.team === "ENEMY"
      && skill.id === TOWER90_WAR_DRUM_TEMPO_SKILL_ID;

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
    const resolution = newResolution();
    const previousResolution = this.resolution;
    this.resolution = resolution;
    const hpBeforeSkill = new Map(targets.map((target) => [target.instanceId, target.currentHp]));
    targets.forEach((target, i) => {
      const targetSkill = aoeConverted && latent?.aoeConversion ? { ...resolvedSkill, effects: resolvedSkill.effects
        .filter((effect) => i === 0 || latent.aoeConversion?.nativeEffectTarget !== "PRIMARY_ONLY" || effect.kind === "DAMAGE")
        .map((effect) => {
          if (effect.kind === "DAMAGE") return { ...effect, multiplier: effect.multiplier * latent.aoeConversion!.damageMultiplier };
          if (i > 0 && "chance" in effect && typeof effect.chance === "number") return { ...effect, chance: effect.chance * (latent.aoeConversion!.secondaryEffectChanceMultiplier ?? 1) };
          return effect;
        }) } : resolvedSkill;
      this.applySkillEffects(unit, target, targetSkill, missed, i === 0, latent, resolution);
    });

    if (this.isTower70Boss(unit) && skill.id === "tower70_behemoth_s3") {
      const removed = cleanseDebuffs(unit);
      if (removed > 0) this.push(`  → ${this.label(unit)} は自身の弱体効果をすべて解除した！`);
      if (tower70BossS3AboveHalf) {
        for (const enemy of this.units.filter((candidate) => candidate.team === "PLAYER" && candidate.alive)) {
          enemy.gauge = Math.max(0, enemy.gauge - 0.2 * ATB_THRESHOLD);
        }
        this.push("  → 天地崩壊で味方全体の行動ゲージが20%後退した！");
      }
    }

    for (const target of new Set(targets)) {
      if (target.currentHp < (hpBeforeSkill.get(target.instanceId) ?? target.currentHp)) this.tryThresholdHeals(target);
    }

    if (skill.extraTurnOnKill && resolution.kills > 0 && unit.alive) this.pendingExtraTurns.push(unit);

    // 攻撃スキルに乗るパッシブは、対象を全部処理してから1度だけ判定する
    if (!missed) this.applyAttackPassives(unit, targets, resolution);
    if (latent && !missed) this.applyLatentAfterSkill(unit, targets[0], latent, resolution);
    // 90階の戦鼓晶S3。全体ゲージを配り終えた後で、ボスにだけ上乗せする
    if (tower90WarDrumTempo) this.applyTower90WarDrumTempo();
    this.applyCoopAttack(unit, resolvedSkill, targets[0]);
    this.resolution = previousResolution;
  }

  /** 溜めた上乗せを、そのスキルのダメージ効果へ差し込む */
  private applyChargeToSkill(skill: Skill, charge: number): Skill {
    if (charge <= 0) return skill;
    return { ...skill, effects: skill.effects.map((effect) => (
      effect.kind === "DAMAGE" ? { ...effect, finalDamageBonus: (effect.finalDamageBonus ?? 0) + charge } : effect
    )) };
  }

  /**
   * 攻撃スキルの使用に紐づくパッシブ。**1スキル使用につき1回**しか判定しない。
   *
   * ここを対象ごとに回すと、全体技を持つモンスターだけが4倍おいしくなる。
   * 依頼主の指定どおり、ゲージ吸収も追加デバフも1回に固定してある。
   */
  private applyAttackPassives(source: BattleUnit, targets: BattleUnit[], resolution: SkillResolution): void {
    const passive = passiveEffectOf(source);
    if (!passive || resolution.sourcePassiveUsed) return;
    const primary = targets.find((target) => target.alive && target.team !== source.team) ?? targets[0];
    if (!primary || primary.team === source.team) return;

    if (passive.kind === "THUNDER_INSTINCT" && resolution.anyCrit) {
      resolution.sourcePassiveUsed = true;
      this.drainGauge(source, primary, passive.drain);
      this.push(`  → ${this.label(source)} の「雷の本能」で行動ゲージを吸収した！`);
    }
    if (passive.kind === "TIME_KEEPER" && resolution.damageDealt > 0) {
      resolution.sourcePassiveUsed = true;
      this.drainGauge(source, primary, passive.drain);
      this.push(`  → ${this.label(source)} の「時の管理者」で行動ゲージを吸収した！`);
      if (primary.alive && !this.isImmune(primary) && this.rollEffectSuccess(source, primary, passive.stunChance)) {
        primary.stunTurns = Math.max(primary.stunTurns, 1);
        this.push(`  → ${this.label(primary)} はスタンした！`);
      }
    }
    if (passive.kind === "REAPER_HARVEST" && resolution.damageDealt > 0 && primary.alive) {
      resolution.sourcePassiveUsed = true;
      let landed = false;
      if (!this.isImmune(primary)) {
        // 強化阻害・回復阻害はどちらも1ターン固定(依頼主の指定)
        if (this.rollEffectSuccess(source, primary, passive.chance) && applyStatus(primary, "BUFF_BLOCK", 1, source.instanceId)) {
          this.push(`  → ${this.label(primary)} は強化不可になった！ (1ターン)`);
          landed = true;
        }
        if (this.rollEffectSuccess(source, primary, passive.chance)) {
          primary.healBlockTurns = Math.max(primary.healBlockTurns, 1);
          primary.healBlockMultiplier = 0;
          this.push(`  → ${this.label(primary)} は治癒阻害を受けた！ (1ターン)`);
          landed = true;
        }
      }
      if (landed) {
        const healAmount = Math.round(source.maxHp * passive.heal);
        applyHeal(source, healAmount);
        this.pushEvent({ targetId: source.instanceId, kind: "HEAL", amount: healAmount });
        this.gainGauge(source, passive.gauge);
        this.push(`  → ${this.label(source)} の「死神の収穫」でHPが ${healAmount} 回復し、行動ゲージが進んだ！`);
      }
    }
  }

  /** 相手のゲージを減らし、減らした分をそのまま自分へ移す */
  private drainGauge(source: BattleUnit, target: BattleUnit, ratio: number): number {
    if (!target.alive || ratio <= 0) return 0;
    const before = target.gauge;
    target.gauge = Math.max(0, target.gauge - ratio * ATB_THRESHOLD);
    const stolen = before - target.gauge;
    source.gauge = Math.max(0, Math.min(ATB_THRESHOLD, source.gauge + stolen));
    return stolen / ATB_THRESHOLD;
  }

  /**
   * 協力攻撃。呼ばれた味方は**それぞれのスキル1**で同じ相手を殴る。
   *
   * `coopDepth` で入れ子を止めている。呼ばれた側のスキル1が
   * また協力攻撃を呼べる形にすると、編成次第で無限に連鎖する。
   */
  private applyCoopAttack(source: BattleUnit, skill: Skill, target: BattleUnit | undefined): void {
    const coop = skill.effects.find((effect): effect is Extract<SkillEffect, { kind: "COOP_ATTACK" }> => effect.kind === "COOP_ATTACK");
    if (!coop || !target || this.coopDepth > 0) return;
    const helpers = this.units
      .filter((unit) => unit.team === source.team && unit.alive && unit !== source && unit.stunTurns <= 0)
      .sort((a, b) => getEffectiveStat(b, "atk") - getEffectiveStat(a, "atk"))
      .slice(0, Math.max(0, coop.allies));
    if (helpers.length === 0) return;

    this.coopDepth += 1;
    try {
      for (const helper of helpers) {
        if (!target.alive) break;
        this.push(`  → ${this.label(helper)} が協力攻撃に加わった！`);
        const helperSkill = helper.def.skills[0];
        const helperLatent = helper.def.latentAbility?.skillSlot === 0 ? helper.def.latentAbility : undefined;
        const resolved = this.applyChargeToSkill(
          helperLatent ? this.applyLatentToSkill(helperSkill, helperLatent) : helperSkill,
          helper.latentChargeBonus,
        );
        helper.latentChargeBonus = 0;
        const resolution = newResolution();
        const previous = this.resolution;
        this.resolution = resolution;
        this.applySkillEffects(helper, target, resolved, false, true, helperLatent, resolution);
        this.applyAttackPassives(helper, [target], resolution);
        if (helperLatent) this.applyLatentAfterSkill(helper, target, helperLatent, resolution);
        this.resolution = previous;
        if (coop.allyCooldownReduce) {
          helper.cooldowns = helper.cooldowns.map((c) => Math.max(0, c - coop.allyCooldownReduce!)) as [number, number, number];
        }
      }
    } finally {
      this.coopDepth -= 1;
    }
  }

  /** ダメージ式・既存デバフ確率へ入る潜在だけを、元のS1を変更せず合成する。 */
  private applyLatentToSkill(skill: Skill, latent: LatentAbilityCandidate): Skill {
    let damageIndex = -1;
    return { ...skill, effects: skill.effects.map((effect) => {
      if (effect.kind === "DAMAGE") {
        damageIndex += 1;
        // 「2撃目だけ強くなる」型は、指定された順番のダメージ効果にしか乗らない
        if (latent.damageEffectIndex !== undefined && latent.damageEffectIndex !== damageIndex) return effect;
        // 「対象のHPが低いほど痛い」型の潜在は、元の段を置き換える。
        // 足すと元の段と二重に乗り、書いてある数字より大きく跳ねる
        const withStatic = {
          ...effect,
          ignoreDefenseRatio: latent.ignoreDefenseRatio ?? effect.ignoreDefenseRatio,
          debuffDamageBonus: latent.debuffDamageBonus ?? effect.debuffDamageBonus,
          finalDamageBonus: (effect.finalDamageBonus ?? 0) + (latent.flatDamageBonus ?? 0),
          conditionalBonus: latent.damageBonusWhen
            ? [...(effect.conditionalBonus ?? []), ...latent.damageBonusWhen]
            : effect.conditionalBonus,
          targetHpBonus: latent.replaceTargetHpBonus ?? effect.targetHpBonus,
          targetHpIgnoreDefense: latent.addTargetHpIgnoreDefense
            ? [...(effect.targetHpIgnoreDefense ?? []), ...latent.addTargetHpIgnoreDefense]
            : effect.targetHpIgnoreDefense,
          scaleBonus: latent.scaleBonusAdd
            ? {
              stat: latent.scaleBonusAdd.stat,
              bonusAtReference: (effect.scaleBonus?.stat === latent.scaleBonusAdd.stat ? effect.scaleBonus.bonusAtReference : 0)
                + latent.scaleBonusAdd.bonusAtReference,
            }
            : effect.scaleBonus,
        };
        if (latent.effectType === "DAMAGE_UP") return { ...withStatic, multiplier: effect.multiplier * (1 + latent.value) };
        if (latent.effectType === "HP_SCALING") return { ...withStatic, hpCoefficient: (effect.hpCoefficient ?? 0) + latent.value };
        if (latent.effectType === "DEF_SCALING") return { ...withStatic, defCoefficient: (effect.defCoefficient ?? 0) + latent.value };
        return withStatic;
      }
      if (effect.kind === "GAUGE" && latent.gaugeAmountOverride !== undefined) {
        // 符号は元のまま。減らす技の潜在で、うっかり増やす技へ化けないようにする
        const sign = effect.amount < 0 ? -1 : 1;
        return { ...effect, amount: sign * Math.abs(latent.gaugeAmountOverride) };
      }
      const bonus = latent.chanceBonus;
      if (bonus && effect.kind === bonus.effectKind && (bonus.stat === undefined || ("stat" in effect && effect.stat === bonus.stat))) {
        return { ...effect, chance: Math.min(1, (("chance" in effect ? effect.chance : undefined) ?? 1) + bonus.value) };
      }
      if (latent.effectType === "DEBUFF_CHANCE_UP" && latent.status === "DEF_DOWN"
        && effect.kind === "DEBUFF" && effect.stat === "def") {
        return { ...effect, chance: Math.min(1, (effect.chance ?? 1) + latent.value) };
      }
      return effect;
    }) };
  }

  /** 潜在能力の発動条件を、その1回の解決で起きたことに照らして判定する */
  private latentConditionMet(
    latent: LatentAbilityCandidate,
    source: BattleUnit,
    target: BattleUnit,
    resolution: SkillResolution,
  ): boolean {
    const condition = latent.condition;
    if (!condition || condition.kind === "ALWAYS") return true;
    switch (condition.kind) {
      case "ON_CRIT": return resolution.critCount >= (condition.atLeast ?? 1);
      case "ON_KILL": return resolution.kills > 0;
      case "ON_APPLIED":
        return condition.status === "ANY_DEBUFF" ? resolution.debuffApplied : resolution.applied.has(condition.status);
      case "TARGET_HP_BELOW":
        return (resolution.targetHpBefore.get(target.instanceId) ?? target.currentHp / target.maxHp) <= condition.ratio;
      case "TARGET_STATE": return evaluateTargetCondition(condition.state, source, target);
    }
  }

  /**
   * S1使用後型の単一潜在効果を解決する。将来 effects[] になった場合は、この関数を
   * 各effectについて呼ぶだけでよく、使用回数単位の入口は変えない。
   */
  private applyLatentAfterSkill(
    source: BattleUnit,
    target: BattleUnit,
    latent: LatentAbilityCandidate,
    resolution: SkillResolution,
  ): void {
    const anyCrit = resolution.anyCrit;
    const debuffApplied = resolution.debuffApplied;
    const allies = this.units.filter((unit) => unit.team === source.team && unit.alive);
    const lowestAlly = allies.reduce((lowest, unit) => hpRatio(unit) < hpRatio(lowest) ? unit : lowest, source);
    const receiver = latent.target === "SELF" ? source : latent.target === "LOWEST_HP_ALLY" ? lowestAlly : target;
    const proc = () => this.rng() < latent.chance;
    const announce = () => this.push(`  → 潜在能力「${latent.name}」が発動！`);

    // クリティカルで溜まる上乗せ・戦闘中ずっと残るクリダメは、条件判定より先に処理する
    if (latent.chargeOnCrit && resolution.critCount > 0) {
      source.latentChargeBonus = Math.min(latent.chargeOnCrit.maxBonus, source.latentChargeBonus + latent.chargeOnCrit.perHit);
    }
    if (latent.critDmgGrowth && resolution.critCount > 0) {
      source.latentCritDmgBonus = Math.min(
        latent.critDmgGrowth.maxBonus,
        source.latentCritDmgBonus + latent.critDmgGrowth.perCrit * resolution.critCount,
      );
    }
    if (latent.oneShotMitigate) source.latentOneShotMitigate = latent.oneShotMitigate;

    // 条件と内部クールタイムは**1スキル使用につき1回**だけ見る。多段でも増えない
    if (!this.latentConditionMet(latent, source, target, resolution)) return;
    if (latent.internalCooldown && source.latentCooldown > 0) return;
    if (latent.internalCooldown && (latent.runtimeEffects?.length ?? 0) > 0) source.latentCooldown = latent.internalCooldown;

    for (const effect of latent.runtimeEffects ?? []) {
      if (effect.kind === "SELF_GAUGE") {
        this.gainGauge(source, effect.value); announce();
      } else if (effect.kind === "SELF_HEAL") {
        const amount = Math.round(source.maxHp * effect.value);
        applyHeal(source, amount);
        this.pushEvent({ targetId: source.instanceId, kind: "HEAL", amount });
        announce();
      } else if (effect.kind === "LIFESTEAL") {
        if (resolution.damageDealt > 0) {
          const amount = Math.round(resolution.damageDealt * effect.value);
          applyHeal(source, amount);
          this.pushEvent({ targetId: source.instanceId, kind: "HEAL", amount });
          announce();
        }
      } else if (effect.kind === "SELF_CLEANSE") {
        if (cleanseDebuffs(source, effect.count) > 0) announce();
      } else if (effect.kind === "SELF_SHIELD") {
        source.shieldValue = Math.max(source.shieldValue, Math.round(source.maxHp * effect.value));
        source.shieldTurns = Math.max(source.shieldTurns, effect.duration);
        announce();
      } else if (effect.kind === "LOWEST_ALLY_HEAL") {
        const amount = Math.round(lowestAlly.maxHp * effect.value);
        applyHeal(lowestAlly, amount);
        this.pushEvent({ targetId: lowestAlly.instanceId, kind: "HEAL", amount });
        announce();
      } else if (effect.kind === "LOWEST_ALLY_GAUGE") {
        const extra = effect.whenAllyHpBelow !== undefined && hpRatio(lowestAlly) <= effect.whenAllyHpBelow ? (effect.extra ?? 0) : 0;
        this.gainGauge(lowestAlly, effect.value + extra); announce();
      } else if (effect.kind === "LOWEST_ALLY_CLEANSE") {
        if (cleanseDebuffs(lowestAlly, effect.count) > 0) announce();
      } else if (effect.kind === "LOWEST_ALLY_SHIELD") {
        if (!hasStatus(lowestAlly, "BUFF_BLOCK")) {
          lowestAlly.shieldValue = Math.max(lowestAlly.shieldValue, Math.round(source.maxHp * effect.value));
          lowestAlly.shieldTurns = Math.max(lowestAlly.shieldTurns, effect.duration);
          announce();
        }
      } else if (effect.kind === "LOWEST_ALLY_MITIGATE") {
        lowestAlly.mitigateAmount = Math.max(lowestAlly.mitigateAmount, effect.value);
        lowestAlly.mitigateTurns = Math.max(lowestAlly.mitigateTurns, effect.duration);
        announce();
      } else if (effect.kind === "LOWEST_ALLY_BUFF") {
        if (!hasStatus(lowestAlly, "BUFF_BLOCK")) {
          lowestAlly.effects.push({ stat: effect.stat, amount: effect.amount, remainingTurns: effect.duration, kind: "BUFF" });
          announce();
        }
      } else if (effect.kind === "ALLY_HEAL") {
        for (const ally of allies) {
          const amount = Math.round(ally.maxHp * effect.value);
          applyHeal(ally, amount);
          this.pushEvent({ targetId: ally.instanceId, kind: "HEAL", amount });
        }
        announce();
      } else if (effect.kind === "GAUGE_DRAIN_SHARE") {
        if (resolution.gaugeRemoved > 0) { this.gainGauge(source, resolution.gaugeRemoved * effect.value); announce(); }
      } else if (effect.kind === "STEAL_BUFF") {
        if (receiver.alive && stealBuffs(receiver, source, effect.count) > 0) announce();
      } else if (effect.kind === "STRIP") {
        if (receiver.alive && this.rollEffectSuccess(source, receiver, effect.chance) && stripBuffs(receiver, effect.count)) announce();
      } else if (effect.kind === "GAUGE_DOWN") {
        if (receiver.alive && this.rng() < effect.chance) { receiver.gauge = Math.max(0, receiver.gauge - effect.value * ATB_THRESHOLD); announce(); }
      } else if (effect.kind === "DEBUFF") {
        if (!receiver.alive || this.isImmune(receiver) || !this.rollEffectSuccess(source, receiver, effect.chance)) continue;
        if (effect.status === "HEAL_BLOCK") { receiver.healBlockTurns = Math.max(receiver.healBlockTurns, effect.duration); receiver.healBlockMultiplier = 0; }
        else if (effect.status === "SPD_DOWN") receiver.effects.push({ stat: "spd", amount: -.3, remainingTurns: effect.duration, kind: "DEBUFF" });
        // 攻撃DOWN・防御DOWNは50%固定(依頼主の指定)
        else if (effect.status === "ATK_DOWN") receiver.effects.push({ stat: "atk", amount: -.5, remainingTurns: effect.duration, kind: "DEBUFF" });
        else if (effect.status === "DEF_DOWN") receiver.effects.push({ stat: "def", amount: -.5, remainingTurns: effect.duration, kind: "DEBUFF" });
        else if (effect.status === "POISON") { receiver.poisonStacks = Math.min(5, receiver.poisonStacks + 1); receiver.poisonTurns = Math.max(receiver.poisonTurns, effect.duration); receiver.poisonDamageRate = effect.value ?? .05; }
        else if (effect.status === "STUN") receiver.stunTurns = Math.max(receiver.stunTurns, effect.duration);
        else applyStatus(receiver, "BUFF_BLOCK", effect.duration, source.instanceId);
        announce();
      } else if (effect.kind === "ALLY_GAUGE_UP") {
        if (this.rng() < effect.chance) { for (const ally of allies) ally.gauge = Math.min(ATB_THRESHOLD, ally.gauge + effect.value * ATB_THRESHOLD); announce(); }
      } else if (effect.kind === "DEBUFF_EXTEND") {
        if (receiver.alive && this.rng() < effect.chance) { receiver.effects.filter((e) => e.kind === "DEBUFF").forEach((e) => e.remainingTurns += effect.duration); receiver.statusEffects.filter((e) => e.category === "DEBUFF").forEach((e) => e.remainingTurns += effect.duration); if (receiver.poisonTurns) receiver.poisonTurns += effect.duration; if (receiver.healBlockTurns) receiver.healBlockTurns += effect.duration; announce(); }
      } else if (effect.kind === "HEAL_CLEANSE") {
        applyHeal(lowestAlly, Math.round(lowestAlly.maxHp * effect.value));
        cleanseDebuffs(lowestAlly, 1);
        announce();
      } else if (effect.kind === "REGEN" && !hasStatus(lowestAlly, "BUFF_BLOCK")) {
        lowestAlly.regenRate = Math.max(lowestAlly.regenRate, effect.value); lowestAlly.regenTurns = Math.max(lowestAlly.regenTurns, effect.duration); announce();
      } else if (effect.kind === "SHIELD" && !hasStatus(lowestAlly, "BUFF_BLOCK")) {
        lowestAlly.shieldValue = Math.max(lowestAlly.shieldValue, Math.round(lowestAlly.maxHp * effect.value)); lowestAlly.shieldTurns = Math.max(lowestAlly.shieldTurns, effect.duration); announce();
      }
    }

    switch (latent.effectType) {
      case "DAMAGE_UP": case "CRIT_TRIGGER": case "HP_SCALING": case "DEF_SCALING": case "DEBUFF_CHANCE_UP":
        return;
      case "ADD_DEBUFF": {
        if (!receiver.alive || this.isImmune(receiver)) return;
        // 正式な基礎発動率→命中/抵抗の共通経路を必ず使う。
        if (!this.rollEffectSuccess(source, receiver, latent.chance)) return;
        if (latent.status === "SPD_DOWN" || latent.status === "ATK_DOWN" || latent.status === "DEF_DOWN") {
          const stat = latent.status === "SPD_DOWN" ? "spd" : latent.status === "ATK_DOWN" ? "atk" : "def";
          receiver.effects.push({ stat, amount: -0.3, remainingTurns: latent.duration, kind: "DEBUFF" });
        } else if (latent.status === "HEAL_BLOCK") {
          receiver.healBlockTurns = Math.max(receiver.healBlockTurns, latent.duration);
          receiver.healBlockMultiplier = 0;
        } else if (latent.status === "BLIND") {
          receiver.blindTurns = Math.max(receiver.blindTurns, latent.duration);
        } else if (latent.status && latent.status in STATUS_EFFECT_CATEGORY) {
          applyStatus(receiver, latent.status as keyof typeof STATUS_EFFECT_CATEGORY, latent.duration, source.instanceId);
        } else return;
        announce();
        return;
      }
      case "TURN_METER_DOWN":
        if (receiver.alive && proc()) { receiver.gauge = Math.max(0, receiver.gauge - latent.value * ATB_THRESHOLD); announce(); }
        return;
      case "SELF_HEAL": case "ALLY_SUPPORT": {
        if (latent.resolution === "ON_CRIT" && !anyCrit) return;
        if (latent.effectType === "ALLY_SUPPORT" && latent.resolution === "ON_CRIT") {
          receiver.gauge += latent.value * ATB_THRESHOLD;
        } else {
          applyHeal(receiver, Math.round(receiver.maxHp * latent.value));
        }
        announce();
        return;
      }
      case "SHIELD":
        if (!hasStatus(receiver, "BUFF_BLOCK")) {
          receiver.shieldValue = Math.max(receiver.shieldValue, Math.round(receiver.maxHp * latent.value));
          receiver.shieldTurns = Math.max(receiver.shieldTurns, latent.duration);
          announce();
        }
        return;
      case "ADD_BUFF": {
        const onceKey = `${source.instanceId}:${latent.id}`;
        if (latent.resolution === "CONDITIONAL" && (hpRatio(source) > 0.3 || this.consumedLatents.has(onceKey))) return;
        if (!latent.status || !(latent.status in STATUS_EFFECT_CATEGORY)) return;
        if (applyStatus(receiver, latent.status as keyof typeof STATUS_EFFECT_CATEGORY, latent.duration, source.instanceId)) {
          if (latent.resolution === "CONDITIONAL") this.consumedLatents.add(onceKey);
          announce();
        }
        return;
      }
      case "SPECIAL_TRIGGER":
        if ((latent.resolution === "ON_CRIT" && anyCrit) || (latent.resolution === "CONDITIONAL" && debuffApplied)) {
          source.gauge += latent.value * ATB_THRESHOLD; announce();
        }
        return;
    }
  }

  /** 火傷している場合、手番の最後(行動の有無・スタンの有無を問わず)に自分の攻撃力分のダメージを受ける */
  private applyBurnAtTurnEnd(unit: BattleUnit): void {
    if (unit.burnTurns <= 0 || !unit.alive) return;
    unit.burnTurns -= 1;
    const burnDamage = Math.max(1, Math.round(getEffectiveStat(unit, "atk")));
    applyDamage(unit, burnDamage);
    if (this.isTower70Boss(unit)) this.afterTower70BossHpChanged(unit);
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
    if (this.isTower70Boss(unit)) this.afterTower70BossHpChanged(unit);
    this.push(`  → ${this.label(unit)} は毒(${stacks}スタック)でダメージを受けた！ ${poisonDamage} (残りHP ${unit.currentHp}/${unit.maxHp})`);
    this.pushEvent({ targetId: unit.instanceId, kind: "DAMAGE", amount: poisonDamage });
    this.onPoisonDamage(unit);
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
    latent?: LatentAbilityCandidate,
    resolution: SkillResolution = newResolution(),
  ): { anyCrit: boolean; debuffApplied: boolean } {
    let damageDealtThisCall = 0;
    // 反撃は効果の解決の途中に割り込ませない(解決中に相手が動くと、
    // 残りの効果が誰に乗るのか分からなくなる)。数えておいて最後にまとめて返す
    const counterTargets = new Set<BattleUnit>();
    if (!resolution.targetHpBefore.has(target.instanceId)) {
      resolution.targetHpBefore.set(target.instanceId, target.currentHp / target.maxHp);
    }
    /** 解決の途中の結果まで含めて、条件が満たされているかを見る */
    const met = (condition: EffectCondition | undefined): boolean => {
      if (!condition) return true;
      if (condition === "ANY_CRIT") return resolution.critCount >= 1;
      if (condition === "CRITS_AT_LEAST_2") return resolution.critCount >= 2;
      if (condition === "CRITS_AT_LEAST_3") return resolution.critCount >= 3;
      if (condition === "STUN_FAILED") return resolution.stunFailed;
      if (condition === "KILLED_TARGET") return resolution.kills > 0;
      return evaluateTargetCondition(condition, source, target);
    };

    for (const effect of skill.effects) {
      if (!target.alive && effect.kind !== "HEAL" && effect.kind !== "LIFESTEAL" && !isSourceScopedEffect(effect)) continue;
      // 暗闇で外した場合、ダメージ以外の効果は一切乗らない
      if (missed && effect.kind !== "DAMAGE" && effect.kind !== "LIFESTEAL") continue;
      if (!sourceScoped && isSourceScopedEffect(effect)) continue;

      switch (effect.kind) {
        case "DAMAGE": {
          if (!met(effect.requires)) break;
          // 「奪った強化1個につき」は解決の途中の結果を見るので、ここで足してから撃つ
          const stolenBonus = effect.stolenBuffBonus
            ? Math.min(effect.stolenBuffBonus.maxBonus, resolution.stolenBuffs * effect.stolenBuffBonus.perBuff)
            : 0;
          const damageEffect = stolenBonus > 0
            ? { ...effect, finalDamageBonus: (effect.finalDamageBonus ?? 0) + stolenBonus }
            : effect;
          const hits = effect.hits ?? 1;
          for (let h = 0; h < hits && target.alive; h += 1) {
            const result = calcDamage(source, target, damageEffect, this.rng);
            if (result.isCrit) {
              resolution.anyCrit = true;
              resolution.critCount += 1;
              // 「各ヒットのクリティカルで」と明記された技だけ、ヒットごとに得る
              if (effect.gaugeOnCritPerHit) this.gainGauge(source, effect.gaugeOnCritPerHit);
            }
            if (result.isCrit && latent?.effectType === "CRIT_TRIGGER") result.damage = Math.round(result.damage * (1 + latent.value));
            // 暗闇で外した攻撃はかすり傷程度にしかならない
            if (missed) result.damage = Math.max(1, Math.round(result.damage * (1 - BLIND_DAMAGE_REDUCTION)));
            const applied = this.applyIncomingDamage(target, result.damage, source, "normal", resolution);
            damageDealtThisCall += applied.hpDamage;
            resolution.damageDealt += applied.hpDamage;
            if (applied.died) { resolution.kills += 1; this.onKill(source); }
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
          const receivers = this.receiversFor(source, target, effect.applyTo);
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
          const lowExtra = effect.selfLowHpExtra && hpRatio(source) <= effect.selfLowHpExtra.hpRatio
            ? effect.selfLowHpExtra.extra
            : 0;
          const healAmount = Math.round(damageDealtThisCall * (effect.healRate + lowExtra));
          if (healAmount <= 0) break;
          applyHeal(source, healAmount);
          this.push(`  → ${this.label(source)} は与えたダメージの一部でHPが ${healAmount} 回復！ (${source.currentHp}/${source.maxHp})`);
          this.pushEvent({ targetId: source.instanceId, kind: "HEAL", amount: healAmount });
          break;
        }

        case "BUFF": {
          // 適用先を選べる。敵を攻撃しつつ味方を強化するスキルなどで使う
          const receivers = this.receiversFor(source, target, effect.applyTo);
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
          if (!this.rollEffectSuccess(source, target, effect.chance, effect.chanceGroup, resolution)) break;
          target.effects.push({
            stat: effect.stat,
            amount: -effect.amount,
            remainingTurns: effect.durationTurns,
            kind: "DEBUFF",
          });
          resolution.debuffApplied = true;
          resolution.applied.add(`${effect.stat.toUpperCase()}_DOWN`);
          this.push(`  → ${this.label(target)} の ${effect.stat.toUpperCase()} が低下！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "STATUS": {
          const category = STATUS_EFFECT_CATEGORY[effect.status];
          const receivers = this.receiversFor(source, target, effect.applyTo);
          for (const receiver of receivers) {
            if (category === "DEBUFF") {
              if (this.isImmune(receiver) || !this.rollEffectSuccess(source, receiver, effect.chance)) continue;
            }
            if (!applyStatus(receiver, effect.status, effect.durationTurns, source.instanceId)) {
              this.push(`  → ${this.label(receiver)} は強化不可でBUFF付与を防いだ！`);
              continue;
            }
            this.push(`  → ${this.label(receiver)} は${STATUS_EFFECT_JA[effect.status]}を得た！ (${effect.durationTurns}ターン)`);
            if (category === "DEBUFF") { resolution.debuffApplied = true; resolution.applied.add(effect.status); }
          }
          break;
        }

        case "STUN": {
          if (!met(effect.requires)) break;
          if (this.isImmune(target) || !this.rollEffectSuccess(source, target, effect.chance)) {
            // 「スタンが失敗したら代わりにゲージを削る」型の技のために、外れたことを覚えておく
            resolution.stunFailed = true;
            break;
          }
          target.stunTurns = Math.max(target.stunTurns, effect.durationTurns);
          resolution.debuffApplied = true;
          resolution.applied.add("STUN");
          this.push(`  → ${this.label(target)} はスタンした！`);
          break;
        }

        case "BURN": {
          if (this.isImmune(target)) break;
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          target.burnTurns = Math.max(target.burnTurns, effect.durationTurns);
          resolution.debuffApplied = true;
          resolution.applied.add("BURN");
          this.push(`  → ${this.label(target)} は火傷を負った！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "GAUGE": {
          if (!met(effect.requires)) break;
          if (effect.chance !== undefined && this.rng() >= effect.chance) break;
          const receivers = this.receiversFor(source, target, effect.applyTo);
          for (const receiver of receivers) {
            if (!receiver.alive) continue;
            let amount = effect.amount;
            if (effect.conditionalExtra && met(effect.conditionalExtra.when)) amount += effect.conditionalExtra.amount;
            if (effect.lowHpExtra && hpRatio(receiver) <= effect.lowHpExtra.hpRatio) amount += effect.lowHpExtra.amount;
            if (effect.drain) {
              // 吸収: 対象から減らした分をそのまま術者へ移す
              resolution.gaugeRemoved += this.drainGauge(source, receiver, amount);
              this.push(`  → ${this.label(source)} が ${this.label(receiver)} の行動ゲージを吸収した！`);
              continue;
            }
            const before = receiver.gauge;
            receiver.gauge = Math.max(0, Math.min(ATB_THRESHOLD, receiver.gauge + amount * ATB_THRESHOLD));
            if (amount < 0) resolution.gaugeRemoved += (before - receiver.gauge) / ATB_THRESHOLD;
            const verb = amount >= 0 ? "進んだ" : "後退した";
            this.push(`  → ${this.label(receiver)} の行動ゲージが${verb}！`);
          }
          break;
        }

        case "BLIND": {
          if (this.isImmune(target)) break;
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          target.blindTurns = Math.max(target.blindTurns, effect.durationTurns);
          resolution.debuffApplied = true;
          resolution.applied.add("BLIND");
          this.push(`  → ${this.label(target)} は暗闇に包まれた！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "SHIELD": {
          const receivers = this.receiversFor(source, target, effect.applyTo);
          for (const receiver of receivers) {
            if (!receiver.alive) continue;
            if (hasStatus(receiver, "BUFF_BLOCK")) { this.push(`  → ${this.label(receiver)} は強化不可でBUFF付与を防いだ！`); continue; }
            // タンクの守りは「自分の頑丈さを配る」形。基準を術者のHPに切り替えられる
            const base = effect.fromSourceHp ? source.maxHp : receiver.maxHp;
            const shieldAmount = Math.round(base * effect.shieldRate);
            receiver.shieldValue = Math.max(receiver.shieldValue, shieldAmount);
            receiver.shieldTurns = Math.max(receiver.shieldTurns, effect.durationTurns);
            this.push(`  → ${this.label(receiver)} にシールドが張られた！ (${shieldAmount}、${effect.durationTurns}ターン)`);
          }
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
          const receivers = this.receiversFor(source, target, effect.applyTo);
          for (const receiver of receivers) {
            if (!receiver.alive) continue;
            if (hasStatus(receiver, "BUFF_BLOCK")) { this.push(`  → ${this.label(receiver)} は強化不可でBUFF付与を防いだ！`); continue; }
            receiver.regenRate = Math.max(receiver.regenRate, effect.healRate);
            receiver.regenTurns = Math.max(receiver.regenTurns, effect.durationTurns);
            this.push(`  → ${this.label(receiver)} は継続回復を得た！ (${effect.durationTurns}ターン)`);
          }
          break;
        }

        case "CLEANSE": {
          const receivers = this.receiversFor(source, target, effect.applyTo);
          for (const receiver of receivers) {
            if (!receiver.alive) continue;
            if (cleanseDebuffs(receiver, effect.count ?? Number.POSITIVE_INFINITY) > 0) {
              this.push(`  → ${this.label(receiver)} のデバフが解除された！`);
            }
          }
          break;
        }

        case "STRIP": {
          // IMMUNITY自身はBUFF。対抗手段である強化解除を免疫で封じない。
          if (!this.rollEffectSuccess(source, target, effect.chance, effect.chanceGroup, resolution)) break;
          const removed = stripBuffs(target, effect.count ?? Number.POSITIVE_INFINITY);
          if (removed > 0) {
            resolution.strippedTargets += 1;
            resolution.applied.add("STRIP");
            this.push(`  → ${this.label(target)} の有利な効果が剥がされた！`);
            if (effect.selfGaugePerRemoved) this.gainGauge(source, effect.selfGaugePerRemoved * removed);
          }
          break;
        }

        case "STEAL_BUFF": {
          if (!target.alive) break;
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          const stolen = stealBuffs(target, source, effect.count ?? 1);
          if (stolen > 0) {
            resolution.stolenBuffs += stolen;
            resolution.applied.add("STRIP");
            this.push(`  → ${this.label(source)} が ${this.label(target)} の有利な効果を ${stolen}個 奪った！`);
          }
          break;
        }

        case "MITIGATE": {
          const receivers = this.receiversFor(source, target, effect.applyTo);
          /*
           * **負の `amount` は「脆弱」**(被ダメージ増加)。
           * `damageTakenMultiplier` が `1 - reduction` で解くので、
           * -0.4 が入れば 1.4倍になる——が、両方を `Math.max` で丸めると
           * `Math.max(0, -0.4)` で**脆弱が何も起きないまま素通り**する。
           * 向きごとに「より強い方を残す」形へ分ける。
           *
           * 正の側は従来のまま。図鑑にも塔にも**負の MITIGATE は1件も無い**ので、
           * ここまでの軽減の挙動は1つも変わらない(90階の脆弱刻印が最初の1件)。
           */
          const weaken = effect.amount < 0;
          for (const receiver of receivers) {
            if (!receiver.alive) continue;
            receiver.mitigateAmount = weaken
              ? Math.min(receiver.mitigateAmount, effect.amount)
              : Math.max(receiver.mitigateAmount, effect.amount);
            receiver.mitigateVsTaunted = Math.max(receiver.mitigateVsTaunted, effect.vsTauntedExtra ?? 0);
            receiver.mitigateTurns = Math.max(receiver.mitigateTurns, effect.durationTurns);
            this.push(weaken
              ? `  → ${this.label(receiver)} は受けるダメージが ${Math.round(-effect.amount * 100)}% 増加した！ (${effect.durationTurns}ターン)`
              : `  → ${this.label(receiver)} は受けるダメージが軽減された！ (${effect.durationTurns}ターン)`);
          }
          break;
        }

        case "PROTECT": {
          // 自分を自分でかばうことはできない。その時はHP割合が最も低い別の味方を守る
          const others = this.units.filter((unit) => unit.team === source.team && unit.alive && unit !== source);
          const guarded = target !== source && target.alive
            ? target
            : others.reduce<BattleUnit | undefined>((lowest, unit) => (!lowest || hpRatio(unit) < hpRatio(lowest) ? unit : lowest), undefined);
          if (!guarded) break;
          guarded.protectorId = source.instanceId;
          guarded.protectShare = effect.share;
          guarded.protectTurns = Math.max(guarded.protectTurns, effect.durationTurns);
          this.push(`  → ${this.label(source)} が ${this.label(guarded)} を守る構えを取った！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "COUNTER_STANCE": {
          source.counterTurns = Math.max(source.counterTurns, effect.durationTurns);
          source.counterMultiplier = Math.max(source.counterMultiplier, effect.multiplier);
          source.counterHpCoefficient = Math.max(source.counterHpCoefficient, effect.hpCoefficient ?? 0);
          source.counterHealRate = Math.max(source.counterHealRate, effect.healRate ?? 0);
          this.push(`  → ${this.label(source)} は反撃の構えを取った！ (${effect.durationTurns}ターン)`);
          break;
        }

        case "COOLDOWN_REDUCE": {
          if (!met(effect.requires)) break;
          const receivers = this.receiversFor(source, target, effect.applyTo);
          for (const receiver of receivers) {
            if (!receiver.alive) continue;
            // 0未満にはしない。負に振れると「常時使える必殺技」ができてしまう
            receiver.cooldowns = receiver.cooldowns.map((c, slot) => (
              effect.slot !== undefined && effect.slot !== slot ? c : Math.max(0, c - effect.turns)
            )) as [number, number, number];
            this.push(`  → ${this.label(receiver)} のスキルのクールタイムが ${effect.turns}ターン短縮された！`);
          }
          break;
        }

        case "GAUGE_ON_HIT": {
          for (const receiver of this.receiversFor(source, target, effect.applyTo)) {
            if (!receiver.alive) continue;
            receiver.hitGaugeAmount = Math.max(receiver.hitGaugeAmount, effect.amount);
            receiver.hitGaugeTurns = Math.max(receiver.hitGaugeTurns, effect.durationTurns);
            this.push(`  → ${this.label(receiver)} は攻撃を受けるたび行動ゲージが進むようになった！`);
          }
          break;
        }

        // 協力攻撃は対象ごとの解決ではなく、スキル全体の解決の最後で処理する
        case "COOP_ATTACK":
          break;

        case "HEAL_BLOCK": {
          if (this.isImmune(target)) break;
          if (!this.rollEffectSuccess(source, target, effect.chance)) break;
          target.healBlockTurns = Math.max(target.healBlockTurns, effect.durationTurns);
          resolution.debuffApplied = true;
          resolution.applied.add("HEAL_BLOCK");
          // 複数から掛かったら、いちばんきついものが残る
          target.healBlockMultiplier = 0;
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
          // 「既に毒状態ならさらに重ねる」は、判定より先に今の状態を見る
          const alreadyPoisoned = target.poisonStacks > 0;
          const stacks = (effect.stacks ?? 1) + (alreadyPoisoned ? (effect.extraStacksIfPoisoned ?? 0) : 0);
          target.poisonStacks = Math.min(5, target.poisonStacks + stacks);
          resolution.debuffApplied = true;
          resolution.applied.add("POISON");
          target.poisonTurns = Math.max(target.poisonTurns, effect.durationTurns);
          target.poisonDamageRate = Math.max(target.poisonDamageRate, effect.damageRatePerStack);
          this.push(`  → ${this.label(target)} は毒を受けた！ (${target.poisonStacks}スタック、${effect.durationTurns}ターン)`);
          break;
        }
      }
    }

    for (const victim of counterTargets) this.tryCounter(victim, source);
    return { anyCrit: resolution.anyCrit, debuffApplied: resolution.debuffApplied };
  }

  /** 特殊ダメージにも共通の致死処理を通し、通常由来だけ反射を1段生成する。 */
  private applyIncomingDamage(
    target: BattleUnit,
    amount: number,
    source?: BattleUnit,
    sourceType: "normal" | "reflect" | "periodic" = "normal",
    resolution: SkillResolution | null = null,
  ): DamageApplicationResult {
    const equipmentMultiplier = Math.max(0, Math.min(1, target.def.latentAbility?.damageTakenMultiplier ?? 1));
    const hpBefore = hpRatio(target);
    // 軽減とパッシブによる被ダメージ減は、無敵・シールドより手前で1度だけ掛ける
    let incoming = Math.round(amount * equipmentMultiplier * damageTakenMultiplier(target, source ? hasStatus(source, "TAUNT") : false));
    if (target.latentOneShotMitigate > 0) target.latentOneShotMitigate = 0;

    /*
     * かばう。**軽減のあと、致死処理の前**に割り込む。
     * 先に肩代わりすると守る側が軽減の恩恵を受けられず、
     * 後に回すと守られた側が一度倒れてから肩代わりが起きてしまう。
     */
    const protector = target.protectTurns > 0
      ? this.units.find((unit) => unit.instanceId === target.protectorId && unit.alive)
      : undefined;
    if (protector && protector !== target && sourceType === "normal" && incoming > 0) {
      const shared = Math.round(incoming * target.protectShare);
      if (shared > 0) {
        incoming -= shared;
        const taken = applyDamage(protector, Math.round(shared * damageTakenMultiplier(protector)));
        this.push(`  → ${this.label(protector)} が ${this.label(target)} をかばった！ ${taken.hpDamage} ダメージ (残りHP ${protector.currentHp}/${protector.maxHp})`);
        this.pushEvent({ targetId: protector.instanceId, kind: "DAMAGE", amount: taken.hpDamage });
        if (taken.died) {
          this.push(`  → ${this.label(protector)} は倒れた！`);
          this.pushEvent({ targetId: protector.instanceId, kind: "DEATH" });
        }
      }
    }

    const applied = applyDamage(target, incoming);
    if (this.isTower70Boss(target) && target.alive && applied.hpDamage > 0) this.afterTower70BossHpChanged(target);
    if (applied.invincible) this.push(`  → ${this.label(target)} は無敵でダメージを無効化した！`);
    if (applied.endured) this.push(`  → ${this.label(target)} は我慢でHP1に踏みとどまった！`);
    if (applied.revived) this.push(`  → ${this.label(target)} は最大HPの25%で復活した！`);
    if (applied.died) {
      this.push(`  → ${this.label(target)} は倒れた！`);
      this.pushEvent({ targetId: target.instanceId, kind: "DEATH" });
    }
    if (sourceType === "normal" && applied.hpDamage > 0) {
      this.onDamaged(target, source, resolution);
      this.tryCounterStance(target, source);
    }
    // HP閾値を「またいだ瞬間」だけ拾う。下回り続けている間ずっと出続けないようにする
    if (target.alive && hpBefore > 0.3 && hpRatio(target) <= 0.3) this.onAllyHpThreshold(target);
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
  /**
   * 反撃態勢による反撃。ボスの `counterAfterHits` と違い**回数を溜めずに毎回返す**。
   * 反撃そのものは反撃を呼ばない(相討ちが無限に続く)。
   */
  private tryCounterStance(defender: BattleUnit, attacker: BattleUnit | undefined): void {
    if (defender.counterTurns <= 0 || !defender.alive || !attacker?.alive) return;
    if (attacker.team === defender.team) return;
    const result = calcDamage(defender, attacker, {
      kind: "DAMAGE",
      multiplier: defender.counterMultiplier,
      hpCoefficient: defender.counterHpCoefficient > 0 ? defender.counterHpCoefficient : undefined,
    }, this.rng);
    const applied = this.applyIncomingDamage(attacker, result.damage, defender, "reflect");
    this.push(`  → ${this.label(defender)} の反撃！ ${this.label(attacker)} に ${applied.hpDamage} ダメージ (残りHP ${attacker.currentHp}/${attacker.maxHp})`);
    this.pushEvent({ targetId: attacker.instanceId, kind: "DAMAGE", amount: applied.hpDamage, isCrit: result.isCrit });
    if (defender.counterHealRate > 0) {
      const healAmount = Math.round(defender.maxHp * defender.counterHealRate);
      applyHeal(defender, healAmount);
      this.pushEvent({ targetId: defender.instanceId, kind: "HEAL", amount: healAmount });
    }
  }

  private tryCounter(defender: BattleUnit, attacker: BattleUnit): void {
    const traits = defender.def.bossTraits;
    const every = traits?.counterAfterHits ?? 0;
    if (every <= 0 || !defender.alive || !attacker.alive) return;
    if (defender.hitsTaken < every) return;
    /*
     * **反撃の中から反撃を呼ばない。**
     *
     * 反撃そのものは被弾数を増やさないので普通は連鎖しないが、
     * 反射(REFLECT)を張った相手を殴ると跳ね返りで自分の被弾数が増える。
     * そこから次の反撃が立ち上がると、盤面が動かないまま延々と往復する。
     */
    if (this.counterDepth > 0) return;

    defender.hitsTaken -= every;

    // 溜めた反撃で**スキルをそのまま撃つ**指定があれば、そちらへ回す
    if (traits?.counterSkillIndex !== undefined) {
      this.counterWithSkill(defender, traits.counterSkillIndex);
      return;
    }

    const result = calcDamage(defender, attacker, { kind: "DAMAGE", multiplier: traits?.counterMultiplier ?? 1.2 }, this.rng);
    applyDamage(attacker, result.damage);
    this.push(`  → ${this.label(defender)} の反撃！ ${this.label(attacker)} に ${result.damage} ダメージ (残りHP ${attacker.currentHp}/${attacker.maxHp})`);
    this.pushEvent({ targetId: attacker.instanceId, kind: "DAMAGE", amount: result.damage, isCrit: result.isCrit });
    if (!attacker.alive) {
      this.push(`  → ${this.label(attacker)} は倒れた！`);
      this.pushEvent({ targetId: attacker.instanceId, kind: "DEATH" });
    }
  }

  /**
   * 溜めた反撃で、自分のスキルをそのまま撃つ。
   *
   * ## 通常の手番と、どこが違うか
   *
   *   ・**クールタイムを動かさない。** 反撃で溜まりが消えるなら、
   *     こちらの手数がそのままボスの手を縛る道具になってしまう
   *   ・手番を消費しない(行動ゲージにも触らない)
   *   ・協力攻撃・撃破による追加ターンは呼ばない(反撃から手番が増えると、
   *     殴った側が損をする形が二重になる)
   *
   * ダメージ・会心・命中/抵抗・ゲージ吸収・解除は、**本編と同じ
   * `applySkillEffects` をそのまま通す。** ここで別式を書くと、
   * 本編を直した時にボスの反撃だけが古い規則で殴り続ける。
   */
  /**
   * 倒れた取り巻きのぶんだけ、本体を強くする。
   *
   * ## 死んだ瞬間ではなく、走査で拾う
   *
   * 死は毒でも火傷でも反撃でも起きるので、**倒れ方ごとに合図を挿していくと
   * 必ずどれか一つを取りこぼす。**代わりに手番の切れ目ごとに全員を見て、
   * まだ弔っていない死体があれば処理する。`mournedDeaths` に控えるので、
   * 同じ死で二度強くなることはない。
   *
   * 効き先は「生き残っている勝利条件の敵」だけ。取り巻き同士では強め合わない
   * (どちらを先に倒しても同じ、では順番を考える意味が無くなる)。
   */
  private applyAllyDeathBoosts(): void {
    for (const victim of this.units) {
      if (victim.alive || this.mournedDeaths.has(victim.instanceId)) continue;
      this.mournedDeaths.add(victim.instanceId);
      const boost = victim.def.bossTraits?.empowerBossOnDeath;
      if (!boost) continue;
      for (const boss of this.units) {
        if (!boss.alive || boss === victim || boss.team !== victim.team || !boss.def.victoryTarget) continue;
        const parts: string[] = [];
        for (const stat of ["atk", "spd", "def"] as const) {
          const amount = boost[stat];
          if (!amount) continue;
          boss.flatStatBonus[stat] = (boss.flatStatBonus[stat] ?? 0) + amount;
          parts.push(`${stat.toUpperCase()}+${amount}`);
        }
        if (parts.length > 0) {
          this.push(`${this.label(boss)} は ${this.label(victim)} の力を取り込んだ！ (${parts.join(" ")})`);
        }
      }
    }
  }

  private counterWithSkill(source: BattleUnit, index: 0 | 1 | 2): void {
    const skill = source.def.skills[index];
    if (!skill || skill.passive) return;
    const targets = chooseTargets(source, skill, this.units);
    if (targets.length === 0) return;

    this.push(`  → ${this.label(source)} の反撃「${skill.name}」！`);
    this.counterDepth += 1;
    const resolution = newResolution();
    const previousResolution = this.resolution;
    this.resolution = resolution;
    try {
      targets.forEach((target, i) => this.applySkillEffects(source, target, skill, false, i === 0, undefined, resolution));
    } finally {
      this.resolution = previousResolution;
      this.counterDepth -= 1;
    }
    for (const target of new Set(targets)) {
      if (!target.alive) {
        this.push(`  → ${this.label(target)} は倒れた！`);
        this.pushEvent({ targetId: target.instanceId, kind: "DEATH" });
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
  private rollEffectSuccess(
    source: BattleUnit,
    target: BattleUnit,
    baseChance: number | undefined,
    chanceGroup?: string,
    resolution?: SkillResolution,
  ): boolean {
    const procChance = baseChance ?? 1;
    const groupKey = chanceGroup && resolution ? `${target.instanceId}:${chanceGroup}` : undefined;
    if (groupKey) {
      const cached = resolution!.chanceGroups.get(groupKey);
      if (cached !== undefined) return cached;
    }
    if (this.rng() >= procChance) {
      if (groupKey) resolution!.chanceGroups.set(groupKey, false);
      return false;
    }

    const ignoreRatio = source.def.combatMods?.ignoreResistancePercent ?? 0;
    const effectiveResistance = target.def.stats.resistance * (1 - ignoreRatio);
    const accuracy = source.def.stats.accuracy;
    const hitChance = Math.max(0, Math.min(1, (1 - effectiveResistance + accuracy) / (1 + accuracy)));

    if (this.rng() < hitChance) {
      if (groupKey) resolution!.chanceGroups.set(groupKey, true);
      return true;
    }

    if (groupKey) resolution!.chanceGroups.set(groupKey, false);

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
