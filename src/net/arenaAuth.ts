/**
 * アリーナの匿名ログイン。
 *
 * ## なぜ要るのか
 *
 * ここまで「自分が誰か」は端末が勝手に作ったUUID(`arenaLocalId`)だった。
 * それだと**名乗った者勝ち**になる:
 *
 *   ・他人のIDを名乗れば、その人の防衛を書き換えられる
 *   ・自分除外は「自分だと申告したID」を外すだけなので、
 *     申告を変えれば自分に挑めてしまう
 *   ・順位表の「自分の周辺」も、申告したIDの周辺でしかない
 *
 * 誰であるかを**サーバが決める**必要がある。Supabase の匿名ログインなら
 * メールもパスワードも要らずに `auth.uid()` が生える。
 * 以後、アリーナのIDはこれ**だけ**にする(端末のUUIDは未接続時の器)。
 *
 * ## SDKを入れない
 *
 * `@supabase/supabase-js` は入れない(`arenaSync.ts` と同じ理由)。
 * GoTrue は素のHTTPで叩ける。使うのは2本だけ:
 *
 *   POST /auth/v1/signup                       匿名ユーザを作る
 *   POST /auth/v1/token?grant_type=refresh_token   期限を延ばす
 *
 * ## ここも例外を投げない
 *
 * ログインできなくても、ゲームはオフラインのアリーナとして完全に動く。
 * 失敗は `null` で返し、呼ぶ側は今までどおりNPCだけで組み立てる。
 * **「繋がらないと遊べない」を作らない**のがこの層の最優先事項。
 *
 * ## 保存するもの
 *
 * 更新用トークンを保存しないと、起動のたびに**別人になる**
 * (匿名ユーザが増え続け、レートも防衛も毎回リセットされる)。
 * だから保存する。保存先は localStorage で、鍵はこの1つだけ。
 */
import { setArenaSyncAccessToken } from "./arenaSync.js";

/** 保存の鍵。**ここ以外に書かない** */
export const ARENA_AUTH_STORAGE_KEY = "crimon.arena.auth.v1";

/** 期限切れの何秒前から更新しにいくか。ぎりぎりで投げると往復の間に切れる */
const REFRESH_MARGIN_SEC = 120;

/** 1回の通信を諦めるまで */
const AUTH_TIMEOUT_MS = 8000;

export interface ArenaSession {
  /** `auth.uid()`。**アリーナのプレイヤーIDはこれ** */
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** 期限(UNIX秒) */
  expiresAt: number;
}

/** テストと道具類から差し込むための入れ物 */
export interface ArenaAuthDeps {
  url: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

let deps: Partial<ArenaAuthDeps> | null = null;
/** いま持っている札。**同じ起動の中では1つだけ** */
let session: ArenaSession | null = null;
/** ログイン中の約束。**同時に何本も走らせない**(匿名ユーザが増える) */
let inFlight: Promise<ArenaSession | null> | null = null;

/** テストからの差し込み。`null` で元に戻す */
export function configureArenaAuth(next: Partial<ArenaAuthDeps> | null): void {
  deps = next;
  session = null;
  inFlight = null;
}

function nowSec(): number {
  return Math.floor((deps?.now?.() ?? Date.now()) / 1000);
}

function storage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  if (deps?.storage) return deps.storage;
  try {
    const store = (globalThis as { localStorage?: Storage }).localStorage;
    return store ?? null;
  } catch {
    // Safari のプライベート閲覧などで触るだけで例外が出る
    return null;
  }
}

function readEnv(name: string): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    const value = env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    /* import.meta が無い実行環境 */
  }
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    const value = proc?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    /* process が無い実行環境 */
  }
  return "";
}

function endpoint(): { url: string; anonKey: string } | null {
  const url = (deps?.url ?? readEnv("VITE_SUPABASE_URL")).replace(/\/+$/, "");
  const anonKey = deps?.anonKey ?? readEnv("VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey || !/^https?:\/\//i.test(url)) return null;
  return { url, anonKey };
}

/** 匿名ログインが使える設定になっているか */
export function arenaAuthAvailable(): boolean {
  return endpoint() !== null;
}

/* ==========================================================================
 * 保存と復元
 * ========================================================================== */

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toSession(value: unknown): ArenaSession | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (!isUuid(row.userId)) return null;
  if (typeof row.accessToken !== "string" || !row.accessToken) return null;
  if (typeof row.refreshToken !== "string" || !row.refreshToken) return null;
  const expiresAt = typeof row.expiresAt === "number" && Number.isFinite(row.expiresAt) ? row.expiresAt : 0;
  return { userId: row.userId, accessToken: row.accessToken, refreshToken: row.refreshToken, expiresAt };
}

function loadStored(): ArenaSession | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(ARENA_AUTH_STORAGE_KEY);
    if (!raw) return null;
    return toSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

