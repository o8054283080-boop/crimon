/**
 * アリーナのサーバ同期。**鍵が無くてもゲームが完全に動くこと**が第一条件。
 *
 * ## なぜ「静かに落ちる」作りなのか
 *
 * いま遊んでいる人は誰も認証を持っていない。ここを必須依存にすると、
 * **全員がアリーナを開けなくなる。** だからこの層は次の約束を守る:
 *
 *   ・設定が無ければ「未接続」を返して何もしない
 *   ・通信が失敗しても**例外を投げない**。既定値(空配列・false・null)を返す
 *   ・返ってきたJSONが壊れていても落ちない。読めた行だけ使う
 *
 * 呼ぶ側は `arenaSyncAvailable()` を見て、false ならNPC対戦だけで組み立てる。
 * 「失敗したら例外」にすると、その try を1つ書き忘れた画面が丸ごと落ちる。
 *
 * ## 依存を増やさない
 *
 * `@supabase/supabase-js` は入れない。PostgREST も RPC も素の `fetch` で叩ける
 * (`src/game/cloudRecovery.ts` が Edge Function に対して同じことをしている)。
 * SDKを1つ足すと、PWAの配信サイズと更新のたびの取り込みが増える。
 *
 * ## 送ってよいもの・送っても意味がないもの
 *
 * レートもコインも**サーバが決める**(`supabase/migrations/20260902172000_arena_rpc.sql`)。
 * ここから「レート+500」を送る道はそもそも無い。送れるのは
 * 「誰と戦って勝ったか負けたか」だけ。
 */
import { ARENA_TIERS, ArenaTierId } from "../data/arena/ranks.js";
import {
  ArenaDefenseSnapshot,
  ArenaMatchRecord,
  ArenaOpponentEntry,
  ArenaOpponentKind,
} from "../game/arena/types.js";

/** 環境変数の名前。**ここ以外に書かない** */
export const ARENA_SYNC_URL_ENV = "VITE_SUPABASE_URL";
export const ARENA_SYNC_KEY_ENV = "VITE_SUPABASE_ANON_KEY";

/** 1回の通信を諦めるまで。画面を止めないための上限 */
const DEFAULT_TIMEOUT_MS = 8000;

export interface ArenaSyncConfig {
  url: string;
  anonKey: string;
  /**
   * Supabase Auth のアクセストークン。**無ければ anon key で投げる。**
   * その場合サーバ側は `auth.uid()` が null なので、書き込み系のRPCは
   * 必ず失敗する(= 未ログインでは読みだけができる)。
   */
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** ランキング1行。`ArenaOpponentEntry` とは別物(防衛編成を含まない) */
export interface ArenaRankingEntry {
  rank: number;
  userId: string;
  name: string;
  iconKey: string;
  rating: number;
  tierId: ArenaTierId;
  wins: number;
  losses: number;
  /** 代表モンスターの図鑑ID(「テンプレートID_属性」)。未登録なら null */
  leadDexId: string | null;
  leadStar: number | null;
}

/** 1戦の報告に対するサーバの答え */
export interface ArenaMatchReport {
  matchId: string;
  /** **サーバが回し直して出した勝敗。** 画面はこれに従う */
  won: boolean;
  ratingBefore: number;
  ratingDelta: number;
  rating: number;
  tierId: ArenaTierId;
  coins: number;
  coinBalance: number;
  tickets: number;
  opponentRating: number;
}

export interface ArenaBeginMatchInput {
  kind: ArenaOpponentKind;
  /** 自分の攻撃編成。**サーバが同じ検分を通す** */
  attackerSnapshot: ArenaDefenseSnapshot;
  /** 実プレイヤーならその識別子 */
  opponentId?: string | null;
  /**
   * NPCの生成に使った種と、並びの中の位置・件数。
   *
   * **レートは送らない。** 送っていた頃は、丸めた値と画面に出ていた
   * NPCがずれて、「見ていた相手」と「サーバが戦わせる相手」が別物になった。
   * 生成の基準はサーバが持っている自分のレートだけにしてある。
   */
  opponentSeed?: string | null;
  opponentIndex?: number | null;
  opponentCount?: number | null;
  opponentName?: string | null;
}

/** 発行された1戦。**種も相手もサーバが決めたもの** */
export interface ArenaMatchTicket {
  matchId: string;
  nonce: string;
  battleSeed: number;
  /** 実プレイヤー戦なら相手の防衛編成。NPC戦は null(種から組み直す) */
  defenderSnapshot: ArenaDefenseSnapshot | null;
  defenderRating: number;
  attackerRating: number;
  tickets: number;
}

const TIER_IDS = new Set<string>(ARENA_TIERS.map((tier) => tier.id));

// ---------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------

/**
 * テストと将来の認証層のための差し込み口。
 * `import.meta.env` は書き換えられないので、上書きはここに置く。
 */
let override: Partial<ArenaSyncConfig> | null = null;

function readEnv(name: string): string {
  // import.meta.env(Vite)。**無い環境でも落ちないように包む**
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    const value = env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    /* import.meta が無い実行環境 */
  }
  // Node(道具類・テスト)からも渡せるようにしておく
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    const value = proc?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    /* process が無い実行環境 */
  }
  return "";
}

