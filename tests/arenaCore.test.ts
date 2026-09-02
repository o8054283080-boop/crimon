import { describe, expect, it } from "vitest";
import { ARENA_TIERS, arenaNextTier, arenaTierForRating } from "../src/data/arena/ranks.js";
import { ARENA_RATING_RULES, applyArenaDefenseRating, applyArenaRating, arenaRatingDelta } from "../src/data/arena/rating.js";
import {
  ARENA_NOT_CLAIMED,
  ARENA_SEASON_EPOCH_UTC,
  ARENA_SEASON_WEEKS,
  arenaSeasonNumber,
  arenaSoftResetRating,
  arenaWeekIndex,
} from "../src/data/arena/season.js";
import { ARENA_SHOP_ITEMS } from "../src/data/arena/shop.js";
import { createInitialState } from "../src/game/playerState.js";
import { buildArenaCandidates, rememberArenaOpponent } from "../src/game/arena/matchmaking.js";
import { arenaRevengeBlock, markArenaRevenged, recordArenaMatch } from "../src/game/arena/match.js";
import {
  applyArenaSeasonRollover,
  canClaimArenaWeekly,
  claimArenaSeasonReward,
  claimArenaWeeklyReward,
} from "../src/game/arena/progress.js";
import { arenaShopRemaining, buyArenaShopItem } from "../src/game/arena/shop.js";
import { captureArenaDefense, isUsableDefense, snapshotToDefinitions } from "../src/game/arena/snapshot.js";
import { ArenaDefenseSnapshot, ArenaOpponentEntry } from "../src/game/arena/types.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { generateEquipment } from "../src/core/equipment.js";

/*
 * 非同期PvPアリーナの中核。
 *
 * ここで見張るのは「画面が言い張れば通る経路が無いこと」と
 * 「寝ている間に壊れないこと」。どちらも実際に遊んで気づくのは遅すぎる。
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SEASON1 = Date.UTC(2026, 8, 8, 12, 0, 0);

function emptySnapshot(): ArenaDefenseSnapshot {
  return { version: 1, capturedAt: 0, units: [] };
}

function opponent(id: string, kind: "PLAYER" | "NPC", rating: number): ArenaOpponentEntry {
  return { index: 0, kind, id, name: id, rating, tierId: "SILVER_3", defense: emptySnapshot() };
}

describe("ランク表", () => {
  it("境界が昇順で、重なりも抜けも無い", () => {
    // 表の並びが崩れると `arenaTierForRating` が後ろから拾えなくなる
    for (let i = 1; i < ARENA_TIERS.length; i += 1) {
      expect(ARENA_TIERS[i].minRating, ARENA_TIERS[i].id).toBeGreaterThan(ARENA_TIERS[i - 1].minRating);
    }
    expect(ARENA_TIERS[0].minRating).toBe(0);
    expect(new Set(ARENA_TIERS.map((t) => t.id)).size).toBe(ARENA_TIERS.length);
  });

  it("表の外の値でも必ず1つ返す", () => {
    expect(arenaTierForRating(-500).id).toBe("BRONZE_3");
    expect(arenaTierForRating(99_999).id).toBe("LEGEND");
    expect(arenaTierForRating(1500).name).toBe("ゴールドIII");
  });

  it("最上位では次のランクが無い", () => {
    expect(arenaNextTier(0)?.tier.id).toBe("BRONZE_2");
    expect(arenaNextTier(99_999)).toBeNull();
  });
});

describe("レートの増減", () => {
  it("同格は依頼の目安どおり", () => {
    expect(arenaRatingDelta(1500, 1500, true)).toBe(ARENA_RATING_RULES.evenWin);
    expect(arenaRatingDelta(1500, 1500, false)).toBe(-ARENA_RATING_RULES.evenLoss);
  });

  it("格上に勝つほど大きく、格上に負けても小さい", () => {
    expect(arenaRatingDelta(1500, 1800, true)).toBe(ARENA_RATING_RULES.maxWin);
    expect(arenaRatingDelta(1500, 1800, false)).toBe(-ARENA_RATING_RULES.minLoss);
  });

  it("格下に勝っても小さく、格下に負けると大きく減る", () => {
    expect(arenaRatingDelta(1800, 1500, true)).toBe(ARENA_RATING_RULES.minWin);
    expect(arenaRatingDelta(1800, 1500, false)).toBe(-ARENA_RATING_RULES.maxLoss);
  });

  it("差が開いても上限・下限を超えない", () => {
    // 段差を作らない代わりに、際限なく伸びないことを確かめる
    for (const diff of [0, 100, 300, 1000, 5000]) {
      const win = arenaRatingDelta(1500, 1500 + diff, true);
      const loss = arenaRatingDelta(1500, 1500 - diff, false);
      expect(win).toBeLessThanOrEqual(ARENA_RATING_RULES.maxWin);
      expect(win).toBeGreaterThanOrEqual(ARENA_RATING_RULES.minWin);
      expect(-loss).toBeLessThanOrEqual(ARENA_RATING_RULES.maxLoss);
    }
  });

  it("レートは0を下回らない", () => {
    expect(applyArenaRating(3, 1500, false).rating).toBe(0);
  });

  it("防衛の増減は攻撃より小さい", () => {
    /*
     * **寝ている間に大量に落ちる状態を避ける。**
     * 防衛は自分で選べない戦いなので、同じ幅で動かすと
     * 触っていないのに順位が溶ける。
     */
    const attack = Math.abs(applyArenaRating(1500, 1500, false).rating - 1500);
    const defense = Math.abs(applyArenaDefenseRating(1500, 1500, false).rating - 1500);
    expect(defense).toBeLessThan(attack);
    expect(defense).toBeGreaterThan(0);
  });
});

