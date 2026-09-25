import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ARENA_ATTACK_LOSS_TO_STRONGER,
  ARENA_DEFENSE_OUTCLASSED_GAP,
  ARENA_GIANT_KILL_MAX,
  ARENA_REPEAT_WIN_WINDOW_HOURS,
  applyArenaDefenseRating,
  arenaAttackWinGain,
  arenaLegacyRatingDelta,
  arenaRatingDelta,
} from "../src/data/arena/rating.js";
import {
  ARENA_CANDIDATE_TOTAL,
  ARENA_NPC_GENERATE_COUNT,
  ARENA_PLAYER_SLOTS,
  buildArenaCandidates,
  orderArenaPlayerPicks,
  type ArenaPoolRow,
} from "../src/game/arena/matchmaking.js";
import type { ArenaOpponentEntry } from "../src/game/arena/types.js";
import { createInitialState } from "../src/game/playerState.js";
import { applyArenaTicketRegen, tryRefillArenaTickets } from "../src/game/pvpArena.js";
import { recordArenaMatch } from "../src/game/arena/match.js";
import { ARENA_TICKET_MAX, ARENA_TICKET_REGEN_MINUTES } from "../src/data/pvpArena.js";
import { ARENA_COIN_LOSS, ARENA_COIN_WIN } from "../src/data/arena/shop.js";

/*
 * アリーナ改修(2026-09)。依頼の目的ごとに確かめる。
 *
 * SQL を本物の Postgres(PGlite)で動かした突き合わせは PR に記録した
 * (差 −2000〜+3000 の全5001点で画面側と一致・本番v1とも一致・既存の券とコインが減らない)。
 * ここではリポジトリの中だけで確かめられることを見張る。
 */

const sql = readFileSync(new URL("../supabase/migrations/20260926090000_arena_rebalance_2026_09.sql", import.meta.url), "utf8");
/** コメントを除いた本文(「消さない」と書いたコメントに引っかからないように) */
const sqlBody = sql.replace(/--[^\n]*/g, "");

describe("5. ジャイアントキリング: 格上に勝つほど大きく", () => {
  it("依頼の目安(帯の始まり)に乗り、帯の中は次の帯の始まりまで連続して伸びる", () => {
    /*
     * 依頼の目安: 0〜49 約+10 / 50〜99 約+15 / 100〜199 約+20〜25 / 200〜299 約+30〜40 /
     * 300〜499 約+50〜70 / 500〜749 約+80〜110 / 750〜999 約+120〜150 / 1000〜1499 約+160〜220 / 1500〜 最大+250前後。
     * 段差を作らない1本の式なので、各帯は「始まりで目安に乗り、終わりで次の帯の始まりに届く」。
     */
    const bands: Array<[number, number, number, number]> = [
      // [差の下限, 差の上限, 下限の値, 上限の値(=次の帯の始まり)]
      [0, 49, 10, 15], [50, 99, 15, 21], [100, 199, 21, 34], [200, 299, 34, 50],
      [300, 499, 50, 83], [500, 749, 83, 125], [750, 999, 125, 167], [1000, 1499, 167, 250],
    ];
    for (const [lo, hi, min, max] of bands) {
      for (let d = lo; d <= hi; d += 1) {
        const gain = arenaAttackWinGain(d);
        expect(gain, `差${d}`).toBeGreaterThanOrEqual(min);
        expect(gain, `差${d}`).toBeLessThanOrEqual(max);
      }
    }
    expect(arenaAttackWinGain(1500)).toBe(250);
    expect(arenaAttackWinGain(5000)).toBe(ARENA_GIANT_KILL_MAX);
  });

  it("差300で頭打ちにならない(2500 が 4000 に勝てば +250)", () => {
    expect(arenaRatingDelta(2500, 2800, true)).toBe(50);
    expect(arenaRatingDelta(2500, 3500, true)).toBe(167);
    expect(arenaRatingDelta(2500, 4000, true)).toBe(250);
  });

  it("段差が無い: 1点差で増加が2以上跳ねない", () => {
    for (let d = -800; d <= 2000; d += 1) {
      expect(Math.abs(arenaAttackWinGain(d + 1) - arenaAttackWinGain(d)), `差${d}`).toBeLessThanOrEqual(1);
    }
  });
});

