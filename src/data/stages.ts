import { Element } from "../core/element.js";
import { Equipment, SetType, generateThemedStageEquipment } from "../core/equipment.js";
import { Star, STAR_MAX_LEVEL } from "../core/rarity.js";
import { MONSTER_TEMPLATES, REINCARNATION_PIG_DEX } from "./monsters.js";

/** ステージの難易度。ノーマル→ハード→ヘルの順で敵が強化され、ドロップする装備の星も上がる */
export type Difficulty = "NORMAL" | "HARD" | "HELL";
export const DIFFICULTIES: Difficulty[] = ["NORMAL", "HARD", "HELL"];
export const DIFFICULTY_JA: Record<Difficulty, string> = { NORMAL: "ノーマル", HARD: "ハード", HELL: "ヘル" };

interface DifficultyModifier {
  /** 敵の星への加算値(6を超える分はクランプされる) */
  starBonus: number;
  /** 敵のレベルへの加算値(新しい星の最大レベルでクランプされる) */
  levelBonus: number;
  /** 敵の実効ステータス倍率(powerScale)にさらに掛かる倍率 */
  powerScaleMultiplier: number;
  /** 敵の速度に掛かる難易度倍率。終盤でも速度育成に意味を持たせる */
  speedScaleMultiplier: number;
  /** ドロップする装備の星への加算値 */
  equipmentStarBonus: number;
  /** モンスター・ファイター獲得EXP倍率 */
  expMultiplier: number;
}

/** 難易度ごとの敵強化・装備ドロップ星ボーナス。具体的な倍率はゲーム内では非公開 */
export const DIFFICULTY_MODIFIERS: Record<Difficulty, DifficultyModifier> = {
  NORMAL: { starBonus: 0, levelBonus: 0, powerScaleMultiplier: 1.0, speedScaleMultiplier: 1.0, equipmentStarBonus: 0, expMultiplier: 1 },
  HARD: { starBonus: 1, levelBonus: 5, powerScaleMultiplier: 1.35, speedScaleMultiplier: 1.1, equipmentStarBonus: 1, expMultiplier: 1.5 },
  HELL: { starBonus: 2, levelBonus: 10, powerScaleMultiplier: 1.8, speedScaleMultiplier: 1.2, equipmentStarBonus: 2, expMultiplier: 2 },
};

export interface WaveEnemy {
  templateId: string;
  element: Element;
  star: Star;
  level: number;
  isBoss?: boolean;
  /** ボスなど、図鑑名とは別の敵専用表示名 */
  displayName?: string;
  /** NORMAL時に使う最終速度。指定時はウェーブspeedScaleより優先する */
  speedOverride?: number;
  /** 難易度ごとの反撃までの被弾回数。主に古代守護ゴーレム用 */
  bossCounterAfterHits?: Partial<Record<Difficulty, number>>;
}

export interface Wave {
  waveNumber: number;
  isBossWave: boolean;
  enemies: WaveEnemy[];
  /** 敵の実効ステータスに掛かる倍率。序盤ステージは1.0未満にして初心者でも確実に勝てるようにする */
  powerScale: number;
  /** 敵の速度に掛かる倍率。powerScale とは別にする(速度は手番の数に直結するため) */
  speedScale: number;
}

export interface StageRewards {
  /** ウェーブを1つクリアするごとにもらえるゴールド */
  waveGold: number;
  /** ステージ(全ウェーブ)クリア時のボーナスゴールド */
  clearGold: number;
  /** 参加モンスター1体あたりの獲得経験値(ウェーブごと) */
  waveExp: number;
  /** ステージクリア時にモンスターがドロップする確率(0-1) */
  dropRate: number;
  /** ドロップするモンスターの星候補(この中から抽選) */
  dropStars: Star[];
  /** ドロップするモンスターの種族(このチャプターのテーマ種族固定) */
  dropTemplateId: string;
  /** ステージクリア時に装備がドロップする確率(0-1)。モンスタードロップとは独立した抽選 */
  equipmentDropRate: number;
  /** ドロップする装備のシリーズ(このチャプターのテーマシリーズ固定) */
  equipmentSet: SetType;
}

export interface Stage {
  id: string;
  /** チャプター番号(1〜8)。チャプターごとにドロップ種族・装備シリーズのテーマが決まっている */
  chapter: number;
  stageNumber: number;
  name: string;
  waves: Wave[];
  rewards: StageRewards;
}

const NORMAL_ELEMENTS: Element[] = ["FIRE", "WATER", "ELECTRIC", "GRASS"];

