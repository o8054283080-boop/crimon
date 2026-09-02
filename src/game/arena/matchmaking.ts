/**
 * 対戦候補を並べる。
 *
 * ## 実プレイヤー優先、足りない分はNPCで埋める
 *
 * **人口が少ないことを前提に設計する。** 実プレイヤーだけで組むと、
 * 相手が0人の日はアリーナが遊べない画面になる。かといってNPCだけだと
 * 対人戦にならない。だから「居る人を先に出し、残りをNPCで埋める」。
 *
 * 人が増えた時にNPCを減らすのは `maxNpc` を下げるだけで済む
 * ——画面側は `ArenaOpponentEntry` しか見ないので、比率を変えても何も壊れない。
 *
 * ## 自分は絶対に出さない
 *
 * 自分の防衛に自分で挑めると、勝敗のどちらでもレートを操作できる。
 * ここは「出さないよう気をつける」ではなく、**除外を必ず通す**形にしてある。
 */
import { ArenaOpponentEntry } from "./types.js";

export interface ArenaMatchmakingOptions {
  /** 並べる人数 */
  count: number;
  /** 自分の識別子。この行は必ず落とす */
  selfId: string;
  /**
   * 直近で出した相手の識別子。**同じ相手ばかり並ばないようにする。**
   * 候補が足りなくなる時は、この制限を緩めてでも枠を埋める。
   */
  recentIds?: readonly string[];
  /** NPCで埋められる上限。人が増えたらここを下げる */
  maxNpc?: number;
}

/**
 * 実プレイヤー候補とNPC候補を混ぜて、候補一覧を作る。
 *
 * `players` は実プレイヤーの防衛(Supabaseから来る想定)、
 * `npcs` は必要数以上を渡してよい。足りない分だけ使う。
 */
export function buildArenaCandidates(
  players: readonly ArenaOpponentEntry[],
  npcs: readonly ArenaOpponentEntry[],
  options: ArenaMatchmakingOptions,
): ArenaOpponentEntry[] {
  const { count, selfId } = options;
  const recent = new Set(options.recentIds ?? []);
  const maxNpc = options.maxNpc ?? count;

  // 1. 自分を除く。ここを通らない経路を作らない
  const eligible = players.filter((entry) => entry.id !== selfId);

  // 2. 直近に出していない実プレイヤーを先に。足りなければ出したことのある人も使う
  const fresh = eligible.filter((entry) => !recent.has(entry.id));
  const seen = eligible.filter((entry) => recent.has(entry.id));
  const chosen: ArenaOpponentEntry[] = [...fresh, ...seen].slice(0, count);

  // 3. 残りをNPCで埋める。NPCにも直近の回避を効かせる
  if (chosen.length < count) {
    const room = Math.min(count - chosen.length, maxNpc);
    const npcFresh = npcs.filter((entry) => !recent.has(entry.id));
    const npcSeen = npcs.filter((entry) => recent.has(entry.id));
    chosen.push(...[...npcFresh, ...npcSeen].slice(0, room));
  }

  // 4. 並びの位置を振り直す。画面は index で対象を指す
  return chosen.slice(0, count).map((entry, index) => ({ ...entry, index }));
}

/** 直近に出した相手として覚えておく件数。多すぎると候補が枯れる */
export const ARENA_RECENT_MEMORY = 8;

/** 直近リストへ1件足す(古いものから落とす) */
export function rememberArenaOpponent(recent: readonly string[], id: string): string[] {
  const next = [id, ...recent.filter((item) => item !== id)];
  return next.slice(0, ARENA_RECENT_MEMORY);
}
