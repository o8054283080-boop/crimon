import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ARENA_DEFENSE_DAILY_LOSS_CAP, ARENA_DEFENSE_RATING_SCALE, ARENA_RATING_RULES } from "../src/data/arena/rating.js";
import {
  ARENA_COIN_DEFENSE_DAILY_CAP,
  ARENA_COIN_DEFENSE_WIN,
  ARENA_COIN_LOSS,
  ARENA_COIN_WIN,
} from "../src/data/arena/shop.js";
import { ARENA_TICKET_MAX, ARENA_TICKET_REGEN_MINUTES } from "../src/data/pvpArena.js";
import { ARENA_TIERS } from "../src/data/arena/ranks.js";
import {
  ARENA_SEASON_EPOCH_UTC,
  ARENA_SEASON_WEEKS,
  ARENA_SOFT_RESET,
  arenaSeasonReward,
  arenaWeekIndex,
  arenaWeeklyReward,
} from "../src/data/arena/season.js";
import { ARENA_SHOP_ITEMS } from "../src/data/arena/shop.js";
import { ARENA_SNAPSHOT_VERSION } from "../src/game/arena/types.js";

/*
 * サーバ側の設定と、クライアント側の定数が同じ値か。
 *
 * ## なぜ要るのか
 *
 * 繋がっている時は**サーバの値が正**になる。つまり両者がずれていると、
 * **Supabaseを有効にした瞬間に画面の数字が飛ぶ。**
 *
 * 実際にずれていた:
 *
 *   挑戦券の回復   サーバ30分  / クライアント60分
 *   勝敗のコイン   サーバ30/8  / クライアント10/3
 *
 * どちらも「同じ値にすること」とコメントに書いてあったのに、片方だけ直された。
 * **注記は約束を守らない。** 突き合わせを機械にやらせる。
 *
 * SQLは実行できないので、初期値のJSONを読んで比べる。
 * `arena_config` の行を後から書き換えれば当然ずれるが、
 * **配布されるSQLがずれていない**ことはここで保証できる。
 */

const sql0001 = readFileSync(new URL("../supabase/migrations/20260902170000_arena_schema.sql", import.meta.url), "utf8");
const sql0003 = readFileSync(new URL("../supabase/migrations/20260902172000_arena_rpc.sql", import.meta.url), "utf8");
const sqlSeed = readFileSync(new URL("../supabase/migrations/20260902172100_arena_seed.sql", import.meta.url), "utf8");
const sqlSafety = readFileSync(new URL("../supabase/migrations/20260903003038_arena_release_safety.sql", import.meta.url), "utf8");
const sqlShopGoals = readFileSync(new URL("../supabase/migrations/20260903015014_arena_shop_goals_and_defense_coins.sql", import.meta.url), "utf8");

/** `arena_config` に入れている初期値を1件取り出す */
function seededConfig(key: string): Record<string, number> {
  const marker = `('${key}',`;
  const at = sql0001.indexOf(marker);
  expect(at, `arena_config に ${key} の初期値が無い`).toBeGreaterThan(-1);
  const json = sql0001.slice(at).match(/'(\{[^']*\})'::jsonb/);
  expect(json, `${key} のJSONを読めない`).not.toBeNull();
  return JSON.parse(json![1]) as Record<string, number>;
}

/** RPC の中に書いてある既定値(設定が空の時に使われる)をすべて拾う */
function fallbacksIn(sql: string, key: string): Record<string, number>[] {
  const found: Record<string, number>[] = [];
  const re = new RegExp(`arena__config\\('${key}',\\s*\\n?\\s*'(\\{[^']*\\})'::jsonb`, "g");
  for (const match of sql.matchAll(re)) found.push(JSON.parse(match[1]) as Record<string, number>);
  return found;
}

