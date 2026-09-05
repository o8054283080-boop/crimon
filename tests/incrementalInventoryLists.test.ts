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
    expect(nextIncrementalCount(3000, 2976)).toBe(3000);
  });

  it("所持モンスター・装備・強化素材・ランクアップ素材・編成候補が共通の段階描画を使う", () => {
    const monsters = readFileSync("src/web/views/monsters.ts", "utf8");
    const equipment = readFileSync("src/web/views/equipment.ts", "utf8");
    const training = readFileSync("src/web/views/monsterTraining.ts", "utf8");
    const party = readFileSync("src/web/views/party.ts", "utf8");

    expect(monsters.match(/createIncrementalGrid/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(equipment).toContain("createIncrementalGrid");
    expect(training).toContain("createIncrementalGrid");
    expect(party).toContain("createIncrementalGrid");
  });

  /*
   * アリーナの攻撃編成・防衛登録だけが段階描画から取り残されていた。
   *
   * 所持400体で測ると、一覧を全件DOM化するせいで画面のノードが12,042個になり、
   * **1体選ぶたびに246〜286msかかっていた**(同じ所持数のパーティ編成は8.4ms)。
   * 攻撃と防衛は `renderPicker` を共有しているので、ここが素のmapへ戻ると
   * 両方いっぺんに重くなる。
   */
  it("アリーナの攻撃編成・防衛登録の候補一覧も段階描画を使う", () => {
    const arenaTeams = readFileSync("src/web/views/arena/teams.ts", "utf8");

    expect(arenaTeams).toContain("createIncrementalGrid");
    // 攻撃・防衛の両方が通る唯一の一覧なので、素のmapでカードを並べる形へ戻さない
    expect(arenaTeams).not.toMatch(/sorted\.map\(/);
  });
});
