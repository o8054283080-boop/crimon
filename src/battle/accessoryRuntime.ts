/**
 * アクセサリーの、戦闘中に見張る効果。**エンジンから呼ばれる窓口。**
 *
 * エンジン(`engine.ts`)は、盤面の誰か1体でもアクセの戦闘効果を持っている時だけ
 * これを作る。**誰も持っていない戦闘では1行も通らない**——乱数も1つも引かないので、
 * アクセの無い戦闘(既存のダンジョン・塔・アクセ無しのアリーナ)は、この追加の前と
 * 同じ種から同じ経過をたどる。
 *
 * ## 効き方(依頼主の指定)
 *
 *   攻撃の与ダメUP … **加算**して1回掛ける(20%や15%の上限は置かない)
 *   耐久の被ダメ軽減 … **乗算**(効果ごとに ×(1−x))
 *   行動不能中への与ダメ(妨害) … 攻撃とは別の段で掛ける
 *   回復時の被ダメ軽減(サポート) … 他の軽減とは別の段で掛ける。重ねず、大きい方で上書き
 *   行動ゲージ減少量 … 元の減少量へ**掛ける**(20% × 1.12 × 1.10 = 24.64%)。ptで足さない
 *   サポートの発動 … **1回のスキル使用 × 1体の対象 × 1つの条件で1回まで**
 *   アクセのシールド … 今あるシールドと比べて**大きい方**。足し合わせない。最大HPを超えない
 *
 * 判定は本番前の検証(アクセサリー最終検証・サポート妨害最終検証)で測った形に揃えてある。
 */
import type { AccessoryBattleEffects } from "../core/accessory.js";
import type { Skill } from "../core/skill.js";
import { applyHeal, countDebuffs, hasStatus, hpRatio, type BattleUnit } from "./unit.js";

/** エンジンが貸す道具。アクセの処理はこれ以外の内部に触らない */
export interface AccessoryEngineAccess {
  readonly units: readonly BattleUnit[];
  rng(): number;
  gainGauge(unit: BattleUnit, amount: number): void;
  push(message: string): void;
  label(unit: BattleUnit): string;
  pushHealEvent(unit: BattleUnit, amount: number): void;
  /** 追撃のダメージを通す(`applyIncomingDamage` を "normal"・解決記録なしで) */
  dealFollowUp(source: BattleUnit, target: BattleUnit, multiplier: number): void;
}

/** アクセのシールドの持続。本番前の検証と同じ2ターン */
const ACCESSORY_SHIELD_TURNS = 2;
/** 特殊「被弾時回復」の発動率 */
const HIT_HEAL_CHANCE = 0.15;
/** 弱効果「被弾時回復」の発動率 */
const WEAK_HIT_HEAL_CHANCE = 0.10;
/** 弱効果「クリティカル時ゲージ」の発動率 */
const CRIT_GAUGE_CHANCE = 0.05;
/** 弱効果「追撃」の倍率(攻撃力×0.15) */
const FOLLOWUP_MULTIPLIER = 0.15;

export function effectsOf(unit: BattleUnit | undefined): AccessoryBattleEffects | undefined {
  return unit?.def.accessory;
}

export class AccessoryRuntime {
  /** 解決中のスキル。反撃や追撃の中でも正しい枠を拾えるよう、入れ子を積む */
  private readonly skillStack: { source: BattleUnit; skill: Skill }[] = [];
  /** 各攻撃役が最初にダメージを与えた解決。「最初の攻撃」の判定に使う */
  private readonly firstResolution = new Map<string, object>();
  private readonly hitCount = new WeakMap<object, Map<string, number>>();
  private readonly lastCrit = new WeakMap<object, number>();
  private readonly shield50Used = new Set<string>();
  /** 回復時の被ダメ軽減。受け手の次の手番の頭で消える */
  private readonly healedDr = new Map<string, number>();
  /** 「1スキル × 1対象 × 1条件で1回」の控え */
  private readonly once = new WeakMap<object, Set<string>>();

  constructor(private readonly engine: AccessoryEngineAccess) {}

  /** 盤面にアクセの戦闘効果を持つ個体が居るか。居なければ作らない */
  static needed(units: readonly BattleUnit[]): boolean {
    return units.some((u) => u.def.accessory !== undefined);
  }

