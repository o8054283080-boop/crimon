import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/playerState.js";
import {
  claimCumulativeMission,
  claimPeriodClear,
  getCumulativeMissionViews,
  getPeriodMissionView,
  missionRewardText,
  missionStateFor,
} from "../src/game/missions.js";
import { REINCARNATION_PIG, findMonsterById } from "../src/data/monsters.js";
import { STAR_MAX_LEVEL } from "../src/core/rarity.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { findAwakeningDepthFloor, grantAwakeningDepthReward } from "../src/game/awakeningDepths.js";
import { resetTalents, unlockTalentPoint } from "../src/game/talents.js";

const NOW = new Date("2026-09-01T00:30:00.000Z"); // JST 2026-09-01 09:30

function cumulative(player: ReturnType<typeof createInitialState>, key: string) {
  const view = getCumulativeMissionViews(player, NOW).find((mission) => mission.key === key);
  if (!view) throw new Error(`累計ミッションが見つかりません: ${key}`);
  return view;
}

describe("デイリー・ウィークリー・マンスリーミッション", () => {
  it("デイリーは全部ではなく4個達成でクリア報酬を受け取れる", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    // 初回同期でログイン1個が達成されるので、他に3条件を進めれば4個到達する。
    state.counters.levelsGained = 5;
    state.counters.shopPurchases = 1;
    state.counters.equipmentEnhancements = 3;
    const view = getPeriodMissionView(player, "DAILY", NOW);
    expect(view.completedCount).toBe(4);
    expect(view.missions).toHaveLength(6);
    expect(view.canClaimClear).toBe(true);
  });

  it("週間は6個、月間は7個でクリア扱いになる", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    Object.assign(state.counters, {
      loginDays: 25,
      levelsGained: 500,
      staminaSpent: 3_000,
      arenaBattles: 100,
      equipmentEnhancements: 100,
      shopPurchases: 30,
      rankUps: 10,
      summons: 100,
      star6Raised: 2,
    });
    const weekly = getPeriodMissionView(player, "WEEKLY", NOW);
    const monthly = getPeriodMissionView(player, "MONTHLY", NOW);
    expect(weekly.completedCount).toBeGreaterThanOrEqual(6);
    expect(weekly.requiredCount).toBe(6);
    expect(monthly.completedCount).toBeGreaterThanOrEqual(7);
    expect(monthly.requiredCount).toBe(7);
  });

  it("週間クリア報酬の覚醒オーブは1個で二重受取できない", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    Object.assign(state.counters, {
      loginDays: 5,
      levelsGained: 100,
      staminaSpent: 500,
      arenaBattles: 20,
      equipmentEnhancements: 20,
      shopPurchases: 10,
    });
    const before = player.awakeningOrbs;
    expect(claimPeriodClear(player, "WEEKLY", NOW)?.awakeningOrbs).toBe(1);
    expect(player.awakeningOrbs).toBe(before + 1);
    expect(claimPeriodClear(player, "WEEKLY", NOW)).toBeNull();
    expect(player.awakeningOrbs).toBe(before + 1);
  });

  it("デイリークリア報酬の★3転生ピッグはMAXレベルで入手する", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    Object.assign(state.counters, { levelsGained: 5, shopPurchases: 1, equipmentEnhancements: 3 });
    expect(claimPeriodClear(player, "DAILY", NOW)).not.toBeNull();
    const pig = player.monsters.find((monster) => findMonsterById(monster.dexId)?.templateId === REINCARNATION_PIG.templateId);
    expect(pig?.star).toBe(3);
    expect(pig?.level).toBe(STAR_MAX_LEVEL[3]);
  });
});

