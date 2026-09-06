import { BossTraits } from "../core/monster.js";
import { Star } from "../core/rarity.js";
import { DungeonEnemy } from "./equipmentDungeon.js";
import {
  ARCHEOS_SKILLS, ARCHEOS_TEMPLATE_ID,
  TALENT_SHARD_ATK_TEMPLATE_ID, TALENT_SHARD_DEF_TEMPLATE_ID,
} from "./awakeningDepthsMonsters.js";

/**
 * 目覚の深域。**才能覚醒の素材だけを配る、10階建ての周回ダンジョン。**
 *
 * ## 最初から挑める
 *
 * 才能覚醒そのものは★6でしか開かないが、**ここは最初から開いている。**
 * ★6に届く前から素材を貯めておけるようにするためで、
 * 「★6にした瞬間に一気に開ける」という道筋を用意している。
 *
 * ## 何を問う場所か
 *
 * 装備ダンジョンは装備、塔は持ち越し。ここが問うのは**手の分散**。
 * 5階から乗る「才能適応」は、**同じ相手から連続で受けるほどその相手からの
 * ダメージが効かなくなる**仕掛けで、1体の高火力に全部を任せる編成ほど
 * 殴るうちに自分の火力が痩せていく。別の味方が殴れば1段階戻るので、
 * 手を配るか、乗り切る前に落とし切るかを選ぶことになる。
 *
 * ## 数値は実効値で置く
 *
 * 図鑑の値に倍率を掛けるのではなく、`fixedStats` に実数を書く
 * (試練の塔60階と同じやり方)。**倍率は掛からない**ので、
 * ここに書いた数字がそのまま戦闘で使われる。
 */

export const AWAKENING_DEPTH_FLOOR_COUNT = 10;

export interface AwakeningDepthDrop {
  /** 目覚の欠片。範囲のどこか(両端を含む) */
  shards: readonly [number, number];
  /** 目覚の結晶 */
  crystals: readonly [number, number];
  /** 目覚の奇石が落ちる確率(0〜1)。落ちる時は1個 */
  stoneChance: number;
}

export interface AwakeningDepthFirstClear {
  shards: number;
  crystals: number;
  stones: number;
}

export interface AwakeningDepthFloor {
  floor: number;
  name: string;
  enemies: DungeonEnemy[];
  /**
   * 敵の実効ステータスに掛かる倍率。**深域では常に1。**
   *
   * 値は `fixedStats` に実数で書いてあるので倍率は掛からないが、
   * 共通の階の形(`DungeonLikeFloor`)を満たすために持たせてある。
   */
  powerScale: 1;
  speedScale: 1;
  /** 挑むのに要るスタミナ */
  stamina: number;
  drop: AwakeningDepthDrop;
  /** 初回クリアだけの報酬 */
  firstClear: AwakeningDepthFirstClear;
  /**
   * その階のねらい。挑む前の画面に出して、
   * **何を試される階なのか**を先に伝える
   */
  note: string;
}

/* ==========================================================================
 * 階ごとの設定
 * ========================================================================== */

interface FloorConfig {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  /** 何ヒット受けるごとに反撃するか。0なら反撃しない */
  counterAfterHits: number;
  /** 才能適応の上限(0なら適応しない) */
  adaptationMax: number;
  /** お供。攻・護のどちらを連れるか */
  shards: readonly ("ATK" | "DEF")[];
  stamina: number;
  drop: AwakeningDepthDrop;
  firstClear: AwakeningDepthFirstClear;
  note: string;
}

/**
 * 1〜10階。
 *
 * **1〜4階は仕掛けを覚える帯**で反撃も適応も無い。
 * 5階から反撃(8ヒットごと)と適応(10%)が乗り、
 * 階が上がるほど反撃が早まり適応が深くなる。
 *
 * 10階だけは試練の塔60階前後を基準にした高難度で、
 * **即死の理不尽ではなく「対策で安定する」形**にしてある。
 */