  private first(key: object | null | undefined, name: string): boolean {
    if (!key) return true;
    let set = this.once.get(key);
    if (!set) { set = new Set(); this.once.set(key, set); }
    if (set.has(name)) return false;
    set.add(name);
    return true;
  }

  /* ------------------------------------------------------------ スキルの入れ子 */

  enterSkill(source: BattleUnit, skill: Skill): void {
    this.skillStack.push({ source, skill });
  }

  exitSkill(): void {
    this.skillStack.pop();
  }

  private currentSkillOf(source: BattleUnit): Skill | undefined {
    for (let i = this.skillStack.length - 1; i >= 0; i -= 1) {
      if (this.skillStack[i].source === source) return this.skillStack[i].skill;
    }
    return undefined;
  }

  /* ------------------------------------------------------------ 被ダメージの手前 */

  /**
   * 着弾の直前に、攻撃役のアクセ × 受け手のアクセの倍率を掛ける。
   *
   * スキルからのダメージ(`resolution` あり)は条件付きの与ダメUP・軽減をすべて見る。
   * それ以外(継続ダメージ・反撃など)は、**条件の無い軽減だけ**を見る。反射には何も掛けない。
   */
  adjustIncoming(
    target: BattleUnit, amount: number, source: BattleUnit | undefined,
    sourceType: "normal" | "reflect" | "periodic", resolution: object | null,
  ): number {
    if (sourceType === "reflect") return amount;
    const def = effectsOf(target);
    if (source && sourceType === "normal" && resolution) {
      const atk = effectsOf(source);
      const skill = this.currentSkillOf(source);
      const slot = skill ? source.def.skills.findIndex((s) => s?.id === skill.id) : -1;
      const critCount = (resolution as { critCount?: number }).critCount ?? 0;
      const crit = critCount > (this.lastCrit.get(resolution) ?? 0);
      this.lastCrit.set(resolution, critCount);
      let counts = this.hitCount.get(resolution);
      if (!counts) { counts = new Map(); this.hitCount.set(resolution, counts); }
      const hitIndex = counts.get(target.instanceId) ?? 0;
      counts.set(target.instanceId, hitIndex + 1);
      if (!this.firstResolution.has(source.instanceId)) this.firstResolution.set(source.instanceId, resolution);
      const firstAttack = this.firstResolution.get(source.instanceId) === resolution;
      const skillTarget = skill?.target === "ALL_ENEMIES" ? "ALL" : skill?.target === "SINGLE_ENEMY" ? "SINGLE" : null;

      let factor = 1;
      if (atk) {
        const self = hpRatio(source);
        const foe = hpRatio(target);
        const debuffs = countDebuffs(target);
        let sum = atk.elementDamage[target.def.element] ?? 0;
        if (slot === 0) sum += atk.s1Damage;
        if (slot === 1) sum += atk.s2Damage;
        if (slot === 2) sum += atk.s3Damage;
        if (self >= 0.7) sum += atk.selfHp70;
        if (self >= 0.5) sum += atk.selfHp50;
        if (self <= 0.3) sum += atk.selfHp30;
        if (foe <= 0.3) sum += atk.enemyHp30;
        if (foe <= 0.2) sum += atk.enemyHp20;
        if (debuffs >= 1) sum += atk.debuff1;
        if (debuffs >= 3) sum += atk.debuff3;
        if (hitIndex >= 1) sum += atk.multi2;
        if (hitIndex >= 2) sum += atk.multi3;
        if (firstAttack) sum += atk.first;
        factor *= 1 + sum;
        // 行動不能の敵へ(妨害)。与ダメUPの加算とは別の段
        if (atk.stunnedDamage > 0 && target.stunTurns > 0) factor *= 1 + atk.stunnedDamage;
      }
      if (def) {
        const ratio = hpRatio(target);
        const cut = (v: number, when: boolean) => { if (when && v > 0) factor *= 1 - v; };
        cut(def.dmgTaken, true);
        cut(def.critTaken, crit);
        cut(def.low50, ratio <= 0.5);
        cut(def.low30, ratio <= 0.3);
        cut(def.hp70Taken, ratio >= 0.7);
        cut(def.debuffedTaken, countDebuffs(target) >= 1);
        cut(def.s1Taken, slot === 0);
        cut(def.s2Taken, slot === 1);
        cut(def.s3Taken, slot === 2);
        cut(def.singleTaken, skillTarget === "SINGLE");
        cut(def.aoeTaken, skillTarget === "ALL");
      }
      factor *= this.healedDrFactor(target, source);
      return factor === 1 ? amount : Math.max(1, Math.round(amount * factor));
    }
    let factor = 1;
    if (def && def.dmgTaken > 0) factor *= 1 - def.dmgTaken;
    if (source && sourceType === "normal") factor *= this.healedDrFactor(target, source);
    return factor === 1 ? amount : Math.max(1, Math.round(amount * factor));
  }

