import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INVENTORY_INITIAL_RENDER_COUNT,
  INVENTORY_RENDER_BATCH_SIZE,
  nextIncrementalCount,
} from "../src/web/incrementalGrid.js";

describe("大量所持一覧の段階描画", () => {
  it("3000件あっても最初から全件を描画する計画にならない", () => {
    expect(INVENTORY_INITIAL_RENDER_COUNT).toBe(24);
    expect(INVENTORY_RENDER_BATCH_SIZE).toBe(24);
    expect(nextIncrementalCount(3000, 0)).toBe(24);
    expect(nextIncrementalCount(3000, 24)).toBe(48);
    expect(nextIncrementalCount(3000, 2988)).toBe(3000);
  });

  it("所持モンスター・装備・強化素材・ランクアップ素材が共通の段階描画を使う", () => {
    const monsters = readFileSync("src/web/views/monsters.ts", "utf8");
    const equipment = readFileSync("src/web/views/equipment.ts", "utf8");
    const training = readFileSync("src/web/views/monsterTraining.ts", "utf8");

    expect(monsters.match(/createIncrementalGrid/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(equipment).toContain("createIncrementalGrid");
    expect(training).toContain("createIncrementalGrid");
  });
});
