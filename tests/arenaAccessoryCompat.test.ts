/**
 * **アクセサリーでアリーナを止めない。**依頼主の最重要条件(A〜O)。
 *
 * アリーナは過去に2回、サーバとクライアントの食い違いで全員が止まっている
 * (`MAIN_STAT_OVER_CAP` と `UNKNOWN_DEX_ID`)。アクセは防衛データに新しい欄を
 * 足すので、同じ種類の事故を起こしうる。ここで押さえるのは:
 *
 *   ・アクセの無い古い防衛データも、アクセの有る新しい防衛データも、どの組み合わせでも戦える
 *   ・欄が無い / null / 壊れた値 / 存在しないID は「着けていない」になるだけで、例外は出ない
 *   ・登録後に売っても、付け替えても、強化しても、登録した時の姿のまま(焼き付け)
 *   ・古い控えを読み込んだだけで、登録し直さずに戦える
 *   ・画面の戦闘とサーバの精算(`arena-settle` と同じ組み立て)が同じ結末になる
 *   ・勝敗・レート・コイン・挑戦券の反映はアクセの有無で壊れない
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { BattleEngine, type BattleResult } from "../src/battle/engine.js";
import { generateAccessory, type Accessory } from "../src/core/accessory.js";
import { generateEquipment, type Equipment, type EquipSlot } from "../src/core/equipment.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { createMonsterInstance, toBattleDefinition, resolveEquippedItems, type MonsterInstance } from "../src/core/monsterInstance.js";
import { findMonsterById } from "../src/data/monsters.js";
import { ARENA_BATTLE_OPTIONS, arenaCompressedSpeed } from "../src/data/pvpArena.js";
import { arenaNpcRng } from "../src/game/arena/npc.js";
import { captureArenaDefense, snapshotToDefinitions, isUsableDefense } from "../src/game/arena/snapshot.js";
import type { ArenaDefenseSnapshot, ArenaOpponentEntry } from "../src/game/arena/types.js";
import { recordArenaMatch } from "../src/game/arena/match.js";
import { buildArenaEntryBattle } from "../src/web/views/arena/model.js";
import { addAccessory, equipAccessory, sellAccessory, tryEnhanceAccessory, unequipAccessory } from "../src/game/accessories.js";
import { createInitialState, normalizeLoadedState, type PlayerState } from "../src/game/playerState.js";
import { decodeSave, encodeSave } from "../src/game/saveCodec.js";
import { configureArenaSync, fetchArenaOpponents, beginArenaMatch } from "../src/net/arenaSync.js";

function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEX = ["knight_FIRE", "wolf_WATER", "fairy_LIGHT", "imp_DARK", "golem_GRASS"];

/** ★6 Lv60・装備6枠の育った個体 */
function grown(dexId: string, seed: number): { instance: MonsterInstance; gear: Equipment[] } {
  const instance = createMonsterInstance(dexId, 6, 60);
  const r = rng(seed);
  const gear = ([1, 2, 3, 4, 5, 6] as EquipSlot[]).map((slot) => {
    const item = generateEquipment({ star: 6, slot, subStatCount: 4, rng: r });
    item.level = 15;
    return item;
  });
  for (const item of gear) instance.equipment[item.slot] = item.id;
  return { instance, gear };
}

function accessoryFor(seed: number, family: Accessory["family"] = "ATTACK"): Accessory {
  const acc = generateAccessory({ star: 6, rarity: "EPIC", family, rng: rng(seed) });
  acc.level = 15;
  return acc;
}

/** プレイヤー1人分。`withAccessories` なら全員にアクセを着ける */
function player(withAccessories: boolean, seedBase = 1): PlayerState {
  const state = createInitialState();
  state.monsters = [];
  state.equipment = [];
  DEX.slice(0, 4).forEach((dexId, i) => {
    const { instance, gear } = grown(dexId, seedBase * 100 + i);
    state.monsters.push(instance);
    state.equipment.push(...gear);
    if (withAccessories) {
      const acc = accessoryFor(seedBase * 1000 + i, (["ATTACK", "DURABILITY", "SUPPORT", "DISRUPT"] as const)[i]);
      addAccessory(state, acc);
      equipAccessory(state, instance.id, acc.id);
    }
  });
  return state;
}