describe("7. 格下に勝ってもレートは膨らまない", () => {
  it("差400以上の格下に勝つと +1、互角で +10", () => {
    expect(arenaAttackWinGain(0)).toBe(10);
    expect(arenaAttackWinGain(-100)).toBe(6);
    expect(arenaAttackWinGain(-200)).toBe(3);
    expect(arenaAttackWinGain(-400)).toBe(1);
    expect(arenaAttackWinGain(-3000)).toBe(1);
  });

  it("同じ実プレイヤーに続けて勝つと、半分(切り捨て)かつ v1 が上限", () => {
    // 身内の防衛を殴り続けても +250 は1回だけ
    expect(arenaRatingDelta(1000, 2500, true, { repeatWin: true })).toBe(25);
    // 大幅な格下を狩り続けると +0
    expect(arenaRatingDelta(4425, 2961, true, { repeatWin: true })).toBe(0);
    expect(ARENA_REPEAT_WIN_WINDOW_HOURS).toBe(20);
    expect(sqlBody).toContain(`interval '${ARENA_REPEAT_WIN_WINDOW_HOURS} hours'`);
  });

  it("互角の相手では5割で釣り合う(旧は4割勝てば上がり続けた)", () => {
    const win = arenaRatingDelta(3000, 3000, true);
    const loss = -arenaRatingDelta(3000, 3000, false);
    expect(win).toBe(loss);
  });

  it("実力どおりの人が格上に挑み続けても、期待値がほぼ0(格上撃破の大ボーナスでインフレしない)", () => {
    for (let d = 250; d <= 1500; d += 50) {
      const p = 1 / (1 + 10 ** (d / 400));
      const ev = p * arenaRatingDelta(3000, 3000 + d, true) + (1 - p) * arenaRatingDelta(3000, 3000 + d, false);
      expect(ev, `差${d}`).toBeLessThan(0.6);
    }
  });
});

describe("8. 防衛側の減少は攻撃側のボーナスと切り離す", () => {
  it("格下に1回破られても −8 まで(攻撃側が +250 でも)", () => {
    expect(arenaRatingDelta(2500, 4000, true)).toBe(250);
    expect(applyArenaDefenseRating(4000, 2500, false).delta).toBe(-8);
  });

  it("500以上格上に破られたら −1(下位が上位に狩られても削れない)", () => {
    expect(applyArenaDefenseRating(2961, 2961 + ARENA_DEFENSE_OUTCLASSED_GAP, false).delta).toBe(-1);
    expect(applyArenaDefenseRating(2961, 4425, false).delta).toBe(-1);
    expect(sqlBody).toContain(`v_me.rating - v_foe.rating >= ${ARENA_DEFENSE_OUTCLASSED_GAP}`);
  });

  it("防衛は v1 の半分のまま(新しい格上ボーナスは使わない)", () => {
    // 格上に攻められて守り切っても +13 まで(新しい式なら +125 になってしまう)
    expect(applyArenaDefenseRating(1500, 3000, true).delta).toBe(13);
    expect(sqlBody).toContain("public.arena__rating_delta_v1(v_foe.rating, v_me.rating, not p_attacker_won)");
  });
});

