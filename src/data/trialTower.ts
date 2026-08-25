import { Element } from "../core/element.js";
import { SkillEffect } from "../core/skill.js";
import { STAR_MAX_LEVEL, Star, levelMultiplier, starMultiplier } from "../core/rarity.js";
import { DungeonEnemy } from "./equipmentDungeon.js";
import { ANCIENT_DEMON, findMonster } from "./monsters.js";

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
 * 代わりに**敵の側の性質**を変える。敵が回復するなら削り切る手に、敵が盾を張るなら
 * 削り続ける手に、敵が数で来るなら全体攻撃に、敵が速いなら手番を奪う手に場面が回る。
 * これは特定の戦術を潰すのではなく、別の戦術へ**場面を配る**やり方になる。
 *
 * ここで「回復封じ・剥がしに場面が回る」とは書かない。**プレイヤー側にその手が無い。**
 * STRIP と HEAL_BLOCK を持つのは敵専用の古代の呪晶だけで、
 * 通常モンスターにも高レアにも1体もいない(全図鑑を機械的に数えて確認した)。
 * 持っていない答えを前提に階を作ると、それは場面ではなく通行止めになる。
 */

/** 階の傾向。敵の側の性質を変えることで、別のスキルに場面を作る */
export type TowerTrait =
  /** 傾向なし。素の殴り合い */
  | "NONE"
  /** 癒やしの階。敵に回復役がいる。火力の集中・気絶・毒に場面が回る */
  | "HEALER"
  /** 守りの階。敵が盾と免疫を張る。削り続ける手・最大HP割合で削る手に場面が回る */
  | "WARD"
  /** 群れの階。敵の数が多い。全体攻撃・全体デバフに場面が回る(実測で最も差の出る傾向) */
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

/**
 * 傾向の席以外に立つ、素の顔ぶれ。**回復も盾も持たない個体だけ**を並べてある。
 *
 * ここを「通常モンスター8種から順に」で組んでいて事故った。フェアリー・ウィスプ・トレントが
 * 素の階にも普通に混ざるので、**どの階にも癒やし手がいる**状態になり、
 * 癒やしの階が癒やしの階でなくなっていた。それどころか、こちらも回復役を連れていると
 * 双方が回復し合って決着がつかず、300手で引き分け=敗北になる盤面が生まれていた
 * (耐久編成が18・19・26〜28階でこれに当たっていた。実測ログで確認)。
 *
 * 癒やす敵・盾を張る敵は、癒やしの階と守りの階にだけ立たせる。
 * そうして初めて「その階だから起きること」になる。
 */
const ATTACKER_ROSTER: { templateId: string; element: Element }[] = [
  { templateId: "slime", element: "GRASS" },
  { templateId: "wolf", element: "FIRE" },
  { templateId: "imp", element: "WATER" },
  { templateId: "knight", element: "GRASS" },
  { templateId: "slime", element: "ELECTRIC" },
  { templateId: "wolf", element: "WATER" },
  { templateId: "imp", element: "FIRE" },
  { templateId: "knight", element: "WATER" },
  { templateId: "slime", element: "WATER" },
  { templateId: "wolf", element: "GRASS" },
  { templateId: "imp", element: "GRASS" },
  { templateId: "knight", element: "FIRE" },
];

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
  /*
   * **最初の節目までは傾向を載せない。**
   *
   * 素直に並べると1階が「癒やしの階」、2階が「群れの階」…と、
   * 塔に入った直後の4階で4つの傾向が全部出る作りになっていた。
   * 塔で最初に飲み込んでもらうことは**持ち越し**の1点だけで、
   * 削られたまま次へ行く感覚を掴む前に階の性質まで変わると、
   * 何が効いて何が効かなかったのかが切り分けられない。
   * 最初のボス(5階)を越えてから傾向を配り始める。
   */
  if (floor < TOWER_BOSS_INTERVAL) return "NONE";
  const order: TowerTrait[] = ["NONE", "HEALER", "SWARM", "WARD", "SWIFT"];
  return order[floor % order.length];
}