function snapshotOf(state: PlayerState): ArenaDefenseSnapshot {
  return captureArenaDefense(state.monsters.slice(0, 4), state.equipment, 1_700_000_000_000, state.accessories ?? []);
}

/** アクセ実装前の形。**`accessory` の欄そのものが無い** */
function legacySnapshot(state: PlayerState): ArenaDefenseSnapshot {
  const snap = captureArenaDefense(state.monsters.slice(0, 4), state.equipment, 1_700_000_000_000);
  for (const unit of snap.units) {
    delete (unit as { accessory?: unknown }).accessory;
    delete (unit.instance as { accessoryId?: unknown }).accessoryId;
  }
  return snap;
}

function withArenaSpeed(def: MonsterDefinition): MonsterDefinition {
  return { ...def, stats: { ...def.stats, spd: arenaCompressedSpeed(def.stats.spd) } };
}

/** `supabase/functions/arena-settle/index.ts` と同じ組み立てで回す */
function settleLikeServer(attacker: ArenaDefenseSnapshot, defender: ArenaDefenseSnapshot, seed: number): BattleResult {
  const attackers = snapshotToDefinitions(attacker).map(withArenaSpeed);
  const defenders = snapshotToDefinitions(defender).map(withArenaSpeed);
  // サーバは `seededRng` を独自に持つが、式は `arenaNpcRng` と同じ(ファイル冒頭の注記)
  return new BattleEngine(attackers, defenders, { ...ARENA_BATTLE_OPTIONS, rng: arenaNpcRng(seed | 0) }).run();
}

function entryOf(defense: ArenaDefenseSnapshot, rating = 1500): ArenaOpponentEntry {
  return { index: 0, kind: "PLAYER", id: "rival", name: "rival", rating, tierId: "SILVER_3", defense };
}

/** 画面側の組み立て(`main.ts` の `renderArenaBattle` と同じ)で回す */
function playLikeClient(me: PlayerState, defense: ArenaDefenseSnapshot, seed: number): BattleResult {
  const attackerSnapshot = snapshotOf(me);
  const setup = buildArenaEntryBattle(me.monsters.slice(0, 4), entryOf(defense), me.equipment, attackerSnapshot, me.accessories ?? []);
  return new BattleEngine(setup.playerDefs, setup.enemyDefs, { ...ARENA_BATTLE_OPTIONS, rng: arenaNpcRng(seed | 0) }).run();
}

function sameOutcome(a: BattleResult, b: BattleResult): void {
  expect(a.winner).toBe(b.winner);
  expect(a.turnsTaken).toBe(b.turnsTaken);
  expect(a.log.join("\n")).toBe(b.log.join("\n"));
}