describe("シーズン", () => {
  it("4週で1シーズン", () => {
    expect(ARENA_SEASON_WEEKS).toBe(4);
    const w0 = arenaWeekIndex(SEASON1);
    expect(arenaSeasonNumber(SEASON1)).toBe(1);
    expect(arenaSeasonNumber(SEASON1 + ARENA_SEASON_WEEKS * WEEK_MS)).toBe(2);
    expect(arenaWeekIndex(SEASON1 + WEEK_MS)).toBe(w0 + 1);
  });

  it("レートは0へ戻さず、基準へ寄せる", () => {
    /*
     * 積み上げたものが毎回消えると、またいで遊ぶ理由が無くなる。
     * 依頼の目安: 2500→1800前後 / 2100→1700前後 / 1600→1500前後
     */
    expect(arenaSoftResetRating(2500)).toBeGreaterThan(1700);
    expect(arenaSoftResetRating(2500)).toBeLessThan(1900);
    expect(arenaSoftResetRating(2100)).toBeGreaterThan(1620);
    expect(arenaSoftResetRating(2100)).toBeLessThan(1800);
    expect(arenaSoftResetRating(1600)).toBeGreaterThan(1400);
    expect(arenaSoftResetRating(1600)).toBeLessThan(1600);
    // 基準より下は落とさない
    expect(arenaSoftResetRating(1000)).toBe(1000);
  });

  it("上ほど落ちるが、順位は入れ替わらない", () => {
    // 圧縮で上下が逆転すると、シーズンをまたいだ瞬間に理不尽が起きる
    let previous = -1;
    for (const rating of [1000, 1200, 1500, 1800, 2100, 2400, 2700]) {
      const after = arenaSoftResetRating(rating);
      expect(after).toBeGreaterThan(previous);
      previous = after;
    }
  });

  it("初めて開いた人のレートをいきなり削らない", () => {
    const state = createInitialState();
    state.arenaPoints = 2400;
    const first = applyArenaSeasonRollover(state, SEASON1);
    expect(first.changed).toBe(false);
    expect(state.arenaPoints).toBe(2400);
  });

  it("シーズンが変わった時だけ締める", () => {
    const state = createInitialState();
    state.arenaPoints = 2400;
    applyArenaSeasonRollover(state, SEASON1);
    expect(applyArenaSeasonRollover(state, SEASON1 + WEEK_MS).changed).toBe(false);
    const rolled = applyArenaSeasonRollover(state, SEASON1 + ARENA_SEASON_WEEKS * WEEK_MS);
    expect(rolled.changed).toBe(true);
    expect(state.arenaPoints).toBeLessThan(2400);
    expect(state.arenaSeasonBattles).toBe(0);
  });
});

