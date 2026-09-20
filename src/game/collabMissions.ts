import { COLLAB_EVENT_FROM_DATE, COLLAB_EVENT_ID, COLLAB_EVENT_TO_DATE, COLLAB_GIFT_DEX_ID, isCollabDexId } from "../data/collabEvent.js";
import { MissionReward } from "./missions.js";
import { MonsterInstance } from "../core/monsterInstance.js";
import { PlayerState } from "./playerState.js";

/**
 * コラボ限定ミッション30個と、累計達成報酬6段。
 *
 * ## 既存のミッションとは別管理
 *
 * 日次・週次・月次も、公開記念キャンペーンも触っていない。
 * **期間が終わったら丸ごと止まる**ものなので、既存の仕組みへ混ぜると
 * 終わらせる時に他まで巻き込む。進捗の置き場も専用に持つ。
 *
 * ## ガチャ運で詰まないこと
 *
 * 記念配布で**電気スエゾー1体 + コラボ限定★4以上召喚書1枚**が配られるので、
 * 誰でも最低2体のコラボモンスターを持てる。
 *
 * **だから条件は「2体」であって「2種類」ではない。**
 * 召喚書から電気スエゾーが被る目は12分の1あり、「2種類」にすると
 * その人だけ30個コンプリートが不可能になる(依頼主の指定で調整した)。
 * 被っても2体目として数えるので、引きに関わらず達成できる。
 */

/** 進捗の測り方 */
export type CollabProgressKey =
  /** 配布の電気スエゾーを受け取った */
  | "giftReceived"
  /** 手持ちのコラボモンスターの数(同じ種類でも別々に数える) */
  | "collabOwned"
  /** コラボモンスターを編成に入れた */
  | "collabInParty"
  /** コラボモンスターを入れた編成で勝った回数 */
  | "collabWins"
  /** 手持ちのコラボモンスターの最高レベル */
  | "collabMaxLevel"
  /** 手持ちのコラボモンスターの最高★ */
  | "collabMaxStar"
  /** コラボ2体のレベル合計(高い順に2体) */
  | "collabTopTwoLevelSum"
  /** レベル40以上のコラボモンスターの数 */
  | "collabAtLevel40"
  /** 潜在覚醒を済ませたコラボモンスターの数 */
  | "collabAwakened"
  /** 装備の強化回数(既存の計測を使う) */
  | "equipmentEnhancements"
  /** 装備1個の強化値の最大(+15まで) */
  | "equipmentMaxLevel"
  /** ダンジョンのクリア回数(既存の計測を使う) */
  | "dungeonClears"
  /** アリーナの挑戦回数(既存の計測を使う) */
  | "arenaBattles"
  /** ランクアップの回数(既存の計測を使う) */
  | "rankUps"
  /** 自動周回で回った周回数 */
  | "farmRuns";

export interface CollabMissionDefinition {
  id: string;
  title: string;
  condition: string;
  progress: CollabProgressKey;
  target: number;
  reward: MissionReward;
}

/**
 * 30個の本体。
 *
 * **並びは進めやすい順。**上から順に手が届くので、
 * 「次に何をすればいいか」を画面で探さなくて済む。
 */
