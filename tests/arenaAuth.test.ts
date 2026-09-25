import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ARENA_AUTH_STORAGE_KEY,
  arenaAuthAvailable,
  arenaAuthAccessToken,
  arenaAuthUserId,
  clearArenaAuth,
  configureArenaAuth,
  ensureArenaAuth,
} from "../src/net/arenaAuth.js";
import { arenaSyncConfig, configureArenaSync } from "../src/net/arenaSync.js";

/*
 * 匿名ログイン。
 *
 * ここで守りたいのは3つ。
 *
 *   1. **起動のたびに別人にならない。** 更新用トークンを保存し、
 *      次の起動ではそれを使って延ばす。作り直すと、レートも防衛も置き去りになる
 *   2. **同時に呼んでも匿名ユーザが増えない。** 画面が2か所から呼ぶのは普通に起きる
 *   3. **繋がらなくてもゲームが動く。** 例外を投げず null を返す
 */

const URL_BASE = "https://example.supabase.co";
const ANON = "anon-key";
const UID = "11111111-2222-4333-8444-555555555555";

/** localStorage の代わり。中身を覗けるようにしておく */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
}

interface Call { path: string; body: unknown; bearer: string }

/** GoTrue の代わり。何を返すかを差し替えられる */
function fakeGoTrue(reply: (path: string, body: unknown) => unknown | null) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const path = url.slice(url.indexOf("/auth/v1/") + "/auth/v1/".length);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body, bearer: headers.Authorization ?? "" });
    const value = reply(path, body);
    if (value === null) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => value };
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "access-1",
    refresh_token: "refresh-1",
    expires_in: 3600,
    user: { id: UID, is_anonymous: true },
    ...overrides,
  };
}

let store: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  store = memoryStorage();
});

afterEach(() => {
  configureArenaAuth(null);
  configureArenaSync(null);
});

describe("設定が無ければ何もしない", () => {
  it("URLも鍵も無ければ使えないと答える", () => {
    configureArenaAuth({ url: "", anonKey: "", storage: store });
    expect(arenaAuthAvailable()).toBe(false);
  });

  it("使えない時は通信せず null を返す(例外を投げない)", async () => {
    const gotrue = fakeGoTrue(() => tokenResponse());
    configureArenaAuth({ url: "", anonKey: "", storage: store, fetchImpl: gotrue.fetchImpl });
    await expect(ensureArenaAuth()).resolves.toBeNull();
    expect(gotrue.calls).toHaveLength(0);
  });
});

describe("匿名ユーザを作る", () => {
  it("signup を叩いて uid とトークンを得る", async () => {
    const gotrue = fakeGoTrue(() => tokenResponse());
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: gotrue.fetchImpl });

    const session = await ensureArenaAuth();
    expect(session?.userId).toBe(UID);
    expect(session?.accessToken).toBe("access-1");
    expect(gotrue.calls.map((c) => c.path)).toEqual(["signup"]);
    // 匿名作成は anon key で投げる(まだ自分のトークンが無い)
    expect(gotrue.calls[0].bearer).toBe(`Bearer ${ANON}`);
  });

  it("得たトークンを arenaSync へ渡す", async () => {
    // 渡さないと、RPCが anon key のまま飛んで auth.uid() が null になる
    configureArenaSync({ url: URL_BASE, anonKey: ANON });
    const gotrue = fakeGoTrue(() => tokenResponse());
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: gotrue.fetchImpl });

    await ensureArenaAuth();
    expect(arenaSyncConfig()?.accessToken).toBe("access-1");
  });

  it("保存する。**次の起動で別人にならないため**", async () => {
    const gotrue = fakeGoTrue(() => tokenResponse());
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: gotrue.fetchImpl });

    await ensureArenaAuth();
    const saved = JSON.parse(store.map.get(ARENA_AUTH_STORAGE_KEY) ?? "{}");
    expect(saved.userId).toBe(UID);
    expect(saved.refreshToken).toBe("refresh-1");
  });

  it("uid の形が違う応答は受け取らない", async () => {
    // 形の検査を抜くと、壊れた応答をそのまま自分のIDとして使ってしまう
    const gotrue = fakeGoTrue(() => tokenResponse({ user: { id: "not-a-uuid" } }));
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: gotrue.fetchImpl });
    await expect(ensureArenaAuth()).resolves.toBeNull();
  });
});

