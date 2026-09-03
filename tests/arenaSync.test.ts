/**
 * アリーナのサーバ同期。**通信を一切せずに確かめる。**
 *
 * ここで守りたいのは「繋がること」ではなく、
 * **繋がらなくてもゲームが止まらないこと。**
 * いま遊んでいる人は誰も認証を持っていないので、この層が例外を投げた瞬間に
 * アリーナの画面が丸ごと落ちる。だから
 *
 *   ・鍵が無い    → 何も送らずに既定値
 *   ・通信が失敗   → 既定値
 *   ・返事が壊れている → 読める行だけ使う
 *
 * の3つを、fetch を差し替えて機械的に押さえる。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ARENA_TIERS } from "../src/data/arena/ranks.js";
import { ArenaDefenseSnapshot, ArenaOpponentEntry } from "../src/game/arena/types.js";
import {
  ARENA_SYNC_KEY_ENV,
  ARENA_SYNC_URL_ENV,
  arenaSyncAvailable,
  arenaSyncConfig,
  claimArenaSeasonReward,
  claimArenaWeeklyReward,
  configureArenaSync,
  ensureArenaProfile,
  fetchArenaMatchHistory,
  fetchArenaOpponents,
  fetchArenaRanking,
  fetchArenaRankingAround,
  fetchArenaState,
  purchaseArenaShopItem,
  fetchPendingArenaShopPurchases,
  acknowledgeArenaShopPurchase,
  pushArenaDefense,
  beginArenaMatch,
  settleArenaMatch,
  setArenaSyncAccessToken,
} from "../src/net/arenaSync.js";

const TIER_IDS = new Set(ARENA_TIERS.map((tier) => tier.id));

function unit(dexId: string) {
  return { instance: { id: `i_${dexId}`, dexId, star: 5, level: 40 }, equipment: [] };
}

/**
 * `MonsterInstance` を丸ごと作らないのは、**この層が中身を見ないから。**
 * 深く検査する作りにすると、育成要素が増えるたびにこのテストが壊れる。
 */
function snapshot(units = 4): ArenaDefenseSnapshot {
  return {
    version: 1,
    capturedAt: 1_700_000_000_000,
    units: Array.from({ length: units }, (_, index) => unit(`knight_FIRE_${index}`)),
  } as unknown as ArenaDefenseSnapshot;
}

function opponentRow(id: string, rating = 1200) {
  return {
    user_id: id,
    display_name: `挑戦者${id}`,
    rating,
    tier_id: "SILVER_3",
    snapshot: snapshot(),
    unit_count: 4,
    captured_at: "2026-01-01T00:00:00Z",
  };
}

/** 決められた本文を返すだけの fetch */
function stubFetch(payload: unknown, ok = true) {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => payload }));
}

/** 鍵があることにする */
function connect(fetchImpl: unknown): void {
  configureArenaSync({
    url: "https://example.test",
    anonKey: "anon-key",
    fetchImpl: fetchImpl as typeof fetch,
    timeoutMs: 50,
  });
}

afterEach(() => {
  configureArenaSync(null);
});

describe("設定", () => {
  it("環境変数の名前は1か所にしかない", () => {
    expect(ARENA_SYNC_URL_ENV).toBe("VITE_SUPABASE_URL");
    expect(ARENA_SYNC_KEY_ENV).toBe("VITE_SUPABASE_ANON_KEY");
  });

  it("URLか鍵のどちらかが欠けたら未接続", () => {
    configureArenaSync({ url: "", anonKey: "" });
    expect(arenaSyncConfig()).toBeNull();
    expect(arenaSyncAvailable()).toBe(false);

    configureArenaSync({ url: "https://example.test", anonKey: "" });
    expect(arenaSyncAvailable()).toBe(false);

    configureArenaSync({ url: "", anonKey: "anon-key" });
    expect(arenaSyncAvailable()).toBe(false);
  });

  it("http(s) でないURLは受け付けない", () => {
    configureArenaSync({ url: "javascript:alert(1)", anonKey: "anon-key" });
    expect(arenaSyncAvailable()).toBe(false);
  });

  it("繋がる設定なら available が true", () => {
    connect(stubFetch([]));
    expect(arenaSyncAvailable()).toBe(true);
  });

  it("トークンを入れても外しても壊れない", () => {
    connect(stubFetch([]));
    setArenaSyncAccessToken("token-1");
    expect(arenaSyncConfig()?.accessToken).toBe("token-1");
    setArenaSyncAccessToken(null);
    expect(arenaSyncConfig()?.accessToken).toBeNull();
  });
});