  private healedDrFactor(target: BattleUnit, source: BattleUnit): number {
    const cut = this.healedDr.get(target.instanceId) ?? 0;
    return cut > 0 && source.team !== target.team ? 1 - cut : 1;
  }

  /* ------------------------------------------------------------ 被ダメージの後 */

  afterIncoming(target: BattleUnit, source: BattleUnit | undefined, sourceType: "normal" | "reflect" | "periodic"): void {
    const def = effectsOf(target);
    if (!def || !target.alive) return;
    if (def.shield50 > 0 && !this.shield50Used.has(target.instanceId) && hpRatio(target) <= 0.5) {
      // **1戦に1回だけ。**回復で50%を超えて、また下回っても出さない
      this.shield50Used.add(target.instanceId);
      this.giveShield(target, target, def.shield50, "HP50%のシールド");
    }
    if (source && sourceType === "normal") {
      if (def.hitHeal > 0 && this.engine.rng() < HIT_HEAL_CHANCE) this.heal(target, target.maxHp * def.hitHeal);
      if (def.weakHitHeal > 0 && this.engine.rng() < WEAK_HIT_HEAL_CHANCE) this.heal(target, target.maxHp * def.weakHitHeal);
    }
  }

  onKill(killer: BattleUnit | undefined): void {
    const atk = effectsOf(killer);
    if (!killer?.alive || !atk || atk.killGauge <= 0) return;
    this.engine.gainGauge(killer, atk.killGauge);
  }

  onTurnStart(unit: BattleUnit): void {
    this.healedDr.delete(unit.instanceId);
  }

  /* ------------------------------------------------------------ サポート */

  /** HP50%以下の味方への回復量UP。回復量の計算に掛ける倍率 */
  healMultiplier(source: BattleUnit, receiver: BattleUnit): number {
    const sup = effectsOf(source);
    if (!sup || sup.low50Heal <= 0 || hpRatio(receiver) > 0.5) return 1;
    return 1 + sup.low50Heal;
  }

  /**
   * 回復を受けた味方への上乗せ。`hpBefore` は回復の直前のHP割合。
   * `key` はスキルの解決記録(パッシブの回復なら、その発動ごとの印)。
   */
  onHealed(source: BattleUnit, receiver: BattleUnit, hpBefore: number, key: object | null): void {
    const sup = effectsOf(source);
    if (!sup || !receiver.alive || receiver.team !== source.team) return;
    if (sup.healedDr + sup.healedShield + sup.low50HealedShield + sup.healedGauge <= 0) return;
    if (!this.first(key, `healed:${receiver.instanceId}`)) return;
    if (sup.healedDr > 0) {
      // 重ねない。大きい方で上書きし、受け手の次の手番の頭で消える
      this.healedDr.set(receiver.instanceId, Math.max(this.healedDr.get(receiver.instanceId) ?? 0, sup.healedDr));
    }
    if (sup.healedShield > 0) this.giveShield(source, receiver, sup.healedShield, "回復時のシールド");
    if (sup.low50HealedShield > 0 && hpBefore <= 0.5) this.giveShield(source, receiver, sup.low50HealedShield, "回復時のシールド");
    if (sup.healedGauge > 0) this.engine.gainGauge(receiver, sup.healedGauge);
  }

