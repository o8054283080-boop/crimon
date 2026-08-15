import { Element } from "../core/element.js";
import { DUNGEON_FLOOR_COUNT, Equipment, generateDungeonEquipment } from "../core/equipment.js";
import { Star, STAR_MAX_LEVEL } from "../core/rarity.js";
import {
  ANCIENT_CRYSTAL,
  ANCIENT_CRYSTAL_CURSE,
  ANCIENT_DEMON,
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
 * 1〜8階のボスは、ガチャ限定の高レアモンスター(SR:グリフォン/セラフ、SSR:ドラゴン/ネメシス)を
 * 巡回で1体割り当てる。ステータスも通常モンスターよりベースが高く設定されているうえに星6で
 * 登場するため、お供2体とはっきり格の違うボスらしい強さになる。
 */
const BOSS_TEMPLATES = [GACHA_SR_COMMON_TEMPLATE, GACHA_SR_RARE_TEMPLATE, GACHA_SSR_COMMON_TEMPLATE, GACHA_SSR_RARE_TEMPLATE];

/**
 * 9・10階(ダンジョン最終盤の最終関門)だけは、装備ダンジョン専用のオリジナルボス
 * 「古代の魔人」が固定で登場する。ガチャには一切出現しない完全にダンジョン専用の存在で、
 * お供2体も同じく専用の「古代のクリスタル」「古代の呪晶」の組み合わせで固定になる。
 * 古代のクリスタルは自ら攻めるよりも古代の魔人へのバフ・回復を優先するサポート役、
 * 古代の呪晶は逆に支援より全体攻撃・デバフでプレイヤー側を弱らせにくる攻撃寄りのお供で、
 * 支援と攻撃で役割がはっきり分かれた2体構成になっている。
 */
const FINAL_BOSS_FLOOR_START = 9;
const FINAL_BOSS_TEMPLATE = ANCIENT_DEMON;
const FINAL_BOSS_COMPANION_TEMPLATES = [ANCIENT_CRYSTAL, ANCIENT_CRYSTAL_CURSE];

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
 *
 * ここで難易度を上げる目的は「高レアを持っていない人を締め出すこと」ではない。
 * 通常モンスターでも育成と装備を突き詰めれば手が届く余地は必ず残す
 * (docs/design-concept.md を参照)。この数値を触る時は、通常編成の勝率が
 * 0になっていないかを必ず確かめること。
 * 装備ダンジョンは通常パーティ(4体)より1体多い専用パーティ(最大5体)で挑めるうえ、
 * ガチャ限定の高レア(SR/SSR)モンスターは通常モンスターよりベースステータス・専用スキルとも
 * 明確に強力なため、SR/SSRを軸にした編成だと通常モンスターだけの編成基準の数値では
 * あっさり突破されてしまう。また9・10階のお供は、回復・防御バフで古代の魔人を支え続ける
 * 「古代のクリスタル」と、全体攻撃・デバフでプレイヤー側を弱らせにくる「古代の呪晶」の
 * 組み合わせで、古代の魔人自身も5ターンCTの全体攻撃を持つため、他の階層より同じpowerScale
 * でも体感の厳しさが増す。これらを踏まえ、9・10階は「星5のSR/SSRを複数体、星6装備込みで
 * 編成した終盤パーティ」を基準に、
 * サブステータスまでしっかり詰めてようやく安定して勝てる水準まで引き上げてある。
 * なおスキル調整で通常モンスターの連携(全体デバフ・毒・継続回復)が強くなったため、
 * 装備を極めた通常モンスターだけの編成でも突破できる場合はあるが、
 * SR/SSR軸の編成と比べれば依然としてはっきり不利になるよう調整してある。
 */
const LATE_FLOOR_POWER_BONUS: Partial<Record<number, number>> = { 9: 1.62, 10: 1.9 };

function powerScaleForFloor(floor: number): number {
  const base = POWER_SCALE_START + ((floor - 1) * (POWER_SCALE_END - POWER_SCALE_START)) / (DUNGEON_FLOOR_COUNT - 1);
  return base * (LATE_FLOOR_POWER_BONUS[floor] ?? 1);
}

function buildFloor(floor: number): DungeonFloor {
  // 各階層の敵は単一属性で統一する。弱点を突く属性のパーティを組めば有利に戦えるようになる
  const floorElement = NORMAL_ELEMENTS[(floor - 1) % NORMAL_ELEMENTS.length];
  const isFinalBossFloor = floor >= FINAL_BOSS_FLOOR_START;

  const bossTemplateId = isFinalBossFloor ? FINAL_BOSS_TEMPLATE.templateId : BOSS_TEMPLATES[(floor - 1) % BOSS_TEMPLATES.length].templateId;
  const companionTemplateIds = isFinalBossFloor
    ? FINAL_BOSS_COMPANION_TEMPLATES.map((t) => t.templateId)
    : [MONSTER_TEMPLATES[(floor - 1) % MONSTER_TEMPLATES.length].templateId, MONSTER_TEMPLATES[floor % MONSTER_TEMPLATES.length].templateId];

  // ボス1体+お供2体の3体編成。ボスを先頭に置く
  const enemies: DungeonEnemy[] = [
    { templateId: bossTemplateId, element: floorElement, star: DUNGEON_BOSS_STAR, level: DUNGEON_BOSS_LEVEL, isBoss: true },
    ...companionTemplateIds.map((templateId) => ({
      templateId,
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
