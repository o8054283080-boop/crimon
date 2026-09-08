import { CombatModifiers, DEFAULT_COMBAT_MODIFIERS, Equipment, EquipSlot, applyEquipmentToStats, computeSetCombatModifiers } from "./equipment.js";
import { MonsterDefinition } from "./monster.js";
import { Star, computeEffectiveStats, requiredExpForLevel } from "./rarity.js";
import { applyPlayerStatBoost } from "./playerStatBoost.js";
import { MAX_SKILL_LEVEL, Skill, computeLeveledSkill } from "./skill.js";
import { MonsterDevelopment, createDefaultMonsterDevelopment } from "./monsterDevelopment.js";
import { ABILITY_POINT_VALUES, MONSTER_TYPE_STAT_MULTIPLIERS } from "./monsterDevelopment.js";
import type { LatentAbilityCandidate } from "./monsterDevelopment.js";
import { applySkillTalents } from "./talentApply.js";
import { talentCombatBonus, talentStatBonus, type TalentState } from "./talents.js";
import type { Stats } from "./stats.js";

/**
 * 移し替えたスキルの実体を引く関数。
 *
 * `core` から `data` を直接参照すると層が逆流するので、
 * 起動時に `data` 側から差し込む(`setCreatedSkillResolver`)。
 */
let createdSkillResolver: ((skillId: string) => Skill | undefined) | null = null;
let latentAbilityResolver: ((dexId: string, abilityId: string) => LatentAbilityCandidate | undefined) | null = null;

export function setCreatedSkillResolver(resolver: (skillId: string) => Skill | undefined): void {
  createdSkillResolver = resolver;
}

/** data 層から安定IDの解決だけを注入し、core→data の依存逆流を避ける。 */
export function setLatentAbilityResolver(
  resolver: (dexId: string, abilityId: string) => LatentAbilityCandidate | undefined,
): void {
  latentAbilityResolver = resolver;
}

function resolveCreatedSkill(skillId: string): Skill | undefined {
  return createdSkillResolver?.(skillId);
}

/** プレイヤーが実際に所持しているモンスター1体分のデータ */
export interface MonsterInstance {
  id: string;
  dexId: string; // MonsterDefinition.id (テンプレートID_属性)
  star: Star;
  level: number;
  exp: number;
  /** スロット番号 → 装着中の装備ID */
  equipment: Partial<Record<EquipSlot, string>>;
  /** スキル1〜3それぞれのレベル(1〜5) */
  skillLevels: [number, number, number];
  /** 素材への誤使用を防ぐ保護。未設定の旧セーブは未ロックとして扱う。 */
  locked?: boolean;
  /**
   * クリエイト(スキル合成)で上書きしたスキル。
   *
   * このゲーム独自の仕組みで、星6まで育てた別のモンスターを素材にすると、
   * その素材のスキル2または3を、この個体の同じ枠へ移し替えられる。
   * **持てるのは常に1つだけ**で、別のモンスターを合成すると置き換わる。
   */
  createdSkill?: CreatedSkill;
  /** 将来のタイプ転生・能力ポイント・潜在覚醒をまとめた、個体固有の育成情報 */
  development: MonsterDevelopment;
}

/** 移し替えたスキル1つ分の記録 */
export interface CreatedSkill {
  /** 上書きした枠。1=スキル2、2=スキル3(配列の添字) */
  slot: 1 | 2;
  /** 移し替えたスキルのID */
  skillId: string;
  /** どのモンスターから移したか(図鑑ID)。表示に使う */
  sourceDexId: string;
}

let instanceCounter = 0;