interface ChapterTheme {
  chapter: number;
  templateId: string;
  equipmentSet: SetType;
}

/**
 * 5〜8章では新規高レアを敵として積極的に登場させる一方、ステージ周回だけで
 * ガチャ高レアが量産されないよう、章ドロップは従来の通常種族8体を一巡させる。
 */
const CHAPTER_THEMES: ChapterTheme[] = [
  { chapter: 1, templateId: "slime", equipmentSet: "CRIT" },
  { chapter: 2, templateId: "wolf", equipmentSet: "POWER" },
  { chapter: 3, templateId: "golem", equipmentSet: "GUARD" },
  { chapter: 4, templateId: "fairy", equipmentSet: "VITALITY" },
  { chapter: 5, templateId: "treant", equipmentSet: "ACCURACY_SET" },
  { chapter: 6, templateId: "knight", equipmentSet: "RESIST_SET" },
  { chapter: 7, templateId: "imp", equipmentSet: "SWIFT" },
  { chapter: 8, templateId: "wisp", equipmentSet: "CRIT" },
];

/** 5〜8章の道中編成。各ステージ3Wave×4体を固定し、対策を立てて再挑戦できるようにする。 */
const LATE_STAGE_WAVES: Record<string, string[][]> = {
  "5-1": [["mushroon", "slime", "wolf", "imp"], ["mushroon", "mushroon", "fairy", "wisp"], ["mushroon", "kobold", "imp", "slime"]],
  "5-2": [["shellturtle", "wolf", "fairy", "golem"], ["shellturtle", "mushroon", "wisp", "imp"], ["shellturtle", "shellturtle", "kobold", "fairy"]],
  "5-3": [["basilisk", "mushroon", "imp", "slime"], ["basilisk", "wisp", "kobold", "wolf"], ["basilisk", "basilisk", "mushroon", "fairy"]],
  "5-4": [["mushroon", "shellturtle", "kobold", "basilisk"], ["shellturtle", "basilisk", "fairy", "wisp"], ["basilisk", "mushroon", "kobold", "imp"]],
  "5-5": [["mushroon", "shellturtle", "basilisk", "fairy"], ["basilisk", "kobold", "imp", "wisp"], ["mushroon", "treant", "shellturtle", "fairy"]],

  "6-1": [["mimic", "golem", "kobold", "wolf"], ["mimic", "shellturtle", "fairy", "basilisk"], ["mimic", "valkyria", "golem", "kobold"]],
  "6-2": [["valkyria", "fairy", "wolf", "shellturtle"], ["valkyria", "mimic", "basilisk", "wisp"], ["valkyria", "valkyria", "kobold", "fairy"]],
  "6-3": [["thunderbeast", "wolf", "wisp", "kobold"], ["thunderbeast", "valkyria", "basilisk", "mimic"], ["thunderbeast", "thunderbeast", "shellturtle", "fairy"]],
  "6-4": [["mimic", "valkyria", "thunderbeast", "basilisk"], ["shellturtle", "mimic", "valkyria", "fairy"], ["thunderbeast", "basilisk", "kobold", "mimic"]],
  "6-5": [["mimic", "shellturtle", "valkyria", "golem"], ["thunderbeast", "basilisk", "mimic", "wisp"], ["mimic", "golem", "valkyria", "shellturtle"]],

  "7-1": [["abyssreaper", "mimic", "imp", "basilisk"], ["abyssreaper", "mushroon", "fairy", "kobold"], ["abyssreaper", "fenrir", "mimic", "wisp"]],
  "7-2": [["fenrir", "wolf", "kobold", "thunderbeast"], ["fenrir", "basilisk", "mimic", "fairy"], ["fenrir", "fenrir", "abyssreaper", "imp"]],
  "7-3": [["abyssreaper", "fenrir", "valkyria", "basilisk"], ["abyssreaper", "mimic", "thunderbeast", "wisp"], ["fenrir", "abyssreaper", "mushroon", "fairy"]],
  "7-4": [["abyssreaper", "fenrir", "mimic", "basilisk"], ["fenrir", "valkyria", "thunderbeast", "wisp"], ["abyssreaper", "fenrir", "kobold", "mimic"]],
  "7-5": [["abyssreaper", "fenrir", "mimic", "fairy"], ["abyssreaper", "basilisk", "thunderbeast", "wisp"], ["abyssreaper", "abyssreaper", "fenrir", "mimic"]],

  "8-1": [["chronos", "wisp", "basilisk", "fairy"], ["chronos", "abyssreaper", "kobold", "mimic"], ["chronos", "fenrir", "thunderbeast", "valkyria"]],
  "8-2": [["behemoth", "mimic", "shellturtle", "fairy"], ["behemoth", "basilisk", "abyssreaper", "wisp"], ["behemoth", "behemoth", "fenrir", "chronos"]],
  "8-3": [["fenrir", "thunderbeast", "kobold", "abyssreaper"], ["chronos", "basilisk", "fenrir", "valkyria"], ["abyssreaper", "chronos", "fenrir", "behemoth"]],
  "8-4": [["chronos", "abyssreaper", "basilisk", "mimic"], ["fenrir", "thunderbeast", "valkyria", "behemoth"], ["chronos", "abyssreaper", "fenrir", "behemoth"]],
  "8-5": [["chronos", "basilisk", "abyssreaper", "wisp"], ["fenrir", "thunderbeast", "behemoth", "valkyria"], ["chronos", "chronos", "abyssreaper", "behemoth"]],
};