/**
 * 階の「総合の強さ」。星・レベル・倍率を**全部掛けた値**をこの1本で決める。
 *
 * 星の帯と倍率を別々に伸ばしていたら、帯の切り替わりで両方が同時に効いて階の間が跳ねた。
 * 実測でも効くのは積の方だった。★5 Lv32 に倍率2.6 と ★6 Lv58 に倍率1.6 は、
 * 星もレベルも倍率も違うのに、どちらも通常編成がちょうど耐えられなくなる所で一致する
 * (積にすると16前後)。だから積を曲線にして、倍率はその帳尻を合わせる係数に落とす。
 *
 * 値の決め方(すべて tools/towerPressure.mjs の実測から):
 *
 * - 全回復から挑んだ1戦で崩れる積は、通常編成で18前後、高レア編成で34前後。
 *   高レアは通常の**約2倍まで耐える**。この差は base ステータスの差そのもので、
 *   曲線をなだらかにすると「高レアだけが30階に届く」ではなく
 *   「高レアだけが遥か先まで行ける」になってしまう
 * - そこで**等比**にした。積が10階ごとに約2倍になるので、耐えられる積が2倍違う編成でも
 *   到達階の差は10階に収まる。通常編成の壁が20階あたり、高レア編成の壁が30階あたりに来る
 * - 持ち越しがあるぶん、実際の壁は1戦の限界より手前に来る(削られた状態で次の階に入るため)
 */
const TOWER_POWER_START = 3.0;
const TOWER_POWER_GROWTH = 1.07;

function towerPowerOf(floor: number): number {
  return TOWER_POWER_START * TOWER_POWER_GROWTH ** (floor - 1);
}

/**
 * HPだけに追加で掛かる倍率。**HPと攻撃力を同じ曲線で伸ばさない**ための別枠。
 *
 * 上の曲線は powerScale としてHP・攻撃・防御に等しく掛かるので、そのままだと
 * 上の階ほど「硬くて痛い」が同時に来る。硬さは低火力の編成を素通しで殺す:
 * 回復役を並べた耐久編成は25階のボスに146手かけて半分しか削れず、
 * **一度も倒れないまま時間切れで負けていた**(実測)。それは耐久を選んだことへの罰になる。
 *
 * そこで上の階ほどHPの取り分を減らし、圧を「硬さ」から「痛さと手数」へ移している。
 * 削り切れる相手が、こちらを削ってくる形。回復・盾で受け止める余地が残り、
 * 毒のような最大HP割合で削る手も、硬さに埋もれずに効く。
 */
const ENEMY_HP_RATIO_START = 1;
const ENEMY_HP_RATIO_END = 0.65;

function enemyHpRatioOf(floor: number): number {
  const t = (floor - 1) / (TOWER_FLOOR_COUNT - 1);
  return ENEMY_HP_RATIO_START + (ENEMY_HP_RATIO_END - ENEMY_HP_RATIO_START) * t;
}

/**
 * 敵の実効ステータスに掛かる倍率。
 * 星・レベルで届く分を差し引いた残りなので、**この数字だけを見て難易度を判断しない**。
 */