const FLOOR_CONFIG: Record<number, FloorConfig> = {
  1: {
    hp: 35_000, atk: 2_700, def: 1_300, spd: 115,
    counterAfterHits: 0, adaptationMax: 0, shards: [], stamina: 6,
    drop: { shards: [3, 5], crystals: [0, 1], stoneChance: 0 },
    firstClear: { shards: 20, crystals: 0, stones: 0 },
    note: "アルケオスのみ。まずは1体で受け止める",
  },
  2: {
    hp: 45_000, atk: 3_100, def: 1_500, spd: 122,
    counterAfterHits: 0, adaptationMax: 0, shards: ["ATK"], stamina: 7,
    drop: { shards: [4, 6], crystals: [0, 1], stoneChance: 0 },
    firstClear: { shards: 30, crystals: 0, stones: 0 },
    note: "才能晶・攻が味方の攻撃力を上げてくる",
  },
  3: {
    hp: 58_000, atk: 3_600, def: 1_750, spd: 130,
    counterAfterHits: 0, adaptationMax: 0, shards: ["DEF"], stamina: 8,
    drop: { shards: [5, 7], crystals: [1, 1], stoneChance: 0 },
    firstClear: { shards: 40, crystals: 0, stones: 0 },
    note: "才能晶・護が盾と回復を配る。削り切る前に戻される",
  },
  4: {
    hp: 72_000, atk: 4_100, def: 2_000, spd: 138,
    counterAfterHits: 0, adaptationMax: 0, shards: ["ATK", "DEF"], stamina: 9,
    drop: { shards: [6, 8], crystals: [1, 2], stoneChance: 0 },
    firstClear: { shards: 50, crystals: 5, stones: 0 },
    note: "攻と護が揃う。**どちらを先に倒すか**で本体の姿が変わる",
  },
  5: {
    hp: 88_000, atk: 4_700, def: 2_300, spd: 146,
    counterAfterHits: 8, adaptationMax: 0.10, shards: ["ATK", "DEF"], stamina: 10,
    drop: { shards: [7, 9], crystals: [1, 2], stoneChance: 0 },
    firstClear: { shards: 60, crystals: 8, stones: 0 },
    note: "8ヒットごとに全体反撃。才能適応(最大10%)が乗り始める",
  },
  6: {
    hp: 105_000, atk: 5_300, def: 2_600, spd: 154,
    counterAfterHits: 8, adaptationMax: 0.10, shards: ["ATK", "DEF"], stamina: 11,
    drop: { shards: [8, 10], crystals: [2, 3], stoneChance: 0 },
    firstClear: { shards: 70, crystals: 10, stones: 0 },
    note: "5階と同じ仕掛けのまま、数字だけが上がる",
  },
  7: {
    hp: 125_000, atk: 6_200, def: 3_000, spd: 164,
    counterAfterHits: 7, adaptationMax: 0.10, shards: ["ATK", "DEF"], stamina: 12,
    drop: { shards: [9, 11], crystals: [2, 3], stoneChance: 0.01 },
    firstClear: { shards: 80, crystals: 12, stones: 0 },
    note: "反撃が7ヒットごとに早まる。**ここから目覚の奇石が落ちる**",
  },
  8: {
    hp: 145_000, atk: 7_200, def: 3_400, spd: 173,
    counterAfterHits: 6, adaptationMax: 0.15, shards: ["ATK", "DEF"], stamina: 13,
    drop: { shards: [10, 12], crystals: [3, 4], stoneChance: 0.02 },
    firstClear: { shards: 100, crystals: 15, stones: 0 },
    note: "適応が15%まで深くなる。同じ1体で殴り続けると通らなくなる",
  },
  9: {
    hp: 162_000, atk: 8_300, def: 3_700, spd: 180,
    counterAfterHits: 6, adaptationMax: 0.15, shards: ["ATK", "DEF"], stamina: 14,
    drop: { shards: [11, 14], crystals: [3, 5], stoneChance: 0.03 },
    firstClear: { shards: 120, crystals: 20, stones: 0 },
    note: "10階の手前。ここを安定して回れるなら10階が見える",
  },
  10: {
    hp: 180_000, atk: 9_500, def: 4_000, spd: 185,
    counterAfterHits: 5, adaptationMax: 0.20, shards: ["ATK", "DEF"], stamina: 15,
    drop: { shards: [14, 18], crystals: [4, 6], stoneChance: 0.06 },
    firstClear: { shards: 150, crystals: 30, stones: 1 },
    note: "5ヒットごとに反撃、適応は20%。**本体集中か、護晶から倒すか**",
  },
};

/* ==========================================================================
 * お供が倒れた時の、本体への変化
 *
 * **消すほど本体が手強くなる。**取り巻きを「先に消しておく置物」で
 * 終わらせないための仕掛けで、放っておく選択肢が常に残る。
 * ========================================================================== */

/** 才能晶・攻を倒すと、本体が防御を無視し始める */
const SHARD_ATK_DEATH_DEFENSE_IGNORE = 0.20;
/** 才能晶・護を倒すと、本体が硬くなる */
const SHARD_DEF_DEATH_DAMAGE_TAKEN = 0.15;
/**
 * どちらを倒しても本体の速度が上がる。**両方倒すと合計+20。**
 * 半分ずつにしてあるのは、片方だけ倒した時にも手番の回りが変わって、
 * 「1つ消した」ことが盤面で分かるようにするため。
 */
const SHARD_DEATH_SPD = 10;

const ARCHEOS_ELEMENT = "DARK" as const;
const SHARD_STAR: Star = 6;
const SHARD_LEVEL = 60;

