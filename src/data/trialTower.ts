import { Element } from "../core/element.js";
import { SkillEffect } from "../core/skill.js";
import { Star } from "../core/rarity.js";
import { DungeonEnemy } from "./equipmentDungeon.js";
import { ANCIENT_CRYSTAL, ANCIENT_CRYSTAL_CURSE, ANCIENT_DEMON, MONSTER_TEMPLATES } from "./monsters.js";

/**
 * 試練の塔。
 *
 * 既存のダンジョンは1階=1戦で、毎回全回復から始まる。だから「削られたまま次へ行く」
 * という状況が一度も起きず、**回復・継続回復・免疫・耐久のスキルに出番が無かった**。
 * 塔はそこを埋める。HPとクールタイムを次の階へ持ち越すので、
 * 「どれだけ削られずに勝つか」が初めて意味を持つ。
 *
 * ## 階の傾向について
 *
 * 難しくする時、**プレイヤーの戦い方を封じる方向へは倒さない**。
 * 一度ボスに継続ダメージ耐性を持たせて撤回している(毒も耐久もちゃんとした戦術で、
 * それを封じるのは戦い方を選んだこと自体への罰だった)。
 *
 * 代わりに**敵の側の性質**を変える。敵が回復するなら回復封じに、敵が盾を張るなら
 * 剥がしに、敵が数で来るなら全体攻撃に、敵が速いならゲージ操作に場面が回る。
 * これは特定の戦術を潰すのではなく、別の戦術へ**場面を配る**やり方になる。
 */

/** 階の傾向。敵の側の性質を変えることで、別のスキルに場面を作る */
export type TowerTrait =
  /** 傾向なし。素の殴り合い */
  | "NONE"
  /** 癒やしの階。敵に回復役がいる。回復封じ・剥がし・火力の集中に場面が回る */
  | "HEALER"
  /** 守りの階。敵が盾と免疫を張る。剥がし・持続ダメージに場面が回る */
  | "WARD"
  /** 群れの階。敵の数が多い。全体攻撃・全体デバフに場面が回る */
  | "SWARM"
  /** 疾風の階。敵が速い。ゲージ操作・気絶・速度そのものに場面が回る */
  | "SWIFT";

export const TOWER_TRAIT_LABEL: Record<TowerTrait, string> = {
  NONE: "",
  HEALER: "癒やしの階",
  WARD: "守りの階",
  SWARM: "群れの階",
  SWIFT: "疾風の階",
};

/** 傾向の説明。**何が起きるか**だけを書く。「◯◯を持って行け」とは書かない(編成は考える所) */
export const TOWER_TRAIT_NOTE: Record<TowerTrait, string> = {
  NONE: "",
  HEALER: "敵が味方を癒やします。削りきる前に戻されます。",
  WARD: "敵が盾と免疫を張ります。素直に殴っても通りません。",
  SWARM: "敵の数が多く、手番が多く回ります。",
  SWIFT: "敵が速く、先に動いてきます。",
};

export interface TowerFloor {
  /** 1始まりの階数 */
  floor: number;
  name: string;
  trait: TowerTrait;
  enemies: DungeonEnemy[];
  /** 敵の実効ステータスに掛かる倍率 */
  powerScale: number;
  /** 敵の速度に掛かる倍率。powerScale は速度に掛からないので別枠 */
  speedScale: number;
  /** この階を初めて越えた時だけ受け取れる報酬 */
  firstClearReward: TowerReward;
}

/**
 * 階を初めて越えた時の報酬。
 *
 * **確率は持たせない。**塔は「登った所まで確実に受け取れる」場所にする。
 * 抽選はダンジョンとガチャで足りていて、ここまで運にすると
 * 「登り直しても何も増えなかった」が起きて、登る意味が薄くなる。
 */
export interface TowerReward {
  crystal?: number;
  gold?: number;
  summonScroll?: number;
  /** 転生ピッグ(ランクアップ素材)の星。渡すなら星を指定する */
  pigStar?: Star;
  /** 装備を渡すなら、その星 */
  equipmentStar?: Star;
}

/** 全階数 */
export const TOWER_FLOOR_COUNT = 30;

/**
 * 節(区切り)の間隔。
 *
 * ここまで登ると**全回復**して、次はその節から再開できる。
 * 30階を一息で登らせると、19階で力尽きた時に1階からやり直しになり、
 * 持ち越しの緊張感ではなく単なる作業になる。節はその歯止め。
 */
export const TOWER_CHECKPOINT_INTERVAL = 10;

/** ボス階の間隔 */
export const TOWER_BOSS_INTERVAL = 5;

/** 1階を挑むごとに消費するスタミナ */
export const TOWER_STAMINA_COST = 4;

/** その階が節(越えると全回復し、次回はここから再開できる)か */
export function isTowerCheckpoint(floor: number): boolean {
  return floor % TOWER_CHECKPOINT_INTERVAL === 0;
}

/** その階がボス階か */
export function isTowerBossFloor(floor: number): boolean {
  return floor % TOWER_BOSS_INTERVAL === 0;
}

