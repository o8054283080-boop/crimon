import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ARENA_DEFENSE_DAILY_LOSS_CAP, ARENA_DEFENSE_RATING_SCALE, ARENA_RATING_RULES } from "../src/data/arena/rating.js";
import { ARENA_COIN_LOSS, ARENA_COIN_WIN } from "../src/data/arena/shop.js";
import { ARENA_TICKET_MAX, ARENA_TICKET_REGEN_MINUTES } from "../src/data/pvpArena.js";
import { ARENA_TIERS } from "../src/data/arena/ranks.js";

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

const sql0001 = readFileSync(new URL("../supabase/migrations/0001_arena.sql", import.meta.url), "utf8");
const sql0003 = readFileSync(new URL("../supabase/migrations/0003_arena_rpc.sql", import.meta.url), "utf8");

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
