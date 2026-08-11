import { Element } from "../core/element.js";
import { DUNGEON_FLOOR_COUNT, Equipment, generateDungeonEquipment } from "../core/equipment.js";
import { Star, STAR_MAX_LEVEL } from "../core/rarity.js";
import {
  GACHA_SR_COMMON_TEMPLATE,
  GACHA_SR_RARE_TEMPLATE,
  GACHA_SSR_COMMON_TEMPLATE,
  GACHA_SSR_RARE_TEMPLATE,
  MONSTER_TEMPLATES,
  REINCARNATION_PIG_DEX,
} from "./monsters.js";

export interface DungeonEnemy {
  templateId: string;
  element: Element;
  star: Star;
  level: number;
  /** 階層専用ボス(お供2体を連れて登場する)かどうか */
  isBoss?: boolean;
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

/** お供(通常モンスター2体)は星5・Lv50(星5の最大値)で固定。難易度はpowerScaleのみで表現する */
const DUNGEON_ENEMY_STAR: Star = 5;
const DUNGEON_ENEMY_LEVEL = 50;

/** 階層専用ボスは、お供よりさらに一段階強い星6・Lv60(星6の最大値)で登場する */
const DUNGEON_BOSS_STAR: Star = 6;
const DUNGEON_BOSS_LEVEL = STAR_MAX_LEVEL[DUNGEON_BOSS_STAR];

/**
 * 各階層のボスは、ガチャ限定の高レアモンスター(SR:グリフォン/セラフ、SSR:ドラゴン/ネメシス)を
 * 巡回で1体割り当てる。ステータスも通常モンスターよりベースが高く設定されているうえに星6で
 * 登場するため、お供2体とはっきり格の違うボスらしい強さになる。
 */
const BOSS_TEMPLATES = [GACHA_SR_COMMON_TEMPLATE, GACHA_SR_RARE_TEMPLATE, GACHA_SSR_COMMON_TEMPLATE, GACHA_SSR_RARE_TEMPLATE];

/**
 * 1階/8階の必要パワースケール。
 * 1階は「星3モンスターに星1装備」くらいの、まだ育成途中のパーティでも挑めるくらいまで下げてあり、
 * 装備ダンジョンの入り口として無理なく足を踏み入れられるようにしてある。
 * そこから階層を上がるごとになだらかに強くなっていく。
 * ランクアップの複利倍率引き上げ(星5/Lv50の実効ステータス底上げ)や、
 * モンスターごとのスキル2/3が属性ごとに異なる組み合わせになったことによる
 * 戦闘バランスの変化に合わせて、この値は都度調整してある。
 */
const POWER_SCALE_START = 0.62;
const POWER_SCALE_END = 1.7;

/**
 * 9・10階はダンジョン最終盤の最終関門として、8階までの線形カーブに対してさらに
 * 大きく難易度を引き上げる。
 * 装備ダンジョンは通常パーティ(4体)より1体多い専用パーティ(最大5体)で挑めるうえ、
 * ガチャ限定の高レア(SR/SSR)モンスターは通常モンスターよりベースステータス・専用スキルとも
 * 明確に強力なため、SR/SSRを軸にした編成だと通常モンスターだけの編成基準の数値では
 * あっさり突破されてしまう。9・10階は「星5のSR/SSRを複数体、星6装備込みで編成した
 * 終盤パーティ」を基準に、サブステータスまでしっかり詰めてようやく安定して勝てる水準まで
 * 引き上げてある(通常モンスターだけの編成では、装備が最大でもほぼ勝てない想定)。
 */
const LATE_FLOOR_POWER_BONUS: Partial<Record<number, number>> = { 9: 2.72, 10: 2.94 };

function powerScaleForFloor(floor: number): number {
  const base = POWER_SCALE_START + ((floor - 1) * (POWER_SCALE_END - POWER_SCALE_START)) / (DUNGEON_FLOOR_COUNT - 1);
  return base * (LATE_FLOOR_POWER_BONUS[floor] ?? 1);
}

function buildFloor(floor: number): DungeonFloor {
  // 各階層の敵は単一属性で統一する。弱点を突く属性のパーティを組めば有利に戦えるようになる
  const floorElement = NORMAL_ELEMENTS[(floor - 1) % NORMAL_ELEMENTS.length];

  const companionTemplates = [MONSTER_TEMPLATES[(floor - 1) % MONSTER_TEMPLATES.length], MONSTER_TEMPLATES[floor % MONSTER_TEMPLATES.length]];
  const bossTemplate = BOSS_TEMPLATES[(floor - 1) % BOSS_TEMPLATES.length];

  // ボス1体+お供2体の3体編成。ボスを先頭に置く
  const enemies: DungeonEnemy[] = [
    {
      templateId: bossTemplate.templateId,
      element: floorElement,
      star: DUNGEON_BOSS_STAR,
      level: DUNGEON_BOSS_LEVEL,
      isBoss: true,
    },
    ...companionTemplates.map((template) => ({
      templateId: template.templateId,
      element: floorElement,
      star: DUNGEON_ENEMY_STAR,
      level: DUNGEON_ENEMY_LEVEL,
    })),
  ];

  return { floor, name: `装備ダンジョン ${floor}階`, enemies, powerScale: powerScaleForFloor(floor), goldReward: 60 * floor };
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
