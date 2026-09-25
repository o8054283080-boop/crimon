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

/*
 * ## 2026-09: 10枠(実プレイヤー3・NPC7)
 *
 * 前は5枠で、実プレイヤーは自分の ±300 に居る人だけだった(`fetchArenaOpponents` の幅)。
 * 人口が少ないと、レートが離れた人とは一度も当たらない。
 * いまは**レート差に関係なく**実プレイヤーを3人まで出し(近い・中くらい・遠いを1人ずつ)、
 * 残りをNPCで埋める。実プレイヤーが3人に満たない時だけ、その分もNPCになる。
 */
/** 候補の枠の数 */
export const ARENA_CANDIDATE_TOTAL = 10;
/** そのうち実プレイヤーに使う枠。居る限り必ずこの人数を出す */
export const ARENA_PLAYER_SLOTS = 3;
/**
 * NPCを何人ぶん作るか。**サーバ(arena-settle)も同じ数を作り直して相手を特定する**ので、
 * 増やすと精算の計算量が増える。前(5枠のころ)と同じ10のまま、そこから7人を出す。
 */
export const ARENA_NPC_GENERATE_COUNT = 10;

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
  /** 実プレイヤーに使う枠の上限。省略時は `count`(全枠) */
  maxPlayers?: number;
  /**
   * 実プレイヤーの並びをそのまま使う(直近の相手を後ろへ回す並べ替えをしない)。
   * `orderArenaPlayerPicks` で近・中・遠の順に並べてある時に使う——
   * 並べ替えると、直近に当たった人しか居ない帯が後ろへ回り、近い人ばかりになる。
   */
  keepPlayerOrder?: boolean;
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
  const maxPlayers = Math.max(0, Math.min(count, options.maxPlayers ?? count));

  // 1. 自分を除く。ここを通らない経路を作らない。**同じ人は1回だけ**(同じ user_id が2行来ても2枠使わない)
  const seenIds = new Set<string>();
  const eligible = players.filter((entry) => {
    if (entry.id === selfId || seenIds.has(entry.id)) return false;
    seenIds.add(entry.id);
    return true;
  });

  // 2. 直近に出していない実プレイヤーを先に。足りなければ出したことのある人も使う
  const fresh = eligible.filter((entry) => !recent.has(entry.id));
  const seen = eligible.filter((entry) => recent.has(entry.id));
  const ordered = options.keepPlayerOrder ? eligible : [...fresh, ...seen];
  const chosen: ArenaOpponentEntry[] = ordered.slice(0, maxPlayers);

  // 3. 残りをNPCで埋める。NPCにも直近の回避を効かせる
  if (chosen.length < count) {
    const room = Math.min(count - chosen.length, maxNpc);
    const npcFresh = npcs.filter((entry) => !recent.has(entry.id));
    const npcSeen = npcs.filter((entry) => recent.has(entry.id));
    chosen.push(...[...npcFresh, ...npcSeen].slice(0, room));
  }

  // 4. 画面用の位置だけを振り直す。
  // NPCの生成位置 `npcGenerationIndex` は、サーバで同じ相手を組み直すため不変にする。
  return chosen.slice(0, count).map((entry, index) => ({ ...entry, index }));
}

/** 直近に出した相手として覚えておく件数。多すぎると候補が枯れる */
export const ARENA_RECENT_MEMORY = 8;

/** 直近リストへ1件足す(古いものから落とす) */
export function rememberArenaOpponent(recent: readonly string[], id: string): string[] {
  const next = [id, ...recent.filter((item) => item !== id)];
  return next.slice(0, ARENA_RECENT_MEMORY);
}

/** 実プレイヤー候補の最小限の形(防衛編成を取る前に選ぶため) */
export interface ArenaPoolRow {
  id: string;
  rating: number;
}

export interface ArenaPlayerPickOptions {
  selfId: string;
  myRating: number;
  /** 「相手を変える」で進む種。同じ種なら同じ並び */
  seed: number;
  recentIds?: readonly string[];
  /** 出す人数(近・中・遠の帯の数でもある) */
  slots?: number;
  /** 帯ごとに控えを何人まで並べるか(防衛編成が壊れていた時の代わり) */
  backupsPerBand?: number;
}

/**
 * 実プレイヤーを選ぶ順番を返す(user_id の列)。**レート差で候補から外すことはしない。**
 *
 * 自分からのレート差で並べて3等分し(近い・中くらい・遠い)、各帯から1人ずつ
 * → 各帯の2人目 → … の順に交互に並べる。呼ぶ側は防衛編成を取れた順に3人まで使う。
 *
 *   ・3人以上居れば、必ず3人とも違う人で、近・中・遠が1人ずつになる
 *   ・帯の中では、直近に当たった人を後ろへ回し、残りは種で混ぜる
 *     (同じ3人ばかりが並ばないように。種は「相手を変える」で進む)
 *   ・自分と、同じ user_id の重複はここでも落とす
 */
export function orderArenaPlayerPicks(pool: readonly ArenaPoolRow[], options: ArenaPlayerPickOptions): string[] {
  const slots = Math.max(1, options.slots ?? ARENA_PLAYER_SLOTS);
  const backups = Math.max(0, options.backupsPerBand ?? 2);
  const recent = new Set(options.recentIds ?? []);
  const seen = new Set<string>();
  const eligible = pool.filter((row) => {
    if (!row.id || row.id === options.selfId || seen.has(row.id) || !Number.isFinite(row.rating)) return false;
    seen.add(row.id);
    return true;
  });
  // 近い順。同じ差なら id で決める(実行ごとに並びが揺れないように)
  const byDistance = [...eligible].sort((a, b) =>
    Math.abs(a.rating - options.myRating) - Math.abs(b.rating - options.myRating) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (byDistance.length === 0) return [];

  const bandCount = Math.min(slots, byDistance.length);
  const bands: ArenaPoolRow[][] = Array.from({ length: bandCount }, () => []);
  byDistance.forEach((row, i) => {
    bands[Math.min(bandCount - 1, Math.floor((i * bandCount) / byDistance.length))].push(row);
  });

  const rng = mulberry(options.seed);
  const orderedBands = bands.map((band) => {
    // 帯の中を種で混ぜてから、直近に当たった人を後ろへ回す(安定な並べ替え)
    const shuffled = band.map((row) => ({ row, key: rng() })).sort((a, b) => a.key - b.key).map((x) => x.row);
    return [...shuffled.filter((row) => !recent.has(row.id)), ...shuffled.filter((row) => recent.has(row.id))];
  });

  const result: string[] = [];
  for (let round = 0; round <= backups; round += 1) {
    for (const band of orderedBands) {
      const row = band[round];
      if (row) result.push(row.id);
    }
  }
  return result;
}

/** 種から決まる乱数(`game/arena/npc.ts` と同じ系統の式) */
function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