describe("サーバと画面で同じ式", () => {
  it("格上負けの表がSQLと同じ", () => {
    const tuples = ARENA_ATTACK_LOSS_TO_STRONGER.map(([d, v]) => `(${d},${v})`).join(",");
    // 表は2か所(下限・上限を探す select)に同じものが入っている
    expect(sql.split(`values ${tuples}`).length - 1).toBe(2);
  });

  it("勝ちの式の係数がSQLと同じ(整数だけで計算する)", () => {
    expect(sqlBody).toContain("if p_diff <= -400 then");
    expect(sqlBody).toContain("((10 * v_x * v_x) * 2 + 160000) / 320000");
    expect(sqlBody).toContain("((p_diff::bigint * p_diff + 900 * p_diff + 90000) * 2 + 9000) / 18000");
    expect(sqlBody).toContain(`least(${ARENA_GIANT_KILL_MAX}, (p_diff * 2 + 6) / 12)`);
  });

  it("残した v1 は本番の値(互角+15/−10、格上+25/−5、格下+8/−15)", () => {
    expect(arenaLegacyRatingDelta(1000, 1000, true)).toBe(15);
    expect(arenaLegacyRatingDelta(1000, 1000, false)).toBe(-10);
    expect(arenaLegacyRatingDelta(1000, 1400, true)).toBe(25);
    expect(arenaLegacyRatingDelta(1000, 1400, false)).toBe(-5);
    expect(arenaLegacyRatingDelta(1000, 600, true)).toBe(8);
    expect(arenaLegacyRatingDelta(1000, 600, false)).toBe(-15);
    expect(sqlBody).toContain("v_target := case when v_diff > 0 then 25 else 8 end;");
    expect(sqlBody).toContain("v_target := case when v_diff > 0 then 5 else 15 end;");
  });

  it("外から呼ぶ入口(arena_rating_delta)の名前・引数・grant を変えていない", () => {
    expect(sqlBody).toContain("create or replace function public.arena_rating_delta(\n  p_my integer, p_opponent integer, p_won boolean\n)");
    expect(sqlBody).toContain("grant execute on function public.arena_rating_delta(integer, integer, boolean) to authenticated;");
  });
});

