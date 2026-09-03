/**
 * 闘技場(アリーナ)の静的データ。
 *
 * ステージもダンジョンも「用意された敵」を殴る場所で、対人の軸が無かった。
 * ここは**他のプレイヤーが組んだ編成に挑む**場所として作る。
 * 実際の通信はしないので、挑戦相手はランク帯に応じて生成する擬似プレイヤーになる。
 *
 * ---
 *
 * ## 高レアだけの場所にしないための決め事
 *
 * `docs/design-concept.md` の芯は「ふつうのモンスターでも努力で強くなれる」。
 * アリーナは放っておくと**引きの強さがそのまま順位になる**場所になりやすい。
 * そうならないよう、この表では次の2つを守っている。
 *
 * 1. 相手編成に高レア(SR/SSR)が混ざる割合には上限を設ける(最上位でも6割)。
 *    どのランク帯にも「よく育てた通常編成」の相手が必ず残る。
 * 2. 通常軸の相手には、同じランク帯の高レア軸より**装備と技のレベルを一段良く**する。
 *    素の能力差を育成の差で埋めている相手を置くことで、
 *    「通常でもここまで来られる」を相手側の編成そのもので示す。
 *
 * ## 確率について
 *
 * 報酬の抽選確率は**このファイルの中だけ**で扱う。画面にもREADMEにも出さない
 * (依頼主の明確な指示)。UIには「まれに手に入るもの」の種類だけを出すこと。
 */
import { EquipStar, SetType, StatType } from "../core/equipment.js";
import { Star } from "../core/rarity.js";

/* ==========================================================================
 * ランク帯
 * ========================================================================== */

export type ArenaRankId = "RUST" | "COPPER" | "SILVER" | "GOLD" | "MITHRIL" | "DRAGON" | "CROWN";

/** 相手編成を組み立てるための、ランク帯ごとの「育ち具合」 */
export interface ArenaOpponentBuild {
  star: Star;
  /** レベルの下限・上限(この範囲から抽選する) */
  level: [number, number];
  /** スキルレベルの下限・上限 */
  skillLevel: [number, number];
  equipStar: EquipStar;
  /** 装備の強化レベルの下限・上限 */
  equipEnhance: [number, number];
  /** 装備のサブステータス個数の下限・上限 */
  equipSubStats: [number, number];
  /**
   * 挑戦相手が高レア軸(SR/SSR)になる割合。
   * **1.0にはしない。**ここを上げ切ると、アリーナが引きの強さだけの場所になる。
   */
  rareRatio: number;
  /**
   * 通常軸の相手に上乗せする育成の差。
   * 素の能力で劣るぶんを「装備の強化」と「技のレベル」で埋めている相手にする。
   */
  normalTeamBonus: { equipEnhance: number; skillLevel: number };
}

/** 1勝ごとの報酬。確率はコード内だけで扱い、画面には出さない */
export interface ArenaWinReward {
  gold: number;
  /** ダイヤが出る確率と量(UIには出さない) */
  crystalChance: number;
  crystal: number;
  /** 召喚の書が出る確率(UIには出さない) */
  scrollChance: number;
}

/** 期間(週)ごとのまとめ報酬。その期間の最高到達ランクで決まる */
export interface ArenaPeriodReward {
  crystal: number;
  gold: number;
  scrolls: number;
}

export interface ArenaRank {
  id: ArenaRankId;
  /** 表示名(「級」まで含む) */
  name: string;
  /** 札などに詰めて出す短い名前 */
  shortName: string;
  /** この帯に入る最低ポイント */
  minPoints: number;
  /** 帯の色。札の縁と帯に使う */
  color: string;
  build: ArenaOpponentBuild;
  winReward: ArenaWinReward;
  periodReward: ArenaPeriodReward;
}

/**
 * ランク帯。名前は坩堝と鍛冶(タイトル画面の熾火・錬成陣)に合わせて金属で並べる。
 * 錆びた鉄から始まり、炉で鍛え上げた末に灼けた冠へ至る、という並びにしてある。
 */