/**
 * いまの設定。**足りなければ null。** 呼ぶ側はこれで「未接続」を判断する。
 */
export function arenaSyncConfig(): ArenaSyncConfig | null {
  const url = (override?.url ?? readEnv(ARENA_SYNC_URL_ENV)).replace(/\/+$/, "");
  const anonKey = override?.anonKey ?? readEnv(ARENA_SYNC_KEY_ENV);
  if (!url || !anonKey) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    url,
    anonKey,
    accessToken: override?.accessToken ?? null,
    fetchImpl: override?.fetchImpl,
    timeoutMs: override?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

/** サーバに繋がる見込みがあるか。**画面はまずこれを見る** */
export function arenaSyncAvailable(): boolean {
  return arenaSyncConfig() !== null;
}

/** テスト・認証層からの差し込み。`null` で元に戻す */
export function configureArenaSync(config: Partial<ArenaSyncConfig> | null): void {
  override = config;
}

/** ログイン後にトークンを渡す。ログアウトは `null` */
export function setArenaSyncAccessToken(token: string | null): void {
  override = { ...(override ?? {}), accessToken: token };
}

// ---------------------------------------------------------------------
// 通信。**ここから外へ例外を出さない**
// ---------------------------------------------------------------------

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  /** PostgREST に1行だけ返させたい時 */
  single?: boolean;
}

async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const config = arenaSyncConfig();
  if (!config) return null;

  const fetchImpl = config.fetchImpl
    ?? (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof fetchImpl !== "function") return null;

  const headers: Record<string, string> = {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.accessToken || config.anonKey}`,
    Accept: options.single ? "application/vnd.pgrst.object+json" : "application/json",
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  // 時間切れ。AbortController が無い環境でも動くようにする
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    if (typeof AbortController === "function") {
      controller = new AbortController();
      timer = setTimeout(() => controller?.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    }
  } catch {
    controller = null;
  }

  try {
    const response = await fetchImpl(`${config.url}/rest/v1/${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller?.signal,
    });
    if (!response || typeof response !== "object") return null;
    if (typeof (response as Response).ok === "boolean" && !(response as Response).ok) return null;
    // 本文が無い/JSONでない時も落とさない
    try {
      return await (response as Response).json();
    } catch {
      return null;
    }
  } catch {
    // 通信断・時間切れ・CORS。**呼ぶ側には何も伝えない(既定値で進む)**
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  return request(`rpc/${name}`, { method: "POST", body: args });
}

// ---------------------------------------------------------------------
// 受け取った値の検分。**信じるのは形が合っている行だけ**
// ---------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asTierId(value: unknown): ArenaTierId {
  return typeof value === "string" && TIER_IDS.has(value) ? (value as ArenaTierId) : "BRONZE_3";
}

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/**
 * 防衛スナップショットを名乗るJSONを検分する。
 *
 * **中身の深いところまでは見ない。** `MonsterInstance` の全項目を
 * ここで検査すると、育成要素が増えるたびに写し忘れと同じ事故が起きる
 * (`src/game/arena/types.ts` の注意書きと同じ理由)。
 * ここで見るのは「戦闘に渡せる形をしているか」まで。
 */