describe("サーバ設定とクライアント定数が同じ値であること", () => {
  it("レートの増減", () => {
    const rating = seededConfig("rating");
    expect(rating.even_win).toBe(ARENA_RATING_RULES.evenWin);
    expect(rating.even_loss).toBe(ARENA_RATING_RULES.evenLoss);
    expect(rating.max_win).toBe(ARENA_RATING_RULES.maxWin);
    expect(rating.min_loss).toBe(ARENA_RATING_RULES.minLoss);
    expect(rating.min_win).toBe(ARENA_RATING_RULES.minWin);
    expect(rating.max_loss).toBe(ARENA_RATING_RULES.maxLoss);
    expect(rating.spread).toBe(ARENA_RATING_RULES.spread);
    expect(rating.floor).toBe(ARENA_RATING_RULES.floor);
  });

  it("防衛の増減と1日の下落上限", () => {
    const defense = seededConfig("defense");
    expect(defense.scale).toBe(ARENA_DEFENSE_RATING_SCALE);
    expect(defense.daily_loss_cap).toBe(ARENA_DEFENSE_DAILY_LOSS_CAP);
  });

  it("挑戦券の上限と回復間隔", () => {
    // 実際にずれていた(サーバ30分 / クライアント60分)
    const tickets = seededConfig("tickets");
    expect(tickets.max).toBe(ARENA_TICKET_MAX);
    expect(tickets.refill_minutes).toBe(ARENA_TICKET_REGEN_MINUTES);
  });

  it("1戦で入るコイン", () => {
    // 実際にずれていた(サーバ 30/8 / クライアント 10/3)
    const coins = seededConfig("match_coins");
    expect(coins.win_base).toBe(ARENA_COIN_WIN);
    expect(coins.loss_base).toBe(ARENA_COIN_LOSS);
  });

  it("クライアントに無い上乗せをサーバだけで持たない", () => {
    /*
     * 格上ボーナスもNPCの割引も、クライアント側には無い。
     * 片方だけ増やすと、繋いだ瞬間に数字が飛ぶ。
     */
    expect(seededConfig("match_coins").upset_max).toBe(0);
    expect(seededConfig("npc").coin_scale).toBe(1);
  });

  it("RPCの中の既定値も、初期値と同じ", () => {
    /*
     * `arena_config` の行が無い時に使われる値。ここだけ古いままだと、
     * 設定を入れ忘れた環境で静かに別の計算になる。
     */
    for (const key of ["match_coins", "npc", "tickets"]) {
      const seeded = seededConfig(key);
      const fallbacks = fallbacksIn(sql0003, key);
      expect(fallbacks.length, `${key} の既定値がRPCに無い`).toBeGreaterThan(0);
      for (const fallback of fallbacks) {
        expect(fallback, `${key} の既定値が初期値と違う`).toEqual(seeded);
      }
    }
  });

  it("ランク表の境界がSQLと同じ", () => {
    // 画面のランクとサーバのランクが食い違うと、順位表だけ別の名前になる
    for (const tier of ARENA_TIERS) {
      expect(sql0001, `${tier.id} がSQLに無い`).toContain(`'${tier.id}'`);
      expect(sql0001, `${tier.id} の境界 ${tier.minRating} がSQLに無い`)
        .toMatch(new RegExp(`'${tier.id}'[^\\n]*\\b${tier.minRating}\\b`));
    }
  });
});

