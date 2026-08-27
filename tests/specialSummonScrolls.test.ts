import { describe, expect, it } from "vitest";
import { findMonsterById } from "../src/data/monsters.js";
import { summonWithSpecialScroll, useSpecialSummonScroll } from "../src/game/gacha.js";
import { createInitialState, normalizeLoadedState } from "../src/game/playerState.js";

const rng = (() => { let n = 1; return () => ((n++ * 2654435761) >>> 0) / 4294967296; })();

describe("特別召喚書", () => {
  it("★4以上召喚書は★4以上だけを排出する", () => {
    for (let i = 0; i < 500; i += 1) expect(summonWithSpecialScroll("FOUR_STAR", rng).star).toBeGreaterThanOrEqual(4);
  });

  it("光闇★4以上召喚書は光闇かつ★4以上だけを排出し、両属性が出る", () => {
    const elements = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const result = summonWithSpecialScroll("LIGHT_DARK_FOUR_STAR", rng);
      expect(result.star).toBeGreaterThanOrEqual(4);
      const element = findMonsterById(result.dexId)?.element;
      expect(["LIGHT", "DARK"]).toContain(element);
      if (element) elements.add(element);
    }
    expect(elements).toEqual(new Set(["LIGHT", "DARK"]));
  });

  it("★5召喚書は通常属性と光闇を含む★5だけを排出する", () => {
    const rare = new Set<boolean>();
    for (let i = 0; i < 500; i += 1) {
      const result = summonWithSpecialScroll("FIVE_STAR", rng);
      expect(result.star).toBe(5);
      rare.add(result.isRare);
    }
    expect(rare).toEqual(new Set([false, true]));
  });

  it("0枚では使えず、成功時だけ1枚減って所持モンスターに追加される", () => {
    const state = createInitialState();
    const before = state.monsters.length;
    expect(useSpecialSummonScroll(state, "FIVE_STAR", rng)).toBeNull();
    expect(state.monsters).toHaveLength(before);
    state.fiveStarSummonScrolls = 1;
    expect(useSpecialSummonScroll(state, "FIVE_STAR", rng)?.star).toBe(5);
    expect(state.fiveStarSummonScrolls).toBe(0);
    expect(state.monsters).toHaveLength(before + 1);
    expect(useSpecialSummonScroll(state, "FIVE_STAR", rng)).toBeNull();
    expect(state.fiveStarSummonScrolls).toBe(0);
  });

  it("旧セーブの3所持数を0で補完する", () => {
    const old: Partial<ReturnType<typeof createInitialState>> = createInitialState();
    delete old.fourStarSummonScrolls;
    delete old.lightDarkFourStarSummonScrolls;
    delete old.fiveStarSummonScrolls;
    const loaded = normalizeLoadedState(old as ReturnType<typeof createInitialState>);
    expect([loaded.fourStarSummonScrolls, loaded.lightDarkFourStarSummonScrolls, loaded.fiveStarSummonScrolls]).toEqual([0, 0, 0]);
  });
});