/** お供の実効値。階が上がるほど厚くなるが、本体ほどは伸ばさない */
function shardStats(floor: number, kind: "ATK" | "DEF"): { hp: number; atk: number; def: number; spd: number } {
  const growth = 1 + (floor - 1) * 0.28;
  return kind === "ATK"
    ? { hp: Math.round(14_000 * growth), atk: Math.round(2_200 * growth), def: Math.round(900 * growth), spd: 108 + floor * 4 }
    : { hp: Math.round(20_000 * growth), atk: Math.round(1_500 * growth), def: Math.round(1_400 * growth), spd: 104 + floor * 4 };
}

function buildEnemies(floor: number, cfg: FloorConfig): DungeonEnemy[] {
  const bossTraits: BossTraits = {};
  if (cfg.counterAfterHits > 0) {
    bossTraits.counterAfterHits = cfg.counterAfterHits;
    // 反撃は**S2をそのまま撃つ**。単発を返すのと全体技を返すのでは意味が違う
    bossTraits.counterSkillIndex = 1;
  }
  if (cfg.adaptationMax > 0) {
    /*
     * 才能適応。1段につき5%ずつ効かなくなり、上限まで積み上がる。
     * **別の味方が殴ると1段戻る**ので、手を配れば深くはならない。
     */
    bossTraits.talentAdaptation = { perStack: 0.05, maxReduction: cfg.adaptationMax };
  }

  const boss: DungeonEnemy = {
    templateId: ARCHEOS_TEMPLATE_ID,
    element: ARCHEOS_ELEMENT,
    star: 6,
    level: 60,
    isBoss: true,
    victoryTarget: true,
    primaryTarget: true,
    displayName: "才能神獣 アルケオス",
    skills: ARCHEOS_SKILLS,
    bossTraits,
    fixedStats: {
      hp: cfg.hp, atk: cfg.atk, def: cfg.def, spd: cfg.spd,
      criRate: 0.25, criDmg: 1.8, accuracy: 0.5,
      // 抵抗は45%。**弱化が通らない相手にはしない**——
      // 妨害を積んだ編成が完全に無力になる場所は作らない
      resistance: 0.45,
    },
  };

  const shards: DungeonEnemy[] = cfg.shards.map((kind) => {
    const stats = shardStats(floor, kind);
    return {
      templateId: kind === "ATK" ? TALENT_SHARD_ATK_TEMPLATE_ID : TALENT_SHARD_DEF_TEMPLATE_ID,
      element: ARCHEOS_ELEMENT,
      star: SHARD_STAR,
      level: SHARD_LEVEL,
      displayName: kind === "ATK" ? "才能晶・攻" : "才能晶・護",
      fixedStats: { ...stats, criRate: 0.2, criDmg: 1.6, accuracy: 0.4, resistance: 0.3 },
      bossTraits: {
        empowerBossOnDeath: { spd: SHARD_DEATH_SPD },
        empowerBossOnDeathRatio: kind === "ATK"
          ? { defenseIgnoreRatio: SHARD_ATK_DEATH_DEFENSE_IGNORE }
          : { damageTakenMultiplier: 1 - SHARD_DEF_DEATH_DAMAGE_TAKEN },
      },
    };
  });

  return [boss, ...shards];
}

export const AWAKENING_DEPTH_FLOORS: AwakeningDepthFloor[] = Array.from(
  { length: AWAKENING_DEPTH_FLOOR_COUNT },
  (_, i) => {
    const floor = i + 1;
    const cfg = FLOOR_CONFIG[floor];
    return {
      floor,
      name: `目覚の深域 ${floor}階`,
      enemies: buildEnemies(floor, cfg),
      powerScale: 1,
      speedScale: 1,
      stamina: cfg.stamina,
      drop: cfg.drop,
      firstClear: cfg.firstClear,
      note: cfg.note,
    };
  },
);

export function findAwakeningDepthFloor(floor: number): AwakeningDepthFloor | undefined {
  return AWAKENING_DEPTH_FLOORS.find((f) => f.floor === floor);
}

/**
 * 周回のドロップを1回ぶん決める。
 *
 * **範囲は両端を含む。**「3〜5」なら3も5も出る。
 */
export function rollAwakeningDepthDrop(
  floor: AwakeningDepthFloor, rng: () => number = Math.random,
): { shards: number; crystals: number; stones: number } {
  const pick = ([min, max]: readonly [number, number]): number =>
    min + Math.floor(rng() * (max - min + 1));
  return {
    shards: pick(floor.drop.shards),
    crystals: pick(floor.drop.crystals),
    stones: floor.drop.stoneChance > 0 && rng() < floor.drop.stoneChance ? 1 : 0,
  };
}
