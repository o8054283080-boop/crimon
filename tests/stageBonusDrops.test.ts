import { describe, expect, it } from "vitest";
import {
  STAGES,
  STAGE_REINCARNATION_PIG_DROP_RATE,
  STAGE_SUMMON_SCROLL_DROP_RATE,
  rollStageBossReincarnationPig,
  rollStageReincarnationPig,
  rollStageReincarnationPigs,
  rollStageSummonScroll,
} from "../src/data/stages.js";

const NORMAL_STAGE = STAGES.find((stage) => stage.id === "1-1")!;
const CHAPTER_8_STAGE = STAGES.find((stage) => stage.id === "8-1")!;
const CHAPTER_8_BOSS = STAGES.find((stage) => stage.id === "8-5")!;

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
    const drop = rollStageReincarnationPig(NORMAL_STAGE, "NORMAL", rng);
    expect(drop).not.toBeNull();
    expect(drop!.star).toBe(2);
  });

  it("転生ピッグのドロップ率はおよそ5%(統計的検証)", () => {
    const rng = mulberry32(1);
    const N = 5000;
    let count = 0;
    for (let i = 0; i < N; i++) {
      if (rollStageReincarnationPig(NORMAL_STAGE, "NORMAL", rng)) count += 1;
    }
    const rate = count / N;
    expect(rate).toBeGreaterThan(STAGE_REINCARNATION_PIG_DROP_RATE - 0.02);
    expect(rate).toBeLessThan(STAGE_REINCARNATION_PIG_DROP_RATE + 0.02);
  });

  it("8章HELLの星2転生ピッグは上限のおよそ12%に収まる", () => {
    const rng = mulberry32(8);
    const N = 10_000;
    let count = 0;
    for (let i = 0; i < N; i++) {
      if (rollStageReincarnationPig(CHAPTER_8_STAGE, "HELL", rng)) count += 1;
    }
    expect(count / N).toBeGreaterThan(0.10);
    expect(count / N).toBeLessThan(0.14);
  });

  it("ボス階は星3転生ピッグを独立抽選し、星2との同時当選も保持する", () => {
    expect(rollStageBossReincarnationPig(CHAPTER_8_STAGE, () => 0)).toBeNull();
    expect(rollStageBossReincarnationPig(CHAPTER_8_BOSS, () => 0)?.star).toBe(3);
    expect(rollStageReincarnationPigs(CHAPTER_8_BOSS, "HELL", () => 0).map((drop) => drop.star)).toEqual([2, 3]);
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