  /** 味方へ強化を配った時 */
  onBuffGiven(source: BattleUnit, receiver: BattleUnit, key: object | null): void {
    const sup = effectsOf(source);
    if (!sup || !receiver.alive || receiver.team !== source.team) return;
    if (sup.buffShield + sup.buffGauge <= 0) return;
    if (!this.first(key, `buff:${receiver.instanceId}`)) return;
    if (sup.buffShield > 0) this.giveShield(source, receiver, sup.buffShield, "強化時のシールド");
    if (sup.buffGauge > 0) this.engine.gainGauge(receiver, sup.buffGauge);
  }

  /**
   * アクセのシールド。**今あるシールドと比べて大きい方。**足し合わせない。
   * 張る側のシールド量UP(`shieldMultiplier`)は掛かる。最大HPは超えない。
   */
  private giveShield(giver: BattleUnit, receiver: BattleUnit, ratio: number, label: string): void {
    if (!receiver.alive || ratio <= 0 || hasStatus(receiver, "BUFF_BLOCK")) return;
    const boost = giver.def.combatMods?.shieldMultiplier ?? 1;
    const amount = Math.min(receiver.maxHp, Math.round(receiver.maxHp * ratio * boost));
    if (amount <= receiver.shieldValue) return;
    receiver.shieldValue = amount;
    receiver.shieldTurns = Math.max(receiver.shieldTurns, ACCESSORY_SHIELD_TURNS);
    this.engine.push(`  → ${this.engine.label(receiver)} にアクセサリーの${label}！ (${amount})`);
  }

  private heal(unit: BattleUnit, amount: number): void {
    if (!unit.alive || amount <= 0) return;
    const before = unit.currentHp;
    applyHeal(unit, Math.round(amount));
    const healed = unit.currentHp - before;
    if (healed > 0) this.engine.pushHealEvent(unit, healed);
  }

  /* ------------------------------------------------------------ 妨害 */

  /**
   * 敵の行動ゲージを減らす量へ掛ける倍率。**元の減少量 × (1+x) × (1+y)。**
   * 1回の解決で同じ相手へは1度だけ(同じ技の2つ目の減少には掛けない)。
   */
  gaugeDownMultiplier(source: BattleUnit, target: BattleUnit, key: object | null): number {
    const dis = effectsOf(source);
    if (!dis || target.team === source.team) return 1;
    const up = dis.gaugeDownUp;
    const cond = countDebuffs(target) > 0 ? dis.debuffedGaugeDown : 0;
    if (up <= 0 && cond <= 0) return 1;
    if (!this.first(key, `gaugeDown:${target.instanceId}`)) return 1;
    return (1 + up) * (1 + cond);
  }

  /** 強化解除(奪取を含む)に成功した時 */
  onStrip(source: BattleUnit, target: BattleUnit, key: object | null): void {
    const dis = effectsOf(source);
    if (!dis || target.team === source.team) return;
    if (dis.stripSelfGauge > 0 && this.first(key, "stripSelf")) this.engine.gainGauge(source, dis.stripSelfGauge);
    if (dis.stripTargetGauge > 0 && target.alive && this.first(key, `stripTarget:${target.instanceId}`)) {
      target.gauge = Math.max(0, target.gauge - dis.stripTargetGauge * 100);
    }
  }

  /* ------------------------------------------------------------ スキルを撃ち終えた後 */

  afterSkill(source: BattleUnit, primary: BattleUnit | undefined, resolution: {
    debuffApplied: boolean; damageDealt: number; critCount: number;
  }): void {
    const e = effectsOf(source);
    if (!e || !source.alive) return;
    if (e.debuffSelfGauge > 0 && resolution.debuffApplied && this.first(resolution, "debuffSelf")) {
      this.engine.gainGauge(source, e.debuffSelfGauge);
    }
    if (resolution.damageDealt > 0) {
      if (e.lifesteal > 0) this.heal(source, resolution.damageDealt * e.lifesteal);
      if (e.critGauge > 0 && resolution.critCount > 0 && this.engine.rng() < CRIT_GAUGE_CHANCE) {
        this.engine.gainGauge(source, e.critGauge);
      }
      if (e.followUpChance > 0 && primary && primary.alive && primary.team !== source.team
        && this.engine.rng() < e.followUpChance) {
        this.engine.push(`  → ${this.engine.label(source)} のアクセサリーの追撃！`);
        this.engine.dealFollowUp(source, primary, FOLLOWUP_MULTIPLIER);
      }
    }
  }
}
