/**
 * ミッションの「一括受取」。
 *
 * 依頼主の指摘は2つ。
 *
 *   1. **何回も押せてしまう** —— 受け取れるものが無くても押せた
 *   2. **まとめて取得できない時がある** —— コラボの報酬が入らなかった
 *
 * 2つ目が本体の不具合。タブは6つあるのに、一括受取が見ていたのは5つで、
 * **コラボだけ抜けていた。**
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  claimAllAvailableMissionRewards,
  countClaimableMissionRewards,
  getCollabCampaignView,
  recordCollabWin,
  syncMissions,
} from "../src/game/missions.js";
import { COLLAB_GIFT_DEX_ID } from "../src/data/collabEvent.js";
import { addMonster, createInitialState } from "../src/game/playerState.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";

/** コラボ開催期間の中の1日 */
const DURING = new Date("2026-09-25T03:00:00Z");

function player() {
  const state = createInitialState();
  syncMissions(state, DURING);
  return state;
}

/** コラボのミッションをいくつか達成させる */
function progressCollab(state: ReturnType<typeof player>) {
  const monster = addMonster(state, COLLAB_GIFT_DEX_ID, 4);
  state.partyIds.push(monster.id);
  monster.level = 20;
  const collab = createMonsterInstance(COLLAB_GIFT_DEX_ID, 4, 1);
  for (let i = 0; i < 5; i += 1) recordCollabWin(state, [collab], DURING);
}

describe("コラボの報酬も一括で入る", () => {
  /*
   * **ここが抜けていた。**
   * コラボのタブで「受け取る」が光っているのに、
   * 一括受取を押しても1つも入らなかった。
   */
  it("一括受取でコラボの個別報酬が受け取り済みになる", () => {
    const state = player();
    progressCollab(state);

    const before = getCollabCampaignView(state, DURING)!;
    const claimable = before.missions.filter((mission) => mission.complete && !mission.claimed);
    expect(claimable.length, "達成しているコラボミッションが無い").toBeGreaterThan(0);

    claimAllAvailableMissionRewards(state, DURING);

    const after = getCollabCampaignView(state, DURING)!;
    const left = after.missions.filter((mission) => mission.complete && !mission.claimed);
    expect(left.map((mission) => mission.id), "コラボの報酬が残っている").toEqual([]);
  });

  it("コラボの累計報酬も入る", () => {
    const state = player();
    progressCollab(state);
    claimAllAvailableMissionRewards(state, DURING);
    const after = getCollabCampaignView(state, DURING)!;
    expect(after.milestones.filter((m) => m.complete && !m.claimed)).toEqual([]);
  });

  it("実際に持ち物が増える", () => {
    const state = player();
    progressCollab(state);
    const crystal = state.crystal;
    const reward = claimAllAvailableMissionRewards(state, DURING);
    expect(Object.keys(reward).length, "何も返ってこない").toBeGreaterThan(0);
    expect(state.crystal).toBeGreaterThan(crystal);
  });
});

describe("受け取れる件数", () => {
  /*
   * **数える場所と受け取る場所がずれない。**
   * ずれると「3件」と出ているのに押しても入らない、が起きる。
   */
  it("数えた件数だけ受け取ると、残りが0件になる", () => {
    const state = player();
    progressCollab(state);
    expect(countClaimableMissionRewards(state, DURING)).toBeGreaterThan(0);
    claimAllAvailableMissionRewards(state, DURING);
    expect(countClaimableMissionRewards(state, DURING), "受け取ったのに残っている").toBe(0);
  });

  it("二度目の一括受取では何も入らない", () => {
    const state = player();
    progressCollab(state);
    claimAllAvailableMissionRewards(state, DURING);
    const crystal = state.crystal;
    const again = claimAllAvailableMissionRewards(state, DURING);
    expect(Object.keys(again), "二度目に何か入った").toEqual([]);
    expect(state.crystal).toBe(crystal);
  });

  /*
   * 始めたばかりでもログイン系は達成済みなので0にはならない。
   * **押せる状態が正しく件数で出ること**を見る。
   */
  it("始めたばかりでも、受け取れるものは件数で出る", () => {
    const state = createInitialState();
    const count = countClaimableMissionRewards(state, DURING);
    expect(count).toBeGreaterThan(0);
    claimAllAvailableMissionRewards(state, DURING);
    expect(countClaimableMissionRewards(state, DURING)).toBe(0);
  });
});

/*
 * 画面側。**0件の時は押せなくする**のがここでの答え。
 * 前は常に押せて、何も起きないのに押した手応えだけが返っていた。
 */
describe("画面への配線", () => {
  const UI = readFileSync(new URL("../src/web/missionUi.ts", import.meta.url), "utf8");

  it("0件なら一括受取を押せなくする", () => {
    expect(UI).toContain("countClaimableMissionRewards(player)");
    expect(UI).toContain("claimable === 0");
  });

  it("押せる時は件数を出す", () => {
    expect(UI).toContain("受け取れる報酬を一括受取（${claimable}件）");
    expect(UI).toContain("受け取れる報酬はありません");
  });

  /** 何が入ったかを言う。**数字だけ動いても、何を受け取ったかは分からない** */
  it("受け取った中身を画面に出す", () => {
    expect(UI).toContain("lastClaimResult = missionRewardText(reward)");
    expect(UI).toContain("regular-missions__claim-result");
  });

  /** 浮かせない。**この案件で3回、浮かせた部品が下のボタンを覆っている** */
  it("結果は浮かせず、画面の流れの中に置く", () => {
    const css = readFileSync(new URL("../src/web/ui/missions.css", import.meta.url), "utf8");
    const rule = css.slice(css.indexOf(".regular-missions__claim-result"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).not.toContain("position: fixed");
    expect(body).not.toContain("position: absolute");
  });
});
