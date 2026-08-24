import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import {
  ARENA_K_FACTOR,
  ARENA_MIN_LOSS,
  ARENA_MIN_WIN_GAIN,
  ARENA_OPPONENT_COUNT,
  ARENA_RANKS,
  ARENA_SPEED_PIVOT,
  ARENA_START_POINTS,
  ARENA_TICKET_MAX,
  ARENA_TICKET_REGEN_MINUTES,
  arenaCompressedSpeed,
  arenaPeriodKey,
  arenaRankForPoints,
} from "../src/data/pvpArena.js";
import {
  ARENA_TEAM_SIZE,
  applyArenaTicketRegen,
  arenaPointDelta,
  generateArenaOpponents,
  resolveArenaMatch,
  setupArenaBattle,
  toggleArenaTeamMember,
  trySpendArenaTicket,
} from "../src/game/pvpArena.js";
import { createInitialState } from "../src/game/playerState.js";
import { applyEquipmentToStats } from "../src/core/equipment.js";
import { computeEffectiveStats } from "../src/core/rarity.js";
import { resolveEquippedItems } from "../src/core/monsterInstance.js";
import { findMonsterById } from "../src/data/monsters.js";

/** 装備のidは生成のたびに変わるので、中身を比べる時は取り除く */
function withoutIds(value: unknown): string {
  return JSON.stringify(value).replace(/"id":"[^"]*"/g, '"id":"-"');
}

/**
 * アリーナ(対人戦)。
 *
 * 実際の通信はしないので、挑戦相手はプレイヤーの点数帯から生成した擬似プレイヤー。
 * ここで守りたいのは「同じ点数なら同じ手応えの相手が出る」「勝ち負けで点が正しく動く」
 * 「速度を詰めただけで一方的にならない」の3つ。
 */

describe("階級と点数", () => {
  it("階級は点数の順に並び、隙間なくつながっている", () => {
    for (let i = 1; i < ARENA_RANKS.length; i++) {
      expect(ARENA_RANKS[i].minPoints, ARENA_RANKS[i].name).toBeGreaterThan(ARENA_RANKS[i - 1].minPoints);
    }
    // どの点数でも必ずどこかの階級に入る(最下位は下限なしで受け止める)
    for (const points of [0, 1, 500, ARENA_START_POINTS, 99999]) {
      expect(arenaRankForPoints(points), String(points)).toBeDefined();
    }
  });

  it("格上に勝つほど大きく上がり、格下に勝っても伸びは小さい", () => {
    const vsStronger = arenaPointDelta(1000, 1400, true);
    const vsEqual = arenaPointDelta(1000, 1000, true);
    const vsWeaker = arenaPointDelta(1000, 600, true);
    expect(vsStronger).toBeGreaterThan(vsEqual);
    expect(vsEqual).toBeGreaterThan(vsWeaker);
  });

  it("**同じ相手を刈り続けても上のランクへは行けない**", () => {
    // 格下狩りだけで上がれると、編成を鍛える理由がなくなる
    expect(arenaPointDelta(2000, 600, true)).toBe(ARENA_MIN_WIN_GAIN);
  });

  it("勝てば必ず増え、負ければ必ず減る(0や逆方向にならない)", () => {
    for (const [mine, theirs] of [[1000, 1000], [400, 2600], [2600, 400], [1, 1]]) {
      expect(arenaPointDelta(mine, theirs, true), `勝ち ${mine}vs${theirs}`).toBeGreaterThanOrEqual(ARENA_MIN_WIN_GAIN);
      expect(arenaPointDelta(mine, theirs, false), `負け ${mine}vs${theirs}`).toBeLessThanOrEqual(-ARENA_MIN_LOSS);
    }
  });

  it("増減の幅はK係数を超えない(1戦で階級が飛ばない)", () => {
    for (const [mine, theirs] of [[1000, 3000], [3000, 1000]]) {
      expect(Math.abs(arenaPointDelta(mine, theirs, true))).toBeLessThanOrEqual(ARENA_K_FACTOR);
      expect(Math.abs(arenaPointDelta(mine, theirs, false))).toBeLessThanOrEqual(ARENA_K_FACTOR);
    }
  });
});