describe("報酬の二重受取", () => {
  it("未受取の目印が、実在しうる週番号と衝突しない", () => {
    /*
     * **実際にこれで壊れた。** 目印に -1 を使っていたため、
     * 週の通し番号が -1 になる時期に「受け取り済み」と判定され、
     * 実機で「今週のランク報酬は受け取り済みです」と出た。
     * シーズンの起点は必ず過去なので、週番号は0以上にしかならない。
     */
    expect(ARENA_NOT_CLAIMED).toBeLessThan(-1000);
    expect(arenaWeekIndex(Date.now())).toBeGreaterThanOrEqual(0);
    expect(arenaSeasonNumber(Date.now())).toBeGreaterThanOrEqual(1);
  });

  it("シーズンの起点は過去にある", () => {
    // 未来にすると週番号が負になり、シーズンが0のまま進まない
    expect(ARENA_SEASON_EPOCH_UTC).toBeLessThan(Date.now());
  });

  it("週間報酬は同じ週に2回受け取れない", () => {
    const state = createInitialState();
    expect(canClaimArenaWeekly(state, SEASON1)).toBe(true);
    const first = claimArenaWeeklyReward(state, SEASON1);
    expect(first.ok).toBe(true);
    const crystalAfterFirst = state.crystal;
    const second = claimArenaWeeklyReward(state, SEASON1);
    expect(second.ok).toBe(false);
    expect(state.crystal).toBe(crystalAfterFirst);
  });

  it("週が変われば受け取れる", () => {
    const state = createInitialState();
    claimArenaWeeklyReward(state, SEASON1);
    expect(claimArenaWeeklyReward(state, SEASON1 + WEEK_MS).ok).toBe(true);
  });

  it("シーズン報酬は終わったシーズンぶんを1回だけ", () => {
    const state = createInitialState();
    const inSeason2 = SEASON1 + ARENA_SEASON_WEEKS * WEEK_MS;
    // 進行中のシーズンぶんは受け取れない
    expect(claimArenaSeasonReward(state, 2000, SEASON1).ok).toBe(false);
    expect(claimArenaSeasonReward(state, 2000, inSeason2).ok).toBe(true);
    const crystal = state.crystal;
    expect(claimArenaSeasonReward(state, 2000, inSeason2).ok).toBe(false);
    expect(state.crystal).toBe(crystal);
  });

  it("シーズン報酬は「終わったシーズンの最高レート」で決まる", () => {
    // 圧縮後の値で配ると、上位ほど損をする逆転が起きる
    const high = createInitialState();
    const low = createInitialState();
    const inSeason2 = SEASON1 + ARENA_SEASON_WEEKS * WEEK_MS;
    claimArenaSeasonReward(high, 2600, inSeason2);
    claimArenaSeasonReward(low, 1000, inSeason2);
    expect(high.crystal).toBeGreaterThan(low.crystal);
  });
});