function toDefenseSnapshot(value: unknown): ArenaDefenseSnapshot | null {
  if (!isRecord(value)) return null;
  const units = value.units;
  if (!Array.isArray(units) || units.length < 1 || units.length > 4) return null;
  const usable = units.filter((unit) =>
    isRecord(unit) && isRecord(unit.instance) && Array.isArray(unit.equipment));
  if (usable.length !== units.length) return null;
  return {
    version: asFiniteNumber(value.version, 1),
    capturedAt: asFiniteNumber(value.capturedAt, 0),
    units: usable as ArenaDefenseSnapshot["units"],
  };
}

function toOpponentEntry(row: unknown, index: number): ArenaOpponentEntry | null {
  if (!isRecord(row)) return null;
  const id = row.user_id;
  if (typeof id !== "string" || !id) return null;
  const defense = toDefenseSnapshot(row.snapshot);
  if (!defense) return null;
  return {
    index,
    kind: "PLAYER",
    id,
    name: asText(row.display_name, "名もなき挑戦者"),
    rating: Math.max(0, Math.round(asFiniteNumber(row.rating, 1000))),
    tierId: asTierId(row.tier_id),
    defense,
  };
}

function toRankingEntry(row: unknown): ArenaRankingEntry | null {
  if (!isRecord(row)) return null;
  const userId = row.user_id;
  if (typeof userId !== "string" || !userId) return null;
  return {
    rank: Math.max(1, Math.round(asFiniteNumber(row.rank, 1))),
    userId,
    name: asText(row.display_name, "名もなき挑戦者"),
    iconKey: asText(row.icon_key, "default"),
    rating: Math.max(0, Math.round(asFiniteNumber(row.rating, 0))),
    tierId: asTierId(row.tier_id),
    wins: Math.max(0, Math.round(asFiniteNumber(row.wins, 0))),
    losses: Math.max(0, Math.round(asFiniteNumber(row.losses, 0))),
    leadDexId: typeof row.lead_dex_id === "string" ? row.lead_dex_id : null,
    leadStar: typeof row.lead_star === "number" ? row.lead_star : null,
  };
}

function toMatchRecord(row: unknown, myId: string): ArenaMatchRecord | null {
  if (!isRecord(row)) return null;
  const id = row.id;
  if (typeof id !== "string" || !id) return null;
  const attacker = typeof row.attacker_id === "string" ? row.attacker_id : "";
  const side: ArenaMatchRecord["side"] = attacker === myId ? "OFFENSE" : "DEFENSE";
  const attackerWon = row.attacker_won === true;
  const won = side === "OFFENSE" ? attackerWon : !attackerWon;
  const delta = side === "OFFENSE"
    ? asFiniteNumber(row.attacker_rating_delta, 0)
    : asFiniteNumber(row.defender_rating_delta, 0);
  const after = side === "OFFENSE"
    ? asFiniteNumber(row.attacker_rating_after, 0)
    : asFiniteNumber(row.defender_rating_after, 0);
  const at = typeof row.created_at === "string" ? Date.parse(row.created_at) : NaN;
  return {
    id,
    at: Number.isFinite(at) ? at : 0,
    side,
    opponentKind: row.opponent_kind === "NPC" ? "NPC" : "PLAYER",
    // NPCの名前だけが行に入っている。実プレイヤーの表示名は
    // arena_matches に持たせていない(改名で履歴が食い違うのを避ける)。
    // 名前が要る画面はランキング側から引くこと
    opponentName: asText(row.npc_name, "名もなき挑戦者"),
    opponentRating: Math.max(0, Math.round(side === "OFFENSE"
      ? asFiniteNumber(row.defender_rating_before, 0)
      : asFiniteNumber(row.attacker_rating_before, 0))),
    won,
    ratingDelta: Math.round(delta),
    ratingAfter: Math.max(0, Math.round(after)),
    // 防衛はコインが入らない(攻めた側の取り分)
    coins: side === "OFFENSE" ? Math.max(0, Math.round(asFiniteNumber(row.coins_awarded, 0))) : 0,
  };
}

// ---------------------------------------------------------------------
// 公開する関数。**どれも例外を投げない**
// ---------------------------------------------------------------------

/**
 * 対戦候補を引く。**失敗したら空配列。**
 *
 * 空が返ったら呼ぶ側はNPCで埋める。「サーバが落ちている」と
 * 「候補が1人もいない」を区別しないのは、画面のふるまいが同じだから。
 */