export const ARENA_RANKS: ArenaRank[] = [
  {
    id: "RUST",
    name: "錆鉄級",
    shortName: "錆鉄",
    minPoints: 0,
    color: "#8d6f5a",
    build: {
      star: 3,
      level: [22, 30],
      skillLevel: [1, 2],
      equipStar: 2,
      equipEnhance: [0, 3],
      equipSubStats: [0, 1],
      rareRatio: 0,
      normalTeamBonus: { equipEnhance: 0, skillLevel: 0 },
    },
    winReward: { gold: 3000, crystalChance: 0.06, crystal: 20, scrollChance: 0.01 },
    periodReward: { crystal: 300, gold: 20000, scrolls: 1 },
  },
  {
    id: "COPPER",
    name: "赤銅級",
    shortName: "赤銅",
    minPoints: 1100,
    color: "#c0733a",
    build: {
      star: 4,
      level: [34, 40],
      skillLevel: [1, 3],
      equipStar: 3,
      equipEnhance: [3, 6],
      equipSubStats: [1, 2],
      rareRatio: 0.1,
      normalTeamBonus: { equipEnhance: 1, skillLevel: 1 },
    },
    winReward: { gold: 6000, crystalChance: 0.08, crystal: 25, scrollChance: 0.02 },
    periodReward: { crystal: 600, gold: 45000, scrolls: 2 },
  },
  {
    id: "SILVER",
    name: "白銀級",
    shortName: "白銀",
    minPoints: 1300,
    color: "#b9c4d6",
    build: {
      star: 5,
      level: [44, 50],
      skillLevel: [2, 3],
      equipStar: 4,
      equipEnhance: [6, 9],
      equipSubStats: [1, 3],
      rareRatio: 0.2,
      normalTeamBonus: { equipEnhance: 2, skillLevel: 1 },
    },
    winReward: { gold: 11000, crystalChance: 0.1, crystal: 30, scrollChance: 0.03 },
    periodReward: { crystal: 1000, gold: 80000, scrolls: 3 },
  },
  {
    id: "GOLD",
    name: "黄金級",
    shortName: "黄金",
    minPoints: 1550,
    color: "#e2b66e",
    build: {
      star: 5,
      level: [50, 50],
      skillLevel: [3, 4],
      equipStar: 5,
      equipEnhance: [9, 12],
      equipSubStats: [2, 3],
      rareRatio: 0.3,
      normalTeamBonus: { equipEnhance: 2, skillLevel: 1 },
    },
    winReward: { gold: 18000, crystalChance: 0.12, crystal: 40, scrollChance: 0.04 },
    periodReward: { crystal: 1600, gold: 130000, scrolls: 4 },
  },
  {
    id: "MITHRIL",
    name: "魔鋼級",
    shortName: "魔鋼",
    minPoints: 1850,
    color: "#7fb4e8",
    build: {
      star: 6,
      level: [54, 60],
      skillLevel: [3, 5],
      equipStar: 5,
      equipEnhance: [12, 15],
      equipSubStats: [2, 4],
      rareRatio: 0.4,
      normalTeamBonus: { equipEnhance: 3, skillLevel: 1 },
    },
    winReward: { gold: 26000, crystalChance: 0.14, crystal: 50, scrollChance: 0.05 },
    periodReward: { crystal: 2400, gold: 200000, scrolls: 6 },
  },
  {
    id: "DRAGON",
    name: "竜鱗級",
    shortName: "竜鱗",
    minPoints: 2200,
    color: "#8f7ae6",
    build: {
      star: 6,
      level: [58, 60],
      skillLevel: [4, 5],
      equipStar: 6,
      equipEnhance: [12, 15],
      equipSubStats: [3, 4],
      rareRatio: 0.5,
      normalTeamBonus: { equipEnhance: 3, skillLevel: 1 },
    },
    winReward: { gold: 38000, crystalChance: 0.16, crystal: 60, scrollChance: 0.06 },
    periodReward: { crystal: 3400, gold: 300000, scrolls: 8 },
  },
  {
    id: "CROWN",
    name: "灼冠級",
    shortName: "灼冠",
    minPoints: 2600,
    color: "#f2853f",
    build: {
      star: 6,
      level: [60, 60],
      skillLevel: [5, 5],
      equipStar: 6,
      equipEnhance: [15, 15],
      equipSubStats: [4, 4],
      // 最上位でも4割は通常軸の相手が残る。ここを1.0にすると
      // 「灼冠級は高レアが無いと相手すら居ない」になってしまう
      rareRatio: 0.6,
      normalTeamBonus: { equipEnhance: 0, skillLevel: 0 },
    },
    winReward: { gold: 55000, crystalChance: 0.18, crystal: 80, scrollChance: 0.08 },
    periodReward: { crystal: 5000, gold: 450000, scrolls: 12 },
  },
];

/** 開始ポイント。錆鉄級の中ほどから始まる */
export const ARENA_START_POINTS = 1000;

/** ポイントからランク帯を引く */
export function arenaRankForPoints(points: number): ArenaRank {
  let current = ARENA_RANKS[0];
  for (const rank of ARENA_RANKS) {
    if (points >= rank.minPoints) current = rank;
  }
  return current;
}

/** 次のランク帯(最上位なら null) */
export function nextArenaRank(rank: ArenaRank): ArenaRank | null {
  const index = ARENA_RANKS.findIndex((r) => r.id === rank.id);
  return index >= 0 && index + 1 < ARENA_RANKS.length ? ARENA_RANKS[index + 1] : null;
}

/* ==========================================================================
 * 挑戦券
 * ========================================================================== */

