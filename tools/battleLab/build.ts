/**
 * シナリオ → `BattleEngine` に渡せる `MonsterDefinition[]`。
 *
 * ## ここが「本編と同じものを測っている」ことの根拠
 *
 * 味方は `createMonsterInstance` → 装備 → `toBattleDefinition` という、
 * **ゲーム本編がプレイヤーの手持ちを戦闘へ送り出すのと同じ道**を通る。
 * 成長曲線もタイプ補正も能力ポイントもセット効果も潜在も、
 * ここでは1つも計算していない。全部向こうの関数がやる。
 *
 * 敵だけは事情が違う。試練の塔のボスは「まだ本編に無い仮の数字」を
 * 試したいので、最終ステータスを直接置ける口を開けてある。
 * ただし**スキルの効果そのものは本編の `Skill` 型**で書くので、
 * 解決はやはりエンジンが行う。
 */
import {
  EQUIP_MAX_LEVEL,
  Equipment,
  EquipStar,
  StatRoll,
  StatType,
  enhanceEquipment,
  rollStatValue,
} from "../../src/core/equipment.js";
import { MAX_SKILL_LEVEL } from "../../src/core/skill.js";
import type { MonsterDefinition } from "../../src/core/monster.js";
import { createMonsterInstance, toBattleDefinition } from "../../src/core/monsterInstance.js";
import { MONSTER_DEX, findMonsterById } from "../../src/data/monsters.js";
import { LATENT_ABILITY_CANDIDATES } from "../../src/data/latentAbilities.js";
import { PRESETS } from "./presets.js";
import { STAT_TYPES } from "../../src/core/equipment.js";
import type { AllySpec, EnemySpec, GearGrade, GearSpec, Scenario } from "./types.js";

/** サブOPは初期値の2割ぶん。本編の生成と同じ比率 */
const SUB_STAT_RATIO = 0.2;

let craftCounter = 0;

/**
 * 指定どおりのメイン・サブを持つ装備を1個作る。
 *
 * **値の表は借りる。**`rollStatValue` を通すので、装備の値付けを
 * 直せばこの道具の測定も自動でついてくる。ここで数字を置くと、
 * 本編を直した日に測定だけが古い表で回り続ける。
 */
function craftGear(spec: GearSpec, rng: () => number): Equipment {
  const star: EquipStar = spec.star ?? 6;
  craftCounter += 1;
  const mainStat: StatRoll = { type: spec.main, value: rollStatValue(spec.main, star, 1, rng) };
  const subStats: StatRoll[] = spec.subs
    .filter((type) => type !== spec.main)
    .slice(0, 4)
    .map((type) => ({ type, value: rollStatValue(type, star, SUB_STAT_RATIO, rng) }));
  const equipment: Equipment = {
    id: `lab_${craftCounter}`,
    slot: spec.slot,
    star,
    level: 0,
    set: spec.set ?? "CRIT",
    mainStat,
    subStats,
  };
  // 強化は本編の関数で回す。1段ずつ上がる伸び方をここで真似しない
  const target = Math.max(0, Math.min(EQUIP_MAX_LEVEL, spec.level ?? EQUIP_MAX_LEVEL));
  while (equipment.level < target) enhanceEquipment(equipment, rng);
  return equipment;
}

function dexIdOf(templateId: string, element: string): string {
  const id = `${templateId}_${element}`;
  if (!findMonsterById(id)) {
    const available = MONSTER_DEX.filter((d) => d.templateId === templateId).map((d) => d.id);
    throw new Error(`図鑑に ${id} がありません。候補: ${available.join(", ") || "(テンプレート自体が無い)"}`);
  }
  return id;
}

/** 味方1体を、本編と同じ道で戦闘定義まで持っていく */
/**
 * 装備の仕上がり具合ごとの設定。
 *
 * ここで効かせているのは主に**サブOPの中身**。★と強化値も落とすが、
 * 実際に効くのは「狙った項目がいくつ乗っているか」で、
 * そこが違うだけで同じモンスターが別物になる。
 */
const GRADE_RULES: Record<GearGrade, {
  star: EquipStar;
  level: number;
  roleSubs: number;
  /**
   * 最初から着いているサブOPの数。ここを指定した段だけ、残りは
   * **強化しながら増やす**(+3/+6/+9/+12/+15)。種類は選べない。
   */
  initialSubs?: number;
}> = {
  // 仕上げ切った人。サブ4つとも役割どおり
  FINISHED: { star: 6, level: 15, roleSubs: 4 },
  // 真面目に集めた人。半分は狙った項目、半分は引いたまま
  STRONG: { star: 6, level: 15, roleSubs: 2 },
  /*
   * 塔の上の方の想定。★6を最大まで上げてはいるが、**買った時点のサブは1〜2個**。
   * 残りは強化しながら増えるので、種類が選べない。
   * 枠ごとに1個・2個を交互にする(全部1個は悲観的すぎ、全部2個は楽観的すぎる)。
   */
  TYPICAL: { star: 6, level: 15, roleSubs: 2, initialSubs: 2 },
  // 育成の途中。狙った項目は1つだけ乗っている
  MID: { star: 6, level: 12, roleSubs: 1 },
  // 拾ったものを着けている段階。中身は完全に運任せ
  ROUGH: { star: 5, level: 9, roleSubs: 0 },
};

