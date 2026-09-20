/**
 * コラボピックアップ召喚と、コラボ限定召喚書3種。
 *
 * **確率は数えて確かめる。**表を読んで「合っている」と言うのは検査ではない。
 * 固定の乱数列で大量に引き、実測値が狙いから離れていないことを見る。
 *
 * ここでいちばん大事なのは**通常召喚が1つも動いていないこと**。
 * コラボは期間限定なので、終わった後に「通常召喚の確率が戻らない」が
 * 起きると取り返しがつかない。
 */
import { describe, expect, it } from "vitest";
import {
  COLLAB_PICKUP_RATE, summonCollabMany, summonWithCollabScroll, useCollabSummonScroll,
} from "../src/game/collabGacha.js";
import { GUARANTEED_MIN_STAR, summonMany } from "../src/game/gacha.js";
import { COLLAB_DEX_IDS, COLLAB_STAR4_TEMPLATES, COLLAB_STAR5_TEMPLATES, isCollabDexId } from "../src/data/collabEvent.js";
import { createInitialState } from "../src/game/playerState.js";

/** 再現できる乱数。seed を変えれば別の並びになる */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/** 引いた結果を、星・枠・コラボかどうかで数える */
function tally(results: { star: number; isRare: boolean; isCollab?: boolean }[]) {
  const box = new Map<string, { total: number; collab: number }>();
  for (const r of results) {
    const key = `★${r.star}${r.isRare ? "光闇" : "通常"}`;
    const entry = box.get(key) ?? { total: 0, collab: 0 };
    entry.total += 1;
    if (r.isCollab) entry.collab += 1;
    box.set(key, entry);
  }
  return box;
}

const TRIALS = 200_000;

describe("コラボピックアップ召喚", () => {
  const results = summonCollabMany(TRIALS, seeded(20260919));
  const box = tally(results);

  /*
   * **星ごとの確率は通常召喚と同じ。**
   * ここが動くと「コラボの間だけ★5が出やすい/出にくい」になる。
   */
  it("★3 75% / ★4 18.75% / ★5 6.25% が保たれている", () => {
    const rate = (star: number) => results.filter((r) => r.star === star).length / TRIALS;
    expect(rate(3)).toBeCloseTo(0.75, 2);
    expect(rate(4)).toBeCloseTo(0.1875, 2);
    expect(rate(5)).toBeCloseTo(0.0625, 2);
  });

  it("通常属性と光闇の比率も通常召喚と同じ", () => {
    const rare = results.filter((r) => r.isRare).length / TRIALS;
    // 0.03 + 0.0135 + 0.0065 = 0.05
    expect(rare).toBeCloseTo(0.05, 2);
  });

  it("★3にはコラボが1体も出ない", () => {
    const star3 = results.filter((r) => r.star === 3);
    expect(star3.length).toBeGreaterThan(10_000);
    expect(star3.filter((r) => r.isCollab)).toHaveLength(0);
    expect(star3.filter((r) => isCollabDexId(r.dexId))).toHaveLength(0);
  });

  /*
   * **4つの枠すべてで33%。**光闇だけ低いと、いちばん引きたい枠から
   * コラボが遠いという歪んだ形になる。
   */
  it("★4/★5 × 通常/光闇 のどの枠でもコラボが約33%", () => {
    for (const key of ["★4通常", "★4光闇", "★5通常", "★5光闇"]) {
      const entry = box.get(key)!;
      expect(entry, `${key} が1件も出ていない`).toBeDefined();
      expect(entry.total, `${key} の試行数が少なすぎる`).toBeGreaterThan(1_000);
      expect(entry.collab / entry.total, `${key} のコラボ率`).toBeCloseTo(COLLAB_PICKUP_RATE, 2);
    }
  });

  it("コラボ枠の中身が、その星と属性の条件に合っている", () => {
    for (const r of results) {
      if (!r.isCollab) continue;
      expect(isCollabDexId(r.dexId), `${r.dexId} がコラボでない`).toBe(true);
      const templateId = r.dexId.slice(0, r.dexId.lastIndexOf("_"));
      const element = r.dexId.slice(r.dexId.lastIndexOf("_") + 1);
      const expected = r.star === 4 ? COLLAB_STAR4_TEMPLATES : COLLAB_STAR5_TEMPLATES;
      expect(expected.map((t) => t.templateId), `★${r.star} に合わない種族`).toContain(templateId);
      expect(["LIGHT", "DARK"].includes(element), `${r.dexId} の属性枠`).toBe(r.isRare);
    }
  });

  /*
   * **同じ条件のコラボは完全に均等。**
   * 特定の1体だけ出やすくすると、狙って引く意味がなくなる。
   */
  it("同じ条件のコラボモンスターが均等に出る", () => {
    for (const [star, rare] of [[4, false], [4, true], [5, false], [5, true]] as const) {
      const hit = results.filter((r) => r.isCollab && r.star === star && r.isRare === rare);
      const counts = new Map<string, number>();
      for (const r of hit) counts.set(r.dexId, (counts.get(r.dexId) ?? 0) + 1);
      // 種族2 × 属性(通常4 or 光闇2)
      const expectedKinds = 2 * (rare ? 2 : 4);
      expect(counts.size, `★${star}${rare ? "光闇" : "通常"} の顔ぶれ数`).toBe(expectedKinds);
      const share = [...counts.values()].map((n) => n / hit.length);
      for (const s of share) expect(s, `★${star}${rare ? "光闇" : "通常"} の偏り`).toBeCloseTo(1 / expectedKinds, 2);
    }
  });

  it("引ける24体がすべて図鑑に載っているIDになっている", () => {
    const seen = new Set(results.filter((r) => r.isCollab).map((r) => r.dexId));
    expect(seen.size).toBe(24);
    for (const id of seen) expect(COLLAB_DEX_IDS, `${id} が対象一覧に無い`).toContain(id);
  });
});

