import { describe, expect, it } from "vitest";
import { TOWER90_ENEMIES_V1, TOWER90_RUSH_PARTY, TOWER90_SAFE_PARTY } from "../tools/battleLab/scenarios/tower90v1.js";
import { TOWER90_RULES } from "../tools/battleLab/tower90/probe.js";
import { findMonsterById } from "../src/data/monsters.js";

describe("90階V1 Battle Lab", () => {
  it("ボス+お供4体の実数が設計どおり", () => {
    expect(TOWER90_ENEMIES_V1.map((e) => [e.stats?.hp, e.stats?.atk, e.stats?.def, e.stats?.spd])).toEqual([
      [230_000, 9_000, 3_500, 180],
      [110_000, 7_000, 3_200, 175],
      [100_000, 7_500, 3_000, 185],
      [90_000, 8_500, 2_600, 190],
      [120_000, 6_500, 3_800, 165],
    ]);
  });

  it("ボス撃破が勝利条件", () => {
    expect(TOWER90_ENEMIES_V1[0].victoryTarget).toBe(true);
    for (const escort of TOWER90_ENEMIES_V1.slice(1)) expect(escort.victoryTarget).toBeUndefined();
  });

  it("安全処理型と速攻型は4体共通で、3枠目だけバジリスク/闇ドラゴンに分かれる", () => {
    expect(TOWER90_SAFE_PARTY.map((a) => `${a.templateId}_${a.element}`)).toEqual([
      "fenrir_ELECTRIC", "mushroon_GRASS", "basilisk_LIGHT", "wisp_WATER", "chronos_ELECTRIC",
    ]);
    expect(TOWER90_RUSH_PARTY.map((a) => `${a.templateId}_${a.element}`)).toEqual([
      "fenrir_ELECTRIC", "dragon_DARK", "mushroon_GRASS", "wisp_WATER", "chronos_ELECTRIC",
    ]);
    for (const ally of [...TOWER90_SAFE_PARTY, ...TOWER90_RUSH_PARTY]) {
      expect(findMonsterById(`${ally.templateId}_${ally.element}`), `${ally.label} が図鑑に存在する`).toBeTruthy();
    }
  });

  it("狂化数値はHP低下とお供死亡の二軸", () => {
    expect(TOWER90_RULES).toEqual({
      hp70Atk: 1_000,
      hp70Spd: 10,
      hp40AtkExtra: 1_500,
      hp40SpdExtra: 15,
      hp40DamageFactor: 1.25,
      hp20AtkExtra: 2_000,
      hp20SpdExtra: 20,
      hp20DamageFactor: 1.5,
      escortAtk: 700,
      escortSpd: 7,
    });
  });
});