/**
 * `floor` から登り始める時、実際に開始する階。
 * 節を越えていれば節から、まだなら1階から。
 */
export function towerStartFloor(bestFloor: number): number {
  return Math.floor(bestFloor / TOWER_CHECKPOINT_INTERVAL) * TOWER_CHECKPOINT_INTERVAL + 1;
}

/* ============================================================
 * 階の中身
 *
 * ここから下の数値は**実測して決める**もので、机上で決めた値ではない。
 * 触る時は tools/towerPressure.mjs で編成別の到達階を測ってから動かすこと。
 * ============================================================ */

const CYCLE: Element[] = ["FIRE", "WATER", "ELECTRIC", "GRASS"];
const NORMAL_IDS = MONSTER_TEMPLATES.map((t) => t.templateId);

/**
 * 傾向ごとの、必ず混ぜる顔ぶれ。**属性まで指定する。**
 *
 * ここを種族だけで書いていて事故った。スキル2・3は属性ごとに違う組み合わせが選ばれるので、
 * 「ゴーレム」とだけ書くと、階の属性が火や電気に回った時に**盾を1枚も張らないゴーレム**が
 * 守りの階に立つ。癒やしの階も同じで、回復を持たない個体が「癒やし手」の席に座る。
 * 下の顔ぶれはすべて、その傾向に要る効果を実際に持っている個体だけを並べてある
 * (`TOWER_TRAIT_REQUIRED_EFFECTS` と `towerTraitProblem` が機械的に見張っている)。
 */
const TRAIT_ANCHORS: Record<TowerTrait, { templateId: string; element: Element }[]> = {
  NONE: [],
  // すべて HEAL を持つ個体。フェアリー[電気]は REGEN も持つ
  HEALER: [
    { templateId: "fairy", element: "WATER" },
    { templateId: "fairy", element: "ELECTRIC" },
    { templateId: "wisp", element: "GRASS" },
    { templateId: "treant", element: "FIRE" },
  ],
  // すべて SHIELD を持つ個体。トレント[電気]・ウィスプ[水]は IMMUNITY も張る
  WARD: [
    { templateId: "golem", element: "GRASS" },
    { templateId: "treant", element: "ELECTRIC" },
    { templateId: "golem", element: "WATER" },
    { templateId: "wisp", element: "WATER" },
  ],
  SWARM: [],
  // 電気は素早さ補正が乗る属性。どちらもゲージ操作を持ち、先手を取ったうえで更に押してくる
  SWIFT: [
    { templateId: "wolf", element: "ELECTRIC" },
    { templateId: "imp", element: "ELECTRIC" },
  ],
};

/**
 * その傾向を敵が「実際に実行できる」ために要る効果。
 * 群れ(数)と疾風(速さ)は効果では表せないので、`towerTraitProblem` が別の見方で確かめる。
 */
export const TOWER_TRAIT_REQUIRED_EFFECTS: Partial<Record<TowerTrait, SkillEffect["kind"][]>> = {
  HEALER: ["HEAL", "REGEN"],
  WARD: ["SHIELD"],
};

/**
 * 階ごとの傾向。5階ごとのボス階には傾向を載せない
 * (ボスそのものが関門なので、傾向まで重ねると何に詰まったのか分からなくなる)。
 */
function traitOf(floor: number): TowerTrait {
  if (isTowerBossFloor(floor)) return "NONE";
  const order: TowerTrait[] = ["NONE", "HEALER", "SWARM", "WARD", "SWIFT"];
  return order[floor % order.length];
}

/**
 * 階が上がるほど敵が強くなる曲線。
 *
 * 難易度の出どころを**星・レベルの帯**(`enemyStarOf` / `enemyLevelOf`)へ寄せ、
 * 倍率はその上に緩く乗せている。星とレベルは1階から30階で実効ステータスを約2.4倍にするので、
 * 倍率まで急にすると、両方が掛かって階の間が跳ねる。
 */
function powerScaleOf(floor: number): number {
  return Number((0.5 + (floor - 1) * 0.022).toFixed(3));
}

/**
 * 敵の速度。**塔の攻め手はここ。**
 *
 * 大きな一撃で削るのではなく、手番の数で削る。持ち越しの塔で敵の攻撃力を上げると、
 * 1発が大きいぶん事故死が増えて「編成の差」ではなく「引きの差」になるが、
 * 手番が増える形の圧なら、回復・盾・継続回復で受け止める余地が残る。
 *
 * **プレイヤー側の速度上限と対で決まる。**塔は★5装備を前提にしていて、
 * 実測でこちらの速度は103〜167。装備ダンジョン(★6装備を速度に全振りして216)より低いので、
 * 末端も装備ダンジョンの1.28より控えめに置いてある。装備の速度を触ったらここも測り直すこと。
 */
function speedScaleOf(floor: number): number {
  return Number((0.92 + (floor - 1) * 0.0097).toFixed(3));
}