export async function fetchArenaOpponents(
  myId: string,
  rating: number,
  limit = 10,
  band = 300,
): Promise<ArenaOpponentEntry[]> {
  try {
    if (!arenaSyncAvailable()) return [];
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const low = Math.max(0, Math.round(rating - band));
    const high = Math.round(rating + band);
    const params = new URLSearchParams();
    params.set("select", "user_id,display_name,rating,tier_id,snapshot,unit_count,captured_at");
    params.append("rating", `gte.${low}`);
    params.append("rating", `lte.${high}`);
    if (myId) params.set("user_id", `neq.${myId}`);
    params.set("limit", String(safeLimit));
    const rows = await request(`arena_opponent_pool?${params.toString()}`);
    if (!Array.isArray(rows)) return [];
    const entries: ArenaOpponentEntry[] = [];
    for (const row of rows) {
      const entry = toOpponentEntry(row, entries.length);
      if (entry) entries.push(entry);
    }
    return entries;
  } catch {
    return [];
  }
}

/** 防衛編成を登録する。**成否だけ返す** */
export async function pushArenaDefense(snapshot: ArenaDefenseSnapshot): Promise<boolean> {
  try {
    if (!arenaSyncAvailable()) return false;
    if (!snapshot || !Array.isArray(snapshot.units) || snapshot.units.length < 1) return false;
    const result = await callRpc("arena_set_defense", { p_snapshot: snapshot });
    return isRecord(result) && result.ok === true;
  } catch {
    return false;
  }
}

/**
 * 挑む許可をもらう。**ここで挑戦券が引かれる。**
 *
 * 返ってくるのは対戦ID・nonce・**サーバが決めた乱数の種**、そして
 * 相手が実プレイヤーならサーバが持っている防衛編成。
 * クライアントはこの種とこの編成で戦闘を再生する——
 * つまり**画面に出るのは、あとでサーバが回し直すのと同じ戦い**になる。
 *
 * 失敗したら null。呼ぶ側はローカルだけで進める。
 */
export async function beginArenaMatch(input: ArenaBeginMatchInput): Promise<ArenaMatchTicket | null> {
  try {
    if (!arenaSyncAvailable()) return null;
    const result = await callRpc("arena_begin_match", {
      p_opponent_kind: input.kind,
      p_attacker_snapshot: input.attackerSnapshot,
      p_opponent_id: input.kind === "PLAYER" ? (input.opponentId ?? null) : null,
      p_opponent_seed: input.kind === "NPC" ? (input.opponentSeed ?? null) : null,
      p_opponent_name: input.opponentName ?? null,
      p_opponent_index: input.kind === "NPC" ? (input.opponentIndex ?? null) : null,
      p_opponent_count: input.kind === "NPC" ? (input.opponentCount ?? null) : null,
    });
    if (!isRecord(result) || result.ok !== true) return null;
    const matchId = asText(result.matchId, "");
    const nonce = asText(result.nonce, "");
    if (!matchId || !nonce) return null;
    return {
      matchId,
      nonce,
      battleSeed: Math.round(asFiniteNumber(result.battleSeed, 0)),
      defenderSnapshot: toDefenseSnapshot(result.defenderSnapshot),
      defenderRating: Math.max(0, Math.round(asFiniteNumber(result.defenderRating, 0))),
      attackerRating: Math.max(0, Math.round(asFiniteNumber(result.attackerRating, 0))),
      tickets: Math.max(0, Math.round(asFiniteNumber(result.tickets, 0))),
    };
  } catch {
    return null;
  }
}

/**
 * 精算する。**勝敗を送る欄が無いことに意味がある。**
 *
 * 送るのは「この対戦を精算してくれ」だけ。Edge Function が
 * 同じ種・同じ編成で戦闘を回し直し、そこで出た勝敗で確定する。
 *
 * `rest/v1` ではなく `functions/v1` を叩くので、`request` は通さない。
 */
