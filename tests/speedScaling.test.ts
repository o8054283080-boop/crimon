import { describe, expect, it } from "vitest";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { GOLD_DUNGEON_FLOORS } from "../src/data/goldDungeon.js";
import { LEVEL_DUNGEON_DEFS } from "../src/data/levelDungeon.js";
import { STAGES } from "../src/data/stages.js";

/**
 * 敵の速度が場所ごとにどこまで伸びるかの取り決め。
 *
 * 1〜4章は従来どおり装備ダンジョンより緩い物語導線を守る。
 * 5〜8章は育成後の編成を受け止める終盤冒険として別枠にし、プレイヤー側の
 * 速度150前後でも常に先手にならないよう、最大1.40まで段階的に伸ばす。
 * ゴールド/レベル上げダンジョンは育成場所なので、引き続き装備ダンジョンより緩く保つ。
 */

const equipTop = EQUIPMENT_DUNGEON_FLOORS[EQUIPMENT_DUNGEON_FLOORS.length - 1].speedScale;

describe("敵の速度カーブ", () => {
  it("どの場所も、最初は等倍から始まる", () => {
    expect(EQUIPMENT_DUNGEON_FLOORS[0].speedScale).toBe(1);
    expect(GOLD_DUNGEON_FLOORS[0].speedScale).toBe(1);
    expect(LEVEL_DUNGEON_DEFS[0].speedScale).toBe(1);
    expect(STAGES[0].waves[0].speedScale).toBe(1);
  });

  it("1〜4章と育成用ダンジョンは装備ダンジョンより緩く、5〜8章だけ終盤用に上回る", () => {
    const legacyStageTop = STAGES.find((s) => s.id === "4-5")!.waves[0].speedScale;
    const lateStageTop = STAGES[STAGES.length - 1].waves[0].speedScale;
    const goldTop = GOLD_DUNGEON_FLOORS[GOLD_DUNGEON_FLOORS.length - 1].speedScale;
    const levelTop = LEVEL_DUNGEON_DEFS[LEVEL_DUNGEON_DEFS.length - 1].speedScale;

    expect(legacyStageTop, "1〜4章").toBeLessThan(equipTop);
    expect(goldTop, "ゴールド").toBeLessThan(equipTop);
    expect(levelTop, "レベル上げ").toBeLessThan(equipTop);
    expect(lateStageTop, "5〜8章").toBeGreaterThan(equipTop);
    expect(lateStageTop).toBeCloseTo(1.4, 5);
  });

  it("進むほど速くなる(どの場所でも後退しない)", () => {
    const series: [string, number[]][] = [
      ["装備ダンジョン", EQUIPMENT_DUNGEON_FLOORS.map((f) => f.speedScale)],
      ["ゴールド", GOLD_DUNGEON_FLOORS.map((f) => f.speedScale)],
      ["レベル上げ", LEVEL_DUNGEON_DEFS.map((d) => d.speedScale)],
      ["ステージ", STAGES.map((s) => s.waves[0].speedScale)],
    ];
    for (const [name, values] of series) {
      for (let i = 1; i < values.length; i++) {
        expect(values[i], `${name} ${i + 1}番目`).toBeGreaterThanOrEqual(values[i - 1]);
      }
    }
  });

  it("**速度はHPや攻撃力ほど急には伸ばさない**", () => {
    const first = EQUIPMENT_DUNGEON_FLOORS[0];
    const last = EQUIPMENT_DUNGEON_FLOORS[EQUIPMENT_DUNGEON_FLOORS.length - 1];
    expect(last.speedScale / first.speedScale).toBeLessThan(last.powerScale / first.powerScale);
  });

  it("ステージの速度倍率は、章をまたいでも巻き戻らない", () => {
    const all = STAGES.flatMap((s) => s.waves.map((w) => w.speedScale));
    for (let i = 1; i < all.length; i++) {
      expect(all[i]).toBeGreaterThanOrEqual(all[i - 1]);
    }
  });
});