describe("上限なし累計ミッション", () => {
  it("召喚は500回の次から100回ごとに続く", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    state.cumulative.summons = { lastClaimedTarget: 500 };
    expect(cumulative(player, "summons").target).toBe(600);
    state.cumulative.summons.lastClaimedTarget = 600;
    expect(cumulative(player, "summons").target).toBe(700);
  });

  it("指定された短い間隔で次の累計目標が続く", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    state.cumulative.levels = { lastClaimedTarget: 500 };
    state.cumulative.rankups = { lastClaimedTarget: 25 };
    state.cumulative.star6 = { lastClaimedTarget: 25 };
    state.cumulative.arena = { lastClaimedTarget: 150 };
    state.cumulative.equipment = { lastClaimedTarget: 200 };
    expect(cumulative(player, "levels").target).toBe(1_000);
    expect(cumulative(player, "rankups").target).toBe(50);
    expect(cumulative(player, "star6").target).toBe(35);
    expect(cumulative(player, "arena").target).toBe(300);
    expect(cumulative(player, "equipment").target).toBe(400);
  });

  it("★6育成は25体以降10体ごと、50体ごとの大台報酬は別に続く", () => {
    const player = createInitialState();
    const state = missionStateFor(player, NOW);
    state.cumulative.star6 = { lastClaimedTarget: 25 };
    state.cumulative["star6-milestone"] = { lastClaimedTarget: 0 };
    expect(cumulative(player, "star6").target).toBe(35);
    expect(cumulative(player, "star6-milestone").target).toBe(50);
  });
});

/*
 * 才能覚醒まわりの累計。
 *
 * **どちらも「戻らないもの」を数えている。**深域は勝った回数、
 * 才能覚醒は解放したptの数。振り分けを数えると、
 * 振り直すだけでミッションが進んでしまう。
 */
describe("目覚の深域と才能覚醒の累計", () => {
  it("深域を勝つたびに1つ進む。**階は問わない**", () => {
    const player = createInitialState();
    player.awakeningShards = 0;
    expect(cumulative(player, "awakening-depth").current).toBe(0);

    // 1階と、開いていない深い階を混ぜても、増え方は同じ
    grantAwakeningDepthReward(player, findAwakeningDepthFloor(1)!, () => 0.5);
    grantAwakeningDepthReward(player, findAwakeningDepthFloor(10)!, () => 0.5);
    expect(cumulative(player, "awakening-depth").current).toBe(2);
  });

  it("才能ptを解放すると1つ進む。**振り直しても戻らない**", () => {
    const player = createInitialState();
    const monster = createMonsterInstance("knight_FIRE", 6);
    monster.level = STAR_MAX_LEVEL[6];
    player.monsters.push(monster);
    player.awakeningShards = 500;
    player.awakeningCrystals = 200;
    player.gold = 1_000_000;

    expect(unlockTalentPoint(player, monster).ok).toBe(true);
    expect(unlockTalentPoint(player, monster).ok).toBe(true);
    expect(cumulative(player, "talent-points").current).toBe(2);

    // 振り直しは「配り方」を戻すだけ。解放した数は使った素材の記録なので減らない
    resetTalents(player, monster);
    expect(cumulative(player, "talent-points").current).toBe(2);
  });

  it("素材が足りずに解放できなかった時は進まない", () => {
    const player = createInitialState();
    const monster = createMonsterInstance("knight_FIRE", 6);
    monster.level = STAR_MAX_LEVEL[6];
    player.monsters.push(monster);
    player.awakeningShards = 0;
    player.awakeningCrystals = 0;

    expect(unlockTalentPoint(player, monster).ok).toBe(false);
    expect(cumulative(player, "talent-points").current).toBe(0);
  });

  it("報酬は目覚の素材で配られ、受け取ると所持数が増える", () => {
    const player = createInitialState();
    player.awakeningShards = 0;
    const view = cumulative(player, "awakening-depth");
    expect(view.target).toBe(5);
    expect(missionRewardText(view.reward)).toBe("目覚の欠片×30");

    for (let i = 0; i < 5; i += 1) {
      grantAwakeningDepthReward(player, findAwakeningDepthFloor(1)!, () => 0.5);
    }
    const before = player.awakeningShards ?? 0;
    expect(claimCumulativeMission(player, "awakening-depth", NOW)).toEqual({ awakeningShards: 30 });
    expect((player.awakeningShards ?? 0) - before).toBe(30);
  });
});
