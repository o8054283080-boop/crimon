import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureArenaSync, setArenaSyncAccessToken } from "../src/net/arenaSync.js";
import {
  fetchTrialTowerRanking,
  fetchTrialTowerSelf,
  submitTrialTowerProgress,
} from "../src/net/trialTowerSync.js";

function connect(fetchImpl: typeof fetch): void {
  configureArenaSync({ url: "https://example.test", anonKey: "anon-key", accessToken: "player-token", fetchImpl, timeoutMs: 50 });
}

function response(payload: unknown, ok = true): Response {
  return { ok, json: async () => payload } as Response;
}

const row = {
  rank: 1,
  user_id: "user-a",
  display_name: "PLAYER-A",
  best_floor: 100,
  best_floor_reached_at: "2026-09-04T01:00:00Z",
  updated_at: "2026-09-04T01:00:00Z",
};

afterEach(() => {
  setArenaSyncAccessToken(null);
  configureArenaSync(null);
});

describe("試練の塔ランキング同期", () => {
  it("未接続・通信失敗でも例外を出さない", async () => {
    configureArenaSync(null);
    await expect(submitTrialTowerProgress(74)).resolves.toBeNull();
    await expect(fetchTrialTowerRanking()).resolves.toEqual({ ok: false, entries: [] });
    await expect(fetchTrialTowerSelf("user-a")).resolves.toBeNull();

    connect(vi.fn(async () => { throw new Error("offline"); }) as typeof fetch);
    await expect(submitTrialTowerProgress(74)).resolves.toBeNull();
    await expect(fetchTrialTowerRanking()).resolves.toEqual({ ok: false, entries: [] });
  });

  it("最高階だけを認証済みRPCへ送る", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response({
      ok: true,
      updated: true,
      bestFloor: 74,
      bestFloorReachedAt: "2026-09-04T01:00:00Z",
      updatedAt: "2026-09-04T01:00:00Z",
    }));
    connect(fetchImpl as typeof fetch);
    await expect(submitTrialTowerProgress(74)).resolves.toMatchObject({ ok: true, updated: true, bestFloor: 74 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.test/rest/v1/rpc/trial_tower_submit_progress");
    expect(JSON.parse(String(options?.body))).toEqual({ p_best_floor: 74 });
    expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer player-token");
  });

  it("1〜100以外は送らない", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response([]));
    connect(fetchImpl as typeof fetch);
    for (const floor of [0, 101, 7.5, Number.NaN]) await expect(submitTrialTowerProgress(floor)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("正常な空ランキングと取得失敗を区別する", async () => {
    connect(vi.fn(async () => response([])) as typeof fetch);
    await expect(fetchTrialTowerRanking()).resolves.toEqual({ ok: true, entries: [] });
    connect(vi.fn(async () => response({ error: "failed" }, false)) as typeof fetch);
    await expect(fetchTrialTowerRanking()).resolves.toEqual({ ok: false, entries: [] });
  });

  it("100F CLEARを含む行を安全に読み、自分の行を絞り込む", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response([row]));
    connect(fetchImpl as typeof fetch);
    const ranking = await fetchTrialTowerRanking();
    expect(ranking).toEqual({ ok: true, entries: [{
      rank: 1,
      userId: "user-a",
      name: "PLAYER-A",
      bestFloor: 100,
      bestFloorReachedAt: "2026-09-04T01:00:00Z",
      updatedAt: "2026-09-04T01:00:00Z",
    }] });
    await expect(fetchTrialTowerSelf("user-a")).resolves.toMatchObject({ rank: 1, userId: "user-a", bestFloor: 100 });
    const selfUrl = String(fetchImpl.mock.calls[1][0]);
    expect(selfUrl).toContain("user_id=eq.user-a");
  });

  it("壊れた行は捨て、画面を落とさない", async () => {
    connect(vi.fn(async () => response([row, null, { ...row, user_id: "" }, { ...row, best_floor_reached_at: "bad" }])) as typeof fetch);
    const ranking = await fetchTrialTowerRanking();
    expect(ranking.ok).toBe(true);
    expect(ranking.entries).toHaveLength(1);
  });
});