describe("アリーナショップ", () => {
  it("並んでいるのは実在する種類だけ", () => {
    // 存在しない道具を勝手に作らない
    const kinds = new Set(ARENA_SHOP_ITEMS.map((item) => item.kind));
    for (const kind of kinds) {
      expect([
        "SUMMON_SCROLL", "FOUR_STAR_SCROLL", "LIGHT_DARK_SCROLL",
        "GOLD", "AWAKENING_ORB", "EXP_PIG", "REINCARNATION_PIG",
      ]).toContain(kind);
    }
    expect(ARENA_SHOP_ITEMS.every((item) => item.price > 0 && item.limit > 0)).toBe(true);
    expect(new Set(ARENA_SHOP_ITEMS.map((i) => i.id)).size).toBe(ARENA_SHOP_ITEMS.length);
  });

  it("転生ピッグは高価で、上限も小さい", () => {
    /*
     * ランクアップの頭数をそのまま買えるので、安いと育成の順番が壊れる。
     */
    const pig = ARENA_SHOP_ITEMS.find((item) => item.kind === "REINCARNATION_PIG")!;
    const scroll = ARENA_SHOP_ITEMS.find((item) => item.kind === "SUMMON_SCROLL")!;
    expect(pig.price).toBeGreaterThan(scroll.price * 5);
    expect(pig.period).toBe("MONTHLY");
    expect(pig.limit).toBe(1);
  });

  it("コインが足りなければ買えず、引き落とされない", () => {
    const state = createInitialState();
    state.arenaCoins = 1;
    const result = buyArenaShopItem(state, "summon_scroll", SEASON1);
    expect(result.ok).toBe(false);
    expect(state.arenaCoins).toBe(1);
    expect(state.summonScrolls).toBe(0);
  });

  it("上限を超えて買えない(押せなくするのではなく処理で弾く)", () => {
    const state = createInitialState();
    state.arenaCoins = 999_999;
    const item = ARENA_SHOP_ITEMS.find((i) => i.id === "summon_scroll")!;
    for (let i = 0; i < item.limit; i += 1) {
      expect(buyArenaShopItem(state, item.id, SEASON1).ok, `${i + 1}回目`).toBe(true);
    }
    expect(arenaShopRemaining(state, item, SEASON1)).toBe(0);
    const over = buyArenaShopItem(state, item.id, SEASON1);
    expect(over.ok).toBe(false);
    expect(state.summonScrolls).toBe(item.limit * item.amount);
  });

  it("週が変われば上限が数え直しになる", () => {
    const state = createInitialState();
    state.arenaCoins = 999_999;
    const item = ARENA_SHOP_ITEMS.find((i) => i.id === "summon_scroll")!;
    for (let i = 0; i < item.limit; i += 1) buyArenaShopItem(state, item.id, SEASON1);
    expect(buyArenaShopItem(state, item.id, SEASON1).ok).toBe(false);
    expect(buyArenaShopItem(state, item.id, SEASON1 + WEEK_MS).ok).toBe(true);
  });

  it("月の商品は翌週になっても上限が戻らない", () => {
    const state = createInitialState();
    state.arenaCoins = 999_999;
    expect(buyArenaShopItem(state, "four_star_scroll", SEASON1).ok).toBe(true);
    expect(buyArenaShopItem(state, "four_star_scroll", SEASON1 + WEEK_MS).ok).toBe(false);
  });

  it("知らない商品IDでは何も起きない", () => {
    const state = createInitialState();
    state.arenaCoins = 999_999;
    expect(buyArenaShopItem(state, "not_a_real_item", SEASON1).ok).toBe(false);
    expect(state.arenaCoins).toBe(999_999);
  });
});

describe("対戦候補の混合", () => {
  const npcs = Array.from({ length: 8 }, (_, i) => opponent(`npc${i}`, "NPC", 1500));

  it("実プレイヤーが0人でもNPCだけで成立する", () => {
    const list = buildArenaCandidates([], npcs, { count: 5, selfId: "me" });
    expect(list).toHaveLength(5);
    expect(list.every((e) => e.kind === "NPC")).toBe(true);
  });

  it("実プレイヤーが居れば先に出て、残りをNPCで埋める", () => {
    const players = [opponent("p1", "PLAYER", 1500), opponent("p2", "PLAYER", 1520), opponent("p3", "PLAYER", 1480)];
    const list = buildArenaCandidates(players, npcs, { count: 5, selfId: "me" });
    expect(list).toHaveLength(5);
    expect(list.filter((e) => e.kind === "PLAYER")).toHaveLength(3);
    expect(list.filter((e) => e.kind === "NPC")).toHaveLength(2);
  });

  it("自分は絶対に出さない", () => {
    // 自分に挑めると、勝敗どちらでもレートを操作できる
    const players = [opponent("me", "PLAYER", 1500), opponent("p1", "PLAYER", 1500)];
    const list = buildArenaCandidates(players, npcs, { count: 5, selfId: "me" });
    expect(list.some((e) => e.id === "me")).toBe(false);
  });

  it("直近に出した相手は後回しになる", () => {
    const players = Array.from({ length: 6 }, (_, i) => opponent(`p${i}`, "PLAYER", 1500));
    const list = buildArenaCandidates(players, npcs, { count: 3, selfId: "me", recentIds: ["p0", "p1", "p2"] });
    expect(list.map((e) => e.id)).toEqual(["p3", "p4", "p5"]);
  });

  it("候補が足りない時は、直近に出した相手でも枠を埋める", () => {
    // 「同じ相手を避ける」ために枠が空くのは、避けるより悪い
    const players = [opponent("p0", "PLAYER", 1500)];
    const list = buildArenaCandidates(players, [], { count: 3, selfId: "me", recentIds: ["p0"] });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("p0");
  });

  it("NPCの上限を下げると、その分だけ枠が減る", () => {
    // 人が増えた時にNPCを減らせること。画面側は何も変えない
    const list = buildArenaCandidates([], npcs, { count: 5, selfId: "me", maxNpc: 2 });
    expect(list).toHaveLength(2);
  });

  it("並びの位置は必ず0から振り直す", () => {
    const list = buildArenaCandidates([], npcs, { count: 4, selfId: "me" });
    expect(list.map((e) => e.index)).toEqual([0, 1, 2, 3]);
  });

  it("直近リストは新しい順で、際限なく伸びない", () => {
    let recent: string[] = [];
    for (let i = 0; i < 30; i += 1) recent = rememberArenaOpponent(recent, `p${i}`);
    expect(recent[0]).toBe("p29");
    expect(recent.length).toBeLessThanOrEqual(8);
    expect(new Set(recent).size).toBe(recent.length);
  });
});