/**
 * 敵の星とレベル。
 *
 * 星をまたぐ時にレベルを最大付近から落とすと実効ステータスが**下がる**
 * (星5 Lv50 は星6 Lv1 より強い)。帯の切り替えでへこまないよう、
 * 新しい星は中間のレベルから始めて、帯の終わりで最大に届くようにしてある。
 */
function enemyStarOf(floor: number): Star {
  if (floor <= 8) return 4;
  if (floor <= 18) return 5;
  return 6;
}

function enemyLevelOf(floor: number): number {
  if (floor <= 8) return 24 + floor * 2;
  if (floor <= 18) return 30 + (floor - 8) * 2;
  return Math.min(60, 36 + (floor - 18) * 2);
}

function rewardOf(floor: number): TowerReward {
  if (floor === TOWER_FLOOR_COUNT) return { crystal: 500, summonScroll: 3, equipmentStar: 6, pigStar: 3 };
  if (isTowerCheckpoint(floor)) return { crystal: 200, summonScroll: 1, equipmentStar: 5, pigStar: 3 };
  if (isTowerBossFloor(floor)) return { crystal: 80, gold: 3000, equipmentStar: 4 };
  return { crystal: 25, gold: 800 };
}

/**
 * ボスの星は6で固定し、レベルで伸ばす。
 * 5階の主も30階の主も同じ★6 Lv60 だと、5階が最初の壁ではなく最後の壁になる。
 */
function bossLevelOf(floor: number): number {
  return Math.min(60, 30 + floor);
}

/**
 * ボスだけに掛かる最大HP倍率。
 *
 * 4倍にしていた頃は、他の階が素通りでボス階だけが壁という形になり、
 * **持ち越しがまったく効かなかった**(道中で削られていないので、毎回ボスに満タンで挑む)。
 * 塔は道中で削れていく場所なので、ボスは「そこまでの消耗を清算される所」であって、
 * 単体で越えられない壁ではない。
 */
const BOSS_HP_MULTIPLIER = 2.6;

/** 傾向に応じた顔ぶれを組む */
function enemiesOf(floor: number, trait: TowerTrait): DungeonEnemy[] {
  const star = enemyStarOf(floor);
  const level = enemyLevelOf(floor);
  const element = CYCLE[(floor - 1) % CYCLE.length];
  const pick = (offset: number): string => NORMAL_IDS[(floor + offset) % NORMAL_IDS.length];

  if (isTowerBossFloor(floor)) {
    // 塔の主。20階からは呪いの結晶を従え、剥がしと回復封じで殴り合いを長くする
    const escort = floor >= 20 ? ANCIENT_CRYSTAL_CURSE.templateId : ANCIENT_CRYSTAL.templateId;
    return [
      {
        templateId: ANCIENT_DEMON.templateId,
        element,
        star: 6,
        level: bossLevelOf(floor),
        isBoss: true,
        hpMultiplier: BOSS_HP_MULTIPLIER,
        spdMultiplier: 1.15,
      },
      { templateId: escort, element, star, level },
      { templateId: escort, element, star, level },
    ];
  }

  const anchors = TRAIT_ANCHORS[trait];
  const anchor = anchors.length > 0 ? anchors[(floor - 1) % anchors.length] : null;
  const size = trait === "SWARM" ? 5 : 4;
  const rest = Array.from({ length: size - (anchor ? 1 : 0) }, (_, i) => ({
    templateId: pick(i),
    element: CYCLE[(floor + i) % CYCLE.length],
    star,
    level,
  }));

  const anchored: DungeonEnemy[] = anchor
    ? [
        {
          ...anchor,
          star,
          level,
          // その傾向を体現する1体は、仕事をする時間が要る
          hpMultiplier: trait === "WARD" ? 1.6 : 1.35,
          spdMultiplier: trait === "SWIFT" ? 1.3 : 1,
        },
        ...rest,
      ]
    : rest;

  return anchored;
}

/**
 * 1階ぶんの中身を組む。
 *
 * `traitOverride` は測定用。**同じ powerScale のまま傾向だけ差し替えられる**ようにしてある。
 * そうしないと「20階が難しいのは階が上だからか、守りの階だからか」が切り分けられず、
 * 傾向がただの色違いになっていても気づけない(tools/towerPressure.mjs --traits)。
 */
export function buildTowerFloor(floor: number, traitOverride?: TowerTrait): TowerFloor {
  const trait = traitOverride ?? traitOf(floor);
  const label = isTowerBossFloor(floor) && traitOverride === undefined ? "関門" : TOWER_TRAIT_LABEL[trait] || "";
  return {
    floor,
    name: `${floor}階${label ? ` ${label}` : ""}`,
    trait,
    enemies: enemiesOf(floor, trait),
    powerScale: powerScaleOf(floor),
    speedScale: speedScaleOf(floor),
    firstClearReward: rewardOf(floor),
  };
}

export const TRIAL_TOWER_FLOORS: TowerFloor[] = Array.from({ length: TOWER_FLOOR_COUNT }, (_, i) =>
  buildTowerFloor(i + 1),
);

export function findTowerFloor(floor: number): TowerFloor | undefined {
  return TRIAL_TOWER_FLOORS.find((f) => f.floor === floor);
}