describe("アリーナ互換 A〜F: 旧形式・新形式のどの組み合わせでも戦える", () => {
  it("A: アクセ実装前の防衛データ vs アクセを着けたプレイヤー", () => {
    const rival = legacySnapshot(player(false, 2));
    const me = player(true, 1);
    expect(isUsableDefense(rival)).toBe(true);
    const client = playLikeClient(me, rival, 11);
    const server = settleLikeServer(snapshotOf(me), rival, 11);
    sameOutcome(client, server);
    expect(["PLAYER", "ENEMY", "DRAW"]).toContain(server.winner);
  });

  it("B: アクセ無し同士は、アクセの仕組みを一切通らない(実装前と同じ定義・同じ経過)", () => {
    const me = player(false, 3);
    const rival = player(false, 4);
    const defs = snapshotToDefinitions(snapshotOf(rival));
    // 焼き付けから戻した定義は、アクセ引数なしの従来の計算と完全に一致する
    rival.monsters.slice(0, 4).forEach((instance, i) => {
      const legacy = toBattleDefinition(instance, findMonsterById(instance.dexId)!, resolveEquippedItems(instance, rival.equipment));
      expect(defs[i].stats).toEqual(legacy.stats);
      expect(defs[i].combatMods).toEqual(legacy.combatMods);
      expect(defs[i].skills).toEqual(legacy.skills);
      expect(defs[i].accessory).toBeUndefined();
    });
    // 旧形式と新形式(アクセ欄なし)は同じ戦いになる
    sameOutcome(settleLikeServer(snapshotOf(me), snapshotOf(rival), 5), settleLikeServer(legacySnapshot(me), legacySnapshot(rival), 5));
    sameOutcome(playLikeClient(me, snapshotOf(rival), 5), settleLikeServer(snapshotOf(me), snapshotOf(rival), 5));
  });

  it("C: アクセ有り(攻撃側) vs アクセ無し(防衛側)", () => {
    const me = player(true, 5);
    const rival = snapshotOf(player(false, 6));
    sameOutcome(playLikeClient(me, rival, 21), settleLikeServer(snapshotOf(me), rival, 21));
  });

  it("D: アクセ無し(攻撃側) vs アクセ有り(防衛側)", () => {
    const me = player(false, 7);
    const rival = snapshotOf(player(true, 8));
    expect(rival.units.every((u) => u.accessory)).toBe(true);
    sameOutcome(playLikeClient(me, rival, 31), settleLikeServer(snapshotOf(me), rival, 31));
  });

  it("E: アクセ有り同士。同じ種なら何度回しても同じ結末", () => {
    const me = player(true, 9);
    const rival = snapshotOf(player(true, 10));
    for (const seed of [1, 2, 3, 4, 5]) {
      const a = settleLikeServer(snapshotOf(me), rival, seed);
      const b = settleLikeServer(snapshotOf(me), rival, seed);
      sameOutcome(a, b);
      sameOutcome(playLikeClient(me, rival, seed), a);
    }
  });

  it("F: 防衛4体すべてがアクセを着けていても組み立てられ、効き目が乗る", () => {
    const state = player(true, 12);
    const snap = snapshotOf(state);
    expect(snap.units).toHaveLength(4);
    const defs = snapshotToDefinitions(snap);
    expect(defs).toHaveLength(4);
    const bare = snapshotToDefinitions(legacySnapshot(state));
    defs.forEach((def, i) => {
      const acc = snap.units[i].accessory!;
      const key = acc.mainStat === "HP" ? "hp" : acc.mainStat === "ATK" ? "atk" : "def";
      expect(def.stats[key]).toBeGreaterThan(bare[i].stats[key]);
    });
  });
});

describe("アリーナ互換 G〜I: 読めないアクセは「着けていない」", () => {
  function patched(value: unknown): ArenaDefenseSnapshot {
    const snap = snapshotOf(player(true, 13));
    for (const unit of snap.units) (unit as { accessory?: unknown }).accessory = value;
    return snap;
  }

  it("G: accessory が undefined", () => {
    const snap = patched(undefined);
    expect(() => snapshotToDefinitions(snap)).not.toThrow();
    expect(snapshotToDefinitions(snap)).toHaveLength(4);
    expect(snapshotToDefinitions(snap).every((d) => d.accessory === undefined)).toBe(true);
  });

  it("H: accessory が null", () => {
    const snap = patched(null);
    expect(snapshotToDefinitions(snap)).toHaveLength(4);
    sameOutcome(settleLikeServer(snapshotOf(player(false, 14)), snap, 3), settleLikeServer(snapshotOf(player(false, 14)), legacySnapshot(player(true, 13)), 3));
  });

  it("I: 存在しないアクセID・壊れた値でも落ちない", () => {
    // 手持ち側: 持ち物に無いIDを指している個体を登録する
    const state = player(false, 15);
    state.monsters[0].accessoryId = "acc_does_not_exist";
    const snap = snapshotOf(state);
    expect(snap.units[0].accessory).toBeUndefined();
    expect(snap.units[0].instance.accessoryId).toBeUndefined();
    // 防衛データ側: 形の壊れた値・範囲外の値・文字列
    for (const broken of [{ id: "x" }, "acc_1", 42, [], { star: 9, rarity: "EPIC" }, { star: 6, rarity: "EPIC", family: "ATTACK", mainStat: "ATK", level: "a", specials: "?" }]) {
      const s = patched(broken);
      expect(() => snapshotToDefinitions(s)).not.toThrow();
      expect(snapshotToDefinitions(s)).toHaveLength(4);
    }
    // 範囲を超えた値は正規の上限に収まる(照合表はアクセを見ていないため)
    const cheat = snapshotOf(player(true, 16));
    const honest = snapshotToDefinitions(cheat)[0];
    const acc = cheat.units[0].accessory!;
    acc.mainRoll = 999; acc.level = 999;
    acc.specials = acc.specials.map((sp) => ({ ...sp, value: 50 }));
    const clamped = snapshotToDefinitions(cheat)[0];
    const key = acc.mainStat === "HP" ? "hp" : acc.mainStat === "ATK" ? "atk" : "def";
    expect(clamped.stats[key]).toBeLessThan(honest.stats[key] * 1.6);
  });
});