describe("防衛スナップショット", () => {
  function buildTeam() {
    const state = createInitialState();
    const instance = createMonsterInstance("slime_FIRE", 4, 30);
    const gear = generateEquipment({ slot: 1, star: 5, subStatCount: 4 });
    gear.id = "eq_original";
    instance.equipment = { 1: gear.id };
    return { state, instance, gear };
  }

  it("焼いた後に本人が装備を売っても壊れない", () => {
    /*
     * 防衛は**自分が居ない時に戦われる**。登録後に装備を外す・売る・
     * 素材にするのは普通のことで、そのたびに相手の画面で崩れてはいけない。
     */
    const { instance, gear } = buildTeam();
    const snapshot = captureArenaDefense([instance], [gear]);
    const before = snapshotToDefinitions(snapshot)[0];
    // 本人が装備を外し、売った
    instance.equipment = {};
    gear.level = 0;
    const after = snapshotToDefinitions(snapshot)[0];
    expect(after.stats).toEqual(before.stats);
    expect(snapshot.units[0].equipment).toHaveLength(1);
  });

  it("装備IDを焼き直して、手持ちのIDを指したままにしない", () => {
    // 同じIDを別の装備が取った時に中身がすり替わる
    const { instance, gear } = buildTeam();
    const snapshot = captureArenaDefense([instance], [gear]);
    const snapped = snapshot.units[0];
    expect(snapped.equipment[0].id).not.toBe("eq_original");
    expect(Object.values(snapped.instance.equipment)).toContain(snapped.equipment[0].id);
  });

  it("装備が最終ステータスへ効いている", () => {
    const { instance, gear } = buildTeam();
    const withGear = snapshotToDefinitions(captureArenaDefense([instance], [gear]))[0];
    const bare = { ...instance, equipment: {} };
    const without = snapshotToDefinitions(captureArenaDefense([bare], []))[0];
    const sum = (s: typeof withGear.stats) => s.hp / 10 + s.atk + s.def + s.spd;
    expect(sum(withGear.stats)).toBeGreaterThan(sum(without.stats));
  });

  it("図鑑から消えた1体で全体が落ちない", () => {
    // 相手の編成が1体壊れただけでアリーナ全体が開かなくなるのを防ぐ
    const { instance, gear } = buildTeam();
    const snapshot = captureArenaDefense([instance], [gear]);
    snapshot.units.push({ instance: { ...instance, dexId: "does_not_exist" }, equipment: [] });
    expect(() => snapshotToDefinitions(snapshot)).not.toThrow();
    expect(snapshotToDefinitions(snapshot)).toHaveLength(1);
  });

  it("空の防衛は候補に出さない", () => {
    expect(isUsableDefense(null)).toBe(false);
    expect(isUsableDefense(emptySnapshot())).toBe(false);
  });
});

