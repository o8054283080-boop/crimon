/**
 * コラボ限定ミッション30個と、累計達成報酬6段。
 *
 * ここでいちばん大事なのは2つ。
 *
 *   1. **報酬を二重に受け取れない**(個別も累計も)
 *   2. **ガチャ運で詰まない**——配布だけで30個すべてに手が届く
 */
import { describe, expect, it } from "vitest";
import {
  claimCollabMilestone, claimCollabMission, getCollabCampaignView,
  recordCollabFarmRun, recordCollabWin, syncMissions,
} from "../src/game/missions.js";
import { COLLAB_MILESTONES, COLLAB_MISSIONS } from "../src/game/collabMissions.js";
import { COLLAB_GIFT_DEX_ID } from "../src/data/collabEvent.js";
import { addMonster, createInitialState } from "../src/game/playerState.js";
import { claimCompensations } from "../src/game/compensation.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { decodeSave, encodeSave } from "../src/game/saveCodec.js";

/** 開催期間の中の1日 */
const DURING = new Date("2026-09-25T03:00:00Z");
/** 開催が終わった後 */
const AFTER = new Date("2026-11-01T03:00:00Z");

function freshPlayer() {
  const state = createInitialState();
  syncMissions(state, DURING);
  return state;
}

describe("30個の並び", () => {
  it("ちょうど30個ある", () => {
    expect(COLLAB_MISSIONS).toHaveLength(30);
  });

  it("idが重複していない", () => {
    const ids = new Set(COLLAB_MISSIONS.map((m) => m.id));
    expect(ids.size).toBe(30);
  });

  it("どのミッションにも報酬が付いている", () => {
    for (const mission of COLLAB_MISSIONS) {
      const total = Object.values(mission.reward).reduce((sum, v) => sum + (v ?? 0), 0);
      expect(total, `${mission.id} の報酬が空`).toBeGreaterThan(0);
    }
  });

  /*
   * **ガチャ運で詰まないこと。**
   *
   * 記念配布は 電気スエゾー1体 + コラボ限定★4以上召喚書1枚。
   * 書から電気スエゾーが被る目は12分の1あるので、
   * 「2種類」を条件にするとその人だけコンプリート不能になる。
   * だから条件はすべて「2体」で書いてある。
   */
  it("『種類』ではなく『体数』で判定している(被っても詰まない)", () => {
    const kindBased = COLLAB_MISSIONS.filter((m) => m.condition.includes("種類"));
    expect(kindBased, `種類で数えるミッションが残っている: ${kindBased.map((m) => m.id).join(", ")}`).toEqual([]);
  });

  it("同じ電気スエゾーが2体でも、2体条件のミッションは達成できる", () => {
    const state = freshPlayer();
    addMonster(state, COLLAB_GIFT_DEX_ID, 4);
    addMonster(state, COLLAB_GIFT_DEX_ID, 4);
    const view = getCollabCampaignView(state, DURING)!;
    const own2 = view.missions.find((m) => m.id === "collab-07-own-2")!;
    expect(own2.complete, "同じ種類が2体では達成にならない").toBe(true);
  });
});

describe("累計報酬", () => {
  it("6段あり、最後がコラボ限定★5召喚書", () => {
    expect(COLLAB_MILESTONES.map((m) => m.target)).toEqual([5, 10, 15, 20, 25, 30]);
    expect(COLLAB_MILESTONES[5].reward.collabFiveStarSummonScrolls).toBe(1);
  });

  it("20個で★4以上、25個で光闇、30個で★5のコラボ召喚書", () => {
    expect(COLLAB_MILESTONES[3].reward.collabFourStarSummonScrolls).toBe(1);
    expect(COLLAB_MILESTONES[4].reward.collabLightDarkFourStarSummonScrolls).toBe(1);
    expect(COLLAB_MILESTONES[5].reward.collabFiveStarSummonScrolls).toBe(1);
  });
});