interface BossProfile {
  templateId: string;
  displayName: string;
  normalSpeed: number;
  /** 特定属性のスキル構成をボスに使いたい場合のみ指定する。 */
  element?: Element;
  counterAfterHits?: Partial<Record<Difficulty, number>>;
}

/** 5〜8章の章ボス。速度はNORMALの最終実効値を直接指定する。 */
const BOSS_PROFILES: Partial<Record<number, BossProfile>> = {
  5: { templateId: "treant", displayName: "腐食トレント", normalSpeed: 120 },
  6: { templateId: "golem", displayName: "古代守護ゴーレム", normalSpeed: 125, counterAfterHits: { NORMAL: 5, HARD: 4, HELL: 3 } },
  7: { templateId: "abyssreaper", displayName: "奈落の死神", normalSpeed: 145 },
  // 水クロノスは強化済み「時空崩壊」(ダメージ後70%でゲージ100%減少)を持つ。
  8: { templateId: "chronos", displayName: "時空の支配者", normalSpeed: 155, element: "WATER" },
};

/** チャプターテーマのモンスター(星1)がステージクリア時にドロップする確率。ゲーム内では非公開 */
const CHAPTER_MONSTER_DROP_RATE = 0.15;
/** チャプターテーマの装備(星1)がステージクリア時にドロップする確率。ゲーム内では非公開 */
const CHAPTER_EQUIPMENT_DROP_RATE = 0.5;

function clampLevel(star: Star, level: number, max: Record<Star, number>): number {
  return Math.min(level, max[star]);
}

const MAX_STAR: Star = 6;

/** 全8チャプター×5ステージを通した番号(1〜40)。 */
function globalStageIndex(chapter: number, stageNumber: number): number {
  return (chapter - 1) * 5 + stageNumber;
}

/** 5章までは★5、6章から通常敵も★6へ移行する。 */
const STAR_BREAKPOINTS = [1, 5, 9, 13, 17, 26];

function baseStarForGlobalIndex(globalIndex: number): Star {
  let star = 1;
  for (let i = STAR_BREAKPOINTS.length - 1; i >= 0; i--) {
    if (globalIndex >= STAR_BREAKPOINTS[i]) {
      star = i + 1;
      break;
    }
  }
  return Math.min(MAX_STAR, star) as Star;
}

/** グローバルステージ番号が1つ上がるごとにレベルが+2される(上限は星ごとにクランプ)。 */
function baseLevelForGlobalIndex(globalIndex: number, waveNumber: number): number {
  return 1 + (globalIndex - 1) * 2 + (waveNumber - 1);
}

/** 1〜4章は従来値を維持し、5章以降だけ滑らかに1.55倍まで引き上げる。 */
const POWER_SCALE_BASE = 0.5;
const POWER_SCALE_STEP = 0.031;
const LEGACY_STAGE_COUNT = 20;
const LEGACY_POWER_AT_20 = POWER_SCALE_BASE + POWER_SCALE_STEP * (LEGACY_STAGE_COUNT - 1);
const LATE_POWER_SCALE_MAX = 1.55;

function powerScaleForGlobalIndex(globalIndex: number): number {
  if (globalIndex <= LEGACY_STAGE_COUNT) {
    return Math.min(1.12, POWER_SCALE_BASE + POWER_SCALE_STEP * (globalIndex - 1));
  }
  const t = Math.min(1, (globalIndex - LEGACY_STAGE_COUNT) / 20);
  return LEGACY_POWER_AT_20 + (LATE_POWER_SCALE_MAX - LEGACY_POWER_AT_20) * t;
}

