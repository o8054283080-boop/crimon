import { Element } from "../core/element.js";
import { DUNGEON_FLOOR_COUNT, Equipment, generateDungeonEquipment } from "../core/equipment.js";
import { Star } from "../core/rarity.js";
import { MONSTER_TEMPLATES, REINCARNATION_PIG_DEX } from "./monsters.js";

export interface DungeonEnemy {
  templateId: string;
  element: Element;
  star: Star;
  level: number;
}

export interface DungeonFloor {
  floor: number;
  name: string;
  enemies: DungeonEnemy[];
  /** 敵の実効ステータスに掛かる倍率。装備を整えた強いパーティ向けなので通常ステージより高めに設定 */
  powerScale: number;
  goldReward: number;
}

const NORMAL_ELEMENTS: Element[] = ["FIRE", "WATER", "ELECTRIC", "GRASS"];

/** 装備ダンジョンの敵は全階層とも星5・Lv50(最大値)で固定。難易度はpowerScaleのみで表現する */
const DUNGEON_ENEMY_STAR: Star = 5;
const DUNGEON_ENEMY_LEVEL = 50;

/**
 * 1階/10階の必要パワースケール(星5装備で武装した星5モンスターでないと勝てない水準〜
 * 星6装備をそろえてようやく挑める最終関門)。
 * ランクアップの複利倍率引き上げ(星5/Lv50の実効ステータス底上げ)や、
 * モンスターごとのスキル2/3が属性ごとに異なる組み合わせになったことによる
 * 戦闘バランスの変化に合わせて、この値は都度調整してある。
 */
const POWER_SCALE_START = 1.3;
const POWER_SCALE_END = 2.6;

function buildFloor(floor: number): DungeonFloor {
  // 属性は階層によらず固定(要素ジャンケンの巡り合わせで難易度が階層ごとにぶれないようにする)
  const enemies: DungeonEnemy[] = MONSTER_TEMPLATES.map((template, i) => ({
    templateId: template.templateId,
    element: NORMAL_ELEMENTS[i % NORMAL_ELEMENTS.length],
    star: DUNGEON_ENEMY_STAR,
    level: DUNGEON_ENEMY_LEVEL,
  }));

  // 星5装備で埋めた星5モンスターでないと勝てないレベルまでパワースケールを引き上げ、
  // 階層が上がるほど星6装備クラスの投資が必要になるよう線形に上昇させる
  const powerScale = POWER_SCALE_START + ((floor - 1) * (POWER_SCALE_END - POWER_SCALE_START)) / (DUNGEON_FLOOR_COUNT - 1);

  return { floor, name: `装備ダンジョン ${floor}階`, enemies, powerScale, goldReward: 60 * floor };
}

export const EQUIPMENT_DUNGEON_FLOORS: DungeonFloor[] = Array.from({ length: DUNGEON_FLOOR_COUNT }, (_, i) => buildFloor(i + 1));

export function findDungeonFloor(floor: number): DungeonFloor | undefined {
  return EQUIPMENT_DUNGEON_FLOORS.find((f) => f.floor === floor);
}

/** 装備ダンジョンは挑戦するたびに必ず1個装備がドロップする(階層のドロップ率テーブルに従って星が決まる) */
export function rollDungeonEquipment(floor: DungeonFloor, rng: () => number = Math.random): Equipment {
  return generateDungeonEquipment(floor.floor, rng);
}

/** 召喚の書の階層共通ドロップ率 */
export const SUMMON_SCROLL_DROP_RATE = 0.05;
/** 転生ピッグのドロップ率(全階層共通) */
export const REINCARNATION_PIG_DROP_RATE = 0.1;
/** この階層まで(1〜6階)は星2ピッグ、それより上(7〜10階)は星3ピッグがドロップする */
export const REINCARNATION_PIG_LOW_TIER_MAX_FLOOR = 6;

export interface DungeonPigDrop {
  dexId: string;
  star: Star;
}

/** 装備ドロップとは独立して、低確率で召喚の書もドロップする(全階層共通) */
export function rollDungeonSummonScroll(rng: () => number = Math.random): boolean {
  return rng() < SUMMON_SCROLL_DROP_RATE;
}

function reincarnationPigStarForFloor(floor: number): Star {
  return floor <= REINCARNATION_PIG_LOW_TIER_MAX_FLOOR ? 2 : 3;
}

/**
 * 低確率で転生ピッグがドロップする(全階層共通10%)。
 * 1〜6階は星2、7〜10階は星3のピッグがドロップする。ドロップしなければnull
 */
export function rollDungeonReincarnationPig(floor: DungeonFloor, rng: () => number = Math.random): DungeonPigDrop | null {
  if (rng() >= REINCARNATION_PIG_DROP_RATE) return null;
  const variant = REINCARNATION_PIG_DEX[Math.floor(rng() * REINCARNATION_PIG_DEX.length)];
  return { dexId: variant.id, star: reincarnationPigStarForFloor(floor.floor) };
}