export async function settleArenaMatch(matchId: string, nonce: string): Promise<ArenaMatchReport | null> {
  const config = arenaSyncConfig();
  if (!config || !matchId || !nonce) return null;
  const fetchImpl = config.fetchImpl ?? (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof fetchImpl !== "function") return null;

  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    if (typeof AbortController === "function") {
      controller = new AbortController();
      // 戦闘を回し直すぶん、読み取りより長めに待つ
      timer = setTimeout(() => controller?.abort(), (config.timeoutMs ?? DEFAULT_TIMEOUT_MS) * 2);
    }
  } catch {
    controller = null;
  }

  try {
    const response = await fetchImpl(`${config.url}/functions/v1/arena-settle`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.accessToken || config.anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ matchId, nonce }),
      signal: controller?.signal,
    });
    if (!response || typeof response !== "object") return null;
    const result = await (response as Response).json().catch(() => null);
    if (!isRecord(result) || result.ok !== true) return null;
    return {
      matchId: asText(result.matchId, matchId),
      won: result.won === true,
      ratingBefore: Math.round(asFiniteNumber(result.ratingBefore, 0)),
      ratingDelta: Math.round(asFiniteNumber(result.ratingDelta, 0)),
      rating: Math.max(0, Math.round(asFiniteNumber(result.rating, 0))),
      tierId: asTierId(result.tierId),
      coins: Math.max(0, Math.round(asFiniteNumber(result.coins, 0))),
      coinBalance: Math.max(0, Math.round(asFiniteNumber(result.coinBalance, 0))),
      tickets: Math.max(0, Math.round(asFiniteNumber(result.tickets, 0))),
      opponentRating: Math.max(0, Math.round(asFiniteNumber(result.opponentRating, 0))),
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 上位ランキング。**失敗したら空配列** */
export async function fetchArenaRanking(limit = 20): Promise<ArenaRankingEntry[]> {
  try {
    if (!arenaSyncAvailable()) return [];
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const params = new URLSearchParams();
    params.set("select", "rank,user_id,display_name,icon_key,rating,tier_id,wins,losses,lead_dex_id,lead_star");
    params.set("order", "rating.desc");
    params.set("limit", String(safeLimit));
    const rows = await request(`arena_public_ranking?${params.toString()}`);
    if (!Array.isArray(rows)) return [];
    return rows.map(toRankingEntry).filter((entry): entry is ArenaRankingEntry => entry !== null);
  } catch {
    return [];
  }
}

/** 自分の周りのランキング。**失敗したら空配列** */
export async function fetchArenaRankingAround(
  userId?: string | null,
  span = 5,
): Promise<ArenaRankingEntry[]> {
  try {
    if (!arenaSyncAvailable()) return [];
    const rows = await callRpc("arena_ranking_around", {
      p_user: userId ?? null,
      p_span: Math.max(0, Math.min(50, Math.floor(span))),
    });
    if (!Array.isArray(rows)) return [];
    return rows.map(toRankingEntry).filter((entry): entry is ArenaRankingEntry => entry !== null);
  } catch {
    return [];
  }
}

/** 自分の戦績。攻撃も防衛も同じ形で返る。**失敗したら空配列** */
export async function fetchArenaMatchHistory(myId: string, limit = 20): Promise<ArenaMatchRecord[]> {
  try {
    if (!arenaSyncAvailable() || !myId) return [];
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const params = new URLSearchParams();
    params.set("select", "*");
    params.set("order", "created_at.desc");
    params.set("limit", String(safeLimit));
    const rows = await request(`arena_matches?${params.toString()}`);
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => toMatchRecord(row, myId))
      .filter((record): record is ArenaMatchRecord => record !== null);
  } catch {
    return [];
  }
}

/** プロフィールを作る/更新する。**失敗したら null** */
export async function ensureArenaProfile(
  displayName: string,
  iconKey = "default",
): Promise<Record<string, unknown> | null> {
  try {
    if (!arenaSyncAvailable()) return null;
    const name = displayName.trim();
    if (!name) return null;
    const result = await callRpc("arena_ensure_profile", {
      p_display_name: name.slice(0, 24),
      p_icon_key: iconKey,
    });
    return isRecord(result) ? result : null;
  } catch {
    return null;
  }
}

/** レート・コイン・挑戦権をまとめて引く。**失敗したら null** */
export async function fetchArenaState(): Promise<Record<string, unknown> | null> {
  try {
    if (!arenaSyncAvailable()) return null;
    const result = await callRpc("arena_state", {});
    return isRecord(result) ? result : null;
  } catch {
    return null;
  }
}