export const COLLAB_MISSIONS: readonly CollabMissionDefinition[] = [
  { id: "collab-01-gift", title: "コラボのはじまり", condition: "電気スエゾーを受け取る", progress: "giftReceived", target: 1, reward: { crystal: 200 } },
  { id: "collab-02-party", title: "さっそく連れて行く", condition: "コラボモンスターを編成に入れる", progress: "collabInParty", target: 1, reward: { summonScrolls: 3 } },
  { id: "collab-03-win-1", title: "はじめての勝利", condition: "コラボモンスターを入れた編成で1回勝つ", progress: "collabWins", target: 1, reward: { gold: 200_000 } },
  { id: "collab-04-level-20", title: "育て始める", condition: "コラボモンスターをLv20以上にする", progress: "collabMaxLevel", target: 20, reward: { expPig4: 2 } },
  { id: "collab-05-win-5", title: "5回の勝利", condition: "コラボモンスターを入れた編成で5回勝つ", progress: "collabWins", target: 5, reward: { crystal: 300 } },
  { id: "collab-06-enhance-10", title: "装備を整える", condition: "装備を10回強化する", progress: "equipmentEnhancements", target: 10, reward: { gold: 300_000 } },
  { id: "collab-07-own-2", title: "2体目の仲間", condition: "コラボモンスターを2体そろえる", progress: "collabOwned", target: 2, reward: { summonScrolls: 5 } },
  { id: "collab-08-dungeon-10", title: "ダンジョン探索", condition: "ダンジョンを10回クリアする", progress: "dungeonClears", target: 10, reward: { staminaPotions: 3 } },
  { id: "collab-09-level-30", title: "さらに育てる", condition: "コラボモンスターをLv30以上にする", progress: "collabMaxLevel", target: 30, reward: { expPig4: 3 } },
  { id: "collab-10-win-10", title: "10回の勝利", condition: "コラボモンスターを入れた編成で10回勝つ", progress: "collabWins", target: 10, reward: { crystal: 500 } },
  { id: "collab-11-rankup", title: "ランクアップ", condition: "モンスターを1回ランクアップする", progress: "rankUps", target: 1, reward: { reincarnationPig4: 2 } },
  { id: "collab-12-star-5", title: "★5へ", condition: "コラボモンスターを★5以上にする", progress: "collabMaxStar", target: 5, reward: { reincarnationPig4: 1 } },
  { id: "collab-13-dungeon-20", title: "ダンジョン攻略", condition: "ダンジョンを20回クリアする", progress: "dungeonClears", target: 20, reward: { summonScrolls: 5 } },
  { id: "collab-14-arena-5", title: "アリーナへ", condition: "アリーナに5回挑戦する", progress: "arenaBattles", target: 5, reward: { arenaCoins: 300 } },
  { id: "collab-15-two-level-60", title: "二人で育つ", condition: "コラボモンスター2体のレベル合計を60以上にする", progress: "collabTopTwoLevelSum", target: 60, reward: { fourStarSummonScrolls: 1 } },
  { id: "collab-16-win-30", title: "30回の勝利", condition: "コラボモンスターを入れた編成で30回勝つ", progress: "collabWins", target: 30, reward: { crystal: 500 } },
  { id: "collab-17-enhance-max", title: "+15まで鍛える", condition: "装備を1個+15まで強化する", progress: "equipmentMaxLevel", target: 15, reward: { gold: 500_000 } },
  { id: "collab-18-level-40", title: "Lv40の壁", condition: "コラボモンスターをLv40以上にする", progress: "collabMaxLevel", target: 40, reward: { skillPig: 1 } },
  { id: "collab-19-farm-30", title: "周回のお供", condition: "自動周回を30周おわらせる", progress: "farmRuns", target: 30, reward: { staminaPotions: 5 } },
  { id: "collab-20-win-40", title: "40回の勝利", condition: "コラボモンスターを入れた編成で40回勝つ", progress: "collabWins", target: 40, reward: { crystal: 700 } },
  { id: "collab-21-star-6", title: "★6の頂", condition: "コラボモンスターを★6にする", progress: "collabMaxStar", target: 6, reward: { reincarnationPig4: 2 } },
  { id: "collab-22-dungeon-50", title: "ダンジョン制覇", condition: "ダンジョンを50回クリアする", progress: "dungeonClears", target: 50, reward: { summonScrolls: 10 } },
  { id: "collab-23-awaken", title: "秘めた力", condition: "コラボモンスターを1体、潜在覚醒させる", progress: "collabAwakened", target: 1, reward: { crystal: 500 } },
  { id: "collab-24-win-50", title: "50回の勝利", condition: "コラボモンスターを入れた編成で50回勝つ", progress: "collabWins", target: 50, reward: { gold: 750_000 } },
  { id: "collab-25-two-level-40", title: "二人とも一人前", condition: "コラボモンスター2体をLv40以上にする", progress: "collabAtLevel40", target: 2, reward: { fourStarSummonScrolls: 1 } },
  { id: "collab-26-win-75", title: "75回の勝利", condition: "コラボモンスターを入れた編成で75回勝つ", progress: "collabWins", target: 75, reward: { skillPig: 2 } },
  { id: "collab-27-dungeon-100", title: "ダンジョンの主", condition: "ダンジョンを100回クリアする", progress: "dungeonClears", target: 100, reward: { crystal: 700 } },
  { id: "collab-28-win-100", title: "100回の勝利", condition: "コラボモンスターを入れた編成で100回勝つ", progress: "collabWins", target: 100, reward: { summonScrolls: 10 } },
  { id: "collab-29-win-125", title: "125回の勝利", condition: "コラボモンスターを入れた編成で125回勝つ", progress: "collabWins", target: 125, reward: { lightDarkFourStarSummonScrolls: 1 } },
  { id: "collab-30-win-150", title: "コラボの果てへ", condition: "コラボモンスターを入れた編成で150回勝つ", progress: "collabWins", target: 150, reward: { crystal: 1_000 } },
];