describe("報酬・シーズン・棚がクライアントと同じ値であること", () => {
  /** seed の `('WEEKLY', 'GOLD_1', 85)` を拾う */
  function seededReward(kind: "WEEKLY" | "SEASON", tierId: string): number | null {
    const found = sqlSeed.match(
      new RegExp(`\\('${kind}',\\s*'${tierId}',\\s*(\\d+)\\)`),
    );
    return found ? Number(found[1]) : null;
  }

  it("週間報酬のコインが一致する", () => {
    /*
     * **桁が1つ違っていた。** サーバの表は 200〜3000、
     * クライアントは 20〜210。繋いだ瞬間に10倍のコインが配られる。
     */
    for (const tier of ARENA_TIERS) {
      expect(seededReward("WEEKLY", tier.id), `週・${tier.name}`)
        .toBe(arenaWeeklyReward(tier.id).arenaCoins ?? 0);
    }
  });

  it("シーズン報酬のコインが一致する", () => {
    for (const tier of ARENA_TIERS) {
      expect(seededReward("SEASON", tier.id), `季・${tier.name}`)
        .toBe(arenaSeasonReward(tier.id).arenaCoins ?? 0);
    }
  });

  it("ソフトリセットの基準と残す割合が一致する", () => {
    /*
     * 締めのたびにレートが動く式。ずれると、**同じ順位の人が
     * サーバとクライアントで違うレートから次のシーズンを始める。**
     */
    const base = sqlSeed.match(/'ACTIVE',\s*\n?\s*(\d+),/);
    expect(base, "soft_reset_base が読めない").not.toBeNull();
    expect(Number(base![1])).toBe(ARENA_SOFT_RESET.anchor);
    // 1/3 は小数で書くと丸めがずれるので、SQL側も割り算のまま持たせている
    expect(sqlSeed).toContain("(1.0 / 3.0)");
    expect(ARENA_SOFT_RESET.keep).toBeCloseTo(1 / 3, 12);
  });

  it("シーズンの開始と長さが一致する", () => {
    // ここがずれると「今シーズンの締めまで」が嘘になる
    const starts = sqlSeed.match(/'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)',\s*\n?\s*'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)'/);
    expect(starts, "シーズンの期間が読めない").not.toBeNull();
    expect(Date.parse(starts![1])).toBe(ARENA_SEASON_EPOCH_UTC);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    expect(Date.parse(starts![2]) - Date.parse(starts![1])).toBe(ARENA_SEASON_WEEKS * weekMs);
  });

  it("週の境界はクライアントとサーバの両方で月曜4時JST", () => {
    const before = Date.parse("2026-09-06T18:59:59.999Z");
    const boundary = Date.parse("2026-09-06T19:00:00.000Z");
    expect(arenaWeekIndex(boundary)).toBe(arenaWeekIndex(before) + 1);
    expect(sqlSafety).toContain("2026-08-30 19:00:00+00");
    expect(sqlSafety).toContain("public.arena_week_key_at(v_now)");
    expect(sqlSafety).toContain("public.arena_week_key_at(now())");
    expect(sqlSafety).toContain("public.arena_tier_for_rating(s.best_rating)");
    expect(sqlSafety).not.toContain("IYYY-\"W\"IW");
  });

  it("棚に並ぶのは実在する商品だけで、値段も上限も一致する", () => {
    /*
     * seed が空のままだと、購入は必ず「その商品はありません」になる。
     * 逆に、実装に無いものを置くと**買えたのに手元に増えない道具**が生まれる。
     */
    for (const item of ARENA_SHOP_ITEMS) {
      // 行の終わりは `),` か `)` +改行。**最後の1件だけ `,` が無い**
      const row = sqlShopGoals.match(new RegExp(`\\('${item.id}',[^)]{0,500}\\)`));
      expect(row, `${item.id} が seed に無い`).not.toBeNull();
      const text = row![0];
      expect(text, `${item.id} の値段`).toContain(`, ${item.price},`);
      expect(text, `${item.id} の中身`).toContain(`"kind":"${item.kind}"`);
      expect(text, `${item.id} の個数`).toContain(`"amount":${item.amount}`);
      const limits = item.period === "WEEKLY"
        ? `${item.limit}, null, null`
        : item.period === "MONTHLY"
          ? `null, ${item.limit}, null`
          : `null, null, ${item.limit}`;
      expect(text, `${item.id} の上限(${item.period})`).toContain(limits);
    }
  });

  it("seed に無い商品を売っていない", () => {
    // サーバだけにある商品は、買った人の手元で何も起きない
    /*
     * **棚の挿入だけを見る。** seed には他の insert も並んでいるので、
     * ファイル全体から拾うと設定の鍵まで「商品」として数えてしまう
     * (`snapshot` を商品だと言って落ちた)。
     */
    const from = sqlShopGoals.indexOf("insert into public.arena_shop_items");
    const block = sqlShopGoals.slice(from, sqlShopGoals.indexOf("on conflict", from));
    const ids = [...block.matchAll(/^\s{2}\('([a-z0-9_]+)',\s*'/gm)].map((m) => m[1]);
    const known = new Set(ARENA_SHOP_ITEMS.map((item) => item.id));
    for (const id of ids) {
      expect(known.has(id), `${id} は実装に無い商品`).toBe(true);
    }
  });

  it("防衛成功コインと日次上限がサーバ設定と一致する", () => {
    expect(sqlShopGoals).toContain(`\"coin_win\":${ARENA_COIN_DEFENSE_WIN}`);
    expect(sqlShopGoals).toContain(`\"daily_coin_cap\":${ARENA_COIN_DEFENSE_DAILY_CAP}`);
    expect(sqlShopGoals).toContain("defender_coins_awarded");
    expect(sqlShopGoals).toContain("at time zone 'Asia/Tokyo'");
  });
});

describe("スナップショットの版", () => {
  it("サーバが受け取れる上限が、クライアントの版と同じ", () => {
    /*
     * ここがクライアントより**低い**と、配信した直後に
     * 誰も防衛を登録できなくなる(全員が新しい版で焼いてくる)。
     * **高い**と、読み方の分からない編成を受け取ってしまい、
     * それを引いた相手の画面で崩れる。同じ値でなければならない。
     */
    const found = sqlSeed.match(/'\{"max_version":(\d+)\}'::jsonb/);
    expect(found, "snapshot の設定が seed に無い").not.toBeNull();
    expect(Number(found![1])).toBe(ARENA_SNAPSHOT_VERSION);
  });

  it("検分の既定値も同じ版", () => {
    // 設定を入れ忘れた環境で、静かに別の版を通さないため
    const integrity = readFileSync(
      new URL("../supabase/migrations/20260902172200_arena_match_integrity.sql", import.meta.url), "utf8");
    const fallback = integrity.match(/arena__config\('snapshot', '\{"max_version":(\d+)\}'::jsonb\)/);
    expect(fallback, "検分に snapshot の既定値が無い").not.toBeNull();
    expect(Number(fallback![1])).toBe(ARENA_SNAPSHOT_VERSION);
  });
});