function generateInstanceId(): string {
  instanceCounter += 1;
  return `mon_${Date.now().toString(36)}_${instanceCounter}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function createMonsterInstance(dexId: string, star: Star, level = 1): MonsterInstance {
  return {
    id: generateInstanceId(),
    dexId,
    star,
    level,
    exp: 0,
    equipment: {},
    skillLevels: [1, 1, 1],
    development: createDefaultMonsterDevelopment(),
  };
}

/** 全スキルが最大レベルに達しているか */
export function isSkillMaxLevel(instance: MonsterInstance): boolean {
  return instance.skillLevels.every((lvl) => lvl >= MAX_SKILL_LEVEL);
}

/**
 * スキルレベルをランダムに1つ、まだ最大に達していないものから選んで1レベル上げる。
 * 上げられるスキルがなければ何もせず-1を返す。上げたスキルのindex(0-2)を返す。
 */
export function rollSkillLevelUp(instance: MonsterInstance, rng: () => number = Math.random): number {
  const eligibleIndices = instance.skillLevels
    .map((lvl, i) => (lvl < MAX_SKILL_LEVEL ? i : -1))
    .filter((i) => i >= 0);
  if (eligibleIndices.length === 0) return -1;
  const index = eligibleIndices[Math.floor(rng() * eligibleIndices.length)];
  instance.skillLevels[index] += 1;
  return index;
}

/**
 * 転生ピッグはランクアップ素材を作りやすくする専用モンスター。
 * ランクアップ後にLv1へ戻っても再育成が苦痛にならないよう、必要経験値を通常の3分の1にする。
 * core層からdata層へ依存を逆流させないため、安定している図鑑IDのprefixだけで判定する。
 */
export function requiredExpForMonsterLevel(instance: MonsterInstance): number {
  const base = requiredExpForLevel(instance.level);
  return instance.dexId.startsWith("reincarnation_pig_") ? Math.max(1, Math.ceil(base / 3)) : base;
}

/** 経験値を加算し、可能な限りレベルアップさせる。実際に上がったレベル数を返す */
export function addExp(instance: MonsterInstance, exp: number, maxLevel: number): number {
  if (instance.level >= maxLevel) return 0;
  instance.exp += exp;
  let levelsGained = 0;
  while (instance.level < maxLevel) {
    const required = requiredExpForMonsterLevel(instance);
    if (instance.exp < required) break;
    instance.exp -= required;
    instance.level += 1;
    levelsGained += 1;
  }
  if (instance.level >= maxLevel) {
    instance.level = maxLevel;
    instance.exp = 0;
  }
  return levelsGained;
}

/** そのインスタンスが装着している装備の実体を、渡された装備リストから解決する */
export function resolveEquippedItems(instance: MonsterInstance, allEquipment: Equipment[]): Equipment[] {
  const equippedIds = new Set(Object.values(instance.equipment));
  return allEquipment.filter((eq) => equippedIds.has(eq.id));
}

/** MonsterInstance + 図鑑データ(+装備)から、バトルエンジンに渡せる実効ステータス付きの定義を作る */
export function toBattleDefinition(
  instance: MonsterInstance,
  dex: MonsterDefinition,
  equippedItems: Equipment[] = [],
): MonsterDefinition {
  /* プレイヤー側のステータス補正。**ここはプレイヤーの手持ちの道。**
     敵は stageRunner / dungeonRunner の別の道を通るので掛からない */
  const growthStats = applyPlayerStatBoost(
    computeEffectiveStats(dex.stats, instance.star, instance.level),
    dex.templateId,
    instance.star,
  );
  const type = instance.development.type;
  const multiplier = type ? MONSTER_TYPE_STAT_MULTIPLIERS[type] : MONSTER_TYPE_STAT_MULTIPLIERS.BALANCE;
  const points = instance.development.abilityPoints;
  const developedStats = {
    ...growthStats,
    hp: Math.round(growthStats.hp * multiplier.hp + points.hp * ABILITY_POINT_VALUES.hp),
    atk: Math.round(growthStats.atk * multiplier.atk + points.atk * ABILITY_POINT_VALUES.atk),
    def: Math.round(growthStats.def * multiplier.def + points.def * ABILITY_POINT_VALUES.def),
    spd: Math.round(growthStats.spd * multiplier.spd + Math.floor(points.spd * ABILITY_POINT_VALUES.spd)),
    criRate: Math.max(0, Math.min(1, growthStats.criRate + multiplier.criRate)),
    criDmg: Math.max(1, growthStats.criDmg + multiplier.criDmg),
    accuracy: Math.max(0, Math.min(1, growthStats.accuracy + multiplier.accuracy)),
    resistance: Math.max(0, Math.min(1, growthStats.resistance + multiplier.resistance)),
  };
  const equipped = equippedItems.length > 0 ? applyEquipmentToStats(developedStats, equippedItems) : developedStats;
  const baseMods = equippedItems.length > 0 ? computeSetCombatModifiers(equippedItems) : undefined;
  /*
   * 才能覚醒。**装備のあとに掛ける。**
   *
   * 装備は「持ち物」で付け替えられるが、才能はその個体そのものの伸びしろ。
   * 装備込みの値に対して割合で乗せることで、
   * **装備を整えた個体ほど才能の1ptが効く**という順序になる。
   */
  const talents = instance.development.talents;
  const stats = talents ? applyTalentStats(equipped, talents) : equipped;
  const combatMods = talents ? applyTalentCombatMods(baseMods, talents) : baseMods;
  const skills = dex.skills.map((skill, i) => computeLeveledSkill(skill, instance.skillLevels[i])) as [
    MonsterDefinition["skills"][0],
    MonsterDefinition["skills"][1],
    MonsterDefinition["skills"][2],
  ];
  // 移し替えたスキルがあれば、その枠だけ差し替える。
  // レベルは元の枠のものをそのまま使う(枠を鍛えた分は無駄にしない)
  const created = instance.createdSkill;
  if (created) {
    const source = resolveCreatedSkill(created.skillId);
    if (source) skills[created.slot] = computeLeveledSkill(source, instance.skillLevels[created.slot]);
  }
  /*
   * スキル才能とスキル覚醒は**差し替えのあと**に焼き込む。
   * 順序を逆にすると、継承で入れ替わった技に前の枠の才能が乗ってしまう。
   */
  if (talents) {
    for (const slot of [1, 2] as const) {
      const ids = [
        ...talents.skill[slot],
        ...(talents.awakening?.slot === slot ? [talents.awakening.id] : []),
      ];
      if (ids.length > 0) skills[slot] = applySkillTalents(skills[slot], ids);
    }
  }
  return {
    ...dex,
    id: instance.id,
    name: `${dex.name}★${instance.star} Lv${instance.level}`,
    stats,
    skills,
    combatMods,
    latentAbility: instance.development.latentAbilityId
      ? latentAbilityResolver?.(instance.dexId, instance.development.latentAbilityId)
      : undefined,
  };
}

export function starLabel(star: Star): string {
  return "★".repeat(star);
}

/**
 * 基礎才能をステータスへ乗せる。
 *
 * 割合のものは掛け算、速度だけ実数で足す。
 * クリ率・的中・抵抗は**0〜1に収める**——ここで抑えないと、
 * 装備と才能を積み切った個体の的中が1を超えて、抵抗の意味が消える。
 */
function applyTalentStats(stats: Stats, talents: TalentState): Stats {
  const bonus = talentStatBonus(talents);
  return {
    ...stats,
    hp: Math.round(stats.hp * (1 + bonus.hpPercent)),
    atk: Math.round(stats.atk * (1 + bonus.atkPercent)),
    def: Math.round(stats.def * (1 + bonus.defPercent)),
    spd: stats.spd + bonus.spdFlat,
    criRate: Math.max(0, Math.min(1, stats.criRate + bonus.criRate)),
    criDmg: Math.max(1, stats.criDmg + bonus.criDmg),
    accuracy: Math.max(0, Math.min(1, stats.accuracy + bonus.accuracy)),
    resistance: Math.max(0, Math.min(1, stats.resistance + bonus.resistance)),
  };
}

/**
 * 戦闘才能を戦闘補正へ乗せる。
 *
 * **装備のセット効果と掛け算で重ねる。**足し算にすると、
 * 装備で与ダメ+20%を持っている個体と持っていない個体で
 * 才能の+7%の意味が変わってしまう。
 */
function applyTalentCombatMods(base: CombatModifiers | undefined, talents: TalentState): CombatModifiers | undefined {
  const bonus = talentCombatBonus(talents);
  const hasAny = Object.values(bonus).some((v) => v !== 0);
  if (!hasAny) return base;
  const mods: CombatModifiers = { ...DEFAULT_COMBAT_MODIFIERS, ...(base ?? {}) };
  mods.damageDealtMultiplier *= 1 + bonus.damageDealt;
  mods.damageTakenMultiplier *= 1 - bonus.damageTaken;
  mods.healingMultiplier = (mods.healingMultiplier ?? 1) * (1 + bonus.healing);
  mods.shieldMultiplier = (mods.shieldMultiplier ?? 1) * (1 + bonus.shielding);
  mods.debuffChanceBonus = (mods.debuffChanceBonus ?? 0) + bonus.debuffChance;
  mods.gaugeUpMultiplier = (mods.gaugeUpMultiplier ?? 1) * (1 + bonus.gaugeUp);
  return mods;
}