/** 報酬の受取結果。二重受取は `ok:false, code:"ALREADY_CLAIMED"` で返る */
export interface ArenaClaimResult {
  ok: boolean;
  code: string | null;
  periodKey: string | null;
  tierId: ArenaTierId | null;
  coins: number;
  coinBalance: number;
}

function toClaimResult(value: unknown): ArenaClaimResult | null {
  if (!isRecord(value)) return null;
  return {
    ok: value.ok === true,
    code: typeof value.code === "string" ? value.code : null,
    periodKey: typeof value.periodKey === "string" ? value.periodKey : null,
    tierId: typeof value.tierId === "string" && TIER_IDS.has(value.tierId) ? value.tierId as ArenaTierId : null,
    coins: Math.max(0, Math.round(asFiniteNumber(value.coins, 0))),
    coinBalance: Math.max(0, Math.round(asFiniteNumber(value.coinBalance, 0))),
  };
}

/** 週間報酬を受け取る。**二重受取はサーバの一意制約が止める** */
export async function claimArenaWeeklyReward(): Promise<ArenaClaimResult | null> {
  try {
    if (!arenaSyncAvailable()) return null;
    return toClaimResult(await callRpc("arena_claim_weekly_reward", {}));
  } catch {
    return null;
  }
}

/** 最新の未受取・終了済みシーズン報酬を受け取る。対象シーズンはサーバが決める。 */
export async function claimArenaSeasonReward(): Promise<ArenaClaimResult | null> {
  try {
    if (!arenaSyncAvailable()) return null;
    return toClaimResult(await callRpc("arena_claim_latest_season_reward", {}));
  } catch {
    return null;
  }
}

export interface ArenaShopPurchaseReceipt {
  purchaseId: string;
  itemId: string;
  quantity: number;
  coinBalance: number;
  purchasedAt: number;
  payload: Record<string, unknown>;
}

function toPurchaseReceipt(value: unknown): ArenaShopPurchaseReceipt | null {
  if (!isRecord(value)) return null;
  const purchaseId = asText(value.purchaseId, "");
  const itemId = asText(value.itemId, "");
  const quantity = Math.round(asFiniteNumber(value.quantity, 0));
  const purchasedAtText = asText(value.createdAt, "");
  const purchasedAt = Date.parse(purchasedAtText);
  if (!purchaseId || !itemId || quantity < 1 || quantity > 99 || !Number.isFinite(purchasedAt)) return null;
  return {
    purchaseId,
    itemId,
    quantity,
    coinBalance: Math.max(0, Math.round(asFiniteNumber(value.coinBalance, 0))),
    purchasedAt,
    payload: isRecord(value.payload) ? value.payload : {},
  };
}

/**
 * ショップの購入。**価格も上限も残高もサーバが見る。**
 * 失敗(残高不足・上限超過・売り切れ)も null で返る。
 */
export async function purchaseArenaShopItem(
  itemId: string,
  quantity = 1,
): Promise<ArenaShopPurchaseReceipt | null> {
  try {
    if (!arenaSyncAvailable() || !itemId) return null;
    const result = await callRpc("arena_purchase_shop_item", {
      p_item_id: itemId,
      p_quantity: Math.max(1, Math.min(99, Math.floor(quantity))),
    });
    return isRecord(result) && result.ok === true ? toPurchaseReceipt(result) : null;
  } catch {
    return null;
  }
}

/** 保存前に通信が切れた購入を再受信する。古い順に返す。 */
export async function fetchPendingArenaShopPurchases(): Promise<ArenaShopPurchaseReceipt[]> {
  try {
    if (!arenaSyncAvailable()) return [];
    const result = await callRpc("arena_pending_shop_purchases", {});
    if (!Array.isArray(result)) return [];
    return result.map(toPurchaseReceipt).filter((row): row is ArenaShopPurchaseReceipt => row !== null);
  } catch {
    return [];
  }
}

/** 手元へ保存できた購入だけを受取済みにする。 */
export async function acknowledgeArenaShopPurchase(purchaseId: string): Promise<boolean> {
  try {
    if (!arenaSyncAvailable() || !purchaseId) return false;
    const result = await callRpc("arena_ack_shop_purchase", { p_purchase_id: purchaseId });
    return isRecord(result) && result.ok === true;
  } catch {
    return false;
  }
}