describe("コラボ召喚の10連保証", () => {
  /*
   * **保証で差し替えた1体にもコラボ判定を通す。**
   * ここを素通しにすると、天井を踏んだ人だけコラボが出ない回が生まれる。
   */
  it("10連では必ず★4以上が1体以上出る", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const ten = summonCollabMany(10, seeded(seed));
      expect(ten, `seed=${seed}`).toHaveLength(10);
      expect(ten.some((r) => r.star >= GUARANTEED_MIN_STAR), `seed=${seed} で★4以上が0体`).toBe(true);
    }
  });

  it("保証枠に差し替わった1体からもコラボが出る", () => {
    /*
     * 保証が働いた回(=★4以上が末尾の1体だけ)を集めて、
     * その1体のコラボ率を見る。素通しなら0%に張り付く。
     */
    let guaranteedOnly = 0;
    let collab = 0;
    for (let seed = 1; seed <= 20_000; seed += 1) {
      const ten = summonCollabMany(10, seeded(seed));
      const high = ten.filter((r) => r.star >= GUARANTEED_MIN_STAR);
      if (high.length !== 1 || ten[9].star < GUARANTEED_MIN_STAR) continue;
      guaranteedOnly += 1;
      if (ten[9].isCollab) collab += 1;
    }
    expect(guaranteedOnly, "保証が働いた回が集まらなかった").toBeGreaterThan(200);
    expect(collab / guaranteedOnly).toBeCloseTo(COLLAB_PICKUP_RATE, 1);
  });
});

describe("通常召喚には手を入れていない", () => {
  /*
   * **コラボ33%は通常召喚へ漏れてはいけない。**
   * 期間が終わった後に戻らない、という最悪の壊れ方をここで止める。
   */
  it("通常召喚の星ごとの確率が変わっていない", () => {
    const results = summonMany(TRIALS, seeded(7));
    const rate = (star: number) => results.filter((r) => r.star === star).length / TRIALS;
    expect(rate(3)).toBeCloseTo(0.75, 2);
    expect(rate(4)).toBeCloseTo(0.1875, 2);
    expect(rate(5)).toBeCloseTo(0.0625, 2);
  });

  /*
   * **通常召喚からもコラボは出る。**ただしそれは
   * 「★4/★5の顔ぶれに加わったから」であって、33%の上乗せではない。
   * ★4の顔ぶれは8種なので、コラボ2種なら 2/8 = 25% 前後に落ち着く。
   */
  it("通常召喚のコラボ率は、顔ぶれに対する割合のままで33%ではない", () => {
    const results = summonMany(TRIALS, seeded(11));
    const star4 = results.filter((r) => r.star === 4);
    const collabRate = star4.filter((r) => isCollabDexId(r.dexId)).length / star4.length;
    // ピックアップの33%とは明確に違う値であること
    expect(Math.abs(collabRate - COLLAB_PICKUP_RATE)).toBeGreaterThan(0.03);
  });
});