describe("起動のたびに別人にならない", () => {
  it("保存された札がまだ生きていれば、通信しない", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    store.map.set(ARENA_AUTH_STORAGE_KEY, JSON.stringify({
      userId: UID, accessToken: "access-old", refreshToken: "refresh-old", expiresAt: future,
    }));
    const gotrue = fakeGoTrue(() => tokenResponse());
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: gotrue.fetchImpl });

    const session = await ensureArenaAuth();
    expect(session?.userId).toBe(UID);
    expect(gotrue.calls).toHaveLength(0);
  });

  it("期限が切れていたら、作り直さずに更新する", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    store.map.set(ARENA_AUTH_STORAGE_KEY, JSON.stringify({
      userId: UID, accessToken: "access-old", refreshToken: "refresh-old", expiresAt: past,
    }));
    const gotrue = fakeGoTrue((path) =>
      path.startsWith("token") ? tokenResponse({ access_token: "access-2" }) : null);
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: gotrue.fetchImpl });

    const session = await ensureArenaAuth();
    // **同じ uid のまま**。ここで作り直すと、それまでのレートと防衛が置き去りになる
    expect(session?.userId).toBe(UID);
    expect(session?.accessToken).toBe("access-2");
    expect(gotrue.calls.map((c) => c.path)).toEqual(["token?grant_type=refresh_token"]);
    expect(gotrue.calls[0].body).toEqual({ refresh_token: "refresh-old" });
  });

  it("期限が近いだけでも先に更新する(往復の間に切れないように)", async () => {
    const soon = Math.floor(Date.now() / 1000) + 30;
    store.map.set(ARENA_AUTH_STORAGE_KEY, JSON.stringify({
      userId: UID, accessToken: "access-old", refreshToken: "refresh-old", expiresAt: soon,
    }));
    const gotrue = fakeGoTrue(() => tokenResponse({ access_token: "access-3" }));
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: gotrue.fetchImpl });

    await ensureArenaAuth();
    expect(gotrue.calls[0].path).toBe("token?grant_type=refresh_token");
  });

  it("更新に失敗しても、保存済みの本人を捨てず別人を作らない", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    store.map.set(ARENA_AUTH_STORAGE_KEY, JSON.stringify({
      userId: UID, accessToken: "old", refreshToken: "revoked", expiresAt: past,
    }));
    const gotrue = fakeGoTrue((path) =>
      path.startsWith("token") ? null : tokenResponse({ user: { id: "99999999-2222-4333-8444-555555555555" } }));
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: gotrue.fetchImpl });

    const session = await ensureArenaAuth();
    expect(gotrue.calls.map((c) => c.path))
      .toEqual(["token?grant_type=refresh_token"]);
    expect(session).toBeNull();
    // uid と refresh token は残す。通信復旧後に同じ本人として再試行できる。
    const saved = JSON.parse(store.map.get(ARENA_AUTH_STORAGE_KEY) ?? "{}");
    expect(saved.userId).toBe(UID);
    expect(saved.refreshToken).toBe("revoked");
    expect(arenaAuthUserId()).toBe(UID);
  });

  it("更新失敗を繰り返しても signup は絶対に呼ばない", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    store.map.set(ARENA_AUTH_STORAGE_KEY, JSON.stringify({
      userId: UID, accessToken: "old", refreshToken: "temporarily-failing", expiresAt: past,
    }));
    const gotrue = fakeGoTrue((path) =>
      path.startsWith("token") ? null : tokenResponse({ user: { id: "99999999-2222-4333-8444-555555555555" } }));
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: gotrue.fetchImpl });

    await ensureArenaAuth();
    await ensureArenaAuth();
    expect(gotrue.calls.every((call) => call.path.startsWith("token"))).toBe(true);
    expect(gotrue.calls.filter((call) => call.path === "signup")).toHaveLength(0);
    expect(arenaAuthUserId()).toBe(UID);
  });
});