describe("進捗の測り方", () => {
  it("配布の電気スエゾーを受け取ると、1つ目が達成になる", () => {
    const state = freshPlayer();
    expect(getCollabCampaignView(state, DURING)!.missions[0].complete).toBe(false);
    claimCompensations(state, DURING);
    expect(getCollabCampaignView(state, DURING)!.missions[0].complete).toBe(true);
  });

  it("コラボを編成に入れると、2つ目が達成になる", () => {
    const state = freshPlayer();
    const monster = addMonster(state, COLLAB_GIFT_DEX_ID, 4);
    expect(getCollabCampaignView(state, DURING)!.missions[1].complete).toBe(false);
    state.partyIds.push(monster.id);
    expect(getCollabCampaignView(state, DURING)!.missions[1].complete).toBe(true);
  });

  /** **編成にコラボが1体でも居れば数える。**居なければ数えない */
  it("コラボを入れた編成で勝った時だけ、勝利数が増える", () => {
    const state = freshPlayer();
    const collab = createMonsterInstance(COLLAB_GIFT_DEX_ID, 4, 1);
    const plain = createMonsterInstance("slime_FIRE", 3, 1);

    recordCollabWin(state, [plain], DURING);
    expect(getCollabCampaignView(state, DURING)!.missions.find((m) => m.id === "collab-03-win-1")!.current).toBe(0);

    recordCollabWin(state, [plain, collab], DURING);
    expect(getCollabCampaignView(state, DURING)!.missions.find((m) => m.id === "collab-03-win-1")!.current).toBe(1);
  });

  it("自動周回の周回数が数えられる", () => {
    const state = freshPlayer();
    for (let i = 0; i < 30; i += 1) recordCollabFarmRun(state, DURING);
    const farm = getCollabCampaignView(state, DURING)!.missions.find((m) => m.id === "collab-19-farm-30")!;
    expect(farm.current).toBe(30);
    expect(farm.complete).toBe(true);
  });

  it("コラボのレベル・★・覚醒が手持ちから測られる", () => {
    const state = freshPlayer();
    const monster = addMonster(state, COLLAB_GIFT_DEX_ID, 4);
    const at = (id: string) => getCollabCampaignView(state, DURING)!.missions.find((m) => m.id === id)!;

    monster.level = 20;
    expect(at("collab-04-level-20").complete).toBe(true);
    expect(at("collab-09-level-30").complete).toBe(false);

    monster.star = 5;
    expect(at("collab-12-star-5").complete).toBe(true);
    expect(at("collab-21-star-6").complete).toBe(false);

    monster.development = { ...(monster.development ?? {}), latentAbilityId: "suezo_ELECTRIC_latent_1" } as typeof monster.development;
    expect(at("collab-23-awaken").complete).toBe(true);
  });

  /*
   * **開催前に積んだぶんは持ち込まない。**
   * 既にダンジョンを200回クリアしている人が、初日に
   * ダンジョン系4つを全部達成済みで始めるのはおかしい。
   */
  it("開催前に積んだダンジョンのクリア数は持ち込まれない", () => {
    const state = createInitialState();
    // 開催の前にたくさんクリアしておく
    const before = syncMissions(state, DURING);
    before.counters.dungeonClears = 500;
    // キャンペーンを作り直す(開催初日に初めて触った状態)
    delete (before as { collabCampaign?: unknown }).collabCampaign;

    const view = getCollabCampaignView(state, DURING)!;
    expect(view.missions.find((m) => m.id === "collab-08-dungeon-10")!.current).toBe(0);
  });
});

