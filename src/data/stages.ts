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
  /** ドロップする装備の星への加算値 */
  equipmentStarBonus: number;
}

/** 難易度ごとの敵強化・装備ドロップ星ボーナス。具体的な倍率はゲーム内では非公開 */
export const DIFFICULTY_MODIFIERS: Record<Difficulty, DifficultyModifier> = {
  NORMAL: { starBonus: 0, levelBonus: 0, powerScaleMultiplier: 1.0, equipmentStarBonus: 0 },
  HARD: { starBonus: 1, levelBonus: 5, powerScaleMultiplier: 1.35, equipmentStarBonus: 1 },
  HELL: { starBonus: 2, levelBonus: 10, powerScaleMultiplier: 1.8, equipmentStarBonus: 2 },
};

export interface WaveEnemy {
  templateId: string;
  element: Element;
  star: Star;
  level: number;
  isBoss?: boolean;
}

export interface Wave {
  waveNumber: number;
  isBossWave: boolean;
  enemies: WaveEnemy[];
  /** 敵の実効ステータスに掛かる倍率。序盤ステージは1.0未満にして初心者でも確実に勝てるようにする */
  powerScale: number;
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
  /** チャプター番号(1〜4)。チャプターごとにドロップするモンスター種族・装備シリーズのテーマが決まっている */
  chapter: number;
  stageNumber: number;
  name: string;
  waves: Wave[];
  rewards: StageRewards;
}

const NORMAL_ELEMENTS: Element[] = ["FIRE", "WATER", "ELECTRIC", "GRASS"];

/**
 * チャプター(ステージ1〜4)ごとのテーマ。各チャプターをクリアすると、
 * このテーマ種族(星1)とテーマ装備シリーズ(星1)が固定で出やすくなる。
 */
interface ChapterTheme {
  chapter: number;
  templateId: string;
  equipmentSet: SetType;
}

const CHAPTER_THEMES: ChapterTheme[] = [
  { chapter: 1, templateId: "slime", equipmentSet: "CRIT" },
  { chapter: 2, templateId: "wolf", equipmentSet: "POWER" },
  { chapter: 3, templateId: "golem", equipmentSet: "GUARD" },
  { chapter: 4, templateId: "fairy", equipmentSet: "VITALITY" },
];

/** チャプターテーマのモンスター(星1)がステージクリア時にドロップする確率。ゲーム内では非公開 */
const CHAPTER_MONSTER_DROP_RATE = 0.15;
/** チャプターテーマの装備(星1)がステージクリア時にドロップする確率。ゲーム内では非公開 */
const CHAPTER_EQUIPMENT_DROP_RATE = 0.5;

function clampLevel(star: Star, level: number, max: Record<Star, number>): number {
  return Math.min(level, max[star]);
}

const MAX_STAR: Star = 6;

/**
 * 全4チャプター×5ステージを通しで並べた「グローバルステージ番号」(1〜20)。
 * チャプターをまたいでも強さがリセットされないよう、星・レベル・powerScaleは
 * すべてこの通し番号を基準に連続的に上昇させる(同じステージ番号でもチャプターが
 * 上がれば必ず明確に強くなる)。
 */
function globalStageIndex(chapter: number, stageNumber: number): number {
  return (chapter - 1) * 5 + stageNumber;
}

/**
 * グローバルステージ番号がこの値に到達した時点で、敵の基本星がその添字+1になる(星1〜5)。
 * 4ステージごとに星が1つ上がる均等な刻みにしてあり、チャプターをまたぐたびに必ず星が変わる。
 * 星6は基本星としては出現せず、各チャプター最終ステージのボス個体(+1される)だけが到達できる
 * 特別な星として、20ステージ目(最終チャプターのボス)で初めて到達するようにしてある。
 */
const STAR_BREAKPOINTS = [1, 5, 9, 13, 17];

function baseStarForGlobalIndex(globalIndex: number): Star {
  let star = 1;
  for (let i = STAR_BREAKPOINTS.length - 1; i >= 0; i--) {
    if (globalIndex >= STAR_BREAKPOINTS[i]) {
      star = i + 1;
      break;
    }
  }
  return star as Star;
}

/** グローバルステージ番号が1つ上がるごとにレベルが+2される(ウェーブ内でもさらに+1ずつ) */
function baseLevelForGlobalIndex(globalIndex: number, waveNumber: number): number {
  return 1 + (globalIndex - 1) * 2 + (waveNumber - 1);
}

/**
 * 敵の実効ステータス倍率(powerScale)。ステージ1-1の0.5倍から始まり、全20ステージを通して滑らかに上昇する。
 * 星の上昇(最大で1.4^4≒3.8倍)だけでも十分に強い上昇カーブになるため、powerScaleの上げ幅は
 * 控えめ(最大でも1.0倍=据え置き相当)に留め、星と掛け合わさって難易度が跳ね上がりすぎないようにしてある。
 */
const POWER_SCALE_BASE = 0.5;
const POWER_SCALE_STEP = 0.026;
const POWER_SCALE_MAX = 1.0;

function powerScaleForGlobalIndex(globalIndex: number): number {
  return Math.min(POWER_SCALE_MAX, POWER_SCALE_BASE + POWER_SCALE_STEP * (globalIndex - 1));
}

function buildWave(chapter: number, stageNumber: number, waveNumber: number, isBossWave: boolean): Wave {
  const globalIndex = globalStageIndex(chapter, stageNumber);
  const baseStar = baseStarForGlobalIndex(globalIndex);
  const baseLevel = baseLevelForGlobalIndex(globalIndex, waveNumber);

  const enemies: WaveEnemy[] = MONSTER_TEMPLATES.map((template, i) => {
    const element = NORMAL_ELEMENTS[(i + stageNumber + waveNumber) % NORMAL_ELEMENTS.length];
    return {
      templateId: template.templateId,
      element,
      star: baseStar,
      level: clampLevel(baseStar, baseLevel, STAR_MAX_LEVEL),
    };
  });

  if (isBossWave) {
    const bossStar = Math.min(MAX_STAR, baseStar + 1) as Star;
    enemies[0] = {
      ...enemies[0],
      element: "DARK",
      star: bossStar,
      level: clampLevel(bossStar, baseLevel + 5, STAR_MAX_LEVEL),
      isBoss: true,
    };
  }

  const powerScale = powerScaleForGlobalIndex(globalIndex);

  return { waveNumber, isBossWave, enemies, powerScale };
}

/** チャプターが1つ上がるごとに、強くなった敵に見合うようウェーブ報酬(ゴールド・経験値)も底上げする */
const CHAPTER_REWARD_STEP = 0.6;

function buildStage(theme: ChapterTheme, stageNumber: number): Stage {
  const isFinalStage = stageNumber === 5;
  const waves: Wave[] = [1, 2, 3].map((waveNumber) => buildWave(theme.chapter, stageNumber, waveNumber, isFinalStage && waveNumber === 3));
  const chapterRewardMultiplier = 1 + CHAPTER_REWARD_STEP * (theme.chapter - 1);

  const rewards: StageRewards = {
    waveGold: Math.round(30 * stageNumber * chapterRewardMultiplier),
    clearGold: Math.round(150 * stageNumber * chapterRewardMultiplier),
    waveExp: Math.round(25 * stageNumber * chapterRewardMultiplier),
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