describe("同時に呼んでも匿名ユーザが増えない", () => {
  it("2か所から同時に呼んでも signup は1回", async () => {
    /*
     * 起動直後に、対戦候補の読み込みと順位表の読み込みが同時に走る。
     * まとめないと、その1回で**匿名ユーザが2つ生える。**
     */
    const gotrue = fakeGoTrue(() => tokenResponse());
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: gotrue.fetchImpl });

    const [a, b, c] = await Promise.all([ensureArenaAuth(), ensureArenaAuth(), ensureArenaAuth()]);
    expect(gotrue.calls.filter((call) => call.path === "signup")).toHaveLength(1);
    expect(a?.userId).toBe(UID);
    expect(b?.userId).toBe(UID);
    expect(c?.userId).toBe(UID);
  });
});

describe("繋がらなくてもゲームは動く", () => {
  it("通信が例外を投げても、投げ返さず null を返す", async () => {
    const fetchImpl = (async () => { throw new Error("ネットワーク断"); }) as unknown as typeof fetch;
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl });
    await expect(ensureArenaAuth()).resolves.toBeNull();
  });

  it("保存領域が触れなくても落ちない", async () => {
    const hostile = {
      getItem: () => { throw new Error("プライベート閲覧"); },
      setItem: () => { throw new Error("プライベート閲覧"); },
      removeItem: () => { throw new Error("プライベート閲覧"); },
    };
    const gotrue = fakeGoTrue(() => tokenResponse());
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: hostile, fetchImpl: gotrue.fetchImpl });
    const session = await ensureArenaAuth();
    // 保存できなくても、この起動の間は使える
    expect(session?.userId).toBe(UID);
  });
});

describe("自分のIDの取り出し", () => {
  it("期限が切れていても uid は返る(自分判定に使うため)", () => {
    const past = Math.floor(Date.now() / 1000) - 100;
    store.map.set(ARENA_AUTH_STORAGE_KEY, JSON.stringify({
      userId: UID, accessToken: "a", refreshToken: "r", expiresAt: past,
    }));
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store });
    expect(arenaAuthUserId()).toBe(UID);
  });

  it("何も無ければ null(端末のUUIDへ落ちるのは呼ぶ側の仕事)", () => {
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store });
    expect(arenaAuthUserId()).toBeNull();
  });

  it("捨てると保存も消える", async () => {
    const gotrue = fakeGoTrue(() => tokenResponse());
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: gotrue.fetchImpl });
    await ensureArenaAuth();
    clearArenaAuth();
    expect(store.map.get(ARENA_AUTH_STORAGE_KEY)).toBeUndefined();
    expect(arenaAuthUserId()).toBeNull();
  });
});


describe("管理用保存から別人を作らない", () => {
  it("保存済み本人がなければsignupしない", async () => {
    const fake = fakeGoTrue(() => tokenResponse());
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: fake.fetchImpl });
    expect(await arenaAuthAccessToken()).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });
  it("更新に失敗してもIDと保存済み認証を維持する", async () => {
    const original = JSON.stringify({ userId: UID, accessToken: "old", refreshToken: "refresh", expiresAt: 1 });
    store.setItem(ARENA_AUTH_STORAGE_KEY, original);
    const fake = fakeGoTrue(() => null);
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: fake.fetchImpl });
    expect(await arenaAuthAccessToken()).toBeNull();
    expect(fake.calls.map((c) => c.path)).toEqual(["token?grant_type=refresh_token"]);
    expect(store.getItem(ARENA_AUTH_STORAGE_KEY)).toBe(original);
    expect(arenaAuthUserId()).toBe(UID);
  });
  it("refreshが別IDを返しても受け入れない", async () => {
    const original = JSON.stringify({ userId: UID, accessToken: "old", refreshToken: "refresh", expiresAt: 1 });
    store.setItem(ARENA_AUTH_STORAGE_KEY, original);
    const fake = fakeGoTrue(() => tokenResponse({ user: { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" } }));
    configureArenaAuth({ url: URL_BASE, anonKey: ANON, storage: store, fetchImpl: fake.fetchImpl });
    expect(await arenaAuthAccessToken()).toBeNull();
    expect(store.getItem(ARENA_AUTH_STORAGE_KEY)).toBe(original);
  });
});