function powerScaleOf(floor: number): number {
  const star = enemyStarOf(floor);
  const statMultiplier = starMultiplier(star) * levelMultiplier(star, enemyLevelOf(floor));
  return Number((towerPowerOf(floor) / statMultiplier).toFixed(3));
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
  return Number((0.92 + (floor - 1) * 0.0138).toFixed(3));
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

/**
 * 階の初回突破報酬。
 *
 * **階が上がるほど増やす。**同じ額を並べると、29階を初めて越えた時と1階を越えた時が
 * 同じ手応えになり、登った距離が何も返ってこない。1階ぶんの重さは上ほど跳ね上がる
 * (実測で通常編成の到達階は23階あたりなので、24階の1歩は1階の1歩とは値打ちが違う)。
 *
 * 装備・召喚の書・転生ピッグは節と最上階に寄せてある。毎階配ると、
 * 塔が装備の主要な供給源になって装備ダンジョンの居場所を奪う。
 */
function rewardOf(floor: number): TowerReward {
  if (floor === TOWER_FLOOR_COUNT) return { crystal: 500, gold: 30000, summonScroll: 3, equipmentStar: 6, pigStar: 3 };
  if (isTowerCheckpoint(floor)) {
    return { crystal: 100 + floor * 5, gold: 2000 + floor * 400, summonScroll: 1, equipmentStar: 5, pigStar: 3 };
  }
  if (isTowerBossFloor(floor)) return { crystal: 40 + floor * 2, gold: 1500 + floor * 200, equipmentStar: 4 };
  return { crystal: 10 + floor, gold: 400 + floor * 100 };
}

/**
 * ボスだけに掛かる最大HP倍率。
 *
 * 4倍・★6 Lv60 固定にしていた頃は、5階の主が30階の主と同じ強さで、
 * **道中が素通り、ボス階だけが壁**という形になっていた。それだと持ち越しが何も効かない
 * (道中で削られないので、毎回満タンでボスに挑むのと同じ)。実測でも
 * 毒編成が10階、通常編成が15階のボスで止まり、間の4階は無傷で抜けていた。
 *
 * 塔のボスは**そこまでの消耗を清算される所**であって、単体で越えられない壁ではない。
 * 星とレベルはその帯の上限(4階帯なら★4 Lv40)に合わせ、
 * 難しさは階の曲線に乗せてある。ここはHPだけを別枠で伸ばす。
 */
const BOSS_HP_MULTIPLIER = 2.2;

/** ボスの速度。速すぎると事故死が増えるので、道中の疾風の階より控えめにする */
const BOSS_SPD_MULTIPLIER = 1.15;

/*
 * ボスのお供に「古代の呪晶」(剥がしと回復封じ持ち)を置く案は、実測して取りやめた。
 *
 * 25階・30階に置いた時の勝率は、高レア編成 100% / 50% に対し**耐久編成 0%**。
 * 通常編成も56%→31%へ落ちた。剥がしと回復阻害は、強化と回復を積み重ねる編成
 * (=通常モンスターと耐久編成の本命の勝ち筋)にだけ刺さり、火力で押し切る高レア編成には
 * ほとんど効かない。装備ダンジョンでも8階に呪晶を混ぜて同じことが起きている
 * (高レアは100%のまま、通常編成だけ8%→2%)。
 * **上を締めるつもりで下だけを締める**調整なので、塔には持ち込まない。
 * 塔のボスは古代の魔人と、傾向のない素の護衛2体で組む。
 */

/**
 * 傾向を体現する1体に掛ける最大HP倍率。
 *
 * **癒やし手が薄いと傾向が消える。**1.35 で置いていた頃、癒やしの階は
 * 傾向なしと比べて決着が8手伸びるだけで、味方の残HPは同じだった(22階の実測)。
 * 回復役は倒されるまでの間しか仕事ができないので、
 * 「削りきる前に戻される」を成立させるには、まず戻す側が生き延びる必要がある。
 */
const TRAIT_ANCHOR_HP: Record<TowerTrait, number> = {
  NONE: 1,
  HEALER: 1.3,
  WARD: 1.4,
  SWARM: 1,
  SWIFT: 1.35,
};

/** 傾向を体現する1体の速度。癒やし手は手数がそのまま回復量になるので少しだけ速い */
const TRAIT_ANCHOR_SPD: Record<TowerTrait, number> = {
  NONE: 1,
  HEALER: 1.3,
  WARD: 1,
  SWARM: 1,
  SWIFT: 1,
};

/** 疾風の階で、階の敵**全員**に掛かる速度倍率と、その中でも先頭に立つ1体の速度倍率 */
const TRAIT_SWIFT_SPD = 1.2;
const TRAIT_SWIFT_ANCHOR_SPD = 1.45;

/** 傾向に応じた顔ぶれを組む */
function enemiesOf(floor: number, trait: TowerTrait): DungeonEnemy[] {
  const star = enemyStarOf(floor);
  const level = enemyLevelOf(floor);
  const element = CYCLE[(floor - 1) % CYCLE.length];
  const hpRatio = enemyHpRatioOf(floor);
  const trash = (i: number): DungeonEnemy => ({
    ...ATTACKER_ROSTER[(floor * 3 + i) % ATTACKER_ROSTER.length],
    star,
    level,
    hpMultiplier: hpRatio,
  });

  if (isTowerBossFloor(floor)) {
    return [
      {
        templateId: ANCIENT_DEMON.templateId,
        element,
        star,
        level,
        isBoss: true,
        hpMultiplier: BOSS_HP_MULTIPLIER * hpRatio,
        spdMultiplier: BOSS_SPD_MULTIPLIER,
      },
      trash(0),
      trash(1),
    ];
  }

  const anchors = TRAIT_ANCHORS[trait];
  const anchor = anchors.length > 0 ? anchors[(floor - 1) % anchors.length] : null;
  const size = trait === "SWARM" ? 6 : 4;
  const rest = Array.from({ length: size - (anchor ? 1 : 0) }, (_, i) => trash(i));

  if (!anchor) return rest;

  // 疾風の階だけは階全体が速い。1体だけ速くしても、実測で「傾向なし」との差が
  // 決着まで2手ぶんしか出ず、ただの色違いだった
  const swift = trait === "SWIFT";
  if (swift) for (const enemy of rest) enemy.spdMultiplier = TRAIT_SWIFT_SPD;

  return [
    {
      ...anchor,
      star,
      level,
      // その傾向を体現する1体は、仕事をする時間が要る。
      // 癒やし手は倒されるまでの間だけ回復できるので、ここが薄いと傾向ごと消える
      hpMultiplier: TRAIT_ANCHOR_HP[trait] * hpRatio,
      spdMultiplier: swift ? TRAIT_SWIFT_ANCHOR_SPD : TRAIT_ANCHOR_SPD[trait],
    },
    ...rest,
  ];
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

/**
 * その階が、名乗っている傾向を**実際に実行できる顔ぶれ**になっているかを機械的に確かめる。
 * できない理由を返す(問題が無ければ null)。
 *
 * 目で確かめるのは無理だった。スキル2・3は属性ごとに違う組み合わせが選ばれるので、
 * 「ゴーレムを置いたから守りの階」と書いたつもりで、火のゴーレムには盾が無い、という取り違えが起きる。
 * 実際、骨格の段階では守りの階の半分に盾を張れる敵が1体もいなかった。
 * tests/trialTower.test.ts が全30階に対してこれを回している。
 */
export function towerTraitProblem(floor: TowerFloor): string | null {
  const required = TOWER_TRAIT_REQUIRED_EFFECTS[floor.trait];
  if (required) {
    const canDoIt = floor.enemies.some((enemy) => {
      const dex = findMonster(enemy.templateId, enemy.element);
      return dex?.skills.some((skill) => skill.effects.some((effect) => required.includes(effect.kind))) ?? false;
    });
    if (!canDoIt) return `${TOWER_TRAIT_LABEL[floor.trait]}なのに ${required.join("/")} を持つ敵が1体もいない`;
  }
  if (floor.trait === "SWARM" && floor.enemies.length <= 4) {
    return `群れの階なのに敵が${floor.enemies.length}体しかいない`;
  }
  if (floor.trait === "SWIFT" && !floor.enemies.every((e) => (e.spdMultiplier ?? 1) > 1)) {
    return "疾風の階なのに速度が上がっていない敵がいる";
  }
  return null;
}
