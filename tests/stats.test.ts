import { describe, expect, it } from "vitest";
import { formatExtraStatLines, Stats } from "../src/core/stats.js";

const baseStats: Stats = {
  hp: 1000,
  atk: 100,
  def: 80,
  spd: 90,
  criRate: 0.15,
  criDmg: 1.5,
  resistance: 0.15,
  accuracy: 0.1,
};

describe("formatExtraStatLines", () => {
  it("クリ率・クリダメ・状態異常付与率・抵抗率を日本語テキストに変換できる", () => {
    const lines = formatExtraStatLines(baseStats);
    expect(lines).toEqual(["クリ率 15%", "クリダメ +50%", "状態異常付与率 10%", "状態異常抵抗率 15%"]);
  });

  it("クリダメ1.5倍は+50%と表示される(初期値の仕様どおり)", () => {
    const lines = formatExtraStatLines({ ...baseStats, criDmg: 1.5 });
    expect(lines).toContain("クリダメ +50%");
  });
});