describe("速度の圧縮", () => {
  /*
   * 装備の副効果を速度に寄せると300を超え、対人だと一方的に何度も動ける。
   * かといって速度を無効にすると、速度という育て方そのものが死ぬ。
   * 基準値へ向けて縮めるだけにして「速い方が先に動く、ただし一方的にはならない」に落とす。
   */
  it("速い方が速いままである(順序は入れ替わらない)", () => {
    const speeds = [80, 110, 150, 220, 310];
    const compressed = speeds.map(arenaCompressedSpeed);
    for (let i = 1; i < compressed.length; i++) {
      expect(compressed[i], String(speeds[i])).toBeGreaterThan(compressed[i - 1]);
    }
  });

  it("**速度差そのものは必ず縮む**", () => {
    const before = 310 / 80;
    const after = arenaCompressedSpeed(310) / arenaCompressedSpeed(80);
    expect(after).toBeLessThan(before);
  });

  it("基準値の速度は変わらない", () => {
    expect(arenaCompressedSpeed(ARENA_SPEED_PIVOT)).toBe(ARENA_SPEED_PIVOT);
  });

  it("圧縮しても1未満にはならない(手番が永久に回らなくなる)", () => {
    expect(arenaCompressedSpeed(1)).toBeGreaterThanOrEqual(1);
  });

  it("**圧縮は両陣営に同じ式で掛かる**(片方だけだと単なる有利不利になる)", () => {
    const state = createInitialState();
    const party = ["griffon_GRASS", "dragon_FIRE", "seraph_WATER", "nemesis_ELECTRIC"].map((id) =>
      createMonsterInstance(id, 5, 50),
    );
    const [opponent] = generateArenaOpponents(ARENA_START_POINTS, 7, 1);
    const setup = setupArenaBattle(party, opponent, state.equipment);

    // 味方側: 素の実効速度を自分で計算して、圧縮後の値と突き合わせる
    party.forEach((instance, i) => {
      const dex = findMonsterById(instance.dexId)!;
      const growth = computeEffectiveStats(dex.stats, instance.star, instance.level);
      const raw = applyEquipmentToStats(growth, resolveEquippedItems(instance, state.equipment)).spd;
      expect(setup.playerDefs[i].stats.spd, dex.name).toBe(arenaCompressedSpeed(raw));
    });

    // 敵側: 同じ式が掛かっていること。素の速度より必ず基準値へ寄っている
    setup.enemyDefs.forEach((def) => {
      const distance = Math.abs(def.stats.spd - ARENA_SPEED_PIVOT);
      expect(distance, def.name).toBeLessThanOrEqual(Math.abs(arenaCompressedSpeed(400) - ARENA_SPEED_PIVOT));
    });
  });
});

describe("挑戦相手の生成", () => {
  it("**同じ点数と同じ種なら、同じ相手が出る**(結果が再現できる)", () => {
    // 装備のidだけは生成ごとに変わる。見たいのは顔ぶれとステータスが同じかどうか
    expect(withoutIds(generateArenaOpponents(1500, 42))).toBe(withoutIds(generateArenaOpponents(1500, 42)));
  });

  it("種が変われば別の顔ぶれになる", () => {
    expect(withoutIds(generateArenaOpponents(1500, 1))).not.toBe(withoutIds(generateArenaOpponents(1500, 2)));
  });

  it("勝てる相手・互角・格上が並ぶ(選ぶ操作に意味を持たせる)", () => {
    const opponents = generateArenaOpponents(1500, 3);
    expect(opponents).toHaveLength(ARENA_OPPONENT_COUNT);
    const points = opponents.map((o) => o.points);
    expect(Math.min(...points)).toBeLessThan(1500);
    expect(Math.max(...points)).toBeGreaterThan(1500);
  });

  it("どの相手も4体そろっていて、装備も着けている", () => {
    for (const opponent of generateArenaOpponents(2200, 9)) {
      expect(opponent.units, opponent.name).toHaveLength(ARENA_TEAM_SIZE);
      for (const unit of opponent.units) {
        expect(unit.equipment.length, `${opponent.name} ${unit.dexId}`).toBeGreaterThan(0);
      }
    }
  });

  it("**点数帯が上がるほど相手は強くなる**", () => {
    const strength = (points: number) =>
      generateArenaOpponents(points, 5).reduce(
        (sum, o) => sum + o.units.reduce((s, u) => s + u.star * 100 + u.level + u.equipment.length * 10, 0),
        0,
      );
    expect(strength(3000)).toBeGreaterThan(strength(1000));
  });

  it("生成した相手は実際に戦える(組み立てて決着まで進む)", () => {
    const state = createInitialState();
    const party = ["griffon_GRASS", "dragon_FIRE", "seraph_WATER", "nemesis_ELECTRIC"].map((id) =>
      createMonsterInstance(id, 5, 50),
    );
    for (const opponent of generateArenaOpponents(1800, 11)) {
      const setup = setupArenaBattle(party, opponent, state.equipment);
      const result = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng: () => 0.5 }).run();
      expect(["PLAYER", "ENEMY", "DRAW"], opponent.name).toContain(result.winner);
      expect(result.turnsTaken, opponent.name).toBeGreaterThan(0);
    }
  });
});