describe("戦績とリベンジ", () => {
  it("勝てばレートもコインも増え、負けても0コインにしない", () => {
    const state = createInitialState();
    const start = state.arenaPoints;
    const win = recordArenaMatch(state, { opponent: opponent("p1", "PLAYER", start), won: true, side: "OFFENSE" });
    expect(win.ratingAfter).toBeGreaterThan(start);
    expect(state.arenaCoins).toBeGreaterThan(0);
    const coinsAfterWin = state.arenaCoins;
    recordArenaMatch(state, { opponent: opponent("p2", "PLAYER", state.arenaPoints), won: false, side: "OFFENSE" });
    expect(state.arenaCoins).toBeGreaterThan(coinsAfterWin);
  });

  it("防衛で1日に落ちるレートに上限がある", () => {
    /*
     * 寝ている間に大量に落ちる状態を避ける。
     * 上限に達した後は0にする(勝ったぶんは上限に関係なく入る)。
     */
    const state = createInitialState();
    state.arenaPoints = 2000;
    const start = state.arenaPoints;
    for (let i = 0; i < 60; i += 1) {
      recordArenaMatch(state, { opponent: opponent(`a${i}`, "PLAYER", 2000), won: false, side: "DEFENSE" });
    }
    expect(start - state.arenaPoints).toBeLessThanOrEqual(60);
  });

  it("防衛では挑戦回数を数えない", () => {
    // 自分で挑んでいない戦いが戦績を汚さない
    const state = createInitialState();
    recordArenaMatch(state, { opponent: opponent("a", "PLAYER", 1500), won: false, side: "DEFENSE" });
    expect(state.arenaSeasonBattles).toBe(0);
  });

  it("履歴は際限なく伸びない", () => {
    const state = createInitialState();
    for (let i = 0; i < 80; i += 1) {
      recordArenaMatch(state, { opponent: opponent(`p${i}`, "NPC", 1500), won: i % 2 === 0, side: "OFFENSE" });
    }
    expect(state.arenaMatchHistory.length).toBeLessThanOrEqual(30);
    expect(state.arenaMatchHistory[0].opponentName).toBe("p79");
  });

  it("リベンジは負けた防衛から1回だけ", () => {
    /*
     * 無制限に挑めると、勝てる相手を履歴から何度でも呼び出して延々狩れる。
     */
    const state = createInitialState();
    recordArenaMatch(state, { opponent: opponent("a", "PLAYER", 1500), won: false, side: "DEFENSE" });
    const record = state.arenaMatchHistory[0];
    expect(arenaRevengeBlock(record, 5)).toBeNull();
    expect(markArenaRevenged(state, record.id)).toBe(true);
    expect(arenaRevengeBlock(state.arenaMatchHistory[0], 5)).toBe("ALREADY");
    expect(markArenaRevenged(state, record.id)).toBe(false);
  });

  it("攻撃の記録や、退けた防衛からはリベンジできない", () => {
    const state = createInitialState();
    recordArenaMatch(state, { opponent: opponent("a", "NPC", 1500), won: false, side: "OFFENSE" });
    expect(arenaRevengeBlock(state.arenaMatchHistory[0], 5)).toBe("NOT_DEFENSE");
    recordArenaMatch(state, { opponent: opponent("b", "PLAYER", 1500), won: true, side: "DEFENSE" });
    expect(arenaRevengeBlock(state.arenaMatchHistory[0], 5)).toBe("WON");
  });

  it("挑戦券が無ければリベンジできない", () => {
    const state = createInitialState();
    recordArenaMatch(state, { opponent: opponent("a", "PLAYER", 1500), won: false, side: "DEFENSE" });
    expect(arenaRevengeBlock(state.arenaMatchHistory[0], 0)).toBe("NO_TICKET");
  });
});

describe("既存セーブとの互換", () => {
  it("アリーナの項目が丸ごと無い控えでも壊れない", () => {
    /*
     * 古い控えには新しい項目が1つも無い。ここで落ちると
     * **前から遊んでいる人だけがゲームを開けなくなる。**
     */
    const state = createInitialState() as unknown as Record<string, unknown>;
    for (const key of [
      "arenaCoins", "arenaDefenseSnapshot", "arenaMatchHistory", "arenaRecentOpponentIds",
      "arenaWeeklyClaimedWeek", "arenaSeasonClaimedNumber", "arenaSeasonNumber",
      "arenaShopPurchases", "arenaCosmetics", "arenaDefenseLossToday", "arenaDefenseLossDate",
    ]) delete state[key];
    expect(() => recordArenaMatch(state as never, {
      opponent: opponent("p", "NPC", 1500), won: true, side: "OFFENSE",
    })).not.toThrow();
  });
});