describe("アリーナ互換 J〜L: 登録後に何をしても、登録した時の姿のまま", () => {
  function registered(): { state: PlayerState; snap: ArenaDefenseSnapshot; defs: MonsterDefinition[] } {
    const state = player(true, 17);
    const snap = snapshotOf(state);
    const stored = JSON.parse(JSON.stringify(snap)) as ArenaDefenseSnapshot;
    return { state, snap: stored, defs: snapshotToDefinitions(stored) };
  }

  it("J: 登録後にアクセを外して売っても、防衛は変わらない", () => {
    const { state, snap, defs } = registered();
    const accId = state.monsters[0].accessoryId!;
    unequipAccessory(state, state.monsters[0].id);
    expect(sellAccessory(state, accId).ok).toBe(true);
    expect(snapshotToDefinitions(snap)).toEqual(defs);
    expect(snap.units[0].accessory?.id).toBe("snap0_acc");
  });

  it("K: 登録後に別のモンスターへ付け替えても、防衛は変わらない", () => {
    const { state, snap, defs } = registered();
    const accId = state.monsters[0].accessoryId!;
    equipAccessory(state, state.monsters[1].id, accId);
    expect(state.monsters[0].accessoryId).toBeNull();
    expect(snapshotToDefinitions(snap)).toEqual(defs);
  });

  it("L: 登録後に強化しても、登録した時のLvのまま(焼き付けの仕様)。登録し直すと新しいLvになる", () => {
    const state = player(true, 18);
    const acc = state.accessories![0];
    acc.level = 5;
    const snap = snapshotOf(state);
    const before = snapshotToDefinitions(snap)[0];
    state.gold = 10_000_000;
    expect(tryEnhanceAccessory(state, acc.id).ok).toBe(true);
    expect(acc.level).toBe(6);
    expect(snap.units[0].accessory!.level).toBe(5);
    expect(snapshotToDefinitions(snap)[0]).toEqual(before);
    const again = snapshotOf(state);
    expect(again.units[0].accessory!.level).toBe(6);
  });
});