describe("挑戦券", () => {
  it("使うと減り、満タンでは増えない", () => {
    const state = createInitialState();
    expect(state.arenaTickets).toBe(ARENA_TICKET_MAX);
    expect(trySpendArenaTicket(state).ok).toBe(true);
    expect(state.arenaTickets).toBe(ARENA_TICKET_MAX - 1);
  });

  it("0枚なら挑めない", () => {
    const state = createInitialState();
    state.arenaTickets = 0;
    state.lastArenaTicketUpdateAt = Date.now();
    expect(trySpendArenaTicket(state).ok).toBe(false);
  });

  it("時間で回復し、上限を超えない", () => {
    const state = createInitialState();
    const now = Date.now();
    state.arenaTickets = 0;
    state.lastArenaTicketUpdateAt = now;
    applyArenaTicketRegen(state, now + ARENA_TICKET_REGEN_MINUTES * 60_000 * 2);
    expect(state.arenaTickets).toBe(2);
    applyArenaTicketRegen(state, now + ARENA_TICKET_REGEN_MINUTES * 60_000 * 999);
    expect(state.arenaTickets).toBe(ARENA_TICKET_MAX);
  });

  it("**満タンで放置しても、使った瞬間にまとめて回復しない**", () => {
    // 基準時刻を更新し忘れると、満タンで数日放置→1枚使う→即満タン、になる
    const state = createInitialState();
    const now = Date.now();
    state.lastArenaTicketUpdateAt = now;
    applyArenaTicketRegen(state, now + ARENA_TICKET_REGEN_MINUTES * 60_000 * 100);
    trySpendArenaTicket(state, now + ARENA_TICKET_REGEN_MINUTES * 60_000 * 100);
    expect(state.arenaTickets).toBe(ARENA_TICKET_MAX - 1);
  });
});

describe("編成", () => {
  it("防衛と攻撃は別枠(攻めに強い編成がそのまま守りにもならない)", () => {
    const state = createInitialState();
    const id = state.monsters[0].id;
    toggleArenaTeamMember(state, "DEFENSE", id);
    expect(state.arenaDefenseIds).toContain(id);
    expect(state.arenaOffenseIds).not.toContain(id);
  });

  it("上限を超えて入らない", () => {
    const state = createInitialState();
    for (let i = 0; i < 8; i++) {
      state.monsters.push(createMonsterInstance("slime_FIRE", 1, 1));
    }
    for (const m of state.monsters) toggleArenaTeamMember(state, "OFFENSE", m.id);
    expect(state.arenaOffenseIds.length).toBeLessThanOrEqual(ARENA_TEAM_SIZE);
  });

  it("もう一度押すと外れる", () => {
    const state = createInitialState();
    const id = state.monsters[0].id;
    toggleArenaTeamMember(state, "OFFENSE", id);
    toggleArenaTeamMember(state, "OFFENSE", id);
    expect(state.arenaOffenseIds).not.toContain(id);
  });
});

describe("対戦の決着", () => {
  it("**報酬は勝った時だけ**(わざと負けて回すのが最短の稼ぎにならない)", () => {
    const state = createInitialState();
    const [opponent] = generateArenaOpponents(state.arenaPoints, 1, 1);
    const goldBefore = state.gold;
    const lost = resolveArenaMatch(state, opponent, false, () => 0.5);
    expect(lost.goldEarned).toBe(0);
    expect(lost.crystalEarned).toBe(0);
    expect(state.gold).toBe(goldBefore);

    const won = resolveArenaMatch(state, opponent, true, () => 0.5);
    expect(won.goldEarned).toBeGreaterThan(0);
    expect(state.gold).toBeGreaterThan(goldBefore);
  });

  it("点数は0未満にならない", () => {
    const state = createInitialState();
    state.arenaPoints = 1;
    const [opponent] = generateArenaOpponents(1, 1, 1);
    resolveArenaMatch(state, opponent, false, () => 0.5);
    expect(state.arenaPoints).toBeGreaterThanOrEqual(0);
  });

  it("今期の最高点は下がらない(下振れしても期間報酬を取り上げない)", () => {
    const state = createInitialState();
    const [opponent] = generateArenaOpponents(state.arenaPoints, 1, 1);
    resolveArenaMatch(state, opponent, true, () => 0.5);
    const best = state.arenaSeasonBestPoints;
    for (let i = 0; i < 5; i++) resolveArenaMatch(state, opponent, false, () => 0.5);
    expect(state.arenaSeasonBestPoints).toBe(best);
    expect(state.arenaPoints).toBeLessThan(best);
  });

  it("対戦数と勝利数が記録される", () => {
    const state = createInitialState();
    const [opponent] = generateArenaOpponents(state.arenaPoints, 1, 1);
    resolveArenaMatch(state, opponent, true, () => 0.5);
    resolveArenaMatch(state, opponent, false, () => 0.5);
    expect(state.arenaSeasonBattles).toBe(2);
    expect(state.arenaSeasonWins).toBe(1);
  });
});

describe("期間", () => {
  it("同じ週なら同じ識別子、週をまたぐと変わる", () => {
    const now = Date.UTC(2026, 0, 5, 12, 0, 0);
    expect(arenaPeriodKey(now)).toBe(arenaPeriodKey(now + 60_000));
    expect(arenaPeriodKey(now + 8 * 24 * 60 * 60 * 1000)).not.toBe(arenaPeriodKey(now));
  });
});