/**
 * アリーナの1編成の人数。
 *
 * **2つの画面がそれぞれ `const ARENA_TEAM_SIZE = 4` を持っていた。**
 * 見た目には同じ4でも、サーバ側の検分もこの数を使う以上、
 * 置き場所が3つあると必ずどれかが古くなる(挑戦券と勝敗コインで
 * 実際にそうなった)。ここ1つにする。
 */
export const ARENA_TEAM_SIZE = 4;

/**
 * 挑戦券。**スタミナとは別枠**にしてある。
 *
 * スタミナを使う作りにすると、周回の途中でアリーナに寄るたびに
 * 周回そのものが止まる。逆にアリーナ側も「今日はもう周回で使い切った」で
 * 触れなくなる。どちらの遊びも相手の都合で止まらないように分ける。
 */
export const ARENA_TICKET_MAX = 10;
/** 挑戦券が1枚回復するまでの実時間(分) */
export const ARENA_TICKET_REGEN_MINUTES = 60;
/** ダイヤを払って挑戦券を全回復する時の価格 */
export const ARENA_TICKET_REFILL_COST = 100;

/* ==========================================================================
 * 期間(まとめ報酬の区切り)
 * ========================================================================== */

/** まとめ報酬の期間の長さ(ミリ秒)。1週間 */
export const ARENA_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * その時刻がどの期間に属するかの識別子。
 * epoch起点の週番号なので、区切りは木曜のUTC 0時になる。
 * 「毎週決まった時刻に締まる」ことだけが要件なので、曜日はここでは問わない。
 */
export function arenaPeriodKey(now: number): number {
  return Math.floor(now / ARENA_PERIOD_MS);
}

/** その期間が終わる時刻(ミリ秒epoch) */
export function arenaPeriodEndAt(now: number): number {
  return (arenaPeriodKey(now) + 1) * ARENA_PERIOD_MS;
}

/* ==========================================================================
 * 編成の型(アーキタイプ)
 *
 * 相手をランダムな顔ぶれで組むと、どの帯でも同じ「なんとなく強い4体」に
 * なってしまい、こちらが編成を変える理由が生まれない。
 *
 * ここでは戦い方の型を先に決め、**その型を本当に実行できる顔ぶれ**を
 * 型ごとに名指しで持つ。過去に「毒編成」として毒を1体も持たない編成を
 * 並べて測った事故があるので、顔ぶれは型に合わせて固定してある
 * (tests/pvpArena.test.ts で、型どおりの技を持っているかを検査している)。
 * ========================================================================== */

export type ArenaArchetypeId = "SWIFT" | "ENDURE" | "DISRUPT" | "BALANCE";

export interface ArenaArchetype {
  id: ArenaArchetypeId;
  name: string;
  /** 一言の説明。相手カードに出して「何をしてくる編成か」を先に伝える */
  note: string;
  /** 通常モンスターだけで組む顔ぶれ */
  normalTeam: string[];
  /** 高レア(SR/SSR)を軸にした顔ぶれ */
  rareTeam: string[];
  /** この型が着ける装備シリーズ */
  set: SetType;
  /** 可変スロット(2/4/6)で狙うメインステータス */
  preferredMains: StatType[];
}

export const ARENA_ARCHETYPES: ArenaArchetype[] = [
  {
    id: "SWIFT",
    name: "速攻",
    note: "先に動いて一気に削る",
    // 電気は素の速度が15%高い。速攻の型はここを軸にする
    normalTeam: ["wolf_ELECTRIC", "slime_ELECTRIC", "knight_ELECTRIC", "imp_ELECTRIC"],
    rareTeam: ["griffon_ELECTRIC", "dragon_FIRE", "nemesis_ELECTRIC", "griffon_FIRE"],
    set: "SWIFT",
    preferredMains: ["SPD", "CRIT_DMG", "ATK_PERCENT"],
  },
  {
    id: "ENDURE",
    name: "耐久",
    note: "守りを固めて粘る",
    normalTeam: ["golem_WATER", "treant_GRASS", "fairy_WATER", "wisp_GRASS"],
    rareTeam: ["seraph_LIGHT", "griffon_WATER", "treant_LIGHT", "fairy_LIGHT"],
    set: "GUARD",
    preferredMains: ["DEF_PERCENT", "HP_PERCENT", "HP_PERCENT"],
  },
  {
    id: "DISRUPT",
    name: "妨害",
    note: "状態異常で手番を奪う",
    // インプはデバッファー、闇スライム/闇ウルフは毒を持つ枠
    normalTeam: ["imp_DARK", "slime_DARK", "wolf_DARK", "wisp_WATER"],
    rareTeam: ["nemesis_DARK", "seraph_DARK", "imp_DARK", "wisp_DARK"],
    set: "ACCURACY_SET",
    preferredMains: ["ACCURACY", "SPD", "HP_PERCENT"],
  },
  {
    id: "BALANCE",
    name: "均衡",
    note: "攻めと守りを両立させる",
    normalTeam: ["knight_WATER", "fairy_GRASS", "wolf_FIRE", "golem_ELECTRIC"],
    rareTeam: ["seraph_WATER", "dragon_FIRE", "griffon_GRASS", "nemesis_ELECTRIC"],
    set: "POWER",
    preferredMains: ["ATK_PERCENT", "CRIT_RATE", "RESISTANCE"],
  },
];