/**
 * 速度は1〜4章の従来カーブ(1.00→1.16)を保ち、5〜8章で1.40まで伸ばす。
 * これによりCh5の高速役が約145、Ch8の高速役が約165〜170になる。
 */
const SPEED_SCALE_BASE = 1;
const LEGACY_SPEED_SCALE_MAX = 1.16;
const LATE_SPEED_SCALE_MAX = 1.4;

function speedScaleForGlobalIndex(globalIndex: number): number {
  if (globalIndex <= LEGACY_STAGE_COUNT) {
    const t = Math.min(1, Math.max(0, (globalIndex - 1) / (LEGACY_STAGE_COUNT - 1)));
    return SPEED_SCALE_BASE + (LEGACY_SPEED_SCALE_MAX - SPEED_SCALE_BASE) * t;
  }
  const t = Math.min(1, (globalIndex - LEGACY_STAGE_COUNT) / 20);
  return LEGACY_SPEED_SCALE_MAX + (LATE_SPEED_SCALE_MAX - LEGACY_SPEED_SCALE_MAX) * t;
}

const WAVE_SIZE = 4;

function rotatingWaveTemplateIds(themeTemplateId: string, globalIndex: number, waveNumber: number): string[] {
  const others = MONSTER_TEMPLATES.map((t) => t.templateId).filter((id) => id !== themeTemplateId);
  const start = ((globalIndex - 1) * 2 + (waveNumber - 1) * 3) % Math.max(1, others.length);
  const picked = [themeTemplateId];
  for (let i = 0; picked.length < WAVE_SIZE && i < others.length; i++) {
    picked.push(others[(start + i) % others.length]);
  }
  while (picked.length < WAVE_SIZE) picked.push(picked[picked.length % Math.max(1, picked.length)]);
  return picked;
}

function waveTemplateIds(theme: ChapterTheme, stageNumber: number, waveNumber: number): string[] {
  const fixed = LATE_STAGE_WAVES[`${theme.chapter}-${stageNumber}`]?.[waveNumber - 1];
  return fixed ? [...fixed] : rotatingWaveTemplateIds(theme.templateId, globalStageIndex(theme.chapter, stageNumber), waveNumber);
}

function buildWave(theme: ChapterTheme, stageNumber: number, waveNumber: number, isBossWave: boolean): Wave {
  const globalIndex = globalStageIndex(theme.chapter, stageNumber);
  const baseStar = baseStarForGlobalIndex(globalIndex);
  const baseLevel = baseLevelForGlobalIndex(globalIndex, waveNumber);

  const enemies: WaveEnemy[] = waveTemplateIds(theme, stageNumber, waveNumber).map((templateId, i) => {
    const element = NORMAL_ELEMENTS[(i + stageNumber + waveNumber) % NORMAL_ELEMENTS.length];
    return {
      templateId,
      element,
      star: baseStar,
      level: clampLevel(baseStar, baseLevel, STAR_MAX_LEVEL),
    };
  });

  if (isBossWave) {
    const bossStar = Math.min(MAX_STAR, baseStar + 1) as Star;
    const profile = BOSS_PROFILES[theme.chapter];

    if (profile) {
      // 4体編成には完全な中央がないため、中央寄りの2番目へ固定する。
      enemies[1] = {
        ...enemies[1],
        templateId: profile.templateId,
        element: profile.element ?? "DARK",
        star: bossStar,
        level: clampLevel(bossStar, baseLevel + 5, STAR_MAX_LEVEL),
        isBoss: true,
        displayName: profile.displayName,
        speedOverride: profile.normalSpeed,
        bossCounterAfterHits: profile.counterAfterHits,
      };
    } else {
      // 1〜4章も表示位置を統一する。テーマ種族(先頭)を2番目へ移し、既存の能力は変えない。
      const themeEnemy = enemies[0];
      enemies[0] = enemies[1];
      enemies[1] = {
        ...themeEnemy,
        element: "DARK",
        star: bossStar,
        level: clampLevel(bossStar, baseLevel + 5, STAR_MAX_LEVEL),
        isBoss: true,
      };
    }
  }

  return {
    waveNumber,
    isBossWave,
    enemies,
    powerScale: powerScaleForGlobalIndex(globalIndex),
    speedScale: speedScaleForGlobalIndex(globalIndex),
  };
}

/** チャプターが1つ上がるごとに、強くなった敵に見合うようゴールドも底上げする */
const CHAPTER_REWARD_STEP = 0.6;