/**
 * 累計達成報酬。**30個ぶんの個別報酬とは別に配る。**
 *
 * 最後の「コラボ限定★5召喚書」がこのコラボの目玉。
 * ★5コラボしか出ない書なので、**ここまで進めば確実に★5が1体増える。**
 */
export const COLLAB_MILESTONES: readonly { target: number; reward: MissionReward }[] = [
  { target: 5, reward: { crystal: 300 } },
  { target: 10, reward: { summonScrolls: 10 } },
  { target: 15, reward: { crystal: 500 } },
  { target: 20, reward: { collabFourStarSummonScrolls: 1 } },
  { target: 25, reward: { collabLightDarkFourStarSummonScrolls: 1 } },
  { target: 30, reward: { collabFiveStarSummonScrolls: 1 } },
];

/** キャンペーンの進捗。ミッションの状態そのものは `missions.ts` が持つ */
export interface CollabCampaignState {
  id: string;
  /** 始めた時点の既存カウンタ。差分だけを進捗として数える */
  baseline: { equipmentEnhancements: number; dungeonClears: number; arenaBattles: number; rankUps: number };
  claimedIds: string[];
  claimedMilestones: number[];
  /** コラボを入れた編成で勝った回数 */
  collabWins: number;
  /** 自動周回で回った周回数 */
  farmRuns: number;
}

export function createCollabCampaignState(
  baseline: CollabCampaignState["baseline"],
): CollabCampaignState {
  return { id: COLLAB_EVENT_ID, baseline, claimedIds: [], claimedMilestones: [], collabWins: 0, farmRuns: 0 };
}

/** 手持ちのコラボモンスターだけを抜き出す */
export function collabMonstersOf(player: PlayerState): MonsterInstance[] {
  return player.monsters.filter((monster) => isCollabDexId(monster.dexId));
}

/**
 * 進捗の値を測る。
 *
 * **手持ちを見れば分かるものは、その場で数える。**
 * 「一度でも達成したか」を保存すると、育てたモンスターを
 * 素材にした時に進捗が巻き戻って見え、受け取り済みの報酬と食い違う。
 */
export function collabProgressValue(
  player: PlayerState,
  campaign: CollabCampaignState,
  counters: { equipmentEnhancements: number; dungeonClears: number; arenaBattles: number; rankUps: number },
  key: CollabProgressKey,
): number {
  const collab = collabMonstersOf(player);
  switch (key) {
    case "giftReceived":
      return player.monsters.some((m) => m.dexId === COLLAB_GIFT_DEX_ID) ? 1 : 0;
    case "collabOwned":
      return collab.length;
    case "collabInParty":
      return player.partyIds.some((id) => collab.some((m) => m.id === id))
        || player.dungeonPartyIds.some((id) => collab.some((m) => m.id === id)) ? 1 : 0;
    case "collabWins":
      return campaign.collabWins;
    case "collabMaxLevel":
      return collab.reduce((max, m) => Math.max(max, m.level), 0);
    case "collabMaxStar":
      return collab.reduce((max, m) => Math.max(max, m.star), 0);
    case "collabTopTwoLevelSum": {
      // 高い順に2体ぶん。1体しか居なければその1体ぶんだけ
      const levels = collab.map((m) => m.level).sort((a, b) => b - a);
      return levels.slice(0, 2).reduce((sum, level) => sum + level, 0);
    }
    case "collabAtLevel40":
      return collab.filter((m) => m.level >= 40).length;
    case "collabAwakened":
      return collab.filter((m) => m.development?.latentAbilityId).length;
    case "equipmentMaxLevel":
      return player.equipment.reduce((max, e) => Math.max(max, e.level), 0);
    case "farmRuns":
      return campaign.farmRuns;
    default:
      return Math.max(0, counters[key] - campaign.baseline[key]);
  }
}

/** 日付(日本時間の YYYY-MM-DD)が開催期間内か */
export function isCollabCampaignActive(today: string): boolean {
  return today >= COLLAB_EVENT_FROM_DATE && today <= COLLAB_EVENT_TO_DATE;
}