/**
 * プリセットの装備を、指定の仕上がり具合まで落とす。
 *
 * **メインは落とさない。** メインは枠ごとに選ぶものなので、
 * 装備が揃っていない人でも「速度メインの2枠」くらいは持っている。
 * 差が出るのはサブの中身の方で、そこを段階的に運任せへ寄せる。
 */
function applyGrade(gear: GearSpec[], grade: GearGrade, rng: () => number): GearSpec[] {
  const rule = GRADE_RULES[grade];
  return gear.map((spec, index) => {
    /*
     * 初期サブの数が決まっている段は、**そこまでしか配らない。**
     * 足りないぶんは `craftGear` の中で `enhanceEquipment` が増やす——
     * つまり種類は運任せになる。これが装備を集める側から見た本当の姿。
     */
    if (rule.initialSubs !== undefined) {
      // 枠ごとに1個・2個を交互に。全部1個は悲観的すぎ、全部2個は楽観的すぎる
      const count = index % 2 === 0 ? 1 : rule.initialSubs;
      return { ...spec, star: rule.star, level: rule.level, subs: spec.subs.slice(0, count) };
    }
    const role = spec.subs.slice(0, rule.roleSubs);
    const pool = STAT_TYPES.filter((type) => type !== spec.main && !role.includes(type));
    const filler: StatType[] = [];
    while (role.length + filler.length < 4 && pool.length > 0) {
      const [type] = pool.splice(Math.floor(rng() * pool.length), 1);
      filler.push(type);
    }
    return { ...spec, star: rule.star, level: rule.level, subs: [...role, ...filler] };
  });
}

export function buildAlly(spec: AllySpec, rng: () => number, grade?: GearGrade): MonsterDefinition {
  const preset = spec.preset ? PRESETS[spec.preset] : undefined;
  const dexId = dexIdOf(spec.templateId, spec.element);
  const dex = findMonsterById(dexId)!;

  const instance = createMonsterInstance(dexId, spec.star ?? 6, spec.level ?? 60);
  instance.skillLevels = spec.skillLevels ?? [MAX_SKILL_LEVEL, MAX_SKILL_LEVEL, MAX_SKILL_LEVEL];

  const type = spec.type ?? preset?.type ?? null;
  if (type) instance.development.type = type;

  const points = { hp: 0, atk: 0, def: 0, spd: 0, ...(preset?.abilityPoints ?? {}), ...(spec.abilityPoints ?? {}) };
  instance.development.abilityPoints = points;
  instance.development.abilityPointsConfirmed = true;

  /*
   * 潜在覚醒。**候補が無いモンスターもいる**ので、そこは黙って未覚醒にする。
   * ここで落とすと、覚醒先を持たない1体のせいでシナリオ全体が動かなくなる。
   */
  const candidates = LATENT_ABILITY_CANDIDATES[dexId] ?? [];
  const latentIndex = spec.latentIndex === undefined ? preset?.latentIndex ?? null : spec.latentIndex;
  if (latentIndex !== null && candidates[latentIndex]) {
    instance.development.latentAbilityId = candidates[latentIndex].id;
  }

  const baseGear = spec.gear ?? preset?.gear ?? [];
  const gearSpecs = grade ? applyGrade(baseGear, grade, rng) : baseGear;
  const gear = gearSpecs.map((g) => craftGear(g, rng));
  gear.forEach((eq) => { instance.equipment[eq.slot] = eq.id; });

  const def = toBattleDefinition(instance, dex, gear);
  const stats = spec.statOverrides ? { ...def.stats, ...spec.statOverrides } : def.stats;
  return { ...def, name: spec.label ?? def.name, stats };
}

/**
 * 敵1体。
 *
 * 最終ステータスを直接書ける口が開いているのは、**まだ本編に無い階を
 * 試すため**。図鑑の敵をそのまま出したい時は `useDexSkills` を立てて
 * `stats` を書かなければ、本編の敵がそのまま出る。
 */
export function buildEnemy(spec: EnemySpec): MonsterDefinition {
  const dexId = dexIdOf(spec.templateId, spec.element);
  const dex = findMonsterById(dexId)!;
  const instance = createMonsterInstance(dexId, spec.star ?? 6, spec.level ?? 60);
  instance.skillLevels = [MAX_SKILL_LEVEL, MAX_SKILL_LEVEL, MAX_SKILL_LEVEL];
  const base = toBattleDefinition(instance, dex);

  return {
    ...base,
    id: spec.label ?? base.id,
    name: spec.label ?? dex.name,
    stats: { ...base.stats, ...(spec.stats ?? {}) },
    skills: spec.skills ?? base.skills,
    bossTraits: spec.bossTraits ?? base.bossTraits,
    victoryTarget: spec.victoryTarget,
    initialCooldowns: spec.initialCooldowns,
    // 敵に装備は無い。セット効果を持ち込まない
    combatMods: undefined,
    latentAbility: undefined,
  };
}

export interface BuiltTeams {
  players: MonsterDefinition[];
  enemies: MonsterDefinition[];
}

export function buildTeams(scenario: Scenario, rng: () => number, grade?: GearGrade): BuiltTeams {
  return {
    players: scenario.allies.map((spec) => buildAlly(spec, rng, grade)),
    enemies: scenario.enemies.map((spec) => buildEnemy(spec)),
  };
}