function buildStage(theme: ChapterTheme, stageNumber: number): Stage {
  const isFinalStage = stageNumber === 5;
  const waves: Wave[] = [1, 2, 3].map((waveNumber) => buildWave(theme, stageNumber, waveNumber, isFinalStage && waveNumber === 3));
  const chapterRewardMultiplier = 1 + CHAPTER_REWARD_STEP * (theme.chapter - 1);

  const rewards: StageRewards = {
    waveGold: Math.round(30 * stageNumber * chapterRewardMultiplier),
    clearGold: Math.round(150 * stageNumber * chapterRewardMultiplier),
    // 4-5で到達した従来の上限(2,000/Wave=6,000/周)を維持し、育成Dの役割を侵食しない。
    waveExp: Math.min(2_000, 100 * globalStageIndex(theme.chapter, stageNumber)),
    dropRate: CHAPTER_MONSTER_DROP_RATE,
    dropStars: [1],
    dropTemplateId: theme.templateId,
    equipmentDropRate: CHAPTER_EQUIPMENT_DROP_RATE,
    equipmentSet: theme.equipmentSet,
  };

  return {
    id: `${theme.chapter}-${stageNumber}`,
    chapter: theme.chapter,
    stageNumber,
    name: `ステージ ${theme.chapter}-${stageNumber}`,
    waves,
    rewards,
  };
}

export const STAGES: Stage[] = CHAPTER_THEMES.flatMap((theme) => [1, 2, 3, 4, 5].map((stageNumber) => buildStage(theme, stageNumber)));

export function findStage(stageId: string): Stage | undefined {
  return STAGES.find((s) => s.id === stageId);
}

export interface StageDrop {
  dexId: string;
  star: Star;
}

/** ステージクリア報酬として、確率でモンスターをドロップする(なければnull)。種族はそのチャプターのテーマ種族固定 */
export function rollStageDrop(stage: Stage, rng: () => number = Math.random): StageDrop | null {
  if (rng() >= stage.rewards.dropRate) return null;
  const star = stage.rewards.dropStars[Math.floor(rng() * stage.rewards.dropStars.length)];
  const element = NORMAL_ELEMENTS[Math.floor(rng() * NORMAL_ELEMENTS.length)];
  return { dexId: `${stage.rewards.dropTemplateId}_${element}`, star };
}

/** ボスステージ(各チャプター最終ステージ)クリア時、装備が星+1でドロップする確率。ゲーム内では非公開 */
const BOSS_STAGE_EQUIPMENT_STAR_BONUS_RATE = 0.25;

/**
 * ステージクリア報酬として、確率で装備をドロップする(なければnull)。シリーズはそのチャプターのテーマシリーズ固定。
 * モンスタードロップとは独立した抽選。ボスステージ(stageNumber=5)ではたまに星+1の装備が出るほか、
 * 難易度がハード/ヘルの場合はさらに星が加算される。
 */
export function rollStageEquipment(stage: Stage, rng: () => number = Math.random, difficulty: Difficulty = "NORMAL"): Equipment | null {
  if (rng() >= stage.rewards.equipmentDropRate) return null;
  const isBossStage = stage.stageNumber === 5;
  const bossBonus = isBossStage && rng() < BOSS_STAGE_EQUIPMENT_STAR_BONUS_RATE ? 1 : 0;
  const starBonus = bossBonus + DIFFICULTY_MODIFIERS[difficulty].equipmentStarBonus;
  return generateThemedStageEquipment(stage.rewards.equipmentSet, rng, starBonus);
}

/** 通常ステージでの転生ピッグ(星2)ドロップ率。他のドロップとは独立した抽選 */
export const STAGE_REINCARNATION_PIG_DROP_RATE = 0.05;
/** 通常ステージでの召喚の書ドロップ率。他のドロップとは独立した抽選 */
export const STAGE_SUMMON_SCROLL_DROP_RATE = 0.01;

/** ステージクリア報酬として、低確率で転生ピッグ(星2固定)がドロップする(なければnull) */
export function rollStageReincarnationPig(rng: () => number = Math.random): StageDrop | null {
  if (rng() >= STAGE_REINCARNATION_PIG_DROP_RATE) return null;
  const variant = REINCARNATION_PIG_DEX[Math.floor(rng() * REINCARNATION_PIG_DEX.length)];
  return { dexId: variant.id, star: 2 };
}

/** ステージクリア報酬として、低確率で召喚の書がドロップする */
export function rollStageSummonScroll(rng: () => number = Math.random): boolean {
  return rng() < STAGE_SUMMON_SCROLL_DROP_RATE;
}