describe("鍵が無い時", () => {
  it("すべて既定値を返し、例外を投げず、通信もしない", async () => {
    const fetchImpl = stubFetch([]);
    configureArenaSync({ url: "", anonKey: "", fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(fetchArenaOpponents("me", 1200)).resolves.toEqual([]);
    await expect(fetchArenaRanking()).resolves.toEqual([]);
    await expect(fetchArenaRankingAround("me")).resolves.toEqual([]);
    await expect(fetchArenaMatchHistory("me")).resolves.toEqual([]);
    await expect(pushArenaDefense(snapshot())).resolves.toBe(false);
    await expect(beginArenaMatch({ kind: "NPC", attackerSnapshot: snapshot() })).resolves.toBeNull();
    await expect(settleArenaMatch("m1", "n1")).resolves.toBeNull();
    await expect(ensureArenaProfile("あかり")).resolves.toBeNull();
    await expect(fetchArenaState()).resolves.toBeNull();
    await expect(claimArenaWeeklyReward()).resolves.toBeNull();
    await expect(claimArenaSeasonReward()).resolves.toBeNull();
    await expect(purchaseArenaShopItem("summon_scroll")).resolves.toBeNull();
    await expect(fetchPendingArenaShopPurchases()).resolves.toEqual([]);
    await expect(acknowledgeArenaShopPurchase("p1")).resolves.toBe(false);

    // **1回も外に出ない。** 未接続で叩きに行くと、鍵の無い人の端末で
    // 毎回タイムアウトを待つことになる
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("通信が失敗した時", () => {
  it("fetch が投げても例外にならない", async () => {
    connect(vi.fn(async () => { throw new Error("offline"); }));
    await expect(fetchArenaOpponents("me", 1200)).resolves.toEqual([]);
    await expect(fetchArenaRanking()).resolves.toEqual([]);
    await expect(pushArenaDefense(snapshot())).resolves.toBe(false);
    await expect(beginArenaMatch({ kind: "PLAYER", attackerSnapshot: snapshot(), opponentId: "u2" })).resolves.toBeNull();
    await expect(settleArenaMatch("m1", "n1")).resolves.toBeNull();
    await expect(claimArenaWeeklyReward()).resolves.toBeNull();
    await expect(purchaseArenaShopItem("summon_scroll")).resolves.toBeNull();
  });

  it("HTTPが失敗した時も既定値", async () => {
    connect(stubFetch({ message: "permission denied" }, false));
    await expect(fetchArenaOpponents("me", 1200)).resolves.toEqual([]);
    await expect(pushArenaDefense(snapshot())).resolves.toBe(false);
    await expect(beginArenaMatch({ kind: "NPC", attackerSnapshot: snapshot() })).resolves.toBeNull();
  });

  it("本文がJSONでなくても既定値", async () => {
    connect(vi.fn(async () => ({ ok: true, json: async () => { throw new SyntaxError("not json"); } })));
    await expect(fetchArenaOpponents("me", 1200)).resolves.toEqual([]);
    await expect(fetchArenaRanking()).resolves.toEqual([]);
    await expect(beginArenaMatch({ kind: "NPC", attackerSnapshot: snapshot() })).resolves.toBeNull();
  });

  it("fetch が無い実行環境でも落ちない", async () => {
    configureArenaSync({ url: "https://example.test", anonKey: "anon-key", fetchImpl: undefined });
    const original = (globalThis as { fetch?: typeof fetch }).fetch;
    try {
      (globalThis as { fetch?: typeof fetch }).fetch = undefined;
      await expect(fetchArenaOpponents("me", 1200)).resolves.toEqual([]);
      await expect(pushArenaDefense(snapshot())).resolves.toBe(false);
    } finally {
      (globalThis as { fetch?: typeof fetch }).fetch = original;
    }
  });
});

describe("返ってきた値が壊れている時", () => {
  const broken: [string, unknown][] = [
    ["配列でない", { error: "nope" }],
    ["null", null],
    ["文字列", "boom"],
    ["行が null", [null, undefined]],
    ["user_id が無い", [{ display_name: "名無し", snapshot: snapshot() }]],
    ["snapshot が無い", [{ user_id: "u2", display_name: "名無し" }]],
    ["units が配列でない", [{ user_id: "u2", snapshot: { version: 1, units: "4体" } }]],
    ["units が空", [{ user_id: "u2", snapshot: { version: 1, units: [] } }]],
    ["units が5体", [{ user_id: "u2", snapshot: { version: 1, units: [unit("a"), unit("b"), unit("c"), unit("d"), unit("e")] } }]],
    ["instance が無い", [{ user_id: "u2", snapshot: { version: 1, units: [{ equipment: [] }] } }]],
    ["equipment が配列でない", [{ user_id: "u2", snapshot: { version: 1, units: [{ instance: {}, equipment: null }] } }]],
  ];

  for (const [name, payload] of broken) {
    it(`対戦候補: ${name} でも落ちず空配列`, async () => {
      connect(stubFetch(payload));
      await expect(fetchArenaOpponents("me", 1200)).resolves.toEqual([]);
    });
  }

  it("使える行だけ拾い、index は詰めて振り直す", async () => {
    connect(stubFetch([
      { user_id: "u1", display_name: "壊れ", snapshot: { version: 1, units: [] } },
      opponentRow("u2"),
      null,
      opponentRow("u3"),
    ]));
    const entries = await fetchArenaOpponents("me", 1200);
    expect(entries.map((entry) => entry.id)).toEqual(["u2", "u3"]);
    expect(entries.map((entry) => entry.index)).toEqual([0, 1]);
  });

  it("ランキングも壊れた行を落とす", async () => {
    connect(stubFetch([{ rank: 1, user_id: "u1", rating: 1500 }, null, "x", { rating: 1400 }]));
    const rows = await fetchArenaRanking();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("u1");
  });
});

describe("返す形が ArenaOpponentEntry を満たす", () => {
  it("必要な項目がすべて埋まっている", async () => {
    connect(stubFetch([opponentRow("u2", 1234)]));
    const [entry] = await fetchArenaOpponents("me", 1200);
    const typed: ArenaOpponentEntry = entry;

    expect(typed.index).toBe(0);
    expect(typed.kind).toBe("PLAYER");
    expect(typed.id).toBe("u2");
    expect(typed.name).toBe("挑戦者u2");
    expect(typed.rating).toBe(1234);
    expect(TIER_IDS.has(typed.tierId)).toBe(true);
    expect(typed.defense.version).toBe(1);
    expect(typed.defense.capturedAt).toBe(1_700_000_000_000);
    expect(typed.defense.units).toHaveLength(4);
    expect(typed.defense.units[0].instance).toBeTruthy();
    expect(Array.isArray(typed.defense.units[0].equipment)).toBe(true);
  });

  it("知らないランクIDや欠けた値は安全側へ寄せる", async () => {
    connect(stubFetch([{
      user_id: "u9",
      tier_id: "GRANDMASTER_0",
      rating: "つよい",
      snapshot: { units: [unit("a")] },
    }]));
    const [entry] = await fetchArenaOpponents("me", 1200);
    expect(entry.tierId).toBe("BRONZE_3");
    expect(entry.rating).toBe(1000);
    expect(entry.name).toBe("名もなき挑戦者");
    expect(entry.defense.version).toBe(1);
    expect(entry.defense.capturedAt).toBe(0);
  });
});

describe("送っている中身", () => {
  it("PostgREST の道と apikey を付ける", async () => {
    const fetchImpl = stubFetch([]);
    connect(fetchImpl);
    await fetchArenaOpponents("me", 1200, 5, 100);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith("https://example.test/rest/v1/arena_opponent_pool?")).toBe(true);
    expect(url).toContain("rating=gte.1100");
    expect(url).toContain("rating=lte.1300");
    expect(url).toContain("user_id=neq.me");
    expect(url).toContain("limit=5");
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe("anon-key");
    expect(headers.Authorization).toBe("Bearer anon-key");
  });

  it("**勝敗を送る欄がそもそも無い。** 発行にも精算にも", async () => {
    /*
     * ここがこの層のいちばん大事な性質。
     * 以前は `p_won` を送っていた——「勝った」と言えば勝ちだった。
     * いまは発行(誰に挑むか)と精算(この対戦を締めてくれ)に分かれていて、
     * **どちらにも勝敗・レート・コインを入れる場所がない。**
     */
    const fetchImpl = stubFetch({ ok: true, matchId: "m1", nonce: "n1", battleSeed: 42 });
    connect(fetchImpl);
    await beginArenaMatch({
      kind: "PLAYER", attackerSnapshot: snapshot(), opponentId: "u2", opponentName: "ひかる",
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.test/rest/v1/rpc/arena_begin_match");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "p_attacker_snapshot", "p_opponent_count", "p_opponent_id",
      "p_opponent_index", "p_opponent_kind", "p_opponent_name", "p_opponent_seed",
    ]);
    const sent = JSON.stringify(body);
    expect(sent).not.toContain("won");
    expect(sent).not.toContain("delta");
    expect(sent).not.toContain("coin");
    expect(sent).not.toContain("rating");
  });

  it("精算は対戦IDと nonce だけを送る", async () => {
    const fetchImpl = stubFetch({ ok: true, won: true, rating: 1215 });
    connect(fetchImpl);
    await settleArenaMatch("m1", "n1");

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    // **RPCではなく Edge Function。** 戦闘を回し直せる場所はそこだけ
    expect(url).toBe("https://example.test/functions/v1/arena-settle");
    expect(JSON.parse(String(init.body))).toEqual({ matchId: "m1", nonce: "n1" });
  });

  it("防衛はスナップショットが空なら送りもしない", async () => {
    const fetchImpl = stubFetch({ ok: true });
    connect(fetchImpl);
    await expect(pushArenaDefense({ version: 1, capturedAt: 0, units: [] } as ArenaDefenseSnapshot)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("シーズン報酬は終了済みの対象をサーバに選ばせる", async () => {
    const fetchImpl = stubFetch({ ok: false, code: "NO_CLAIMABLE_SEASON" });
    connect(fetchImpl);
    await claimArenaSeasonReward();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.test/rest/v1/rpc/arena_claim_latest_season_reward");
    expect(JSON.parse(String(init.body))).toEqual({});
  });
});

describe("サーバの答えの読み取り", () => {
  it("1戦の結果を数値に均す。**勝敗もサーバの答えから読む**", async () => {
    connect(stubFetch({
      ok: true, matchId: "m1", won: true, ratingBefore: 1200, ratingDelta: 15, rating: 1215,
      tierId: "SILVER_2", coins: 30, coinBalance: 330, tickets: 9, opponentRating: 1205,
    }));
    const report = await settleArenaMatch("m1", "n1");
    expect(report).toEqual({
      matchId: "m1", won: true, ratingBefore: 1200, ratingDelta: 15, rating: 1215,
      tierId: "SILVER_2", coins: 30, coinBalance: 330, tickets: 9, opponentRating: 1205,
    });
  });

  it("発行の答えを読む", async () => {
    connect(stubFetch({
      ok: true, matchId: "m1", nonce: "n1", battleSeed: 12345,
      defenderSnapshot: null, defenderRating: 1180, attackerRating: 1200, tickets: 9,
    }));
    const ticket = await beginArenaMatch({ kind: "NPC", attackerSnapshot: snapshot() });
    expect(ticket).toEqual({
      matchId: "m1", nonce: "n1", battleSeed: 12345,
      defenderSnapshot: null, defenderRating: 1180, attackerRating: 1200, tickets: 9,
    });
  });

  it("対戦IDか nonce が欠けた答えは受け取らない", async () => {
    // どちらかが無いと精算できない。**「発行できた」ことにしない**
    connect(stubFetch({ ok: true, matchId: "m1", battleSeed: 1 }));
    await expect(beginArenaMatch({ kind: "NPC", attackerSnapshot: snapshot() })).resolves.toBeNull();
  });

  it("ok が false の答えは null(勝手に成功にしない)", async () => {
    connect(stubFetch({ ok: false, code: "NO_TICKET" }));
    await expect(beginArenaMatch({ kind: "NPC", attackerSnapshot: snapshot() })).resolves.toBeNull();
    await expect(settleArenaMatch("m1", "n1")).resolves.toBeNull();
    await expect(pushArenaDefense(snapshot())).resolves.toBe(false);
    await expect(purchaseArenaShopItem("summon_scroll")).resolves.toBeNull();
  });

  it("二重受取の返事はそのまま伝える", async () => {
    connect(stubFetch({ ok: false, code: "ALREADY_CLAIMED", periodKey: "2026-W36" }));
    const result = await claimArenaWeeklyReward();
    expect(result).toEqual({
      ok: false,
      code: "ALREADY_CLAIMED",
      periodKey: "2026-W36",
      tierId: null,
      coins: 0,
      coinBalance: 0,
    });
  });

  it("ショップの購入領収書と未受取一覧を読める", async () => {
    const row = {
      ok: true,
      purchaseId: "purchase-1",
      itemId: "summon_scroll",
      quantity: 1,
      coinBalance: 240,
      payload: { kind: "SUMMON_SCROLL", amount: 1 },
      createdAt: "2026-09-03T00:00:00.000Z",
    };
    connect(stubFetch(row));
    await expect(purchaseArenaShopItem("summon_scroll")).resolves.toEqual({
      purchaseId: "purchase-1",
      itemId: "summon_scroll",
      quantity: 1,
      coinBalance: 240,
      purchasedAt: Date.parse(row.createdAt),
      payload: row.payload,
    });

    connect(stubFetch([row]));
    await expect(fetchPendingArenaShopPurchases()).resolves.toHaveLength(1);
  });

  it("ショップ受取完了は購入IDだけを送る", async () => {
    const fetchImpl = stubFetch({ ok: true, purchaseId: "purchase-1" });
    connect(fetchImpl);
    await expect(acknowledgeArenaShopPurchase("purchase-1")).resolves.toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.test/rest/v1/rpc/arena_ack_shop_purchase");
    expect(JSON.parse(String(init.body))).toEqual({ p_purchase_id: "purchase-1" });
  });

  it("戦績は攻撃側と防衛側で向きが変わる", async () => {
    connect(stubFetch([
      {
        id: "m1", attacker_id: "me", defender_id: "u2", opponent_kind: "PLAYER",
        attacker_won: true, attacker_rating_delta: 15, attacker_rating_after: 1215,
        defender_rating_before: 1205, defender_rating_delta: -5, defender_rating_after: 1200,
        coins_awarded: 30, created_at: "2026-02-01T00:00:00.000Z",
      },
      {
        id: "m2", attacker_id: "u3", defender_id: "me", opponent_kind: "PLAYER",
        attacker_won: false, attacker_rating_before: 1300, attacker_rating_delta: -10,
        defender_rating_delta: 5, defender_rating_after: 1205,
        coins_awarded: 3, defender_coins_awarded: 4, created_at: "2026-02-02T00:00:00.000Z",
      },
    ]));
    const [offense, defense] = await fetchArenaMatchHistory("me");

    expect(offense.side).toBe("OFFENSE");
    expect(offense.won).toBe(true);
    expect(offense.ratingDelta).toBe(15);
    expect(offense.coins).toBe(30);
    expect(offense.at).toBe(Date.parse("2026-02-01T00:00:00.000Z"));

    expect(defense.side).toBe("DEFENSE");
    // 攻撃側が負けた = 防衛成功。サーバが焼いた防衛報酬を表示する
    expect(defense.won).toBe(true);
    expect(defense.ratingDelta).toBe(5);
    expect(defense.ratingAfter).toBe(1205);
    expect(defense.coins).toBe(4);
  });

  it("日時が読めなくても落ちない", async () => {
    connect(stubFetch([{ id: "m1", attacker_id: "me", attacker_won: false, created_at: "きのう" }]));
    const [record] = await fetchArenaMatchHistory("me");
    expect(record.at).toBe(0);
    expect(record.won).toBe(false);
  });
});