function save(next: ArenaSession | null): void {
  session = next;
  // **トークンは `arenaSync` にも渡す。** ここだけ持っていても意味がない
  setArenaSyncAccessToken(next?.accessToken ?? null);
  const store = storage();
  if (!store) return;
  try {
    if (next) store.setItem(ARENA_AUTH_STORAGE_KEY, JSON.stringify(next));
    else store.removeItem(ARENA_AUTH_STORAGE_KEY);
  } catch {
    /* 保存できなくても、この起動の間は使える */
  }
}

/* ==========================================================================
 * 通信
 * ========================================================================== */

async function post(path: string, body: unknown, bearer: string): Promise<Record<string, unknown> | null> {
  const target = endpoint();
  if (!target) return null;
  const fetchImpl = deps?.fetchImpl ?? (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof fetchImpl !== "function") return null;

  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    if (typeof AbortController === "function") {
      controller = new AbortController();
      timer = setTimeout(() => controller?.abort(), AUTH_TIMEOUT_MS);
    }
  } catch {
    controller = null;
  }

  try {
    const response = await fetchImpl(`${target.url}/auth/v1/${path}`, {
      method: "POST",
      headers: {
        apikey: target.anonKey,
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body ?? {}),
      signal: controller?.signal,
    });
    if (!response || typeof response !== "object") return null;
    if (typeof (response as Response).ok === "boolean" && !(response as Response).ok) return null;
    const json = await (response as Response).json();
    return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** GoTrue の応答を札に変える。**形が違えば null** */
function fromTokenResponse(json: Record<string, unknown> | null): ArenaSession | null {
  if (!json) return null;
  const accessToken = json.access_token;
  const refreshToken = json.refresh_token;
  const user = json.user;
  if (typeof accessToken !== "string" || !accessToken) return null;
  if (typeof refreshToken !== "string" || !refreshToken) return null;
  const userId = typeof user === "object" && user !== null ? (user as Record<string, unknown>).id : null;
  if (!isUuid(userId)) return null;
  const expiresIn = typeof json.expires_in === "number" && Number.isFinite(json.expires_in) ? json.expires_in : 3600;
  const expiresAt = typeof json.expires_at === "number" && Number.isFinite(json.expires_at)
    ? json.expires_at
    : nowSec() + expiresIn;
  return { userId, accessToken, refreshToken, expiresAt };
}

/* ==========================================================================
 * 入口
 * ========================================================================== */

/*
 * **型の絞り込み(`candidate is ArenaSession`)にしない。**
 * それをすると「偽の側は必ず null」と型が言い切ってしまい、
 * 期限切れの札から更新用トークンを取り出す道が `never` になって消える。
 * ここで欲しいのは「まだ使えるか」の真偽だけ。
 */
function stillFresh(candidate: ArenaSession | null): boolean {
  return candidate !== null && candidate.expiresAt - REFRESH_MARGIN_SEC > nowSec();
}

async function login(): Promise<ArenaSession | null> {
  const target = endpoint();
  if (!target) return null;

  // 1. この起動で既に持っていて、まだ切れていない
  if (stillFresh(session)) return session;

  // 2. 保存してあるものを見る
  const stored = session ?? loadStored();
  if (stillFresh(stored)) {
    save(stored);
    return stored;
  }

  // 3. 更新用トークンがあるなら延ばす。**ここで別人にならないことが要**
  if (stored?.refreshToken) {
    const refreshed = fromTokenResponse(
      await post("token?grant_type=refresh_token", { refresh_token: stored.refreshToken }, target.anonKey),
    );
    if (refreshed) {
      save(refreshed);
      return refreshed;
    }
    /*
     * 延ばせなかった。**ここで匿名ユーザを作り直すと、それまでのレートも
     * 防衛も置き去りになる。** ただし作らない選択もできない(繋げなくなる)。
     * 保存を捨ててから作り直す——同じ壊れた札で毎回失敗し続けるよりはよい。
     */
    save(null);
  }

  // 4. 新しい匿名ユーザを作る
  const created = fromTokenResponse(await post("signup", {}, target.anonKey));
  if (!created) return null;
  save(created);
  return created;
}

/**
 * ログインしていることを確かめる。**何度呼んでもよい。**
 *
 * 同時に呼ばれても通信は1本にまとめる。まとめないと、起動直後に
 * 画面が2か所から呼んだだけで**匿名ユーザが2つ生える**。
 */
export function ensureArenaAuth(): Promise<ArenaSession | null> {
  if (!arenaAuthAvailable()) return Promise.resolve(null);
  if (stillFresh(session)) return Promise.resolve(session);
  if (inFlight) return inFlight;
  inFlight = login().finally(() => { inFlight = null; });
  return inFlight;
}

/** いま分かっている `auth.uid()`。まだログインしていなければ null */
export function arenaAuthUserId(): string | null {
  if (session) return session.userId;
  const stored = loadStored();
  if (stored) {
    // 期限が切れていてもIDは変わらない。**自分判定にはそのまま使える**
    session = stored;
    setArenaSyncAccessToken(stored.accessToken);
    return stored.userId;
  }
  return null;
}

/** 保存ごと捨てる。**次の起動で別人になる**ので、普段は呼ばない */
export function clearArenaAuth(): void {
  save(null);
}