describe("既存データを壊さない(user_id・rating・coins・tickets・戦績)", () => {
  it("行を消す・表を作り直す・列を落とす文が無い", () => {
    expect(sqlBody).not.toMatch(/\bdelete\s+from\b/i);
    expect(sqlBody).not.toMatch(/\btruncate\b/i);
    expect(sqlBody).not.toMatch(/\bdrop\s+(table|column|view|schema)\b/i);
    expect(sqlBody).not.toMatch(/\balter\s+table\b/i);
    expect(sqlBody).not.toMatch(/\binsert\s+into\s+public\.arena_(profiles|standings|wallets)\b/i);
  });

  it("財布に触る update は「上限を下げる」だけ。枚数・コインは書き換えない", () => {
    const walletUpdates = sqlBody.match(/update public\.arena_wallets[\s\S]*?;/g) ?? [];
    // 移行1本 + 自然回復の中(上限の引き下げ・回復・時刻)+ ダイヤ回復
    expect(walletUpdates.length).toBeGreaterThan(0);
    const migration = walletUpdates.find((u) => /where w\.tickets_max > 5/.test(u));
    expect(migration, "移行の update が無い").toBeTruthy();
    expect(migration).toMatch(/set tickets_max = 5, updated_at = now\(\)/);
    expect(migration).toMatch(/and w\.tickets <= 5/);
    for (const u of walletUpdates) expect(u, "コインを書き換えている").not.toMatch(/\bcoins\s*=/);
  });

  it("5枚を超えて持っている人の枚数を切り捨てない(自然回復は上限との小さい方まで)", () => {
    expect(sqlBody).toContain("v_cap := least(v_wallet.tickets_max, v_max);");
    expect(sqlBody).toContain("if v_wallet.tickets_max > v_max and v_wallet.tickets <= v_max then");
    expect(sqlBody).not.toMatch(/set tickets\s*=\s*least\(\s*5/);
  });

  it("順位の行は、勝敗と防衛の数を足すだけ(初期化しない)", () => {
    expect(sqlBody).toContain("wins = s.wins + case when p_attacker_won then 1 else 0 end");
    expect(sqlBody).toContain("defense_losses = s.defense_losses + case when p_attacker_won then 1 else 0 end");
    expect(sqlBody).not.toMatch(/rating\s*=\s*1000/);
  });

  it("本番へは、マージ時に database → deploy の順で流れる", () => {
    const edge = readFileSync(new URL("../.github/workflows/arena-edge.yml", import.meta.url), "utf8");
    expect(edge).toContain("file: supabase/migrations/20260926090000_arena_rebalance_2026_09.sql");
    expect(edge).toMatch(/deploy:\n\s+needs: database/);
  });

  it("本番に流れていない古いレート式(0912)は、流しても先頭で止まる", () => {
    const old = readFileSync(new URL("../supabase/migrations/20260912120000_arena_rating_gap_rebalance.sql", import.meta.url), "utf8");
    const guard = old.indexOf("raise exception 'SUPERSEDED");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(old.indexOf("create or replace function"));
  });
});

describe("1・2. 挑戦券 5枚/120分・コイン2倍", () => {
  it("1日に回復する枚数が 24 → 12(半分)", () => {
    expect(ARENA_TICKET_MAX).toBe(5);
    expect((24 * 60) / ARENA_TICKET_REGEN_MINUTES).toBe(12);
  });

  it("手元でも、5枚を超えて持っている分は消えない(回復が止まるだけ)", () => {
    const state = createInitialState();
    state.arenaTickets = 8;
    state.lastArenaTicketUpdateAt = Date.now() - 10 * 60 * 60 * 1000;
    applyArenaTicketRegen(state);
    expect(state.arenaTickets).toBe(8);
    state.crystal = 1000;
    expect(tryRefillArenaTickets(state).ok).toBe(false);
    expect(state.arenaTickets).toBe(8);
    expect(state.crystal).toBe(1000);
  });

  it("手元の精算でも、勝ち20・負け6", () => {
    const state = createInitialState();
    const npc = { id: "npc-a", kind: "NPC" as const, name: "NPC", rating: state.arenaPoints };
    recordArenaMatch(state, { opponent: npc, won: true, side: "OFFENSE" });
    recordArenaMatch(state, { opponent: { ...npc, id: "npc-b" }, won: false, side: "OFFENSE" });
    expect(state.arenaMatchHistory.map((r) => r.coins).sort()).toEqual([ARENA_COIN_WIN, ARENA_COIN_LOSS].sort());
    expect(ARENA_COIN_WIN).toBe(20);
    expect(ARENA_COIN_LOSS).toBe(6);
  });
});

/* -------------------------------------------------------------- 候補 */

const pool = (ratings: number[]): ArenaPoolRow[] => ratings.map((rating, i) => ({ id: `p${i}`, rating }));
function entry(id: string, kind: "PLAYER" | "NPC", rating = 1500): ArenaOpponentEntry {
  return { index: 0, kind, id, name: id, rating, tierId: "GOLD_3", defense: { version: 1, capturedAt: 0, units: [] } } as unknown as ArenaOpponentEntry;
}

describe("4. 候補は10枠 = 実プレイヤー3 + NPC7", () => {
  it("枠の数と、サーバが作り直すNPCの数(前と同じ10)", () => {
    expect(ARENA_CANDIDATE_TOTAL).toBe(10);
    expect(ARENA_PLAYER_SLOTS).toBe(3);
    expect(ARENA_NPC_GENERATE_COUNT).toBe(10);
  });

  it("実プレイヤーが3人以上居れば、必ず3人・NPC7人", () => {
    const players = ["a", "b", "c", "d", "e"].map((id) => entry(id, "PLAYER"));
    const npcs = Array.from({ length: 10 }, (_, i) => entry(`n${i}`, "NPC"));
    const list = buildArenaCandidates(players, npcs, { count: 10, selfId: "me", maxPlayers: 3, keepPlayerOrder: true });
    expect(list).toHaveLength(10);
    expect(list.filter((e) => e.kind === "PLAYER")).toHaveLength(3);
    expect(list.filter((e) => e.kind === "NPC")).toHaveLength(7);
    expect(list.map((e) => e.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("3人未満の時だけ、その分をNPCで埋める", () => {
    const npcs = Array.from({ length: 10 }, (_, i) => entry(`n${i}`, "NPC"));
    const list = buildArenaCandidates([entry("a", "PLAYER"), entry("b", "PLAYER")], npcs, { count: 10, selfId: "me", maxPlayers: 3 });
    expect(list.filter((e) => e.kind === "PLAYER")).toHaveLength(2);
    expect(list.filter((e) => e.kind === "NPC")).toHaveLength(8);
  });

  it("自分と、同じ user_id の重複は出さない", () => {
    const players = [entry("me", "PLAYER"), entry("a", "PLAYER"), entry("a", "PLAYER"), entry("b", "PLAYER")];
    const npcs = Array.from({ length: 10 }, (_, i) => entry(`n${i}`, "NPC"));
    const list = buildArenaCandidates(players, npcs, { count: 10, selfId: "me", maxPlayers: 3 });
    const ids = list.map((e) => e.id);
    expect(ids).not.toContain("me");
    expect(new Set(ids).size).toBe(ids.length);
    expect(list.filter((e) => e.kind === "PLAYER").map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("4・5. 実プレイヤーの選び方(レート差で外さない)", () => {
  const base = { selfId: "me", myRating: 2500, seed: 7, slots: 3 };

  it("±300より離れた人しか居なくても、3人選ぶ(0人にしない)", () => {
    const picks = orderArenaPlayerPicks(pool([2700, 3300, 4500]), base);
    expect(picks.slice(0, 3).sort()).toEqual(["p0", "p1", "p2"]);
  });

  it("近い・中くらい・遠いから1人ずつ", () => {
    // 近い帯(2400〜2600)・中(3000〜3200)・遠い(4000〜4600)に3人ずつ
    const rows = pool([2450, 2550, 2600, 3000, 3100, 3200, 4000, 4300, 4600]);
    for (let seed = 1; seed <= 20; seed += 1) {
      const top3 = orderArenaPlayerPicks(rows, { ...base, seed }).slice(0, 3).map((id) => rows.find((r) => r.id === id)!.rating);
      expect(top3.filter((r) => r <= 2600), `seed=${seed}`).toHaveLength(1);
      expect(top3.filter((r) => r >= 3000 && r <= 3200), `seed=${seed}`).toHaveLength(1);
      expect(top3.filter((r) => r >= 4000), `seed=${seed}`).toHaveLength(1);
    }
  });

  it("自分・重複・壊れた行は選ばない", () => {
    const rows: ArenaPoolRow[] = [{ id: "me", rating: 2500 }, { id: "a", rating: 2600 }, { id: "a", rating: 2600 },
      { id: "", rating: 1 }, { id: "b", rating: Number.NaN }, { id: "c", rating: 4000 }];
    expect(orderArenaPlayerPicks(rows, base).sort()).toEqual(["a", "c"]);
  });

  it("直近に当たった人は帯の中で後ろへ回る(同じ3人ばかりにならない)", () => {
    const rows = pool([2450, 2550, 3000, 3100, 4000, 4300]);
    const recentIds = ["p0", "p1"]; // 近い帯の2人とも直近
    const top3 = orderArenaPlayerPicks(rows, { ...base, recentIds }).slice(0, 3);
    // 近い帯には直近の人しか居ないので、それでも1人は出す(枠を空けない)
    expect(top3.some((id) => id === "p0" || id === "p1")).toBe(true);
    const fresh = orderArenaPlayerPicks(pool([2450, 2460, 2470, 3000, 3100, 4000]), { ...base, recentIds: ["p0", "p1"] }).slice(0, 3);
    expect(fresh).toContain("p2");
  });

  it("「相手を変える」(種が変わる)と、帯の中の顔ぶれが入れ替わる", () => {
    const rows = pool(Array.from({ length: 30 }, (_, i) => 1500 + i * 110));
    const seen = new Set<string>();
    for (let seed = 1; seed <= 10; seed += 1) orderArenaPlayerPicks(rows, { ...base, seed }).slice(0, 3).forEach((id) => seen.add(id));
    expect(seen.size).toBeGreaterThan(6);
  });
});