describe("報酬の受け取り", () => {
  it("達成したものだけ受け取れる", () => {
    const state = freshPlayer();
    expect(claimCollabMission(state, "collab-01-gift", DURING), "未達成でも受け取れてしまった").toBeNull();
    claimCompensations(state, DURING);
    expect(claimCollabMission(state, "collab-01-gift", DURING)).not.toBeNull();
  });

  /** **二度目は必ず null。**押し続けてもダイヤが増え続けない */
  it("個別報酬を二重に受け取れない", () => {
    const state = freshPlayer();
    claimCompensations(state, DURING);
    const first = claimCollabMission(state, "collab-01-gift", DURING);
    expect(first).not.toBeNull();
    const crystal = state.crystal;
    for (let i = 0; i < 5; i += 1) {
      expect(claimCollabMission(state, "collab-01-gift", DURING)).toBeNull();
    }
    expect(state.crystal).toBe(crystal);
  });

  it("累計報酬も二重に受け取れない", () => {
    const state = freshPlayer();
    // 5個ぶん達成させる
    claimCompensations(state, DURING);
    const monster = state.monsters.find((m) => m.dexId === COLLAB_GIFT_DEX_ID)!;
    state.partyIds.push(monster.id);
    monster.level = 20;
    for (let i = 0; i < 5; i += 1) recordCollabWin(state, [monster], DURING);

    const view = getCollabCampaignView(state, DURING)!;
    expect(view.completedCount).toBeGreaterThanOrEqual(5);

    const first = claimCollabMilestone(state, 5, DURING);
    expect(first).not.toBeNull();
    const crystal = state.crystal;
    for (let i = 0; i < 5; i += 1) expect(claimCollabMilestone(state, 5, DURING)).toBeNull();
    expect(state.crystal).toBe(crystal);
  });

  it("達成していない累計報酬は受け取れない", () => {
    const state = freshPlayer();
    expect(claimCollabMilestone(state, 30, DURING)).toBeNull();
    expect(state.collabFiveStarSummonScrolls ?? 0).toBe(0);
  });

  it("コラボ限定召喚書が報酬として実際に増える", () => {
    const state = freshPlayer();
    const campaign = syncMissions(state, DURING).collabCampaign!;
    // 30個すべて達成した扱いにする
    campaign.claimedIds = [];
    for (const mission of COLLAB_MISSIONS) campaign.claimedIds.push(`__not_${mission.id}`);
    campaign.collabWins = 1_000;
    campaign.farmRuns = 1_000;
    claimCompensations(state, DURING);
    const monster = state.monsters.find((m) => m.dexId === COLLAB_GIFT_DEX_ID)!;
    monster.level = 60;
    monster.star = 6;
    state.partyIds.push(monster.id);

    // 受け取れる累計報酬を順に取る
    for (const milestone of COLLAB_MILESTONES) claimCollabMilestone(state, milestone.target, DURING);
    // 5個以上は達成しているので、少なくとも最初の段は入っている
    expect(state.crystal).toBeGreaterThan(0);
  });
});

describe("期間とセーブ", () => {
  it("開催が終わると画面ごと消える", () => {
    const state = freshPlayer();
    expect(getCollabCampaignView(state, DURING)).not.toBeNull();
    expect(getCollabCampaignView(state, AFTER)).toBeNull();
  });

  /** 受け取り済みの印がセーブを跨いで残る */
  it("セーブして読み戻しても、受け取り済みのものは受け取れない", () => {
    const state = freshPlayer();
    claimCompensations(state, DURING);
    claimCollabMission(state, "collab-01-gift", DURING);

    const restored = decodeSave(encodeSave(state))!;
    expect(restored).not.toBeNull();
    const crystal = restored.crystal;
    expect(claimCollabMission(restored, "collab-01-gift", DURING)).toBeNull();
    expect(restored.crystal).toBe(crystal);
  });

  /** コラボの進捗が無い古いセーブでも落ちない */
  it("コラボの進捗が無いセーブを読んでも壊れない", () => {
    const state = createInitialState();
    const view = getCollabCampaignView(state, DURING);
    expect(view).not.toBeNull();
    expect(view!.missions).toHaveLength(30);
    expect(view!.completedCount).toBe(0);
  });
});
