import { Element } from "../core/element.js";
import { Equipment, SetType, generateThemedStageEquipment } from "../core/equipment.js";
import { Star } from "../core/rarity.js";
import { MONSTER_TEMPLATES, REINCARNATION_PIG_DEX } from "./monsters.js";

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

const STAR_MAX: Record<Star, number> = { 1: 15, 2: 20, 3: 30, 4: 40, 5: 50 };

function buildWave(stageNumber: number, waveNumber: number, isBossWave: boolean): Wave {
  // 星1のスターターパーティ(Lv1)がステージ1-1から無理なく挑戦できるよう、
  // レベルは緩やかに(1-1で敵Lv1、1-5ボスでも星2Lv15程度まで)しか上げない。
  // どのチャプターも同じ難易度カーブ(チャプターはドロップのテーマのみが異なる)。
  const baseStar = Math.min(2, Math.ceil(stageNumber / 3)) as Star;
  const baseLevel = 1 + (stageNumber - 1) * 2 + (waveNumber - 1);

  const enemies: WaveEnemy[] = MONSTER_TEMPLATES.map((template, i) => {
    const element = NORMAL_ELEMENTS[(i + stageNumber + waveNumber) % NORMAL_ELEMENTS.length];
    return {
      templateId: template.templateId,
      element,
      star: baseStar,
      level: clampLevel(baseStar, baseLevel, STAR_MAX),
    };
  });

  if (isBossWave) {
    const bossStar = Math.min(5, baseStar + 1) as Star;
    enemies[0] = {
      ...enemies[0],
      element: "DARK",
      star: bossStar,
      level: clampLevel(bossStar, baseLevel + 5, STAR_MAX),
      isBoss: true,
    };
  }

  // 序盤ステージの敵は少し弱めにして、初心者でも安定して勝てるようにする。
  // ステージ5でようやく等倍(プレイヤーと五分)になる。
  const powerScale = Math.min(1, 0.45 + 0.11 * stageNumber);

  return { waveNumber, isBossWave, enemies, powerScale };
}

function buildStage(theme: ChapterTheme, stageNumber: number): Stage {
  const isFinalStage = stageNumber === 5;
  const waves: Wave[] = [1, 2, 3].map((waveNumber) => buildWave(stageNumber, waveNumber, isFinalStage && waveNumber === 3));

  const rewards: StageRewards = {
    waveGold: 30 * stageNumber,
    clearGold: 150 * stageNumber,
    waveExp: 25 * stageNumber,
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

/** ステージクリア報酬として、確率で装備をドロップする(なければnull)。シリーズはそのチャプターのテーマシリーズ固定。モンスタードロップとは独立した抽選 */
export function rollStageEquipment(stage: Stage, rng: () => number = Math.random): Equipment | null {
  if (rng() >= stage.rewards.equipmentDropRate) return null;
  return generateThemedStageEquipment(stage.rewards.equipmentSet, rng);
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