describe("アリーナ互換 M〜O: 古い控え・ランキングの古い相手・精算", () => {
  afterEach(() => configureArenaSync(null));

  it("M: 古い控え(アクセの項目が1つも無い)を読み込んで、登録し直さずに戦える", () => {
    const old = player(false, 19);
    old.arenaDefenseSnapshot = legacySnapshot(old);
    const raw = JSON.parse(encodeSave(old));
    // アクセ実装前の控えには、どの項目も存在しない
    for (const key of ["accessories", "ancientShards", "evolutionCores", "clearedPowerRuinFloors", "clearedGuardianRuinFloors"]) delete raw.s[key];
    const loaded = normalizeLoadedState(decodeSave(JSON.stringify(raw))!);
    expect(loaded.accessories).toEqual([]);
    expect(loaded.ancientShards).toBe(0);
    expect(loaded.evolutionCores).toBe(0);
    expect(loaded.monsters.every((m) => m.accessoryId === undefined || m.accessoryId === null)).toBe(true);
    expect(isUsableDefense(loaded.arenaDefenseSnapshot)).toBe(true);
    const rival = snapshotOf(player(true, 20));
    sameOutcome(playLikeClient(loaded, rival, 41), settleLikeServer(snapshotOf(loaded), rival, 41));
    // 自分の古い防衛を相手にしても戦える
    sameOutcome(settleLikeServer(rival, loaded.arenaDefenseSnapshot!, 42), settleLikeServer(rival, loaded.arenaDefenseSnapshot!, 42));
  });

  it("N: ランキングから古い相手(アクセ欄なし)を選んで対戦を始められる", async () => {
    const oldDefense = legacySnapshot(player(false, 21));
    const row = { user_id: "old-user", display_name: "古参", rating: 1500, tier_id: "SILVER_3", snapshot: oldDefense, unit_count: 4, captured_at: "2026-01-01T00:00:00Z" };
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("arena_opponent_pool")) return { ok: true, status: 200, json: async () => [row] };
      return {
        ok: true, status: 200,
        json: async () => ({ ok: true, matchId: "m1", nonce: "n1", battleSeed: 77, defenderSnapshot: oldDefense, defenderRating: 1500, attackerRating: 1500, tickets: 4 }),
      };
    });
    configureArenaSync({ url: "https://example.invalid", anonKey: "anon", fetchImpl: fetchImpl as unknown as typeof fetch });
    const [entry] = await fetchArenaOpponents("me", 1500);
    expect(entry?.id).toBe("old-user");
    expect(isUsableDefense(entry.defense)).toBe(true);
    const me = player(true, 22);
    const begun = await beginArenaMatch({ kind: "PLAYER", attackerSnapshot: snapshotOf(me), opponentId: entry.id });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    const defense = begun.ticket.defenderSnapshot!;
    sameOutcome(playLikeClient(me, defense, begun.ticket.battleSeed), settleLikeServer(snapshotOf(me), defense, begun.ticket.battleSeed));
  });

  it("O: 決着後の勝敗・レート・コイン・挑戦券はアクセの有無で壊れない", () => {
    for (const withAcc of [false, true]) {
      const me = player(withAcc, 23);
      me.arenaPoints = 1500;
      me.arenaTickets = 5;
      const coinsBefore = me.arenaCoins;
      const rival = snapshotOf(player(!withAcc, 24));
      const result = settleLikeServer(snapshotOf(me), rival, 51);
      const won = result.winner === "PLAYER";
      const outcome = recordArenaMatch(me, { opponent: entryOf(rival, 1500), won, side: "OFFENSE", now: 1_800_000_000_000 });
      expect(outcome.record.won).toBe(won);
      expect(me.arenaPoints).toBe(outcome.ratingAfter);
      expect(Math.sign(outcome.ratingAfter - outcome.ratingBefore)).toBe(won ? 1 : -1);
      expect(me.arenaCoins).toBeGreaterThanOrEqual(coinsBefore);
      // 挑戦券はサーバが引く(`arena_begin_match`)。精算で手元の券を二重に動かさない
      expect(me.arenaTickets).toBe(5);
      expect(me.arenaMatchHistory[0].won).toBe(won);
    }
  });
});

describe("サーバの検分(SQL)はアクセの欄で登録・対戦を断らない", () => {
  it("最新の arena__validate_snapshot は1体の欄を列挙で縛らず、版の上限は1のまま", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = new URL("../supabase/migrations/", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const defining = files.filter((f) => readFileSync(new URL(f, dir), "utf8").includes("function public.arena__validate_snapshot"));
    const latest = readFileSync(new URL(defining.at(-1)!, dir), "utf8");
    const body = latest.slice(latest.indexOf("function public.arena__validate_snapshot"));
    // 欄の一覧で縛る書き方(未知の欄を拒む)をしていない
    expect(body).not.toMatch(/jsonb_object_keys\s*\(\s*v_unit/);
    expect(body).not.toMatch(/jsonb_object_keys\s*\(\s*v_inst/);
    expect(body).not.toMatch(/accessory/i);
    // 焼き付けの版は上げていない(上げると `max_version: 1` のサーバに弾かれる)
    const { ARENA_SNAPSHOT_VERSION } = await import("../src/game/arena/types.js");
    expect(ARENA_SNAPSHOT_VERSION).toBe(1);
  });
});