describe("コラボ限定召喚書", () => {
  const draw = (type: Parameters<typeof summonWithCollabScroll>[0], count: number, seed: number) => {
    const rng = seeded(seed);
    return Array.from({ length: count }, () => summonWithCollabScroll(type, rng));
  };

  it("★4以上召喚書: ★4が90% / ★5が10%、通常モンスターは出ない", () => {
    const results = draw("COLLAB_FOUR_STAR", TRIALS, 101);
    expect(results.filter((r) => r.star === 4).length / TRIALS).toBeCloseTo(0.9, 2);
    expect(results.filter((r) => r.star === 5).length / TRIALS).toBeCloseTo(0.1, 2);
    expect(results.every((r) => isCollabDexId(r.dexId)), "通常モンスターが混ざった").toBe(true);
    expect(results.every((r) => r.isCollab)).toBe(true);
  });

  it("★4以上光闇召喚書: 光と闇しか出ず、通常4属性は1体も出ない", () => {
    const results = draw("COLLAB_LIGHT_DARK_FOUR_STAR", TRIALS, 202);
    expect(results.filter((r) => r.star === 4).length / TRIALS).toBeCloseTo(0.9, 2);
    expect(results.filter((r) => r.star === 5).length / TRIALS).toBeCloseTo(0.1, 2);
    const elements = new Set(results.map((r) => r.dexId.slice(r.dexId.lastIndexOf("_") + 1)));
    expect([...elements].sort()).toEqual(["DARK", "LIGHT"]);
    expect(results.every((r) => isCollabDexId(r.dexId))).toBe(true);
  });

  it("★5召喚書: ★5コラボ以外が1体も出ない", () => {
    const results = draw("COLLAB_FIVE_STAR", TRIALS, 303);
    expect(results.every((r) => r.star === 5), "★5以外が出た").toBe(true);
    expect(results.every((r) => isCollabDexId(r.dexId)), "通常モンスターが出た").toBe(true);
    const templateIds = new Set(results.map((r) => r.dexId.slice(0, r.dexId.lastIndexOf("_"))));
    expect([...templateIds].sort()).toEqual(COLLAB_STAR5_TEMPLATES.map((t) => t.templateId).sort());
  });

  it("どの書も、その条件の中では均等に出る", () => {
    const results = draw("COLLAB_FIVE_STAR", TRIALS, 404);
    const counts = new Map<string, number>();
    for (const r of results) counts.set(r.dexId, (counts.get(r.dexId) ?? 0) + 1);
    // ★5コラボ2種 × 6属性 = 12体
    expect(counts.size).toBe(12);
    for (const n of counts.values()) expect(n / TRIALS).toBeCloseTo(1 / 12, 2);
  });
});

describe("召喚書の所持と消費", () => {
  it("1回引くとちょうど1枚減る", () => {
    const state = createInitialState();
    state.collabFourStarSummonScrolls = 3;
    const before = state.monsters.length;
    expect(useCollabSummonScroll(state, "COLLAB_FOUR_STAR", seeded(5))).not.toBeNull();
    expect(state.collabFourStarSummonScrolls).toBe(2);
    expect(state.monsters.length).toBe(before + 1);
  });

  /*
   * **0枚では引けない。**引けてしまうと、持っていない書で
   * ★5コラボが無限に出る道ができる。
   */
  it("0枚の書は引けず、手持ちも増えない", () => {
    const state = createInitialState();
    state.collabFiveStarSummonScrolls = 0;
    const before = state.monsters.length;
    expect(useCollabSummonScroll(state, "COLLAB_FIVE_STAR", seeded(6))).toBeNull();
    expect(state.collabFiveStarSummonScrolls).toBe(0);
    expect(state.monsters.length).toBe(before);
  });

  /** **連打しても負にならない。**所持確認と消費を1操作にまとめてある */
  it("持っている数より多く引こうとしても、残数が負にならない", () => {
    const state = createInitialState();
    state.collabLightDarkFourStarSummonScrolls = 2;
    const rng = seeded(9);
    const drawn = [0, 1, 2, 3, 4].map(() => useCollabSummonScroll(state, "COLLAB_LIGHT_DARK_FOUR_STAR", rng));
    expect(drawn.filter(Boolean)).toHaveLength(2);
    expect(state.collabLightDarkFourStarSummonScrolls).toBe(0);
  });

  /** 欄そのものが無い古いセーブでも、壊れずに「0枚」として扱う */
  it("欄が無いセーブでも引けないだけで落ちない", () => {
    const state = createInitialState();
    delete (state as { collabFiveStarSummonScrolls?: number }).collabFiveStarSummonScrolls;
    expect(useCollabSummonScroll(state, "COLLAB_FIVE_STAR", seeded(3))).toBeNull();
  });
});
