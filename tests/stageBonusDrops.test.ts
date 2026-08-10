import { describe, expect, it } from "vitest";
import {
  STAGE_REINCARNATION_PIG_DROP_RATE,
  STAGE_SUMMON_SCROLL_DROP_RATE,
  rollStageReincarnationPig,
  rollStageSummonScroll,
} from "../src/data/stages.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("通常ステージのボーナスドロップ", () => {
  it("転生ピッグは星2固定でドロップする", () => {
    const rng = () => 0;
    const drop = rollStageReincarnationPig(rng);
    expect(drop).not.toBeNull();
    expect(drop!.star).toBe(2);
  });

  it("転生ピッグのドロップ率はおよそ5%(統計的検証)", () => {
    const rng = mulberry32(1);
    const N = 5000;
    let count = 0;
    for (let i = 0; i < N; i++) {
      if (rollStageReincarnationPig(rng)) count += 1;
    }
    const rate = count / N;
    expect(rate).toBeGreaterThan(STAGE_REINCARNATION_PIG_DROP_RATE - 0.02);
    expect(rate).toBeLessThan(STAGE_REINCARNATION_PIG_DROP_RATE + 0.02);
  });

  it("召喚の書のドロップ率はおよそ1%(統計的検証)", () => {
    const rng = mulberry32(2);
    const N = 8000;
    let count = 0;
    for (let i = 0; i < N; i++) {
      if (rollStageSummonScroll(rng)) count += 1;
    }
    const rate = count / N;
    expect(rate).toBeGreaterThan(STAGE_SUMMON_SCROLL_DROP_RATE - 0.008);
    expect(rate).toBeLessThan(STAGE_SUMMON_SCROLL_DROP_RATE + 0.008);
  });
});