export function findArenaArchetype(id: ArenaArchetypeId): ArenaArchetype {
  return ARENA_ARCHETYPES.find((a) => a.id === id) ?? ARENA_ARCHETYPES[ARENA_ARCHETYPES.length - 1];
}

/* ==========================================================================
 * 擬似プレイヤーの名前
 *
 * 実在のプレイヤーは居ないが、**相手が人の顔をしている**ことは対人の要。
 * 「敵A」ではなく名前と称号を持たせる。組み合わせで作るので表は小さくて済む。
 * ========================================================================== */

export const ARENA_NAME_TITLES = [
  "炉端の",
  "灰かぶりの",
  "月影の",
  "鉄砂の",
  "紅蓮の",
  "霜降りの",
  "鳴神の",
  "常盤の",
  "黄昏の",
  "白霧の",
  "赤錆の",
  "星屑の",
];

export const ARENA_NAME_CORES = [
  "リュカ",
  "ミナ",
  "ガロウ",
  "セイラ",
  "トウヤ",
  "ノエル",
  "ハヅキ",
  "クロト",
  "リーゼ",
  "ジン",
  "アオイ",
  "ファルコ",
  "ミリア",
  "ゲンゴ",
  "シオン",
  "ルカ",
];

/* ==========================================================================
 * 速度の扱い
 * ========================================================================== */

/**
 * アリーナでだけ、速度の効きを圧縮する。
 *
 * ## なぜ要るか
 *
 * このゲームのATBは「速度がそのまま手番の数」になる。装備は速度を実数で足せる
 * (スロット2のメイン+副効果)ので、速度に全部を詰めた編成は素の編成に対して
 * 手番が1.5〜2倍になる。対人でそれをそのまま持ち込むと、
 * **先に動いた側が動き続けて、後手は何もできずに終わる**。
 * 「スキルがモンスターにいろんな場所での役割を与える」(docs/design-concept.md)
 * という芯が、アリーナだけ「速度を積んだ者が勝つ」に置き換わってしまう。
 *
 * ## なぜ「速度を殺す」ではなく「圧縮」なのか
 *
 * 速度を無効にすると、速度を鍛えた人の努力が丸ごと無駄になる。
 * それは「時間をかけた人が報われる余地を必ず残す」に反する。
 * ここでは基準値へ向けて縮めるだけにして、**速い方が先に動く・手番も多い、
 * ただし一方的にはならない**という形に落とす。
 *
 * ## なぜ BattleEngine を触らないのか
 *
 * 戦闘の仕組みは作り直さない。渡す前のステータスを整えるだけなら、
 * 他のコンテンツ(ステージ・ダンジョン)の挙動には一切影響しない。
 *
 * 圧縮は**両陣営に同じ式で掛ける**。片方だけに掛けると単なる有利不利になる。
 */
export const ARENA_SPEED_PIVOT = 110;
/** 0で速度差が消える / 1で圧縮なし。実測して決めた値は tests/pvpArena.test.ts の意図と揃えること */
export const ARENA_SPEED_COMPRESSION = 0.55;

/** アリーナ用に圧縮した速度を返す(1未満にはしない) */
export function arenaCompressedSpeed(spd: number): number {
  return Math.max(1, Math.round(ARENA_SPEED_PIVOT + (spd - ARENA_SPEED_PIVOT) * ARENA_SPEED_COMPRESSION));
}

/* ==========================================================================
 * ポイントの増減
 * ========================================================================== */

/** 増減の基準値。強い相手に勝つほど大きく上がり、弱い相手に負けるほど大きく下がる */
export const ARENA_K_FACTOR = 32;
/** 勝った時に必ずもらえる最低ポイント */
export const ARENA_MIN_WIN_GAIN = 5;
/** 負けた時に必ず引かれるポイント */
export const ARENA_MIN_LOSS = 3;

/** 1試合の挑戦相手として並べる人数 */
export const ARENA_OPPONENT_COUNT = 3;

/**
 * 挑戦相手のポイントの置き方。
 * **勝てる相手・互角の相手・格上**を必ず1人ずつ並べる。
 * 3人とも同じ強さだと、選ぶという操作に意味が無くなる。
 */
export const ARENA_OPPONENT_POINT_OFFSETS = [-70, 10, 95];
