/**
 * アリーナの画面が外から受け取るもの。**ここが画面と配線の唯一の契約。**
 *
 * 画面は数字を作らない。レートもコインも購入上限も `game/arena/*` が決め、
 * ここには「決まった結果」と「押されたことを伝える口」だけが並ぶ。
 */
import { MonsterInstance } from "../../../core/monsterInstance.js";
import { PlayerState } from "../../../game/playerState.js";
import { ArenaShopRow } from "../../../game/arena/shop.js";
import {
  ArenaMatchRecord,
  ArenaOpponentEntry,
  ArenaRevengeBlock,
} from "../../../game/arena/types.js";
import { ArenaRankingEntry } from "../../../net/arenaSync.js";
import { ArenaViewName } from "./model.js";

/** 防衛履歴1行ぶん。リベンジの可否は `arenaRevengeBlock` が決めた結果をそのまま渡す */
export interface ArenaHistoryInput {
  record: ArenaMatchRecord;
  block: ArenaRevengeBlock;
}

export interface PvpArenaProps {
  player: PlayerState;
  /** いまアリーナの中のどこを見ているか */
  view: ArenaViewName;
  notice: string | null;

  /** Supabaseに繋がっているか。**繋がっていない時に順位の嘘を出さないための旗** */
  online: boolean;
  /** 自分の全国順位。未接続・未掲載なら null */
  myRank: number | null;
  /** 挑戦券の上限と、次の1枚が回復する時刻 */
  ticketMax: number;
  nextTicketAt: number | null;

  /** 対戦候補。実プレイヤーとNPCが混ざる */
  candidates: readonly ArenaOpponentEntry[];
  candidatesLoading: boolean;
  /** 詳細を開いている相手。開いていなければ null */
  detailEntry: ArenaOpponentEntry | null;
  /** 検分している1体の位置(相手の詳細・自分の防衛で共用) */
  unitIndex: number;

  ranking: {
    loading: boolean;
    top: readonly ArenaRankingEntry[];
    around: readonly ArenaRankingEntry[];
    myUserId: string | null;
  };

  shopRows: readonly ArenaShopRow[];
  history: readonly ArenaHistoryInput[];

  /** 防衛に登録しようとしている顔ぶれ(まだ焼いていない) */
  defenseDraftIds: readonly string[];
  /** 攻撃編成の現在の顔ぶれ */
  offenseMembers: readonly MonsterInstance[];

  onGo: (view: ArenaViewName) => void;
  onOpenOpponent: (entry: ArenaOpponentEntry) => void;
  onSelectUnit: (index: number) => void;
  onChallenge: (entry: ArenaOpponentEntry) => void;
  onReroll: () => void;
  /** 「相手を変える」の残り回数。0なら押せない */
  rerollsLeft: number;
  rerollLimit: number;
  onRefillTickets: () => void;
  onClaimWeekly: () => void;
  onToggleOffenseMember: (instanceId: string) => void;
  onToggleDefenseDraft: (instanceId: string) => void;
  onRegisterDefense: () => void;
  onBuy: (itemId: string) => void;
  onRevenge: (record: ArenaMatchRecord) => void;
  onReloadRanking: () => void;
  /** 自分のモンスターの詳細画面へ */
  onViewMonster: (instanceId: string) => void;
}
