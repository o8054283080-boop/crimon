/**
 * コラボ開催記念の配布。
 *
 * **二重に配られないことがすべて。**
 * 再ログイン・別端末・セーブの復旧のどれを通っても、配るのは一度きり。
 * 受け取る前ならプレゼントボックスに残り続ける。
 */
import { describe, expect, it } from "vitest";
import {
  COLLAB_GIFT_ID, COMPENSATIONS, claimCompensations, hasReward, pendingCompensations,
} from "../src/game/compensation.js";
import { COLLAB_GIFT_DEX_ID } from "../src/data/collabEvent.js";
import { createInitialState } from "../src/game/playerState.js";
import { decodeSave, encodeSave } from "../src/game/saveCodec.js";

/** 開催期間の中の1日 */
const DURING = new Date("2026-09-25T03:00:00Z");

const gift = () => COMPENSATIONS.find((c) => c.id === COLLAB_GIFT_ID)!;

describe("配る中身", () => {
  it("依頼どおりの4点が入っている", () => {
    const g = gift();
    expect(g.crystal).toBe(3_000);
    expect(g.summonScrolls).toBe(30);
    expect(g.collabFourStarSummonScrolls).toBe(1);
    expect(g.monsters).toHaveLength(1);
    expect(g.monsters![0].dexId).toBe(COLLAB_GIFT_DEX_ID);
    expect(g.monsters![0].dexId).toBe("suezo_ELECTRIC");
  });

  /** 中身がある札は、ホームにも「受け取れるもの」として出る */
  it("モノを配る札として扱われる", () => {
    expect(hasReward(gift())).toBe(true);
  });
});

describe("受け取り", () => {
  it("4点がそのまま手持ちへ入る", () => {
    const state = createInitialState();
    const beforeMonsters = state.monsters.length;
    const claims = claimCompensations(state, DURING);

    expect(claims.some((c) => c.compensation.id === COLLAB_GIFT_ID)).toBe(true);
    expect(state.crystal).toBeGreaterThanOrEqual(3_000);
    expect(state.summonScrolls).toBeGreaterThanOrEqual(30);
    expect(state.collabFourStarSummonScrolls).toBe(1);
    expect(state.monsters.length).toBe(beforeMonsters + 1);
  });

  /*
   * **配布専用の弱い個体にはしない。**
   * 召喚で引いた電気スエゾーとまったく同じ図鑑IDと星で入る。
   */
  it("配られる電気スエゾーが、通常の電気スエゾーと同じ個体", () => {
    const state = createInitialState();
    const before = new Set(state.monsters.map((m) => m.id));
    claimCompensations(state, DURING);
    const granted = state.monsters.filter((m) => !before.has(m.id));
    const suezo = granted.find((m) => m.dexId === COLLAB_GIFT_DEX_ID);
    expect(suezo, "電気スエゾーが配られていない").toBeDefined();
    expect(suezo!.star).toBe(4);
    expect(suezo!.level).toBe(1);
  });

  /** **何度開いても増えない。**受け取り済みの印が id で残る */
  it("二度目以降は何も配られない", () => {
    const state = createInitialState();
    claimCompensations(state, DURING);
    const crystal = state.crystal;
    const scrolls = state.summonScrolls;
    const collab = state.collabFourStarSummonScrolls;
    const monsters = state.monsters.length;

    for (let i = 0; i < 5; i += 1) claimCompensations(state, DURING);

    expect(state.crystal).toBe(crystal);
    expect(state.summonScrolls).toBe(scrolls);
    expect(state.collabFourStarSummonScrolls).toBe(collab);
    expect(state.monsters.length).toBe(monsters);
    expect(state.claimedCompensationIds.filter((id) => id === COLLAB_GIFT_ID)).toHaveLength(1);
  });

  /*
   * **セーブを跨いでも配られない。**
   * 別端末で復旧した時にここが効く(受け取り済みの印はセーブに入っている)。
   */
  it("セーブして読み戻した後も、もう一度は配られない", () => {
    const state = createInitialState();
    claimCompensations(state, DURING);
    const restored = decodeSave(encodeSave(state))!;
    expect(restored, "セーブを読み戻せなかった").not.toBeNull();
    const crystal = restored.crystal;
    const monsters = restored.monsters.length;

    claimCompensations(restored, DURING);

    expect(restored.crystal).toBe(crystal);
    expect(restored.monsters.length).toBe(monsters);
    expect(restored.collabFourStarSummonScrolls).toBe(1);
  });

  /** 受け取る前なら、プレゼントボックスに残り続ける */
  it("受け取るまでは一覧に出続ける", () => {
    const state = createInitialState();
    expect(pendingCompensations(state, DURING).some((c) => c.id === COLLAB_GIFT_ID)).toBe(true);
    // 何度覗いても消えない
    expect(pendingCompensations(state, DURING).some((c) => c.id === COLLAB_GIFT_ID)).toBe(true);
    claimCompensations(state, DURING);
    expect(pendingCompensations(state, DURING).some((c) => c.id === COLLAB_GIFT_ID)).toBe(false);
  });
});

describe("前から遊んでいる人のセーブ", () => {
  /*
   * **コラボ限定の書の欄が無いセーブでも、足せて壊れない。**
   * 欄そのものが無い状態から 0 → 1 にする道が通ることを見る。
   */
  it("コラボ召喚書の欄が無くても受け取れる", () => {
    const state = createInitialState();
    delete (state as { collabFourStarSummonScrolls?: number }).collabFourStarSummonScrolls;
    claimCompensations(state, DURING);
    expect(state.collabFourStarSummonScrolls).toBe(1);
  });

  /*
   * 既存の所持品を**減らさない。**
   *
   * ちょうどの値ではなく「以上」で見る。同じ日に受け取れる配布は
   * コラボの1件だけではないので、他の配布ぶんが乗って増えることがある
   * (実際、★4以上召喚書は既存の配布からも2枚入る)。
   * ここで見たいのは「コラボの配布が他の所持品を削らないこと」。
   */
  it("配布で他の所持品が減ったりしない", () => {
    const state = createInitialState();
    state.gold = 123_456;
    state.fourStarSummonScrolls = 7;
    state.awakeningOrbs = 3;
    claimCompensations(state, DURING);
    expect(state.gold).toBeGreaterThanOrEqual(123_456);
    expect(state.fourStarSummonScrolls).toBeGreaterThanOrEqual(7);
    expect(state.awakeningOrbs).toBeGreaterThanOrEqual(3);
  });
});