/**
 * 届かなかった記録を、取り残さない。
 *
 * ## 実際に起きたこと(依頼主の指摘)
 *
 * 「試練の塔も99階までいっているはずです」。端末では99階まで登っているのに、
 * サーバ側(`trial_tower_progress`)は**69階で止まっていた**。
 *
 * 原因は送る回数ではなく、**送るきっかけと、失敗の扱い**だった。
 *
 *   - きっかけは2つだけ。「階を登った瞬間」と「ランキングを開いた時」
 *   - 前者は `void syncTrialTowerBest()` の投げっぱなしで、失敗しても誰も知らない
 *   - 後者は**ランキングを開かない人には一生訪れない**
 *
 * つまり登った瞬間に通信がこけると、その階は永久に届かない。
 * 塔の画面を開いた時にも送るようにし、送れなかった階を画面に出す。
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const MAIN = read("src/web/main.ts");
const VIEW = read("src/web/views/trialTower.ts");
const VIEW_CSS = read("src/web/ui/trialTower.css");
const RANKING_SQL = read("supabase/migrations/20260904160957_trial_tower_ranking.sql");

describe("送るきっかけ", () => {
  it("塔の画面を開いた時にも送る(ランキングを開かない人が取り残される)", () => {
    const at = MAIN.indexOf('case "TRIAL_TOWER": {');
    expect(at).toBeGreaterThan(-1);
    expect(MAIN.slice(at, at + 1400), "塔の画面から送っていない").toContain("void syncTrialTowerBest()");
  });

  it("階を登った時と、ランキングを開いた時にも送る", () => {
    expect(MAIN).toContain("if (outcome.lifetimeBestUpdated) void syncTrialTowerBest(true)");
    const at = MAIN.indexOf("async function refreshTrialTowerRanking(");
    expect(MAIN.slice(at, at + 900)).toContain("await syncTrialTowerBest(true)");
  });

  it("新記録は待たせない(再試行の間隔を飛ばす)", () => {
    // 登った直後は、間隔を空けずにその場で送る
    expect(MAIN).toContain("async function syncTrialTowerBest(force = false)");
    expect(MAIN).toContain("if (!force && Date.now() - towerSyncLastAttemptAt < TOWER_SYNC_RETRY_MS) return false;");
  });
});

describe("描き直しのたびに通信しない", () => {
  /*
   * 塔の画面から送る所は `render()` の中にある。素直に毎回送ると、
   * ボタンを押すたびにRPCが飛ぶ(しかも `render()` を呼び返す)。
   */
  it("届いた階を覚えて、同じ階を送り直さない", () => {
    expect(MAIN).toContain("if (towerSyncSentFloor >= best) return true;");
    expect(MAIN).toContain("if (ok) towerSyncSentFloor = best;");
  });

  it("走っている最中は重ねない", () => {
    expect(MAIN).toContain("if (towerSyncRunning) return false;");
    // 失敗して抜けても必ず下ろす(下ろし忘れると二度と送れなくなる)
    const at = MAIN.indexOf("towerSyncRunning = true;");
    expect(MAIN.slice(at, at + 500)).toContain("} finally {");
  });
});

describe("失敗を捨てない", () => {
  it("送れなかった階を覚えて、画面へ渡す", () => {
    expect(MAIN).toContain("const pending = ok ? 0 : best;");
    expect(MAIN).toContain("syncPendingFloor: state.towerSyncPending,");
    expect(VIEW).toContain("syncPendingFloor: number;");
  });

  it("**記録は端末に残っている**と書く(いちばん不安な所)", () => {
    const at = VIEW.indexOf("syncPendingFloor > 0");
    expect(at).toBeGreaterThan(-1);
    const block = VIEW.slice(at, at + 500);
    expect(block).toContain("送れていません");
    expect(block).toContain("この端末に残っています");
  });

  it("送り先が無い環境では、何も言わない", () => {
    /*
     * `arenaSyncAvailable()` が偽なのは通信の失敗ではなく、
     * **ランキングそのものが無い**というだけ。ここで知らせを出すと、
     * 直しようのない警告が塔の画面に出っぱなしになる。
     */
    const at = MAIN.indexOf("async function syncTrialTowerBest(");
    const block = MAIN.slice(at, at + 900);
    expect(block).toContain("if (!arenaSyncAvailable()) return false;");
    expect(block.indexOf("if (!arenaSyncAvailable()) return false;")).toBeLessThan(block.indexOf("const pending = ok ? 0 : best;"));
  });
});

describe("知らせが下の何かを覆わない", () => {
  it("案内を2枚並べない(広い画面の格子で重なる)", () => {
    /*
     * `.tower-screen` は広い画面で格子になり、`.tower-notice` は
     * `grid-row` を名指しで決めている。2枚出すと同じ枡に重なって、
     * 下の文字が読めなくなる。1枚の中へ行として積む。
     */
    expect(VIEW).toContain("function renderNotices(");
    expect(VIEW).toContain("tower-notice__line");
    const screen = VIEW.slice(VIEW.indexOf("renderOutcome(props),"));
    expect(screen.slice(0, 200), "案内を2枚並べている").not.toContain('className: "tower-notice tower-notice--sync"');
    expect(VIEW_CSS).toContain(".tower-notice__line");
  });

  it("読める大きさである(9px未満にしない)", () => {
    // `.tower-notice` は 0.74rem(≒11.8px)。行はそれを継承する
    const at = VIEW_CSS.indexOf(".tower-notice {");
    expect(VIEW_CSS.slice(at, at + 400)).toContain("font-size: 0.74rem;");
    const line = VIEW_CSS.indexOf(".tower-notice__line {");
    expect(VIEW_CSS.slice(line, line + 200)).not.toContain("font-size");
  });
});

describe("何度送っても害が無い(サーバ側)", () => {
  it("低い階では上書きしない", () => {
    expect(RANKING_SQL).toContain("where public.trial_tower_progress.best_floor < excluded.best_floor");
  });

  it("到達日時をクライアントに決めさせない", () => {
    expect(RANKING_SQL).toContain("best_floor_reached_at = clock_timestamp()");
    expect(RANKING_SQL).not.toContain("p_reached_at");
  });
});
