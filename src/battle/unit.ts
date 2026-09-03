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
  /**
   * ステータスへの**実数**の上乗せ。倍率のバフとは別に足す。
   *
   * 既存のバフは全部「何%上げる」なので、「攻撃力を2000上げる」が書けなかった。
   * 仲間が倒れるたびに強くなる相手を作るのに要る。
   */
  flatStatBonus: Partial<Record<BuffStat, number>>;

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
  if (effect.kind === "LAST_STAND" && stat === "def") {
    return unit.currentHp / unit.maxHp <= effect.hpRatio ? { multiplier: 1 + effect.defUp, add: 0 } : { multiplier: 1, add: 0 };
  }
  if (effect.kind === "THUNDER_INSTINCT") {
    if (stat === "criDmg") return { multiplier: 1, add: effect.critDmg };
    if (stat === "spd") return { multiplier: 1, add: effect.spd };
  }
  if (effect.kind === "PACK_INSTINCT" && stat === "criDmg") return { multiplier: 1, add: effect.critDmg };
  return { multiplier: 1, add: 0 };
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
    ...freshExtendedState(),
  };
}

/** バフ/デバフを反映した実効ステータス値を計算する。criRate/criDmgは加算、それ以外は乗算で効く */
export function getEffectiveStat(unit: BattleUnit, stat: BuffStat): number {
  const passive = passiveStatBonus(unit, stat);
  const flat = unit.flatStatBonus[stat] ?? 0;
  const base = unit.def.stats[stat] + flat + (stat === "spd" ? passive.add : 0);
  const totalRate = unit.effects
    .filter((e) => e.stat === stat)
    .reduce((sum, e) => sum + e.amount, 0);

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
  return unit.immuneTurns > 0
    || unit.shieldTurns > 0
    || unit.regenTurns > 0
    || unit.effects.some((effect) => effect.kind === "BUFF")
    || unit.statusEffects.some((effect) => effect.category === "BUFF");
}

/** その相手が持っている弱体効果の数。ダメージ倍率や条件判定に使う */
export function countDebuffs(unit: BattleUnit): number {
  return unit.effects.filter((e) => e.kind === "DEBUFF").length
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
